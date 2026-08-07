import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";

/**
 * Harvester automático de gols — Mapa de Finalizações
 * ----------------------------------------------------
 * Substitui o registro manual (assistir vídeo de melhores momentos e clicar
 * no campo) por dado direto da API da FootStats.
 *
 * ACHADO CRÍTICO DE ARQUITETURA (2026-08, descoberto só depois de publicar
 * a primeira versão e o Renato notar que o site não mudou nada): o Render
 * hospeda esse serviço com um DISCO PERSISTENTE de 10GB — a pasta `data/`
 * que o servidor de fato lê NÃO vem do Git a cada deploy, ela mora nesse
 * disco, que sobrevive entre deploys e só é alimentada por quem ESCREVE
 * NELE EM TEMPO REAL (o próprio servidor rodando, via `/api/save-round`).
 * Confirmado comparando o header `Last-Modified` de dois arquivos do MESMO
 * deploy: um script novo veio com data de hoje, `data/flamengo.json` veio
 * com data de maio — meses atrás. Ou seja: a primeira versão deste
 * harvester escrevia só no Git, o commit chegava certinho no GitHub, mas
 * NUNCA alcançava o disco que o site realmente serve. Por isso agora:
 *
 *   1. Este script NÃO escreve mais arquivo local nenhum. Ele CONSULTA o
 *      site AO VIVO (`SITE_URL/data/{time}.json`) pra saber quais rodadas
 *      já existem de verdade, e ENVIA as que faltam pro MESMO endpoint que
 *      o editor manual usa (`POST SITE_URL/api/save-round`) — exatamente
 *      como se um humano tivesse clicado "Salvar rodada". O próprio
 *      servidor cuida de gravar no disco E de sincronizar com o GitHub
 *      (usa o `GITHUB_TOKEN` que já está configurado lá, ver server.py).
 *   2. `/api/save-round` NÃO tem nenhuma proteção contra sobrescrita — quem
 *      chama decide o que manda. Por isso a checagem "essa rodada já existe
 *      pra esse time?" agora é feita AQUI, contra o dado ao vivo, e o
 *      payload manda `home: null` ou `away: null` pro lado que já existe,
 *      pra nunca sobrescrever nada que já esteja lá (nem manual, nem de uma
 *      execução anterior deste script).
 *   3. Por padrão o script roda em MODO SIMULAÇÃO (não envia nada de
 *      verdade, só mostra o que enviaria) — só grava em produção com
 *      `ENVIO_REAL=1`. Depois do susto de descobrir que a v1 não fazia
 *      nada, essa trava existe pra nunca mais rodar isso "no escuro".
 *
 * SEGUNDO ACHADO CRÍTICO (mesmo dia): mandar várias rodadas em sequência
 * derrubava o site com erro 502, mesmo com pausa entre os envios. Causa
 * real, achada no log do Render: o serviço estava com "Auto-Deploy: On
 * Commit" — cada `/api/save-round` bem-sucedido comita no GitHub, e cada
 * commit disparava um REDEPLOY COMPLETO do serviço (~25s de reinício). Uma
 * rodada nova enviada durante essa janela de reinício batia num servidor
 * caindo ou ainda subindo = 502. A correção foi desligar o Auto-Deploy no
 * Render (Settings > Build & Deploy > Auto-Deploy > Off) — sem prejuízo
 * nenhum, porque o dado já fica ao vivo no disco no instante em que
 * `/api/save-round` grava, ANTES até do commit no GitHub começar; o
 * redeploy automático nunca foi necessário pra dado aparecer no site, só
 * pra código (index.html/script.js/server.py cru). Com Auto-Deploy
 * desligado, atualização de CÓDIGO passa a exigir "Manual Deploy" no
 * painel do Render — atualização de DADO continua 100% automática.
 *
 * O QUE VEM DIRETO DA FOOTSTATS (preciso, não aproximado):
 *   - shotPlayer / assistPlayer: `atleta_id`/`atleta_id_assistente` batem
 *     EXATO com o id já usado neste projeto.
 *   - is_penalty: originOfShot === "PENALTI".
 *   - isHeader: bodyPart === "CABECA".
 *   - se foi gol: campo `goal` (booleano).
 *   - coordenada do lado que SOFREU o gol: EXATA — rotação 180° da
 *     coordenada de quem fez o gol (`{x: PITCH.maxX - x, y: PITCH.maxY - y}`,
 *     PITCH.maxX=96, maxY=68 — mesma fórmula do script.js).
 *
 * O QUE É APROXIMADO (aceito explicitamente pelo Renato, 2026-08):
 *   - shot.{x,y}: regressão linear calibrada contra ~330 gols já
 *     registrados manualmente — R²≈0.77 nos dois eixos.
 *   - pass.{x,y}: centro do quadrante (grade 6x6) do fundamento
 *     "Assistência"/"Assistência pra finalização" da FootStats. A ponte
 *     entre o ID interno da FootStats (usado nesse fundamento) e o ID
 *     estilo Cartola (usado na lista de gols) é construída PRA CADA
 *     PARTIDA a partir dos próprios chutes (cada chute traz os dois IDs do
 *     mesmo jogador lado a lado) — sem essa ponte, os dois nunca casam
 *     (taxa de acerto medida: 98,4%, 63/64 assistências reais testadas).
 *
 * O QUE FICA DE FORA (testado e descartado — limitação real da fonte, não
 * falta de esforço):
 *   - own_goal (gol contra): a FootStats não registra em NENHUM endpoint
 *     testado. Confirmado batendo o placar oficial contra os gols achados
 *     (ver `divergenciasPlacar` abaixo) — quando não bate, é sempre isso.
 *     Continua manual; o script avisa exatamente em qual jogo procurar.
 *
 * Como rodar (a partir da RAIZ do repositório):
 *   1. cd scripts && npm install && cd ..
 *      (o package.json fica DENTRO de scripts/, de propósito — a raiz do
 *      repositório precisa continuar "limpa" de Node pro Render, que só
 *      espera Python aqui, ver render.yaml.)
 *   2. cd scripts && npx playwright install --with-deps chromium && cd ..
 *   3. Criar um arquivo .env.local NA RAIZ do repositório com:
 *        FOOTSTATS_EMAIL=seu-email
 *        FOOTSTATS_PASSWORD=sua-senha
 *   4. node --env-file=.env.local scripts/harvest_footstats_goals.mjs
 *      → roda em modo SIMULAÇÃO, só mostra o que faria.
 *   5. ENVIO_REAL=1 node --env-file=.env.local scripts/harvest_footstats_goals.mjs
 *      → agora sim grava de verdade no site ao vivo.
 *      (LIMITE_PARTIDAS=5 antes do comando testa só nas 5 primeiras partidas)
 *
 * Também roda sozinho, todo dia, via GitHub Actions — ver
 * .github/workflows/harvest-footstats.yml.
 */

