import { fetchJsonWithRetry } from "./lib/http.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";

/**
 * Banco de jogadores notáveis — calcula, por posição granular, quais
 * jogadores estão no top 25% em taxa de recuperação (desarme+interceptação)
 * por jogo e quais estão no top 25% em taxa de perda de posse por jogo.
 * Insumo do "cruzamento em destaque" do Mapa de Desarmes (ver script.js).
 *
 * REGRAS CONFIRMADAS COM O RENATO (2026-08-12/13):
 * - Mínimo 3 jogos "com dado" na temporada pra um jogador entrar na conta.
 * - Corte: top 25% dentro da própria posição granular (não compara posições
 *   diferentes entre si).
 * - Testado em backtest real (confrontos que já se repetiram na temporada):
 *   candidato de cruzamento SEM jogador notável envolvido não confirmou
 *   NENHUMA vez no jogo seguinte — por isso esse selo é usado como filtro
 *   obrigatório no destaque de zona, não só um enfeite.
 *
 * LIMITAÇÃO DE DADO (deixar isso claro sempre que os números forem usados):
 * um jogador que jogou uma partida inteira mas teve ZERO desarme/interceptação/
 * perda registrada nela não entra no denominador dessa partida — então a taxa
 * calculada aqui tende a ser um pouco OTIMISTA (super-estimada) em relação à
 * taxa real por jogo de fato. Acontece pra qualquer jogador, então não
 * distorce a comparação relativa entre eles, mas o número absoluto não deve
 * ser lido como "isso é exatamente quantos ele faz por jogo".
 *
 * Roda por cima do dado JÁ AO VIVO no site (busca `${SITE_URL}/data/desarmes/
 * {time}.json` e `${SITE_URL}/api/jogadores`, não lê disco local) — assim
 * funciona igual dentro do GitHub Actions (checkout não tem o disco
 * persistente do Render) ou local. Roda sempre DEPOIS do harvester de
 * desarmes no mesmo workflow, pra já refletir a rodada recém-processada.
 *
 * Rodar: ENVIO_REAL=1 pra gravar de verdade (POST /api/save-perfis-
 * jogadores), SITE_URL pra apontar pro servidor certo (padrão: site ao
 * vivo; use SITE_URL=http://localhost:PORT pra testar local).
 */

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";

const MIN_JOGOS = 3;
const CORTE_PERCENTIL = 0.25;

const TEAMS = [
  "atletico-mg", "athletico-pr", "bahia", "botafogo", "chapecoense", "corinthians",
  "coritiba", "cruzeiro", "flamengo", "fluminense", "gremio", "internacional",
  "mirassol", "palmeiras", "red-bull-bragantino", "remo", "santos", "sao-paulo",
  "vasco", "vitoria",
];

async function fetchTeamMatches(teamKey) {
  try {
    const data = await fetchJsonWithRetry(`${SITE_URL}/data/desarmes/${teamKey}.json?t=${Date.now()}`);
    return { teamKey, matches: Object.values(data.matches || {}) };
  } catch {
    return { teamKey, matches: [] }; // time ainda sem dado de desarmes salvo — normal no início
  }
}

function aggregatePlayers(teamsData) {
  const porJogador = new Map(); // jogadorId -> { posicao, teamKey, recMatches:Set, recTotal, perdMatches:Set, perdTotal }

  for (const { teamKey, matches } of teamsData) {
    for (const m of matches) {
      const matchId = m.matchId;
      for (const ev of m.recuperacoes || []) {
        const key = ev.jogadorId;
        if (!porJogador.has(key)) porJogador.set(key, { posicao: ev.posicao, teamKey, recMatches: new Set(), recTotal: 0, perdMatches: new Set(), perdTotal: 0 });
        const p = porJogador.get(key);
        p.recMatches.add(matchId);
        p.recTotal++;
      }
      for (const ev of m.perdas || []) {
        const key = ev.jogadorId;
        if (!porJogador.has(key)) porJogador.set(key, { posicao: ev.posicao, teamKey, recMatches: new Set(), recTotal: 0, perdMatches: new Set(), perdTotal: 0 });
        const p = porJogador.get(key);
        p.perdMatches.add(matchId);
        p.perdTotal++;
      }
    }
  }

  const jogadores = [];
  for (const [jogadorId, p] of porJogador) {
    const jogosComDado = new Set([...p.recMatches, ...p.perdMatches]).size;
    if (jogosComDado < MIN_JOGOS) continue;
    jogadores.push({
      jogadorId, teamKey: p.teamKey, posicao: p.posicao, jogosComDado,
      recuperacoes: p.recTotal, perdas: p.perdTotal,
      taxaRecuperacao: p.recTotal / jogosComDado,
      taxaPerda: p.perdTotal / jogosComDado,
    });
  }
  return jogadores;
}

