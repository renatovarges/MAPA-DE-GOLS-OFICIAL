import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";
import { carregarCartolaAtletas, encontrarAtletaPorNome } from "./lib/cartola-name-match.mjs";

/**
 * Harvester RAIO X OFENSIVO — base consolidada por jogador/partida
 * -----------------------------------------------------------------------
 * Alimenta a aba "Raio X Ofensivo" (conceito fechado por escrito com o
 * Renato em 2026-08-19): cruza o que cada jogador CONQUISTA (gol,
 * assistência, finalização, xG, grande chance criada) com o que o
 * adversário do confronto CEDE na mesma posição.
 *
 * Três fontes, uma por métrica:
 *   - FootStats matchShots: gol (goal:true), assistência (atleta_id_assistente
 *     num chute que virou gol), finalização (toda linha) — mesmo dado já
 *     usado no Mapa de Finalizações, só reagregado por jogador/partida em
 *     vez de por chute.
 *   - SofaScore /event/{id}/lineups: xG, xA e grande chance criada por
 *     jogador — confirmado com dado real (2026-08-19) que vem direto nessa
 *     rota, sem precisar de shotmap. Chaves com valor 0 vêm OMITIDAS pela
 *     API (ausência = zero, não "sem dado").
 *
 *     IMPORTANTE: isso NÃO é buscado aqui (Node/Playwright) — achado real
 *     (2026-08-19): a API do SofaScore devolve 403 pra QUALQUER Chromium
 *     "cru" do Playwright (fingerprint de automação, não é limite de
 *     volume). Resolvido reaproveitando a técnica que o projeto
 *     dash-analise-futebol-main já validou: `scripts/harvest_sofascore_
 *     raiox.py` (lib `soccerdata`, TLS impersonation) busca tudo e grava
 *     `scripts/.cache/sofascore-raiox.json` — ESTE script só LÊ esse cache.
 *     Rodar o .py sempre antes do .mjs (dois passos, não um só).
 *   - escalação + data/lado-inferido.json: mesma resolução de posição
 *     granular (ZAG/GOL/VOL/MEI direto, LAT via tendência de quadrante) já
 *     validada nos harvesters de desarmes/finalizações — reaproveitada
 *     aqui, não reinventada.
 *
 * PONTE matchId (FootStats) <-> eventId (SofaScore): por (data em horário
 * de Brasília | slug mandante | slug visitante) — confirmado 225/225
 * (100%) na temporada inteira em 2026-08-19. A data tem que ser convertida
 * pro fuso de Brasília (não UTC): jogo noturno já vira o dia seguinte em
 * UTC e quebrava o cruzamento (84% só de acerto até corrigir isso).
 *
 * PONTE de jogador SofaScore -> atleta_id (Cartola): por nome, reaproveitando
 * o mesmo algoritmo (semAcento/encontrarAtletaPorNome, 95.7% de acerto
 * validado) já usado pra escalação da FootStats -> Cartola.
 *
 * Cada jogador só entra na lista `for` de uma partida se tiver PELO MENOS
 * UM evento ofensivo registrado (gol, assistência, finalização, xG>0, xA>0
 * ou grande chance criada) — jogador sem nenhum sinal não é gravado (regra
 * de conteúdo do projeto: sem posição confiável OU sem sinal, descarta).
 *
 * Saída: data/raio-x/{time}.json — `matches` por matchId, cada um com
 * `for` (produção do próprio time) e `against` (o que o adversário fez
 * naquela partida, do ponto de vista de quem cede) — mesmo padrão de
 * shots_for/shots_against do Mapa de Finalizações.
 *
 * Rodar: ENVIO_REAL=1 pra gravar de verdade, LIMITE_PARTIDAS pra testar em
 * lote pequeno, FORCE_REPROCESS=1 pra reprocessar partida já existente.
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

const LATERAL_MIN_AMOSTRA = 5;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const posicoes = JSON.parse(fs.readFileSync(path.join(__dirname, "posicoes-granulares.json"), "utf8"));

function posicaoGranular(atletaId) {
  if (!atletaId) return null;
  return posicoes[String(atletaId)] || null;
}

/** posição granular -> balde genérico usado na aba (ATA/MEI/VOL/ZAG/LAT-ESQ/LAT-DIR). */
/**
 * 8 baldes, não 6 — pedido do Renato (2026-08-19, depois de ver o primeiro
 * visual): "ATA" genérico escondia se a brecha era de ponta ou de
 * centroavante, e isso é informação central pro Raio X ("caracterização de
 * onde eles podem explorar"). Cada balde granular já existe na posição
 * resolvida (posicoes-granulares.json ou fallback) — só não estava sendo
 * usado assim na hora de agrupar.
 */
