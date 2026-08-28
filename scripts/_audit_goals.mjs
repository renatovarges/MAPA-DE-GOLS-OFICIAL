import fs from "node:fs";
import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";

/**
 * Auditoria completa: compara o que está gravado em data/{time}.json no
 * site AO VIVO contra o que a FootStats tem de verdade, pra CADA
 * time/rodada -- não só o caso do Botafogo que já achamos. Só LÊ, não
 * grava nada em lugar nenhum (nem site, nem FootStats).
 *
 * Junta pelo par (rodada, clube_id) em vez de por data -- a data é
 * exatamente o campo que já vimos corrompido num caso real (São Paulo x
 * Botafogo), então não dá pra confiar nela como chave de comparação.
 */

const CAMPEONATO_ID = 1395;
const API_BASE = "https://gather-api-app.footstats.com.br";
const SITE_URL = "https://mapa-de-gols-oficial.onrender.com";

const CLUBE_ID = {
  262: "flamengo", 263: "botafogo", 264: "corinthians", 265: "bahia", 266: "fluminense",
  267: "vasco", 275: "palmeiras", 276: "sao-paulo", 277: "santos", 280: "red-bull-bragantino",
  282: "atletico-mg", 283: "cruzeiro", 284: "gremio", 285: "internacional", 287: "vitoria",
  293: "athletico-pr", 294: "coritiba", 315: "chapecoense", 364: "remo", 2305: "mirassol",
};
const SLUG_TO_CLUBE_ID = Object.fromEntries(Object.entries(CLUBE_ID).map(([id, slug]) => [slug, Number(id)]));
const TIMES = Object.values(CLUBE_ID);

async function authedGet(url, token) {
  return fetchJsonWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function main() {
  console.log("→ autenticando na FootStats ...");
  const token = await getFootstatsToken();

  console.log("→ listando partidas do campeonato ...");
  const partidas = await authedGet(`${API_BASE}/api/1.0/campeonatos/${CAMPEONATO_ID}/partidas`, token);
  const jogadas = partidas.filter((m) => m.hasscout && m.finished);
  console.log(`  ${jogadas.length} partidas finalizadas com scout`);

  // indice (rodada, clube_id) -> partida
  const indice = new Map();
  for (const m of jogadas) {
    indice.set(`${m.round}|${m.sdE_EQUIPE_MANDANTE_ID}`, m);
    indice.set(`${m.round}|${m.sdE_EQUIPE_VISITANTE_ID}`, m);
  }

  console.log("→ baixando data/{time}.json dos 20 times, ao vivo ...");
  const dadosPorTime = new Map();
  for (const slug of TIMES) {
    try {
      const d = await fetchJsonWithRetry(`${SITE_URL}/data/${slug}.json?t=${Date.now()}`);
      dadosPorTime.set(slug, d);
    } catch (e) {
      console.log(`  ! falha lendo ${slug}: ${e.message}`);
    }
  }

  const cacheDetalhe = new Map();
  async function detalhePartida(matchId) {
    if (cacheDetalhe.has(matchId)) return cacheDetalhe.get(matchId);
    const shotDetail = await authedGet(`${API_BASE}/api/1.0/partidas/${CAMPEONATO_ID}/finalizacao-detalhada/${matchId}/partida`, token);
    const gols = (shotDetail.matchShots || []).filter((s) => s.goal);
    cacheDetalhe.set(matchId, gols);
    return gols;
  }

  const divergencias = [];
  let verificacoes = 0;

  for (const slug of TIMES) {
    const dados = dadosPorTime.get(slug);
    if (!dados) continue;
    const meuClubeId = SLUG_TO_CLUBE_ID[slug];
    for (const [roundKey, r] of Object.entries(dados.rounds || {})) {
      const m = indice.get(`${roundKey}|${meuClubeId}`);
      if (!m) {
        divergencias.push({ tipo: "SEM_PARTIDA_FOOTSTATS", time: slug, rodada: roundKey, dataNoSite: r.date, adversarioNoSite: r.opponent });
        continue;
      }
      const adversarioReal = CLUBE_ID[m.sdE_EQUIPE_MANDANTE_ID] === slug ? CLUBE_ID[m.sdE_EQUIPE_VISITANTE_ID] : CLUBE_ID[m.sdE_EQUIPE_MANDANTE_ID];
      verificacoes++;
      let gols;
      try {
        gols = await detalhePartida(m.id);
      } catch (e) {
        divergencias.push({ tipo: "ERRO_BUSCA", time: slug, rodada: roundKey, erro: e.message });
        continue;
      }
      const meusGolsReal = gols.filter((g) => g.equipe_id === meuClubeId).length;
      const golsAdversarioReal = gols.filter((g) => g.equipe_id !== meuClubeId).length;
      const placarOficial = (Number(m.goalshome) || 0) + (Number(m.goalsaway) || 0);
      const totalEncontrado = gols.length;

      const feitosNoSite = (r.created_goals || []).length;
      const sofridosNoSite = (r.conceded_goals || []).length;

      const problemas = [];
      if (adversarioReal !== r.opponent) problemas.push(`adversário no site="${r.opponent}" mas o real da rodada ${roundKey} é "${adversarioReal}"`);
      if (feitosNoSite !== meusGolsReal) problemas.push(`feitos no site=${feitosNoSite}, FootStats tem ${meusGolsReal}`);
      if (sofridosNoSite !== golsAdversarioReal) problemas.push(`sofridos no site=${sofridosNoSite}, FootStats tem ${golsAdversarioReal}`);
      if (placarOficial > 0 && totalEncontrado !== placarOficial) problemas.push(`placar oficial=${placarOficial} mas FootStats só tem ${totalEncontrado} gol(s) catalogado(s) na partida inteira (provável gol contra não registrado)`);

      if (problemas.length) {
        divergencias.push({
          tipo: "DIVERGENCIA", time: slug, rodada: roundKey, dataNoSite: r.date, adversarioNoSite: r.opponent,
          adversarioReal, matchId: m.id, problemas,
        });
      }
    }
  }

  console.log(`\n→ ${verificacoes} rodada/time verificadas contra a FootStats`);
  console.log(`→ ${divergencias.length} divergência(s) encontrada(s)\n`);
  for (const d of divergencias) {
    console.log(JSON.stringify(d));
  }

  fs.writeFileSync(
    "C:/Users/User/AppData/Local/Temp/claude/C--Users-User--gemini-antigravity-scratch-MAPA-DE-PERDA-E-DESARME/ea2d1e46-5b57-4f4a-a3b3-866970351f24/scratchpad/auditoria_gols.json",
    JSON.stringify({ verificacoes, divergencias }, null, 2),
  );
  console.log("\n✓ resultado salvo em scratchpad/auditoria_gols.json");
}

main().catch((e) => {
  console.error("✗", e);
  process.exitCode = 1;
});
