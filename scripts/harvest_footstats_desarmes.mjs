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
 * PONTE DE JOGADOR (reescrita em 2026-08-14): o endpoint de escalação da
 * FootStats, que uma investigação anterior (2026-08-11) tinha marcado como
 * "sempre devolve titular/reserva vazios", **voltou a funcionar** — a
 * FootStats deve ter corrigido do lado deles. Re-testado com 11 partidas
 * espalhadas pela temporada inteira (não só 3): 11/11 com escalação
 * completa (11 titulares dos dois lados, zagueiro incluído com posicao
 * "ZAG"). Confirmado também que o `idJogador` da escalação é o MESMO
 * espaço de ID do `idPlayer` em fieldPositionByMatch (jogador de teste
 * tinha 73 eventos reais, incluindo interceptação).
 *
 * A escalação não traz atleta_id (Cartola) diretamente — só nomeJogador —
 * então a ponte idJogador→atleta_id agora tem DUAS fontes, nessa ordem de
 * confiança:
 *   1. `finalizacao-detalhada` (matchShots): dá atleta_id EXATO, sem
 *      ambiguidade, mas só cobre quem finaliza ou assiste.
 *   2. escalação + casamento de NOME contra a API do Cartola
 *      (api.cartola.globo.com/atletas/mercado): cobre TODO MUNDO que
 *      jogou (titular+reserva dos dois times), incluindo zagueiro puro —
 *      o ponto cego que a fonte 1 sozinha nunca resolvia. Testado em uma
 *      partida real: 44/46 jogadores casaram por nome (95.7%; os 2 que
 *      não casaram não pareciam nem estar no elenco atual do Cartola).
 *      Casamento tenta, nessa ordem: nome exato (apelido ou nome
 *      completo) → substring (apelido curto tipo "Alonso" dentro de
 *      "Júnior Alonso") → último sobrenome, desempatado pelo clube_id
 *      quando ambíguo.
 *
 * idEquipe da escalação já vem no MESMO espaço de idTeam usado em
 * fieldPositionByMatch (confirmado: idEquipe=1009 bateu com o idTeam que
 * eu mesmo passei como parâmetro) — então o mapeamento idTeam→equipe_id
 * (Cartola) agora é direto (via /placar + o equipe_id que já vem na
 * própria partida), sem precisar mais cruzar por jogador que finalizou
 * (o que falhava justamente quando um time não tinha nenhum chute).
 *
 * Ponte ACUMULADA de forma persistente em `data/id-bridge-footstats.json`
 * (via GET/POST no site, igual aos outros datasets — não em disco local,
 * porque o GitHub Actions roda com checkout novo a cada execução).
 *
 * Regra de conteúdo (Renato): sem jogador resolvido via bridge OU sem
 * posição confiável, o evento é DESCARTADO por completo — nunca um
 * achado incompleto.
 *
 * ZAGUEIRO — segundo ponto cego, descoberto em 2026-08-14: mesmo com a
 * ponte resolvendo o jogador certinho, `posicoes-granulares.json` (533
 * jogadores, construído pro Mapa de Gols) não tem NENHUMA entrada de
 * zagueiro — só lateral/ponta/meia/volante/atacante, porque zagueiro
 * quase nunca finaliza/assiste, então nunca precisou entrar naquele
 * arquivo. Pra goleiro e zagueiro (posições sem "lado" — não faz sentido
 * granular esquerda/direita), a posição cai pro código genérico que a
 * própria escalação já devolve (GOL/ZAG) em vez de descartar. Pra
 * lateral/meia/volante/atacante (onde o lado importa de verdade),
 * continua exigindo posicoes-granulares.json — sem isso, descarta, como
 * sempre foi.
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

function semAcento(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** carrega o elenco atual do Cartola uma vez (não por partida) pra casar nome->atleta_id. */
async function carregarCartolaAtletas() {
  const res = await fetch("https://api.cartola.globo.com/atletas/mercado");
  const data = await res.json();
  const atletas = data.atletas || [];
  const porNome = new Map();
  const porUltimoNome = new Map();
  for (const a of atletas) {
    for (const campo of [a.apelido, a.nome]) {
      if (!campo) continue;
      const norm = semAcento(campo);
      if (!porNome.has(norm)) porNome.set(norm, a);
      const palavras = norm.split(/\s+/).filter(Boolean);
      const ultima = palavras[palavras.length - 1];
      if (!ultima) continue;
      if (!porUltimoNome.has(ultima)) porUltimoNome.set(ultima, []);
      porUltimoNome.get(ultima).push(a);
    }
  }
  return { porNome, porUltimoNome };
}

/**
 * nomeJogador (escalação, FootStats) -> atleta_id (Cartola). Testado numa
 * partida real: exato pega a maioria, substring/último-nome pegam o resto
 * (apelido curto tipo "Alonso" pra "Júnior Alonso") — 95.7% de acerto.
 */
function encontrarAtletaPorNome(cartola, nomeJogador, clubeIdEsperado) {
  const norm = semAcento(nomeJogador);
  if (!norm) return null;
  const exato = cartola.porNome.get(norm);
  if (exato) return exato;
  for (const [chave, atleta] of cartola.porNome) {
    if (chave.length < 4) continue;
    if (norm.includes(chave) || chave.includes(norm)) {
      if (!clubeIdEsperado || atleta.clube_id === clubeIdEsperado) return atleta;
    }
  }
  const palavras = norm.split(/\s+/).filter(Boolean);
  const ultima = palavras[palavras.length - 1];
  const candidatos = cartola.porUltimoNome.get(ultima) || [];
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length > 1 && clubeIdEsperado) {
    const doTime = candidatos.filter((a) => a.clube_id === clubeIdEsperado);
    if (doTime.length === 1) return doTime[0];
  }
  return null;
}

