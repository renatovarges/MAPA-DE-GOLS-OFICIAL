import fs from "node:fs";
import path from "node:path";
import {
  contagensPartida, eventosDoChute, gerarCandidatosConfronto,
  selecionarDestaques, rotuloEvento,
} from "./lib/matchup-insights.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const TIMES = fs.readdirSync(path.join(DATA, "finalizacoes")).filter((x) => x.endsWith(".json")).map((x) => x.replace(".json", ""));

function lerJson(arquivo) { return JSON.parse(fs.readFileSync(arquivo, "utf8")); }
function chaveMapa(time, date, opponent) { return [time, date, opponent].join("|"); }

function mapaRodadas() {
  const mapa = new Map();
  for (const time of TIMES) {
    const arquivo = path.join(DATA, time + ".json");
    if (!fs.existsSync(arquivo)) continue;
    const dados = lerJson(arquivo);
    for (const partida of Object.values(dados.rounds || {})) {
      if (partida?.date && partida?.opponent) mapa.set(chaveMapa(time, partida.date, partida.opponent), Number(partida.roundNumber));
    }
  }
  return mapa;
}

function carregarPartidas() {
  const rodadas = mapaRodadas(), porTime = new Map(), todas = [];
  for (const time of TIMES) {
    const dados = lerJson(path.join(DATA, "finalizacoes", time + ".json"));
    const partidas = Object.values(dados.matches || {}).map((m) => ({
      ...m, team: time,
      roundResolved: rodadas.get(chaveMapa(time, m.date, m.opponent)) || Number(m.roundNumber) || 0,
    })).sort((a, b) => a.date.localeCompare(b.date) || Number(a.matchId) - Number(b.matchId));
    porTime.set(time, partidas);
    todas.push(...partidas);
  }
  return { porTime, todas };
}

function chavesHistoricas(partidas, cutoff) {
  const chaves = new Set();
  for (const partida of partidas) {
    if (partida.date >= cutoff) continue;
    for (const lado of ["shots_for", "shots_against"]) {
      for (const chute of partida[lado] || []) for (const chave of eventosDoChute(chute)) chaves.add(chave);
    }
  }
  return [...chaves];
}

