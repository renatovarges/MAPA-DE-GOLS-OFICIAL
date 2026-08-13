import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";

/**
 * Harvester de FINALIZAÇÕES — base pra detectar padrão (não é o mapa de gols)
 * -----------------------------------------------------------------------
 * Guarda TODA finalização de cada partida (não só as que viraram gol) numa
 * base nova e separada (`data/finalizacoes/{time}.json`, via o endpoint novo
 * `/api/save-shots` — ver server.py). Não aparece no campinho, não altera
 * em nada o dado que o /api/save-round já grava — é insumo pra análise de
 * padrão (setor do campo × origem da jogada × posição do jogador, criado e
 * cedido por cada time), pedida pelo Renato em 2026-08.
 *
 * Roda por cima do MESMO dado já buscado pelo harvester de gols
 * (`finalizacao-detalhada`), então não dobra a carga na API da FootStats —
 * é um script separado só pra manter risco isolado: o registro de gol no
 * campinho é a funcionalidade principal do site e já foi corrigida uma vez
 * com dor; esse dado novo é experimental e pode ser refeito/recalibrado sem
 * qualquer risco pro que já funciona.
 *
 * Cada finalização guardada:
 *   - jogadorId / posição granular (ver posicoes-granulares.json)
 *   - zona do CHUTE no campo (fieldPositionX/Y, mesma regressão calibrada
 *     do harvester de gols — aproximada, mesmas ~330 metragens de
 *     referência; aqui aplicada a TODA finalização, não só gol)
 *   - origem da jogada (originOfShot: PASSE/CRUZAMENTO/ESCANTEIO/FALTA/
 *     LANÇAMENTO/REBATIDA), perna/cabeça, se foi de contra-ataque, se foi
 *     dentro/fora da área, metros, se foi bloqueada, se foi gol
 *   - jogador que assistiu (quando houve) + posição granular dele também
 *
 * O que NÃO dá pra afirmar com confiança ainda: "finalização a gol" (chute
 * no alvo vs. pra fora) — a FootStats devolve goalPositionX/Y (onde a bola
 * cruzaria a linha do gol), mas sem saber o referencial exato da trave não
 * dá pra calibrar isso sem arriscar erro. Por ora fica de fora; `blocked` e
 * `goal` já dão um proxy razoável de qualidade da chance.
 *
 * Cada partida é IDEMPOTENTE por matchId — sempre sobrescreve, sem trava de
 * "nunca sobrescrever" (diferente do registro de gol): é dado 100% derivado
 * da FootStats, ninguém edita isso na mão, então reprocessar só corrige.
 *
 * Rodar: mesmo padrão do harvest_footstats_goals.mjs (ENVIO_REAL=1 pra
 * gravar de verdade, LIMITE_PARTIDAS pra testar em lote pequeno).
 */

const CAMPEONATO_ID = 1395;
const API_BASE = "https://gather-api-app.footstats.com.br";
const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";

const CLUBE_ID = {
  262: "flamengo", 263: "botafogo", 264: "corinthians", 265: "bahia", 266: "fluminense",
  267: "vasco", 275: "palmeiras", 276: "sao-paulo", 277: "santos", 280: "red-bull-bragantino",
  282: "atletico-mg", 283: "cruzeiro", 284: "gremio", 285: "internacional", 287: "vitoria",
  293: "athletico-pr", 294: "coritiba", 315: "chapecoense", 364: "remo", 2305: "mirassol",
};
const NORMALIZE_KEY = { athletico_pr: "athletico-pr", atletico_mg: "atletico-mg", sao_paulo: "sao-paulo", red_bull_bragantino: "red-bull-bragantino" };