/** cobre todo mundo que jogou (titular+reserva, os dois times) — inclusive quem nunca finaliza/assiste. */
function mergeBridgeFromEscalacao(bridge, cartola, esc, homeEquipeId, awayEquipeId) {
  let novos = 0;
  const grupos = [
    [esc.titular?.mandante, homeEquipeId], [esc.reserva?.mandante, homeEquipeId],
    [esc.titular?.visitante, awayEquipeId], [esc.reserva?.visitante, awayEquipeId],
  ];
  for (const [lista, equipeId] of grupos) {
    for (const j of lista || []) {
      if (!j.idJogador || bridge[j.idJogador]) continue;
      const atleta = encontrarAtletaPorNome(cartola, j.nomeJogador, equipeId);
      if (atleta) { bridge[j.idJogador] = atleta.atleta_id; novos++; }
    }
  }
  return novos;
}

/**
 * ZAG/GOL da escalação, indexado por idJogador — usado só como fallback
 * quando posicoes-granulares.json não conhece o atleta (ver nota no topo
 * do arquivo). Lateral/meia/volante/atacante nunca usam esse fallback:
 * pra essas posições o lado importa e continua exigindo o arquivo
 * granular, senão descarta — regra do Renato inalterada.
 */
function buildPosicaoFallback(esc) {
  const fallback = new Map();
  const CODIGO_PARA_LABEL = { ZAG: "zagueiro", GOL: "goleiro" };
  const grupos = [esc?.titular?.mandante, esc?.reserva?.mandante, esc?.titular?.visitante, esc?.reserva?.visitante];
  for (const lista of grupos) {
    for (const j of lista || []) {
      const label = CODIGO_PARA_LABEL[j.posicao];
      if (label && j.idJogador) fallback.set(j.idJogador, label);
    }
  }
  return fallback;
}

function construirEventosPorTime(events, idTeamToEquipe, bridge, posicaoFallback) {
  const porTime = new Map();
  for (const ev of events) {
    if (ev.idSkill !== 5 && ev.idSkill !== 24 && ev.idSkill !== 12) continue;
    if ((ev.idSkill === 5 || ev.idSkill === 24) && ev.skillCorrect !== true) continue;

    const equipeId = idTeamToEquipe.get(ev.idTeam);
    if (!equipeId) continue;

    const atletaId = bridge[ev.idPlayer];
    if (!atletaId) continue;

    const posicao = posicaoGranular(atletaId) || posicaoFallback.get(ev.idPlayer) || null;
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
  const cartola = await carregarCartolaAtletas();
  console.log(`→ elenco do Cartola carregado: ${cartola.porNome.size} nomes conhecidos (pra casar com a escalação)`);

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
    // FORCE_REPROCESS=1 ignora o "já existe" e reprocessa tudo de novo —
    // usado pra backfill quando a lógica de resolução de jogador muda
    // (ex: 2026-08-14, quando a ponte passou a cobrir zagueiro).
    const forcar = process.env.FORCE_REPROCESS === "1";
    if (!forcar && existentesHome.has(String(m.id)) && existentesAway.has(String(m.id))) { puladas++; continue; }

    const homeEquipeId = m.sdE_EQUIPE_MANDANTE_ID;
    const awayEquipeId = m.sdE_EQUIPE_VISITANTE_ID;

    let shotDetail, fieldPos, placar;
    try {
      [shotDetail, fieldPos, placar] = await Promise.all([
        authedGet(`${API_BASE}/api/1.0/partidas/${CAMPEONATO_ID}/finalizacao-detalhada/${m.id}/partida`, token),
        authedGet(`${API_BASE}/api/1.0/partidas/${m.id}/fieldPositionByMatch`, token),
        authedGet(`${API_BASE}/api/2.0/partidas/${m.id}/placar`, token),
      ]);
    } catch (e) {
      console.log(`  ! partida ${m.id} (${homeSlug} x ${awaySlug}): ${e.message}`);
      partidasComErro.push(`${homeSlug} x ${awaySlug} (id ${m.id}): ${e.message}`);
      continue;
    }
    const matchShots = shotDetail.matchShots || [];
    const events = fieldPos.data || fieldPos || [];
    if (!events.length) continue;

    const homeIdTeam = placar.home?.idTeam, awayIdTeam = placar.away?.idTeam;
    const idTeamToEquipe = new Map();
    if (homeIdTeam) idTeamToEquipe.set(homeIdTeam, homeEquipeId);
    if (awayIdTeam) idTeamToEquipe.set(awayIdTeam, awayEquipeId);

    bridgeNovos += mergeBridgeFromShots(bridge, matchShots);
    let posicaoFallback = new Map();
    if (homeIdTeam && awayIdTeam) {
      try {
        const esc = await authedGet(`${API_BASE}/api/2.0/partidas/${m.id}/championship/${CAMPEONATO_ID}/teamHome/${homeIdTeam}/teamAway/${awayIdTeam}/escalacao`, token);
        bridgeNovos += mergeBridgeFromEscalacao(bridge, cartola, esc, homeEquipeId, awayEquipeId);
        posicaoFallback = buildPosicaoFallback(esc);
      } catch (e) {
        console.log(`  ! escalação indisponível pra partida ${m.id}: ${e.message} (segue só com a ponte de chutes)`);
      }
    }

    const porTime = construirEventosPorTime(events, idTeamToEquipe, bridge, posicaoFallback);
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