function baldeDaPosicao(label) {
  const MAPA = {
    zagueiro: "ZAG", volante: "VOL", meia: "MEI",
    "lateral-esquerdo": "LAT-ESQ", "lateral-direito": "LAT-DIR",
    "atacante-area": "CENTROAVANTE", "ponta-esquerda": "PONTA-ESQ", "ponta-direita": "PONTA-DIR",
  };
  return MAPA[label] || null;
}

/** mesma lógica dos outros harvesters: ZAG/GOL/VOL/MEI direto, LAT via tendência de quadrante. */
function buildPosicaoFallbackPorAtleta(esc, cartola, ladoInferido, homeEquipeId, awayEquipeId) {
  const CODIGO_DIRETO = { ZAG: "zagueiro", GOL: "goleiro", VOL: "volante", MEI: "meia" };
  const fallback = new Map();
  const grupos = [
    [esc?.titular?.mandante, homeEquipeId], [esc?.reserva?.mandante, homeEquipeId],
    [esc?.titular?.visitante, awayEquipeId], [esc?.reserva?.visitante, awayEquipeId],
  ];
  for (const [lista, equipeId] of grupos) {
    for (const j of lista || []) {
      if (!j.idJogador) continue;
      let label = CODIGO_DIRETO[j.posicao];
      if (!label && j.posicao === "LAT") {
        const acc = ladoInferido[j.idJogador];
        if (acc && acc.n >= LATERAL_MIN_AMOSTRA) {
          const media = acc.somaRow / acc.n;
          label = media <= 3.5 ? "lateral-esquerdo" : "lateral-direito";
        }
      }
      if (!label) continue;
      const atleta = encontrarAtletaPorNome(cartola, j.nomeJogador, equipeId);
      if (atleta) fallback.set(String(atleta.atleta_id), label);
    }
  }
  return fallback;
}

async function authedGet(url, token) {
  return fetchJsonWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
}

/** agrega os chutes (grão fino) por atleta_id -> {gol, assistencia, finalizacoes}, num único passe. */
function agregarPorJogador(matchShots) {
  const porJogador = new Map();
  const bump = (id, campo) => {
    const key = String(id);
    if (!porJogador.has(key)) porJogador.set(key, { gol: 0, assistencia: 0, finalizacoes: 0 });
    porJogador.get(key)[campo]++;
  };
  for (const s of matchShots) {
    if (!s.atleta_id) continue;
    bump(s.atleta_id, "finalizacoes");
    if (s.goal) {
      bump(s.atleta_id, "gol");
      if (s.atleta_id_assistente > 0) bump(s.atleta_id_assistente, "assistencia");
    }
  }
  return porJogador;
}

function construirEntradasTime(matchShots, equipeIdDoTime, posicaoFallback, sofaPorAtletaId) {
  const agregados = agregarPorJogador(matchShots.filter((s) => s.equipe_id === equipeIdDoTime));
  const nomesById = new Map();
  for (const s of matchShots) {
    if (s.equipe_id === equipeIdDoTime && s.atleta_id) nomesById.set(String(s.atleta_id), s.nickname);
  }
  const entradas = [];
  for (const [atletaId, nums] of agregados) {
    const posGranular = posicaoGranular(atletaId) || posicaoFallback.get(atletaId) || null;
    const balde = baldeDaPosicao(posGranular);
    if (!balde) continue; // sem posição confiável -> descarta (regra do projeto)
    const sofa = sofaPorAtletaId.get(atletaId) || { xg: 0, xa: 0, grandeChanceCriada: 0 };
    const temSinal = nums.gol || nums.assistencia || nums.finalizacoes || sofa.xg || sofa.xa || sofa.grandeChanceCriada;
    if (!temSinal) continue;
    entradas.push({
      jogadorId: atletaId,
      // nickname da FootStats só existe pra quem FINALIZA (é o campo do
      // chutador) -- jogador que só assiste (nunca chuta na janela) cai
      // sem nome ali; o SofaScore cobre esse buraco (achado real,
      // 2026-08-19: jogador aparecia como "—" na tela).
      nome: nomesById.get(atletaId) || sofaPorAtletaId.get(atletaId)?.nome || null,
      posicao: posGranular,
      balde,
      gol: nums.gol,
      assistencia: nums.assistencia,
      finalizacoes: nums.finalizacoes,
      xg: Math.round((sofa.xg || 0) * 1000) / 1000,
      xa: Math.round((sofa.xa || 0) * 1000) / 1000,
      grandeChanceCriada: sofa.grandeChanceCriada || 0,
    });
  }
  return entradas;
}

