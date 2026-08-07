import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";

/**
 * Harvester automático de gols — Mapa de Finalizações
 * ----------------------------------------------------
 * Substitui o registro manual (assistir o vídeo de melhores momentos e
 * clicar no campo) por dado direto da API da FootStats: quem chutou, quem
 * assistiu, de onde saiu o chute, de onde saiu o passe, e se foi pênalti.
 *
 * O QUE VEM DIRETO DA FOOTSTATS (preciso, não aproximado):
 *   - shotPlayer / assistPlayer (quem chutou / quem assistiu): o
 *     `atleta_id`/`atleta_id_assistente` da FootStats bate EXATO com o id
 *     já usado neste projeto (confirmado contra o gol real do Bidon/Garro,
 *     rodada 1, Corinthians x Bahia).
 *   - is_penalty: originOfShot === "PENALTI".
 *   - isHeader: bodyPart === "CABECA" — confirmado exato contra um gol de
 *     cabeça real já registrado neste repositório (Aguirre, Athletico-PR).
 *   - se foi gol: campo `goal` (booleano), sem precisar inferir de ícone.
 *   - coordenada do lado que SOFREU o gol: EXATA — é a rotação 180° da
 *     coordenada de quem fez o gol, igual ao que o próprio script.js já faz
 *     (`{x: PITCH.maxX - x, y: PITCH.maxY - y}`, PITCH.maxX=96, maxY=68).
 *     Confirmado byte a byte contra o par corinthians.json/bahia.json da
 *     rodada 1.
 *
 * O QUE É APROXIMADO (aceito explicitamente pelo Renato, 2026-08):
 *   - shot.{x,y} (onde saiu o chute que virou gol): a FootStats não usa a
 *     mesma escala/orientação do Mapa (o campo deles é desenhado deitado; o
 *     daqui, em pé). Calibrado por regressão linear contra ~330 gols JÁ
 *     registrados manualmente neste repositório — R²≈0.77 nos dois eixos.
 *   - pass.{x,y} (de onde saiu o passe da assistência): vem da grade de 36
 *     quadrantes da FootStats (fundamento "Assistência"/"Assistência pra
 *     finalização"), usando o CENTRO do quadrante como ponto — dá a região
 *     certa, não o pixel exato do clique manual.
 *
 * O QUE FICA DE FORA (investigado e descartado, 2026-08 — não é falta de
 * esforço, é limitação real da fonte):
 *   - own_goal (gol contra): a FootStats NÃO registra gol contra como
 *     finalização de ninguém. Confirmado batendo o placar OFICIAL contra a
 *     lista de chutes de um jogo real (Atlético-MG 2x2 Palmeiras, rodada 1,
 *     com um gol contra do Khellven já registrado manualmente aqui): o
 *     placar oficial soma 4 gols, a lista de chutes só trouxe 3 — falta
 *     exatamente o gol contra. Continua manual.
 *   - isSetPiece (assistência de bola parada): testado contra 2 exemplos
 *     reais já marcados aqui. Nos dois, a FootStats classificou a origem
 *     como "CRUZAMENTO" — a MESMA tag usada pra cruzamento de jogo aberto.
 *     A FootStats tem tags específicas de bola parada (FALTA, ESCANTEIO),
 *     mas os exemplos reais não vieram com elas. Sem um sinal que separe
 *     "cruzamento de bola parada" de "cruzamento de jogo aberto", não dá
 *     pra automatizar sem errar boa parte — fica manual também.
 *
 * ACHADO IMPORTANTE (2026-08, graças a um print real que o Renato mandou da
 * própria tela da FootStats): a FootStats usa DOIS sistemas de ID de
 * jogador em paralelo dentro da MESMA partida — um "estilo Cartola"
 * (`atleta_id`/`atleta_id_assistente`, usado na lista de chutes) e um
 * INTERNO da FootStats (`idPlayer`, usado na grade de 36 quadrantes). Os
 * dois números NUNCA coincidem pro mesmo jogador. Primeira tentativa
 * (comparar `atleta_id_assistente` direto contra `idPlayer`) dava 0% de
 * acerto — parecia que os dois dados simplesmente não se cruzavam. A
 * correção: construir, PRA CADA PARTIDA, uma ponte idPlayer->atleta_id
 * usando os próprios chutes da partida (cada chute já traz os dois IDs do
 * mesmo jogador, `idPlayer`+`atleta_id` pro artilheiro e
 * `idAssistantPlayer`+`atleta_id_assistente` pro assistente) — e traduzir
 * a lista de assistências por essa ponte antes de comparar. Com isso, taxa
 * de acerto real medida em 64 assistências de gol (30 partidas): 98,4%
 * (63/64). O 1 caso que não casou é aceitável (jogador sem nenhum chute na
 * partida pra alimentar a ponte, ou assistência não capturada nesse
 * fundamento — raro).
 *
 * Quando o mesmo jogador dá mais de uma assistência na mesma partida
 * (raro), a FootStats não grava minuto no dado de zona — os eventos são
 * consumidos em ORDEM (fila), pareados com os gols do jogador também em
 * ordem cronológica (via timePlayInSeconds do chute). Funciona bem no caso
 * comum; no caso raro de 2+ assistências do mesmo jogador pode trocar qual
 * zona vai pra qual gol.
 *
 * SEGURANÇA: NUNCA sobrescreve uma rodada que já existe no arquivo do time
 * (rodada já registrada manualmente = intocável). Só PREENCHE rodadas
 * ausentes. Roda de novo quantas vezes quiser sem risco de duplicar ou
 * perder trabalho manual já feito.
 *
 * Como rodar (a partir da RAIZ do repositório):
 *   1. cd scripts && npm install && cd ..
 *      (o package.json fica DENTRO de scripts/, de propósito — a raiz do
 *      repositório precisa continuar "limpa" de Node pro Render, que só
 *      espera Python aqui, ver render.yaml. Node acha node_modules subindo
 *      pastas a partir de onde o script está, então isso não muda nada na
 *      hora de rodar o harvester em si.)
 *   2. cd scripts && npx playwright install --with-deps chromium && cd ..
 *      (baixa o navegador headless, pula se já tiver instalado por outro
 *      projeto na mesma máquina)
 *   3. Criar um arquivo .env.local NA RAIZ do repositório com:
 *        FOOTSTATS_EMAIL=seu-email
 *        FOOTSTATS_PASSWORD=sua-senha
 *   4. node --env-file=.env.local scripts/harvest_footstats_goals.mjs
 *      (ou LIMITE_PARTIDAS=5 node --env-file=.env.local scripts/... pra
 *      testar só nas 5 primeiras partidas antes de rodar a temporada toda)
 *
 * Também roda sozinho, todo dia, via GitHub Actions — ver
 * .github/workflows/harvest-footstats.yml.
 *
 * Gera um RELATÓRIO no final (quantas rodadas preencheu, quantas já
 * existiam e foram puladas, taxa de casamento de assistência) — revise o
 * `git diff` antes de commitar.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const CAMPEONATO_ID = 1395;
const API_BASE = "https://gather-api-app.footstats.com.br";
const CARTOLA_API = "https://api.cartola.globo.com/atletas/mercado";

// clube_id (Cartola) -> slug do time, mesmo esquema já usado nos dois lados
// (server.py::CLUBE_ID_TO_KEY e o pipeline do projeto "Linha") — os 20 IDs
// foram conferidos batendo os dois dicionários, são idênticos.
const CLUBE_ID = {
  262: "flamengo", 263: "botafogo", 264: "corinthians", 265: "bahia", 266: "fluminense",
  267: "vasco", 275: "palmeiras", 276: "sao-paulo", 277: "santos", 280: "red-bull-bragantino",
  282: "atletico-mg", 283: "cruzeiro", 284: "gremio", 285: "internacional", 287: "vitoria",
  293: "athletico-pr", 294: "coritiba", 315: "chapecoense", 364: "remo", 2305: "mirassol",
};
const NORMALIZE_KEY = { athletico_pr: "athletico-pr", atletico_mg: "atletico-mg", sao_paulo: "sao-paulo", red_bull_bragantino: "red-bull-bragantino" };

// PITCH do próprio script.js — unidades lógicas do campo (não são 0-100 nos
// dois eixos: largura lógica 100, altura lógica 68, como um campo real).
const PITCH = { unitsX: 100, unitsY: 68, maxX: 96, maxY: 68 };

// Regressão linear ajustada contra ~330 gols reais já registrados neste
// repositório (ver cabeçalho). fsX/fsY = fieldPositionX/Y da FootStats —
// os eixos saem TROCADOS entre os dois sistemas (confirmado empiricamente).
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
  const col = Math.ceil(idQuadrant36 / 6); // 1-6, terço defensivo->ofensivo
  const row = ((idQuadrant36 - 1) % 6) + 1; // 1-6, flanco A -> flanco B
  return { x: ((col - 0.5) / 6) * PITCH.unitsX, y: ((row - 0.5) / 6) * PITCH.unitsY };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

async function authedGet(url, token) {
  return fetchJsonWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
}

/** roster de jogadores (id -> nome/posição) via API oficial do Cartola — mesma fonte que server.py já usa pro autocomplete do editor. */
async function buildRoster() {
  const data = await fetchJsonWithRetry(CARTOLA_API, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  const posicaoNome = { 1: "Goleiro", 2: "Lateral", 3: "Zagueiro", 4: "Meia", 5: "Atacante", 6: "Técnico" };
  const roster = new Map();
  for (const a of data.atletas || []) {
    roster.set(String(a.atleta_id), {
      id: String(a.atleta_id),
      name: a.apelido || a.nome,
      fullName: a.nome,
      position: posicaoNome[a.posicao_id] || "",
      side: null,
    });
  }
  return roster;
}

/**
 * playerRef — o campo `team` é SEMPRE o time de quem marcou o gol NAQUELA
 * partida (`teamNaPartida`, vindo de `equipe_id` do próprio chute), nunca o
 * time atual do jogador na API ao vivo do Cartola. BUG REAL achado em teste
 * (2026-08): usar o clube do roster ao vivo marcava o jogador no time pro
 * qual ele foi transferido DEPOIS da partida (ex: Gilberto, que jogava pelo
 * Bahia na rodada 1, saiu marcado como Athletico-PR). Nome/posição podem
 * vir do roster atual sem problema (não muda com transferência); só o time
 * precisa ser o da partida.
 */
function playerRef(roster, footstatsId, teamNaPartida) {
  if (!footstatsId || Number(footstatsId) <= 0) return null;
  const found = roster.get(String(footstatsId));
  if (found) return { ...found, team: teamNaPartida };
  return { id: String(footstatsId), name: "?", fullName: "?", position: "", side: null, team: teamNaPartida };
}

/**
 * buildIdBridge — idPlayer (interno da FootStats, usado no
 * fieldPositionByMatch) -> atleta_id (estilo Cartola, usado na lista de
 * chutes), construída a partir dos PRÓPRIOS chutes dessa partida (cada
 * chute já traz os dois IDs do mesmo jogador lado a lado). Ver o achado no
 * cabeçalho do arquivo — sem essa ponte, os dois endpoints nunca casam.
 */
function buildIdBridge(matchShots) {
  const bridge = new Map();
  for (const s of matchShots) {
    if (s.idPlayer && s.atleta_id) bridge.set(s.idPlayer, s.atleta_id);
    if (s.idAssistantPlayer && s.atleta_id_assistente) bridge.set(s.idAssistantPlayer, s.atleta_id_assistente);
  }
  return bridge;
}

async function main() {
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

  // acumulador: slug -> rodada -> { roundNumber, date, opponent, home, created_goals, conceded_goals }
  const porTime = new Map();
  const getAcc = (slug, rodada, opponentSlug, home, date) => {
    if (!porTime.has(slug)) porTime.set(slug, new Map());
    const rodadas = porTime.get(slug);
    if (!rodadas.has(rodada)) {
      rodadas.set(rodada, { roundNumber: rodada, date, opponent: opponentSlug, home, created_goals: [], conceded_goals: [] });
    }
    return rodadas.get(rodada);
  };

  let totalGols = 0, comAssistPossivel = 0, assistCasada = 0;
  const divergenciasPlacar = []; // jogos onde o placar oficial não bate com os gols achados — quase sempre gol contra (ver cabeçalho)

  for (let i = 0; i < jogadas.length; i++) {
    const m = jogadas[i];
    const homeSlug = CLUBE_ID[m.sdE_EQUIPE_MANDANTE_ID];
    const awaySlug = CLUBE_ID[m.sdE_EQUIPE_VISITANTE_ID];
    if (!homeSlug || !awaySlug) continue;

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

    // conferência de placar: gol contra nunca aparece em matchShots (ver
    // cabeçalho), então uma partida com gol contra sempre vai ter menos gols
    // aqui do que no placar oficial — é o sinal de "olha aqui, falta 1 manual".
    const placarOficial = (Number(m.goalshome) || 0) + (Number(m.goalsaway) || 0);
    if (placarOficial > 0 && gols.length !== placarOficial) {
      divergenciasPlacar.push({
        homeSlug, awaySlug, rodada: m.round, data: m.date ? m.date.slice(0, 10) : "?",
        oficial: placarOficial, achados: gols.length,
      });
    }
    if (!gols.length) continue;

    // ponte de ID pra essa partida + fila de eventos de assistência por
    // atleta_id (já traduzido), consumida em ordem — ver cabeçalho.
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

    const rodada = Number(m.round);
    const dataISO = m.date ? m.date.slice(0, 10) : null;

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

      const flags = {
        ...(isPenalty ? { is_penalty: true } : {}),
        ...(isHeader ? { isHeader: true } : {}),
      };
      const golCriado = { pass: passXY, shot: shotXY, assistPlayer, shotPlayer, ...flags };
      const golSofrido = { pass: passXY ? rotate180(passXY) : null, shot: rotate180(shotXY), assistPlayer, shotPlayer, ...flags };

      const homeDoTimeQueMarcou = timeQueMarcou === homeSlug;
      getAcc(timeQueMarcou, rodada, timeQueSofreu, homeDoTimeQueMarcou, dataISO).created_goals.push(golCriado);
      getAcc(timeQueSofreu, rodada, timeQueMarcou, !homeDoTimeQueMarcou, dataISO).conceded_goals.push(golSofrido);
    }

    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${jogadas.length} partidas processadas...`);
    await sleep(150);
  }

  const pctAssist = comAssistPossivel ? ((assistCasada / comAssistPossivel) * 100).toFixed(1) : "—";
  console.log(`\n→ ${totalGols} gols processados | assistência com zona casada: ${assistCasada}/${comAssistPossivel} (${pctAssist}%)`);

  // ---- grava, SEM NUNCA sobrescrever rodada já existente ----
  let preenchidas = 0, puladas = 0;
  for (const [slug, rodadas] of porTime) {
    const normalized = NORMALIZE_KEY[slug] || slug;
    const filePath = path.join(DATA_DIR, `${normalized}.json`);
    const existing = fs.existsSync(filePath) ? readJSON(filePath) : { rounds: {} };
    if (!existing.rounds || typeof existing.rounds !== "object") existing.rounds = {};

    for (const [rodadaNum, obj] of rodadas) {
      const key = String(rodadaNum);
      if (existing.rounds[key]) {
        puladas++;
        continue; // já registrado manualmente (ou por execução anterior) — intocável
      }
      existing.rounds[key] = obj;
      preenchidas++;
    }
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
  }

  console.log(`\n✓ ${preenchidas} rodadas novas preenchidas | ${puladas} já existiam e foram puladas (não sobrescritas)`);
  console.log("  Revise com 'git diff' antes de commitar.");

  if (divergenciasPlacar.length) {
    console.log(`\n⚠ ATENÇÃO — ${divergenciasPlacar.length} jogo(s) onde o placar oficial não bate com os gols montados (quase sempre gol contra, que a FootStats não registra — ver cabeçalho do script). Adicione esse(s) gol(s) manualmente:`);
    for (const d of divergenciasPlacar) {
      console.log(`  · ${d.homeSlug} x ${d.awaySlug} (${d.data}, rodada FootStats ${d.rodada}) — placar oficial ${d.oficial}, harvester montou ${d.achados}`);
    }
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exitCode = 1;
});
