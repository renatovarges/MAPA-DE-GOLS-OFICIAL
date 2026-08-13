import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";

/**
 * Harvester de DESARMES/INTERCEPTAÇÕES (recuperação) e PERDA DE POSSE
 * -----------------------------------------------------------------------
 * Projeto próprio do Mapa de Desarmes e Perda de Posse — sem nenhuma
 * dependência de código do MAPA-DE-GOLS-OFICIAL (só reaproveita, como
 * dado, o `posicoes-granulares.json` que o Renato já tinha construído e
 * as libs genéricas de auth/http/alerta, copiadas pra dentro deste
 * projeto).
 *
 * Guarda, por partida e por time, cada evento de desarme/interceptação/
 * perda de posse com quadrante (grade 6x6 da FootStats, já normalizada
 * por lado de ataque), jogador e posição granular — em
 * `data/desarmes/{time}.json`, via `/api/save-desarmes` (ver server.py
 * deste projeto).
 *
 * REGRA DO CARTOLA: DS = Desarme (idSkill 5) + Interceptação (idSkill 24),
 * contando só skillCorrect===true. Perda de posse = idSkill 12 (não vem
 * subdividida por causa — limitação aceita pelo Renato).
 *
 * PONTE DE JOGADOR: o endpoint de escalação da FootStats devolve
 * titular/reserva SEMPRE VAZIOS pra temporada 2026 do Brasileirão
 * (confirmado batendo a chamada exata que o site oficial da FootStats usa,
 * com token de sessão logada de verdade — não é bug nosso). Por isso a
 * ponte idPlayer→atleta_id usa `finalizacao-detalhada` (cobre quem
 * finaliza/assiste), ACUMULADA de forma persistente em
 * `data/id-bridge-footstats.json` (via GET/POST no site, igual aos outros
 * datasets — não em disco local, porque o GitHub Actions roda com
 * checkout novo a cada execução) — cresce partida a partida.
 *
 * Regra de conteúdo (Renato): sem jogador resolvido via bridge OU sem
 * posição granular confiável em posicoes-granulares.json, o evento é
 * DESCARTADO por completo — nunca um achado incompleto.
 *
 * Cada partida é IDEMPOTENTE por matchId (sempre sobrescreve).
 *
 * Rodar: ENVIO_REAL=1 pra gravar de verdade, LIMITE_PARTIDAS pra testar
 * em lote pequeno, SITE_URL pra apontar pro servidor certo (padrão: site
 * ao vivo; use SITE_URL=http://localhost:PORT pra testar local).
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const posicoes = JSON.parse(fs.readFileSync(path.join(__dirname, "posicoes-granulares.json"), "utf8"));

function posicaoGranular(atletaId) {
  if (!atletaId) return null;
  return posicoes[String(atletaId)] || null;
}

/**
 * Ponte idPlayer->atleta_id, persistida através do site (não em disco
 * local) — o GitHub Actions roda com checkout novo a cada execução, sem
 * disco persistente, então gravar só localmente faria a ponte reiniciar
 * vazia todo dia, contrariando o acúmulo partida-a-partida descrito acima.
 * Mesmo padrão dos outros datasets: GET pra carregar, POST (com
 * ENVIO_REAL) em /api/save-id-bridge pra persistir via GitHub.
 */
async function loadBridge() {
  try {
    return await fetchJsonWithRetry(`${SITE_URL}/data/id-bridge-footstats.json?t=${Date.now()}`);
  } catch {
    return {}; // primeira vez rodando — normal
  }
}
async function saveBridge(bridge) {
  if (!ENVIO_REAL) return;
  const res = await fetch(`${SITE_URL}/api/save-id-bridge`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bridge),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-id-bridge falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
}

function mergeBridgeFromShots(bridge, matchShots) {
  let novos = 0;
  for (const s of matchShots) {
    if (s.idPlayer && s.atleta_id && !bridge[s.idPlayer]) { bridge[s.idPlayer] = s.atleta_id; novos++; }
    if (s.idAssistantPlayer && s.atleta_id_assistente && !bridge[s.idAssistantPlayer]) { bridge[s.idAssistantPlayer] = s.atleta_id_assistente; novos++; }
  }
  return novos;
}

/** idTeam (fieldPositionByMatch) é espaço de ID diferente de equipe_id (matchShots/CLUBE_ID) — resolve cruzando por idPlayer. */
function buildIdTeamBridge(matchShots, events) {
  const shotPlayerToEquipe = new Map();
  for (const s of matchShots) {
    if (s.idPlayer && s.equipe_id) shotPlayerToEquipe.set(s.idPlayer, s.equipe_id);
  }
  const idTeamToEquipe = new Map();
  for (const ev of events) {
    if (idTeamToEquipe.has(ev.idTeam)) continue;
    const eq = shotPlayerToEquipe.get(ev.idPlayer);
    if (eq) idTeamToEquipe.set(ev.idTeam, eq);
  }
  return idTeamToEquipe;
}