/** um POST só com os dois times — mesmo padrão do /api/save-desarmes. */
async function saveMatchData(matchId, homeTeamKey, awayTeamKey, homeEntry, awayEntry) {
  if (!ENVIO_REAL) {
    console.log(`  [dry-run] gravaria raio-x de ${homeTeamKey} e ${awayTeamKey} (match ${matchId})`);
    return;
  }
  const res = await fetch(`${SITE_URL}/api/save-raio-x`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId: String(matchId), homeTeamKey, awayTeamKey, home: homeEntry, away: awayEntry }),
  });
  if (!res.ok) throw new Error(`falha ao salvar raio-x: HTTP ${res.status}`);
}

const cacheMatchesExistentes = new Map();
async function matchesExistentesDoTime(slug) {
  const normalized = NORMALIZE_KEY[slug] || slug;
  if (cacheMatchesExistentes.has(normalized)) return cacheMatchesExistentes.get(normalized);
  let existentes = new Set();
  try {
    const data = await fetchJsonWithRetry(`${SITE_URL}/data/raio-x/${normalized}.json?t=${Date.now()}`);
    existentes = new Set(Object.keys(data.matches || {}));
  } catch { /* arquivo ainda não existe pra esse time — normal na primeira vez */ }
  cacheMatchesExistentes.set(normalized, existentes);
  return existentes;
}