const PITCH = { unitsX: 100, unitsY: 68, maxX: 96, maxY: 68 };
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function footstatsToShotXY(fsX, fsY) {
  const x = clamp(-0.09523 * fsY + 92.15, 0, PITCH.unitsX);
  const y = clamp(0.08600 * fsX + 0.47, 0, PITCH.unitsY);
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
function rotate180(pt) { return { x: Math.round((PITCH.maxX - pt.x) * 100) / 100, y: Math.round((PITCH.maxY - pt.y) * 100) / 100 }; }

/** centro do quadrante 1-36 (grade 6x6) — mesma fórmula do harvester de gols. */
function quadrantCentroid(idQuadrant36) {
  if (!Number.isInteger(idQuadrant36) || idQuadrant36 < 1 || idQuadrant36 > 36) return null;
  const col = Math.ceil(idQuadrant36 / 6);
  const row = ((idQuadrant36 - 1) % 6) + 1;
  return {
    x: Math.round(((col - 0.5) / 6) * PITCH.unitsX * 100) / 100,
    y: Math.round(((row - 0.5) / 6) * PITCH.unitsY * 100) / 100,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const posicoes = JSON.parse(fs.readFileSync(path.join(__dirname, "posicoes-granulares.json"), "utf8"));

/** posição granular quando existe (lateral-esquerdo, ponta-direita, etc.); null quando não temos (roster caiu, base do Cartola cobre goleiro/zagueiro só na análise, não aqui). */
function posicaoGranular(atletaId) {
  if (!atletaId) return null;
  return posicoes[String(atletaId)] || null;
}

async function authedGet(url, token) {
  return fetchJsonWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
}

const cacheMatchesExistentes = new Map();
async function matchesExistentesDoTime(slug) {
  const normalized = NORMALIZE_KEY[slug] || slug;
  if (cacheMatchesExistentes.has(normalized)) return cacheMatchesExistentes.get(normalized);
  let existentes = new Set();
  try {
    const data = await fetchJsonWithRetry(`${SITE_URL}/data/finalizacoes/${normalized}.json?t=${Date.now()}`);
    existentes = new Set(Object.keys(data.matches || {}));
  } catch { /* arquivo ainda não existe pra esse time — normal na primeira vez */ }
  cacheMatchesExistentes.set(normalized, existentes);
  return existentes;
}

async function salvarFinalizacoes(payload) {
  if (!ENVIO_REAL) {
    console.log(`  [SIMULAÇÃO] enviaria partida ${payload.matchId}: ${payload.homeTeamKey} x ${payload.awayTeamKey}`);
    return { ok: true, simulado: true };
  }
  const res = await fetch(`${SITE_URL}/api/save-shots`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-shots falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

/** ponte idPlayer (interno FootStats) -> atleta_id, construída a partir dos próprios chutes da partida. */
function buildIdBridge(matchShots) {
  const bridge = new Map();
  for (const s of matchShots) {
    if (s.idPlayer && s.atleta_id) bridge.set(s.idPlayer, s.atleta_id);
    if (s.idAssistantPlayer && s.atleta_id_assistente) bridge.set(s.idAssistantPlayer, s.atleta_id_assistente);
  }
  return bridge;
}

/**
 * Filas de zona de assistência por jogador, com idSkill=27 SEMPRE preferido
 * sobre idSkill=28 — mesma correção do harvester de gols (ver o histórico
 * do bug do Reinaldo lá). Aqui a 28 é a fila principal na prática, porque
 * ela é justamente "assistência para finalização" e cobre 98,4% das
 * finalizações assistidas (medido); a 27 só existe pras que viraram gol.
 */
function construirFilasDeAssistencia(fieldPosData, bridge) {
  const preferida = new Map();
  const fallback = new Map();
  for (const ev of fieldPosData || []) {
    if (ev.idSkill !== 27 && ev.idSkill !== 28) continue;
    const atletaId = bridge.get(ev.idPlayer);
    if (!atletaId) continue;
    const key = String(atletaId);
    const alvo = ev.idSkill === 27 ? preferida : fallback;
    if (!alvo.has(key)) alvo.set(key, []);
    alvo.get(key).push(ev);
  }
  return { preferida, fallback };
}

/**
 * Categoria do resultado do chute — descoberta em 2026-08-13: o campo
 * `imgShots` que a FootStats devolve é o mesmo ícone que ELES usam pra
 * desenhar o resultado no site deles, então já vem pré-classificado.
 * Testado contra 219 chutes reais de 8 partidas, bate certinho com goal/
 * blocked: "ball2"=gol (sempre goal=true), "bloqueada"=bloqueio (sempre
 * blocked=true), "trave"=bateu na trave, "errada"=foi pra fora,
 * "finalizacao.png" (sem sufixo)=defendida pelo goleiro (chute no alvo,
 * não bloqueado, não foi gol). Isso substitui a limitação antiga anotada
 * aqui ("não dá pra afirmar gol vs. pra fora com confiança") — aquela
 * tentativa era calibrar a trajetória exata via goalPositionX/Y; esse
 * campo é uma classificação direta da própria FootStats, mais confiável.
 */
function resultadoDoChute(s) {
  const img = String(s.imgShots || "");
  if (img.includes("ball2")) return "gol";
  if (img.includes("bloqueada")) return "bloqueada";
  if (img.includes("trave")) return "trave";
  if (img.includes("errada")) return "fora";
  if (img.includes("finalizacao.png")) return "defendida";
  // fallback defensivo, caso a FootStats troque o nome do ícone algum dia
  if (s.goal) return "gol";
  if (s.blocked) return "bloqueada";
  return "fora";
}

/**
 * monta os registros de finalização de UM time (o que ele CRIOU).
 * `filas` é mutado ao longo da chamada (cada zona é consumida uma vez) —
 * por isso as duas chamadas (home/away) recebem filas recém-construídas.
 */
function construirFinalizacoes(matchShots, timeSlug, filas) {
  const registros = [];
  for (const s of matchShots) {
    const timeDoChute = CLUBE_ID[s.equipe_id];
    if (timeDoChute !== timeSlug) continue;

    // de onde NASCEU a jogada (não de onde saiu o chute) — é isso que
    // permite dizer "cruzamento pela direita". Só existe quando houve
    // assistente registrado; jogada individual/rebote fica sem.
    let origemZona = null;
    if (s.atleta_id_assistente > 0) {
      const k = String(s.atleta_id_assistente);
      const p = filas.preferida.get(k);
      const f = filas.fallback.get(k);
      const ev = (p && p.length ? p.shift() : null) || (f && f.length ? f.shift() : null);
      if (ev) origemZona = quadrantCentroid(ev.idQuadrant36);
    }

    registros.push({
      jogadorId: String(s.atleta_id),
      posicao: posicaoGranular(s.atleta_id),
      zona: footstatsToShotXY(s.fieldPositionX, s.fieldPositionY),
      origemZona,
      origem: s.originOfShot || null,
      perna: s.bodyPart || null,
      contraAtaque: !!s.counterAttack,
      dentroDaArea: s.penaltyArea === "DENTRO_AREA",
      metros: s.meters ?? null,
      bloqueada: !!s.blocked,
      gol: !!s.goal,
      resultado: resultadoDoChute(s),
      penalti: s.originOfShot === "PENALTI",
      assistenteId: s.atleta_id_assistente > 0 ? String(s.atleta_id_assistente) : null,
      assistentePosicao: s.atleta_id_assistente > 0 ? posicaoGranular(s.atleta_id_assistente) : null,
    });
  }
  return registros;
}

/**
 * espelha as finalizações CRIADAS pelo adversário como "cedidas" por este
 * time — zonas rotacionadas 180° (mesma convenção do mapa de gols).
 * A rotação também é o que faz "flanco direito do atacante" virar
 * corretamente "flanco esquerdo de quem defende", exatamente como aparece
 * no campinho do site.
 */
function espelharCedidas(finalizacoesDoAdversario) {
  return finalizacoesDoAdversario.map((f) => ({
    ...f,
    zona: rotate180(f.zona),
    origemZona: f.origemZona ? rotate180(f.origemZona) : null,
  }));
}

async function main() {
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é enviado — rode com ENVIO_REAL=1 pra gravar de verdade)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  const token = await getFootstatsToken();
  console.log(`→ listando partidas do campeonato ${CAMPEONATO_ID} ...`);
  const partidas = await authedGet(`${API_BASE}/api/1.0/campeonatos/${CAMPEONATO_ID}/partidas`, token);
  let jogadas = partidas.filter((m) => m.hasscout && m.finished);
  const limite = Number(process.env.LIMITE_PARTIDAS);
  if (Number.isFinite(limite) && limite > 0) jogadas = jogadas.slice(0, limite);
  console.log(`  ${jogadas.length} partidas finalizadas com scout${limite ? ` (LIMITE_PARTIDAS=${limite})` : ""}`);

  let processadas = 0, puladas = 0, enviadas = 0;
  const partidasComErro = [];

  for (const m of jogadas) {
    const homeSlug = CLUBE_ID[m.sdE_EQUIPE_MANDANTE_ID];
    const awaySlug = CLUBE_ID[m.sdE_EQUIPE_VISITANTE_ID];
    if (!homeSlug || !awaySlug) continue;

    const [existentesHome, existentesAway] = await Promise.all([
      matchesExistentesDoTime(homeSlug), matchesExistentesDoTime(awaySlug),
    ]);
    if (existentesHome.has(String(m.id)) && existentesAway.has(String(m.id))) { puladas++; continue; }

    let shotDetail, fieldPos;
    try {
      [shotDetail, fieldPos] = await Promise.all([
        authedGet(`${API_BASE}/api/1.0/partidas/${CAMPEONATO_ID}/finalizacao-detalhada/${m.id}/partida`, token),
        authedGet(`${API_BASE}/api/1.0/partidas/${m.id}/fieldPositionByMatch`, token),
      ]);
    } catch (e) {
      console.log(`  ! partida ${m.id} (${homeSlug} x ${awaySlug}): ${e.message}`);
      partidasComErro.push(`${homeSlug} x ${awaySlug} (id ${m.id}): ${e.message}`);
      continue;
    }
    const matchShots = shotDetail.matchShots || [];
    if (!matchShots.length) continue;

    // filas recém-construídas pra cada lado: construirFinalizacoes consome
    // as zonas conforme casa, então cada chamada precisa da sua própria.
    const bridge = buildIdBridge(matchShots);
    const finalizacoesHome = construirFinalizacoes(matchShots, homeSlug, construirFilasDeAssistencia(fieldPos.data, bridge));
    const finalizacoesAway = construirFinalizacoes(matchShots, awaySlug, construirFilasDeAssistencia(fieldPos.data, bridge));
    const dataISO = m.date ? m.date.slice(0, 10) : null;

    const payload = {
      matchId: m.id, homeTeamKey: homeSlug, awayTeamKey: awaySlug,
      home: {
        matchId: m.id, roundNumber: Number(m.round) || null, date: dataISO, opponent: awaySlug, home: true,
        shots_for: finalizacoesHome, shots_against: espelharCedidas(finalizacoesAway),
      },
      away: {
        matchId: m.id, roundNumber: Number(m.round) || null, date: dataISO, opponent: homeSlug, home: false,
        shots_for: finalizacoesAway, shots_against: espelharCedidas(finalizacoesHome),
      },
    };

    try {
      await salvarFinalizacoes(payload);
      enviadas++;
      processadas++;
      if (ENVIO_REAL) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.log(`  ! falha ao salvar finalizações da partida ${m.id}: ${e.message}`);
      partidasComErro.push(`${homeSlug} x ${awaySlug} (id ${m.id}): falha ao salvar — ${e.message}`);
    }
  }

  console.log(`\n✓ ${enviadas} partida(s) ${ENVIO_REAL ? "enviadas" : "que seriam enviadas"} | ${puladas} já existiam nos dois times e foram puladas`);
  if (!ENVIO_REAL) {
    console.log("\nEssa foi uma SIMULAÇÃO — rode com ENVIO_REAL=1 pra gravar de verdade no site ao vivo.");
  }
  if (ENVIO_REAL && partidasComErro.length) {
    await dispatchAlert({
      title: `${partidasComErro.length} partida(s) não atualizaram finalizações (erro ao buscar na FootStats)`,
      details: partidasComErro.join("\n"),
    });
  }
}

main().catch(async (e) => {
  console.error("✗", e);
  if (process.env.ENVIO_REAL === "1") {
    await dispatchAlert({
      title: "harvester de finalizações falhou por completo",
      details: String(e && e.stack ? e.stack : e),
    }).catch(() => {});
  }
  process.exitCode = 1;
});