function marcarNotaveis(jogadores) {
  const porPosicao = new Map();
  for (const j of jogadores) {
    if (!porPosicao.has(j.posicao)) porPosicao.set(j.posicao, []);
    porPosicao.get(j.posicao).push(j);
  }
  for (const [, grupo] of porPosicao) {
    const nCorte = Math.max(1, Math.ceil(grupo.length * CORTE_PERCENTIL));
    [...grupo].sort((a, b) => b.taxaRecuperacao - a.taxaRecuperacao).slice(0, nCorte).forEach(j => { j.notavelDesarmador = true; });
    [...grupo].sort((a, b) => b.taxaPerda - a.taxaPerda).slice(0, nCorte).forEach(j => { j.notavelPerdedor = true; });
  }
  return jogadores;
}

async function resolverNomes(jogadores) {
  let porId = new Map();
  try {
    const data = await fetchJsonWithRetry(`${SITE_URL}/api/jogadores`);
    porId = new Map((data.jogadores || []).map(a => [String(a.id), a]));
  } catch (e) {
    console.warn("Não foi possível buscar nomes em /api/jogadores:", e.message);
  }
  for (const j of jogadores) {
    const a = porId.get(String(j.jogadorId));
    j.nome = a ? (a.apelido || a.nome_completo || `Jogador #${j.jogadorId}`) : `Jogador #${j.jogadorId}`;
  }
  return jogadores;
}

async function salvarPerfis(jogadores) {
  if (!ENVIO_REAL) {
    console.log(`  [SIMULAÇÃO] enviaria ${jogadores.length} perfis de jogadores`);
    return { ok: true, simulado: true };
  }
  const res = await fetch(`${SITE_URL}/api/save-perfis-jogadores`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jogadores),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-perfis-jogadores falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é enviado — rode com ENVIO_REAL=1 pra gravar de verdade)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  const teamsData = await Promise.all(TEAMS.map(fetchTeamMatches));
  const comDado = teamsData.filter(t => t.matches.length > 0).length;
  console.log(`→ ${comDado}/${TEAMS.length} times com dado de desarmes disponível`);

  let jogadores = aggregatePlayers(teamsData);
  jogadores = marcarNotaveis(jogadores);
  jogadores = await resolverNomes(jogadores);
  jogadores.sort((a, b) => b.taxaRecuperacao - a.taxaRecuperacao);

  const notaveisDesarme = jogadores.filter(j => j.notavelDesarmador).length;
  const notaveisPerda = jogadores.filter(j => j.notavelPerdedor).length;
  console.log(`→ ${jogadores.length} jogadores com >= ${MIN_JOGOS} jogos com dado (${notaveisDesarme} notáveis desarmadores, ${notaveisPerda} notáveis perdedores)`);

  await salvarPerfis(jogadores);
  console.log(`✓ perfis ${ENVIO_REAL ? "salvos" : "que seriam salvos"}`);
  if (!ENVIO_REAL) {
    console.log("\nEssa foi uma SIMULAÇÃO — rode com ENVIO_REAL=1 pra gravar de verdade no site ao vivo.");
  }
}

main().catch(async (e) => {
  console.error("✗", e);
  if (process.env.ENVIO_REAL === "1") {
    await dispatchAlert({
      title: "build_player_profiles falhou por completo",
      details: String(e && e.stack ? e.stack : e),
    }).catch(() => {});
  }
  process.exitCode = 1;
});