const CAMPEONATO_ID = 1395;
const API_BASE = "https://gather-api-app.footstats.com.br";
const CARTOLA_API = "https://api.cartola.globo.com/atletas/mercado";
const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";

// clube_id (Cartola) -> slug do time — os 20 IDs foram conferidos batendo
// com server.py::CLUBE_ID_TO_KEY do próprio site, são idênticos.
const CLUBE_ID = {
  262: "flamengo", 263: "botafogo", 264: "corinthians", 265: "bahia", 266: "fluminense",
  267: "vasco", 275: "palmeiras", 276: "sao-paulo", 277: "santos", 280: "red-bull-bragantino",
  282: "atletico-mg", 283: "cruzeiro", 284: "gremio", 285: "internacional", 287: "vitoria",
  293: "athletico-pr", 294: "coritiba", 315: "chapecoense", 364: "remo", 2305: "mirassol",
};
const NORMALIZE_KEY = { athletico_pr: "athletico-pr", atletico_mg: "atletico-mg", sao_paulo: "sao-paulo", red_bull_bragantino: "red-bull-bragantino" };

// PITCH do próprio script.js — unidades lógicas do campo (largura lógica
// 100, altura lógica 68, como um campo real — não é 0-100 nos dois eixos).
const PITCH = { unitsX: 100, unitsY: 68, maxX: 96, maxY: 68 };

