import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";
import { proximaRodadaCompleta } from "./lib/next-round.mjs";
import { contagensPartida, eventosDoChute, gerarCandidatosConfronto, selecionarDestaques } from "./lib/matchup-insights.mjs";
import { gerarFraseInsight } from "./lib/matchup-phrases.mjs";

const CAMPEONATO_ID = 1395;
const API_BASE = "https://gather-api-app.footstats.com.br";
const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";
const TIMES = ["flamengo", "botafogo", "corinthians", "bahia", "fluminense", "vasco", "palmeiras", "sao-paulo", "santos", "red-bull-bragantino", "atletico-mg", "cruzeiro", "gremio", "internacional", "vitoria", "athletico-pr", "coritiba", "chapecoense", "remo", "mirassol"];

function contagemRodada(dadosPorTime) {
  const contagem = new Map();
  for (const dados of dadosPorTime.values()) for (const partida of Object.values(dados.matches || {})) {
    const rodada = Number(partida.roundNumber);
    if (rodada > 0) contagem.set(rodada, (contagem.get(rodada) || new Set()).add(String(partida.matchId)));
  }
  return [...contagem].filter(([, ids]) => ids.size >= 10).sort((a, b) => b[0] - a[0])[0]?.[0] || 0;
}

function chavesHistoricas(partidas, cutoff) {
  const chaves = new Set();
  for (const partida of partidas) {
    if (partida.date >= cutoff) continue;
    for (const lado of ["shots_for", "shots_against"]) for (const chute of partida[lado] || []) for (const chave of eventosDoChute(chute)) chaves.add(chave);
  }
  return [...chaves];
}

function baselinesHistoricos(partidas, cutoff, chaves) {
  const elegiveis = partidas.filter((m) => m.date < cutoff), resultado = new Map();
  for (const scout of ["finalizacoes", "gols"]) {
    const totais = new Map();
    for (const partida of elegiveis) {
      const contagens = contagensPartida(partida, "shots_for", scout);
      for (const chave of chaves) totais.set(chave, (totais.get(chave) || 0) + (contagens.get(chave) || 0));
    }
    for (const chave of chaves) resultado.set(scout + "|" + chave, elegiveis.length ? (totais.get(chave) || 0) / elegiveis.length : 0);
  }
  return resultado;
}

async function salvar(payload) {
  if (!ENVIO_REAL) return;
  const response = await fetch(SITE_URL + "/api/save-round-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error("save-round-summary falhou (HTTP " + response.status + "): " + JSON.stringify(body));
}

async function main() {
  const dadosPorTime = new Map();
  await Promise.all(TIMES.map(async (time) => dadosPorTime.set(time, await fetchJsonWithRetry(SITE_URL + "/data/finalizacoes/" + time + ".json?t=" + Date.now()))));
  const rodadaDados = contagemRodada(dadosPorTime);
  const token = await getFootstatsToken();
  const partidasFootstats = await fetchJsonWithRetry(API_BASE + "/api/1.0/campeonatos/" + CAMPEONATO_ID + "/partidas", { headers: { Authorization: "Bearer " + token } });
  const proxima = proximaRodadaCompleta(partidasFootstats, rodadaDados);
  if (!proxima) throw new Error("nenhuma rodada futura completa encontrada depois da rodada " + rodadaDados);
  const cutoff = proxima.jogos[0].data.slice(0, 10), todas = [], porTime = new Map();
  for (const [time, dados] of dadosPorTime) {
    const partidas = Object.values(dados.matches || {}).map((m) => ({ ...m, team: time })).sort((a, b) => a.date.localeCompare(b.date));
    porTime.set(time, partidas); todas.push(...partidas);
  }
  const chaves = chavesHistoricas(todas, cutoff), baselines = baselinesHistoricos(todas, cutoff, chaves), candidatos = [];
  for (const jogo of proxima.jogos) for (const [atacante, defensor] of [[jogo.mandante, jogo.visitante], [jogo.visitante, jogo.mandante]]) {
    const historicoAtacante = (porTime.get(atacante) || []).filter((x) => x.date < cutoff).slice(-10);
    const historicoDefensor = (porTime.get(defensor) || []).filter((x) => x.date < cutoff).slice(-10);
    if (historicoAtacante.length < 5 || historicoDefensor.length < 5) continue;
    for (const scout of ["finalizacoes", "gols"]) candidatos.push(...gerarCandidatosConfronto({ atacante, defensor, historicoAtacante, historicoDefensor, baselines, scout, chaves }));
  }
  const conclusoes = selecionarDestaques(candidatos, { max: 8 }).map((item) => {
    const editorial = gerarFraseInsight(item);
    return { tipo: item.tipo, titulo: editorial.titulo, frase: editorial.texto, times: [item.atacante, item.defensor], scout: item.scout, chave: item.chave };
  });
  let resumoAnterior = null;
  try { resumoAnterior = await fetchJsonWithRetry(SITE_URL + "/data/resumo-rodada.json?t=" + Date.now()); } catch {}
  const defensivo = resumoAnterior?.conclusoes?.find((x) => x.tipo === "destaque-defensivo");
  if (defensivo && conclusoes.length < 8) conclusoes.push(defensivo);
  if (conclusoes.length < 5) throw new Error("motor gerou apenas " + conclusoes.length + " conclusões para a rodada " + proxima.rodada);
  const agora = new Date().toISOString();
  const payload = { versao: 3, tipoLeitura: "pre-jogo", rodada: proxima.rodada, rodadaDados, janelaAte: todas.map((x) => x.date).filter((x) => x < cutoff).sort().at(-1) || null, geradoEm: agora, jogos: proxima.jogos, conclusoes, statusAtualizacao: { ...(resumoAnterior?.statusAtualizacao || {}), rodada: rodadaDados, rodadaLeitura: proxima.rodada, leituraEstrategicaAtualizada: true, atualizadoEm: agora } };
  console.log(JSON.stringify(payload, null, 2));
  await salvar(payload);
  console.error(ENVIO_REAL ? "Resumo pré-jogo salvo em produção." : "Simulação concluída; nada foi gravado.");
}

main().catch((erro) => { console.error(erro.stack || erro); process.exitCode = 1; });