async function main() {
  console.log(`=== Harvester Raio X Ofensivo ===`);
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é gravado)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  const token = await getFootstatsToken();
  const cartola = await carregarCartolaAtletas();
  console.log(`→ elenco do Cartola carregado`);

  let ladoInferido = {};
  try {
    ladoInferido = await fetchJsonWithRetry(`${SITE_URL}/data/lado-inferido.json?t=${Date.now()}`);
  } catch { /* segue sem tendência de lado — LAT fica sem posição até acumular */ }
  console.log(`→ tendência de lado carregada: ${Object.keys(ladoInferido).length} jogadores`);

  console.log(`→ listando partidas do campeonato ${CAMPEONATO_ID} ...`);
  const partidas = await authedGet(`${API_BASE}/api/1.0/campeonatos/${CAMPEONATO_ID}/partidas`, token);
  let jogadas = (partidas || []).filter((m) => m.hasscout && m.finished);
  const limite = Number(process.env.LIMITE_PARTIDAS);
  if (Number.isFinite(limite) && limite > 0) jogadas = jogadas.slice(0, limite);
  console.log(`  ${jogadas.length} partidas finalizadas com scout${limite ? ` (LIMITE_PARTIDAS=${limite})` : ""}`);

  console.log(`→ carregando cache do SofaScore (scripts/.cache/sofascore-raiox.json) ...`);
  const cachePath = path.join(__dirname, ".cache", "sofascore-raiox.json");
  if (!fs.existsSync(cachePath)) {
    throw new Error(
      `cache do SofaScore não encontrado (${cachePath}). Rode primeiro: python scripts/harvest_sofascore_raiox.py`,
    );
  }
  const sofaCache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const eventosPorChave = new Map();
  for (const e of sofaCache.eventos || []) {
    const key = `${e.date}|${e.homeSlug}|${e.awaySlug}`;
    eventosPorChave.set(key, e.eventId);
  }
  console.log(`  ${eventosPorChave.size} eventos indexados (cache gerado com ${(sofaCache.eventos || []).length} eventos)`);

  {
    let processadas = 0, puladas = 0, semSofascore = 0, enviadas = 0;
    const forcar = process.env.FORCE_REPROCESS === "1";
    const partidasComErro = [];

    for (const m of jogadas) {
      const homeSlug = CLUBE_ID[m.sdE_EQUIPE_MANDANTE_ID];
      const awaySlug = CLUBE_ID[m.sdE_EQUIPE_VISITANTE_ID];
      if (!homeSlug || !awaySlug) continue;

      const [existentesHome, existentesAway] = await Promise.all([
        matchesExistentesDoTime(homeSlug), matchesExistentesDoTime(awaySlug),
      ]);
      if (!forcar && existentesHome.has(String(m.id)) && existentesAway.has(String(m.id))) { puladas++; continue; }

      const homeEquipeId = m.sdE_EQUIPE_MANDANTE_ID;
      const awayEquipeId = m.sdE_EQUIPE_VISITANTE_ID;

      let shotDetail, placar;
      try {
        [shotDetail, placar] = await Promise.all([
          authedGet(`${API_BASE}/api/1.0/partidas/${CAMPEONATO_ID}/finalizacao-detalhada/${m.id}/partida`, token),
          authedGet(`${API_BASE}/api/2.0/partidas/${m.id}/placar`, token),
        ]);
      } catch (e) {
        console.log(`  ! partida ${m.id} (${homeSlug} x ${awaySlug}): ${e.message}`);
        partidasComErro.push(`${homeSlug} x ${awaySlug} (id ${m.id}): ${e.message}`);
        continue;
      }
      const matchShots = shotDetail?.matchShots || [];
      if (!matchShots.length) continue;

      let posicaoFallback = new Map();
      const homeIdTeam = placar.home?.idTeam, awayIdTeam = placar.away?.idTeam;
      if (homeIdTeam && awayIdTeam) {
        try {
          const esc = await authedGet(`${API_BASE}/api/2.0/partidas/${m.id}/championship/${CAMPEONATO_ID}/teamHome/${homeIdTeam}/teamAway/${awayIdTeam}/escalacao`, token);
          posicaoFallback = buildPosicaoFallbackPorAtleta(esc, cartola, ladoInferido, homeEquipeId, awayEquipeId);
        } catch (e) {
          console.log(`  ! escalação indisponível pra partida ${m.id}: ${e.message} (segue só com posicoes-granulares.json)`);
        }
      }

      // SofaScore: casa pela chave (data BRT | slug mandante | slug visitante), depois por nome de jogador.
      const dataISO = m.date ? m.date.slice(0, 10) : null;
      const chaveSofa = `${dataISO}|${homeSlug}|${awaySlug}`;
      const eventIdSofa = eventosPorChave.get(chaveSofa);
      const sofaPorAtletaId = new Map();
      const presentesHome = [], presentesAway = [];
      if (eventIdSofa) {
        const statsJogadores = sofaCache.stats?.[String(eventIdSofa)] || [];
        for (const s of statsJogadores) {
          // clube esperado (mesmo valor de equipe_id usado no resto do
          // harvester) desambigua nomes genéricos (ex.: "Gabriel" existe em
          // vários times) -- sem isso, o casamento pode acertar o atleta_id
          // ERRADO e o jogador certo fica com presença zerada mesmo tendo
          // gol/finalização reais vindos da FootStats (achado real,
          // 2026-08-19: Gabriel do Santos aparecia "presente 0/5" com gol
          // registrado).
          const clubeEsperado = s.side === "home" ? homeEquipeId : awayEquipeId;
          const atleta = encontrarAtletaPorNome(cartola, s.nome, clubeEsperado);
          if (!atleta) continue;
          const atletaId = String(atleta.atleta_id);
          sofaPorAtletaId.set(atletaId, { xg: s.xg, xa: s.xa, grandeChanceCriada: s.grandeChanceCriada, nome: s.nome });
          // presença (jogou de verdade, minutesPlayed != null) -- distinta de
          // ter sinal ofensivo, usada só pro corte de 50% dos jogos no
          // desempate (ver motor de cálculo). `side` já é do ponto de vista
          // do SofaScore, mas casa 1:1 com home/away da FootStats porque a
          // ponte de partida já casa pelas mesmas equipes.
          (s.side === "home" ? presentesHome : presentesAway).push(atletaId);
        }
      } else {
        semSofascore++;
      }

      const entradasHome = construirEntradasTime(matchShots, homeEquipeId, posicaoFallback, sofaPorAtletaId);
      const entradasAway = construirEntradasTime(matchShots, awayEquipeId, posicaoFallback, sofaPorAtletaId);

      const roundNumber = Number(m.round) || null;
      const entryHome = { date: dataISO, roundNumber, opponent: awaySlug, home: true, for: entradasHome, against: entradasAway, presentes: presentesHome };
      const entryAway = { date: dataISO, roundNumber, opponent: homeSlug, home: false, for: entradasAway, against: entradasHome, presentes: presentesAway };

      await saveMatchData(m.id, homeSlug, awaySlug, entryHome, entryAway);
      enviadas++;
      processadas++;
      if (processadas % 20 === 0) console.log(`  ... ${processadas}/${jogadas.length}`);
    }

    console.log(`\n=== concluído ===`);
    console.log(`✓ ${enviadas} partida(s) processada(s) | ${puladas} já existiam | ${semSofascore} sem correspondente no SofaScore`);
    if (partidasComErro.length) {
      console.log(`! ${partidasComErro.length} partida(s) com erro:`);
      partidasComErro.forEach((l) => console.log(`  - ${l}`));
      if (ENVIO_REAL) await dispatchAlert("Harvester Raio X Ofensivo — partidas com erro", partidasComErro.join("\n"));
    }
  }
}

main().catch(async (e) => {
  console.error("✗ erro fatal:", e);
  if (ENVIO_REAL) await dispatchAlert("Harvester Raio X Ofensivo — erro fatal", e.message);
  process.exitCode = 1;
});