function footstatsToShotXY(fsX, fsY) {
  const x = clamp(-0.09523 * fsY + 92.15, 0, PITCH.unitsX);
  const y = clamp(0.08600 * fsX + 0.47, 0, PITCH.unitsY);
  return { x, y };
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/** rotate180 — idêntico ao de script.js::computeRoundPayload. */
function rotate180(pt) {
  return { x: PITCH.maxX - pt.x, y: PITCH.maxY - pt.y };
}

/** centro do quadrante 1-36 (grade 6x6) em unidades lógicas do campo. */
function quadrantCentroid(idQuadrant36) {
  if (!Number.isInteger(idQuadrant36) || idQuadrant36 < 1 || idQuadrant36 > 36) return null;
  const col = Math.ceil(idQuadrant36 / 6);
  const row = ((idQuadrant36 - 1) % 6) + 1;
  return { x: ((col - 0.5) / 6) * PITCH.unitsX, y: ((row - 0.5) / 6) * PITCH.unitsY };
}

async function authedGet(url, token) {
  return fetchJsonWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
}

/** roster de jogadores (id -> nome/posição) via API oficial do Cartola. */
async function buildRoster() {
  const data = await fetchJsonWithRetry(CARTOLA_API, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  const posicaoNome = { 1: "Goleiro", 2: "Lateral", 3: "Zagueiro", 4: "Meia", 5: "Atacante", 6: "Técnico" };
  const roster = new Map();
  for (const a of data.atletas || []) {
    roster.set(String(a.atleta_id), {
      id: String(a.atleta_id), name: a.apelido || a.nome, fullName: a.nome,
      position: posicaoNome[a.posicao_id] || "", side: null,
    });
  }
  return roster;
}

/** team = SEMPRE o time de quem marcou NAQUELA partida — nunca o clube atual do jogador (ver types no cabeçalho: transferência já causou bug real aqui). */
function playerRef(roster, footstatsId, teamNaPartida) {
  if (!footstatsId || Number(footstatsId) <= 0) return null;
  const found = roster.get(String(footstatsId));
  if (found) return { ...found, team: teamNaPartida };
  return { id: String(footstatsId), name: "?", fullName: "?", position: "", side: null, team: teamNaPartida };
}

/** ponte idPlayer (interno FootStats) -> atleta_id (estilo Cartola), construída a partir dos chutes da própria partida — ver achado no cabeçalho. */
function buildIdBridge(matchShots) {
  const bridge = new Map();
  for (const s of matchShots) {
    if (s.idPlayer && s.atleta_id) bridge.set(s.idPlayer, s.atleta_id);
    if (s.idAssistantPlayer && s.atleta_id_assistente) bridge.set(s.idAssistantPlayer, s.atleta_id_assistente);
  }
  return bridge;
}

/** busca as rodadas já existentes AO VIVO pra um time — fonte de verdade agora é o site, não o Git (ver achado no cabeçalho). */
const cacheRodadasExistentes = new Map();
async function rodadasExistentesDoTime(slug) {
  const normalized = NORMALIZE_KEY[slug] || slug;
  if (cacheRodadasExistentes.has(normalized)) return cacheRodadasExistentes.get(normalized);
  let existentes = new Set();
  try {
    const data = await fetchJsonWithRetry(`${SITE_URL}/data/${normalized}.json?t=${Date.now()}`);
    existentes = new Set(Object.keys(data.rounds || {}));
  } catch (e) {
    console.log(`  ! não consegui ler data/${normalized}.json ao vivo (${e.message}) — assumindo vazio, cuidado`);
  }
  cacheRodadasExistentes.set(normalized, existentes);
  return existentes;
}

async function salvarRodada(payload) {
  if (!ENVIO_REAL) {
    console.log(`  [SIMULAÇÃO] enviaria rodada ${payload.roundNumber}: ${payload.homeTeamKey} x ${payload.awayTeamKey} (home=${!!payload.home}, away=${!!payload.away})`);
    return { ok: true, simulado: true };
  }
  const res = await fetch(`${SITE_URL}/api/save-round`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-round falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é enviado — rode com ENVIO_REAL=1 pra gravar de verdade)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  console.log("→ carregando elenco (API oficial do Cartola) ...");
  const roster = await buildRoster();
  console.log(`  ${roster.size} jogadores mapeados`);

  console.log("→ autenticando na FootStats ...");
  const token = await getFootstatsToken();

  console.log(`→ listando partidas do campeonato ${CAMPEONATO_ID} ...`);
  const partidas = await authedGet(`${API_BASE}/api/1.0/campeonatos/${CAMPEONATO_ID}/partidas`, token);
  let jogadas = partidas.filter((m) => m.hasscout && m.finished);
  const limite = Number(process.env.LIMITE_PARTIDAS);
  if (Number.isFinite(limite) && limite > 0) jogadas = jogadas.slice(0, limite);
  console.log(`  ${jogadas.length} partidas finalizadas com scout${limite ? ` (LIMITE_PARTIDAS=${limite})` : ""}`);

  let totalGols = 0, comAssistPossivel = 0, assistCasada = 0;
  let rodadasEnviadas = 0, rodadasPuladas = 0;
  const divergenciasPlacar = [];

  // LIMITE_ENVIOS: pra depois do susto do 502 (muitos /api/save-round em
  // sequência pareceram esgotar algum recurso do servidor pequeno do
  // Render) — permite mandar em lotes controlados, com pausa entre lotes.
  const limiteEnvios = Number(process.env.LIMITE_ENVIOS);
  const temLimiteEnvios = Number.isFinite(limiteEnvios) && limiteEnvios > 0;

  for (let i = 0; i < jogadas.length; i++) {
    if (temLimiteEnvios && rodadasEnviadas >= limiteEnvios) {
      console.log(`\n(parando aqui — LIMITE_ENVIOS=${limiteEnvios} atingido; rode de novo pra continuar o restante)`);
      break;
    }
    const m = jogadas[i];
    const homeSlug = CLUBE_ID[m.sdE_EQUIPE_MANDANTE_ID];
    const awaySlug = CLUBE_ID[m.sdE_EQUIPE_VISITANTE_ID];
    if (!homeSlug || !awaySlug) continue;

    const rodada = Number(m.round);
    const [existentesHome, existentesAway] = await Promise.all([
      rodadasExistentesDoTime(homeSlug), rodadasExistentesDoTime(awaySlug),
    ]);
    const homeJaExiste = existentesHome.has(String(rodada));
    const awayJaExiste = existentesAway.has(String(rodada));
    if (homeJaExiste && awayJaExiste) { rodadasPuladas++; continue; } // já registrado dos dois lados — intocável

    let shotDetail, fieldPos;
    try {
      [shotDetail, fieldPos] = await Promise.all([
        authedGet(`${API_BASE}/api/1.0/partidas/${CAMPEONATO_ID}/finalizacao-detalhada/${m.id}/partida`, token),
        authedGet(`${API_BASE}/api/1.0/partidas/${m.id}/fieldPositionByMatch`, token),
      ]);
    } catch (e) {
      console.log(`  ! partida ${m.id} (${homeSlug} x ${awaySlug}): ${e.message}`);
      continue;
    }

    const matchShots = shotDetail.matchShots || [];
    const gols = matchShots.filter((s) => s.goal).sort((a, b) => (a.timePlayInSeconds ?? 0) - (b.timePlayInSeconds ?? 0));
    if (!gols.length) continue;

    const placarOficial = (Number(m.goalshome) || 0) + (Number(m.goalsaway) || 0);
    if (placarOficial > 0 && gols.length !== placarOficial) {
      divergenciasPlacar.push({
        homeSlug, awaySlug, rodada: m.round, data: m.date ? m.date.slice(0, 10) : "?",
        oficial: placarOficial, achados: gols.length,
      });
    }

    const bridge = buildIdBridge(matchShots);
    const filaAssistPorAtletaId = new Map();
    for (const ev of fieldPos.data || []) {
      if (ev.idSkill !== 27 && ev.idSkill !== 28) continue;
      const atletaId = bridge.get(ev.idPlayer);
      if (!atletaId) continue;
      const key = String(atletaId);
      if (!filaAssistPorAtletaId.has(key)) filaAssistPorAtletaId.set(key, []);
      filaAssistPorAtletaId.get(key).push(ev);
    }

    const dataISO = m.date ? m.date.slice(0, 10) : null;
    const createdHome = [], concededHome = [], createdAway = [], concededAway = [];

    for (const s of gols) {
      totalGols++;
      const isPenalty = s.originOfShot === "PENALTI";
      const isHeader = s.bodyPart === "CABECA";
      const timeQueMarcou = CLUBE_ID[s.equipe_id];
      if (!timeQueMarcou) continue;
      const timeQueSofreu = timeQueMarcou === homeSlug ? awaySlug : homeSlug;

      const shotXY = footstatsToShotXY(s.fieldPositionX, s.fieldPositionY);
      let passXY = null;
      if (!isPenalty && s.atleta_id_assistente > 0) {
        comAssistPossivel++;
        const fila = filaAssistPorAtletaId.get(String(s.atleta_id_assistente));
        const ev = fila && fila.length ? fila.shift() : null;
        if (ev) { passXY = quadrantCentroid(ev.idQuadrant36); assistCasada++; }
      }

      const shotPlayer = playerRef(roster, s.atleta_id, timeQueMarcou);
      const assistPlayer = isPenalty ? null : playerRef(roster, s.atleta_id_assistente, timeQueMarcou);
      const flags = { ...(isPenalty ? { is_penalty: true } : {}), ...(isHeader ? { isHeader: true } : {}) };
      const golCriado = { pass: passXY, shot: shotXY, assistPlayer, shotPlayer, ...flags };
      const golSofrido = { pass: passXY ? rotate180(passXY) : null, shot: rotate180(shotXY), assistPlayer, shotPlayer, ...flags };

      if (timeQueMarcou === homeSlug) { createdHome.push(golCriado); concededAway.push(golSofrido); }
      else { createdAway.push(golCriado); concededHome.push(golSofrido); }
    }

    // payload no MESMO formato que script.js::computeRoundPayload manda pro
    // /api/save-round — home/away vem null pro lado que já existe, pra
    // nunca sobrescrever o que já está registrado nesse time.
    const payload = {
      roundNumber: rodada, homeTeamKey: homeSlug, awayTeamKey: awaySlug,
      home: homeJaExiste ? null : { roundNumber: rodada, date: dataISO, opponent: awaySlug, home: true, created_goals: createdHome, conceded_goals: concededHome },
      away: awayJaExiste ? null : { roundNumber: rodada, date: dataISO, opponent: homeSlug, home: false, created_goals: createdAway, conceded_goals: concededAway },
    };

    try {
      await salvarRodada(payload);
      rodadasEnviadas++;
      // pausa pequena só pra não bater a API do GitHub rápido demais com os
      // commits automáticos. A causa REAL do 502 em cadeia era outra
      // (Auto-Deploy "On Commit" do Render reiniciando o serviço a cada
      // commit — desligado agora, ver cabeçalho), então isso aqui não
      // precisa mais ser uma pausa longa.
      if (ENVIO_REAL) await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.log(`  ! falha ao salvar rodada ${rodada} (${homeSlug} x ${awaySlug}): ${e.message}`);
    }

    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${jogadas.length} partidas processadas...`);
  }

  const pctAssist = comAssistPossivel ? ((assistCasada / comAssistPossivel) * 100).toFixed(1) : "—";
  console.log(`\n→ ${totalGols} gols processados | assistência com zona casada: ${assistCasada}/${comAssistPossivel} (${pctAssist}%)`);
  console.log(`✓ ${rodadasEnviadas} rodada(s) ${ENVIO_REAL ? "enviadas" : "que seriam enviadas"} | ${rodadasPuladas} já existiam nos dois times e foram puladas`);

  if (divergenciasPlacar.length) {
    console.log(`\n⚠ ATENÇÃO — ${divergenciasPlacar.length} jogo(s) onde o placar oficial não bate com os gols montados (quase sempre gol contra — a FootStats não registra, ver cabeçalho). Adicione manualmente pelo editor:`);
    for (const d of divergenciasPlacar) {
      console.log(`  · ${d.homeSlug} x ${d.awaySlug} (${d.data}, rodada FootStats ${d.rodada}) — placar oficial ${d.oficial}, harvester montou ${d.achados}`);
    }
  }

  if (!ENVIO_REAL) {
    console.log("\nEssa foi uma SIMULAÇÃO — nada foi gravado. Rode de novo com ENVIO_REAL=1 pra gravar de verdade no site ao vivo.");
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exitCode = 1;
});