function construirEventosPorTime(events, idTeamToEquipe, bridge) {
  const porTime = new Map();
  for (const ev of events) {
    if (ev.idSkill !== 5 && ev.idSkill !== 24 && ev.idSkill !== 12) continue;
    if ((ev.idSkill === 5 || ev.idSkill === 24) && ev.skillCorrect !== true) continue;

    const equipeId = idTeamToEquipe.get(ev.idTeam);
    if (!equipeId) continue;

    const atletaId = bridge[ev.idPlayer];
    if (!atletaId) continue;

    const posicao = posicaoGranular(atletaId);
    if (!posicao) continue;

    if (!porTime.has(equipeId)) porTime.set(equipeId, { recuperacoes: [], perdas: [] });
    const bucket = porTime.get(equipeId);

    if (ev.idSkill === 12) {
      bucket.perdas.push({ jogadorId: String(atletaId), posicao, quadrante: ev.idQuadrant36 });
    } else {
      bucket.recuperacoes.push({
        jogadorId: String(atletaId),
        posicao,
        quadrante: ev.idQuadrant36,
        fundamento: ev.idSkill === 5 ? "desarme" : "interceptacao",
      });
    }
  }
  return porTime;
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
    const data = await fetchJsonWithRetry(`${SITE_URL}/data/desarmes/${normalized}.json?t=${Date.now()}`);
    existentes = new Set(Object.keys(data.matches || {}));
  } catch { /* arquivo ainda não existe pra esse time — normal na primeira vez */ }
  cacheMatchesExistentes.set(normalized, existentes);
  return existentes;
}

async function salvarDesarmes(payload) {
  if (!ENVIO_REAL) {
    console.log(`  [SIMULAÇÃO] enviaria partida ${payload.matchId}: ${payload.homeTeamKey} x ${payload.awayTeamKey} (rec/perd home=${payload.home.recuperacoes.length}/${payload.home.perdas.length} away=${payload.away.recuperacoes.length}/${payload.away.perdas.length})`);
    return { ok: true, simulado: true };
  }
  const res = await fetch(`${SITE_URL}/api/save-desarmes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-desarmes falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é enviado — rode com ENVIO_REAL=1 pra gravar de verdade)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  const token = await getFootstatsToken();
  const bridge = await loadBridge();
  console.log(`→ bridge idPlayer->atleta_id carregada: ${Object.keys(bridge).length} jogadores conhecidos`);

  console.log(`→ listando partidas do campeonato ${CAMPEONATO_ID} ...`);
  const partidas = await authedGet(`${API_BASE}/api/1.0/campeonatos/${CAMPEONATO_ID}/partidas`, token);
  let jogadas = partidas.filter((m) => m.hasscout && m.finished);
  const limite = Number(process.env.LIMITE_PARTIDAS);
  if (Number.isFinite(limite) && limite > 0) jogadas = jogadas.slice(0, limite);
  console.log(`  ${jogadas.length} partidas finalizadas com scout${limite ? ` (LIMITE_PARTIDAS=${limite})` : ""}`);

  let processadas = 0, puladas = 0, enviadas = 0, bridgeNovos = 0;
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
    const events = fieldPos.data || fieldPos || [];
    if (!events.length || !matchShots.length) continue;

    bridgeNovos += mergeBridgeFromShots(bridge, matchShots);
    const idTeamToEquipe = buildIdTeamBridge(matchShots, events);
    const porTime = construirEventosPorTime(events, idTeamToEquipe, bridge);

    const homeEquipeId = m.sdE_EQUIPE_MANDANTE_ID;
    const awayEquipeId = m.sdE_EQUIPE_VISITANTE_ID;
    const homeBucket = porTime.get(homeEquipeId) || { recuperacoes: [], perdas: [] };
    const awayBucket = porTime.get(awayEquipeId) || { recuperacoes: [], perdas: [] };
    const dataISO = m.date ? m.date.slice(0, 10) : null;

    const payload = {
      matchId: m.id, homeTeamKey: homeSlug, awayTeamKey: awaySlug,
      home: { matchId: m.id, date: dataISO, opponent: awaySlug, home: true, ...homeBucket },
      away: { matchId: m.id, date: dataISO, opponent: homeSlug, home: false, ...awayBucket },
    };

    try {
      await salvarDesarmes(payload);
      enviadas++;
      processadas++;
      if (ENVIO_REAL) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.log(`  ! falha ao salvar desarmes da partida ${m.id}: ${e.message}`);
      partidasComErro.push(`${homeSlug} x ${awaySlug} (id ${m.id}): falha ao salvar — ${e.message}`);
    }
  }

  await saveBridge(bridge);
  console.log(`\n→ bridge ${ENVIO_REAL ? "atualizada" : "que seria atualizada"}: +${bridgeNovos} jogador(es) novo(s), total agora ${Object.keys(bridge).length}`);
  console.log(`✓ ${enviadas} partida(s) ${ENVIO_REAL ? "enviadas" : "que seriam enviadas"} | ${puladas} já existiam nos dois times e foram puladas`);
  if (!ENVIO_REAL) {
    console.log("\nEssa foi uma SIMULAÇÃO — rode com ENVIO_REAL=1 pra gravar de verdade no site ao vivo.");
  }
  if (ENVIO_REAL && partidasComErro.length) {
    await dispatchAlert({
      title: `${partidasComErro.length} partida(s) não atualizaram desarmes (erro ao buscar na FootStats)`,
      details: partidasComErro.join("\n"),
    });
  }
}

main().catch(async (e) => {
  console.error("✗", e);
  if (process.env.ENVIO_REAL === "1") {
    await dispatchAlert({
      title: "harvester de desarmes falhou por completo",
      details: String(e && e.stack ? e.stack : e),
    }).catch(() => {});
  }
  process.exitCode = 1;
});