function baselinesHistoricos(partidas, cutoff, chaves) {
  const elegiveis = partidas.filter((m) => m.date < cutoff);
  const resultado = new Map();
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

function intervaloBootstrap(itens, repeticoes = 2000) {
  if (itens.length < 2) return [0, 0];
  let estado = 20260810;
  const sorteio = () => ((estado = (estado * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lifts = [];
  for (let r = 0; r < repeticoes; r++) {
    let real = 0, base = 0;
    for (let i = 0; i < itens.length; i++) { const x = itens[Math.floor(sorteio() * itens.length)]; real += x.real; base += x.baseline; }
    if (base > 0) lifts.push(real / base);
  }
  lifts.sort((a, b) => a - b);
  return [lifts[Math.floor(lifts.length * 0.025)], lifts[Math.floor(lifts.length * 0.975)]];
}

function metricas(itens) {
  if (!itens.length) return { n: 0, hitRate: 0, beatBaseline: 0, mediaReal: 0, mediaEsperada: 0, lift: 0 };
  const somaReal = itens.reduce((n, x) => n + x.real, 0);
  const somaBase = itens.reduce((n, x) => n + x.baseline, 0);
  return {
    n: itens.length,
    hitRate: itens.filter((x) => x.real > 0).length / itens.length,
    beatBaseline: itens.filter((x) => x.real > x.baseline).length / itens.length,
    mediaReal: somaReal / itens.length,
    mediaEsperada: somaBase / itens.length,
    lift: somaBase ? somaReal / somaBase : 0,
    intervaloLift: intervaloBootstrap(itens),
  };
}

function formatarPct(x) { return (x * 100).toFixed(1) + "%"; }
function formatarNumero(x) { return x.toFixed(2); }

function main() {
  const { porTime, todas } = carregarPartidas();
  const grupos = new Map();
  for (const partida of todas) {
    if (!(partida.roundResolved > 0)) continue;
    if (!grupos.has(partida.roundResolved)) grupos.set(partida.roundResolved, []);
    grupos.get(partida.roundResolved).push(partida);
  }

  const selecionados = [], rodadasAuditadas = [];
  for (const [rodada, partidasRodada] of [...grupos].sort((a, b) => a[0] - b[0])) {
    const times = new Set(partidasRodada.map((x) => x.team));
    if (rodada < 6 || times.size < 8) continue;
    const cutoff = partidasRodada.map((x) => x.date).sort()[0];
    const chaves = chavesHistoricas(todas, cutoff);
    const baselines = baselinesHistoricos(todas, cutoff, chaves);
    const candidatos = [];

    for (const atual of partidasRodada) {
      const historicoAtacante = (porTime.get(atual.team) || []).filter((x) => x.date < cutoff).slice(-10);
      const historicoDefensor = (porTime.get(atual.opponent) || []).filter((x) => x.date < cutoff).slice(-10);
      if (historicoAtacante.length < 5 || historicoDefensor.length < 5) continue;
      for (const scout of ["finalizacoes", "gols"]) {
        candidatos.push(...gerarCandidatosConfronto({
          atacante: atual.team, defensor: atual.opponent,
          historicoAtacante, historicoDefensor, baselines, scout, chaves,
        }).map((item) => ({
          ...item, rodada, date: atual.date,
          real: contagensPartida(atual, "shots_for", scout).get(item.chave) || 0,
        })));
      }
    }

    const destaques = selecionarDestaques(candidatos, { max: 8 });
    selecionados.push(...destaques);
    rodadasAuditadas.push({ rodada, cutoff, times: times.size, candidatos: candidatos.length, selecionados: destaques.length });
  }

  const porTipo = Object.fromEntries(["convergencia", "forca-ofensiva-propria", "fragilidade-defensiva-propria"].map((tipo) => [tipo, metricas(selecionados.filter((x) => x.tipo === tipo))]));
  const porScout = Object.fromEntries(["finalizacoes", "gols"].map((scout) => [scout, metricas(selecionados.filter((x) => x.scout === scout))]));
  const geral = metricas(selecionados);
  const exemplos = [...selecionados].sort((a, b) => b.score - a.score).slice(0, 12).map((x) => ({
    rodada: x.rodada, tipo: x.tipo, scout: x.scout, confronto: x.atacante + " x " + x.defensor,
    padrao: rotuloEvento(x.chave), score: Number(x.score.toFixed(2)),
    previsto: Number(x.baseline.toFixed(2)), realizado: x.real,
  }));

  console.log("# Backtest do motor de confrontos\n");
  console.log("- Rodadas auditadas: " + rodadasAuditadas.map((x) => x.rodada).join(", "));
  const resolvidos = todas.filter((x) => x.roundResolved > 0).length;
  console.log("- Cobertura ligada a rodadas: " + resolvidos + "/" + todas.length + " registros de time (" + ((resolvidos / todas.length) * 100).toFixed(1) + "%)");
  console.log("- Destaques simulados: " + selecionados.length);
  console.log("- Regra temporal: somente partidas anteriores ao primeiro jogo da rodada.\n");
  console.log("| Recorte | N | Ocorreu no jogo | Superou a média | Média real | Média esperada | Lift (IC95%) |");
  console.log("|---|---:|---:|---:|---:|---:|---:|");
  const porPeriodo = {
    "rodadas-6-a-14": metricas(selecionados.filter((x) => x.rodada <= 14)),
    "rodadas-15-a-22": metricas(selecionados.filter((x) => x.rodada >= 15)),
  };
  const linhas = [["Geral", geral], ...Object.entries(porTipo), ...Object.entries(porScout), ...Object.entries(porPeriodo)];
  for (const [nome, m] of linhas) console.log("| " + nome + " | " + m.n + " | " + formatarPct(m.hitRate) + " | " + formatarPct(m.beatBaseline) + " | " + formatarNumero(m.mediaReal) + " | " + formatarNumero(m.mediaEsperada) + " | " + formatarNumero(m.lift) + "x (" + formatarNumero(m.intervaloLift[0]) + "–" + formatarNumero(m.intervaloLift[1]) + ") |");
  console.log("\n## Exemplos mais fortes selecionados\n");
  for (const x of exemplos) console.log("- R" + x.rodada + " · " + x.tipo + " · " + x.confronto + " · " + x.scout + " · " + x.padrao + " · esperado " + x.previsto + ", ocorreu " + x.realizado);
  console.log("\n## Cobertura por rodada\n");
  for (const x of rodadasAuditadas) console.log("- R" + x.rodada + ": " + x.times + " times, " + x.candidatos + " candidatos, " + x.selecionados + " selecionados");
}

main();
