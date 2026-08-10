import fs from "node:fs";
import path from "node:path";
import { contagensPartida, eventosDoChute, gerarCandidatosConfronto, selecionarDestaques } from "./lib/matchup-insights.mjs";
import { gerarFraseInsight } from "./lib/matchup-phrases.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const RODADA = Number(process.env.RODADA_ALVO || 22);
const TIMES = fs.readdirSync(path.join(DATA, "finalizacoes")).filter((x) => x.endsWith(".json")).map((x) => x.replace(".json", ""));

function lerJson(arquivo) { return JSON.parse(fs.readFileSync(arquivo, "utf8")); }
function chaveMapa(time, date, opponent) { return [time, date, opponent].join("|"); }

function mapaRodadas() {
  const mapa = new Map();
  for (const time of TIMES) {
    const arquivo = path.join(DATA, time + ".json");
    if (!fs.existsSync(arquivo)) continue;
    for (const partida of Object.values(lerJson(arquivo).rounds || {})) {
      if (partida?.date && partida?.opponent) mapa.set(chaveMapa(time, partida.date, partida.opponent), Number(partida.roundNumber));
    }
  }
  return mapa;
}

function carregarPartidas() {
  const rodadas = mapaRodadas(), porTime = new Map(), todas = [];
  for (const time of TIMES) {
    const partidas = Object.values(lerJson(path.join(DATA, "finalizacoes", time + ".json")).matches || {}).map((m) => ({
      ...m, team: time, roundResolved: rodadas.get(chaveMapa(time, m.date, m.opponent)) || Number(m.roundNumber) || 0,
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
    for (const lado of ["shots_for", "shots_against"]) for (const chute of partida[lado] || []) for (const chave of eventosDoChute(chute)) chaves.add(chave);
  }
  return [...chaves];
}

function baselinesHistoricos(partidas, cutoff, chaves) {
  const elegiveis = partidas.filter((m) => m.date < cutoff), resultado = new Map();
  for (const scout of ["finalizacoes", "gols", "participacoes"]) {
    const totais = new Map();
    for (const partida of elegiveis) {
      const contagens = contagensPartida(partida, "shots_for", scout);
      for (const chave of chaves) totais.set(chave, (totais.get(chave) || 0) + (contagens.get(chave) || 0));
    }
    for (const chave of chaves) resultado.set(scout + "|" + chave, elegiveis.length ? (totais.get(chave) || 0) / elegiveis.length : 0);
  }
  return resultado;
}

function main() {
  const { porTime, todas } = carregarPartidas();
  const partidasRodada = todas.filter((x) => x.roundResolved === RODADA);
  if (!partidasRodada.length) throw new Error("Rodada " + RODADA + " não encontrada.");
  const cutoff = partidasRodada.map((x) => x.date).sort()[0];
  const chaves = chavesHistoricas(todas, cutoff);
  const baselines = baselinesHistoricos(todas, cutoff, chaves);
  const candidatos = [];
  for (const atual of partidasRodada) {
    const historicoAtacante = (porTime.get(atual.team) || []).filter((x) => x.date < cutoff).slice(-10);
    const historicoDefensor = (porTime.get(atual.opponent) || []).filter((x) => x.date < cutoff).slice(-10);
    if (historicoAtacante.length < 5 || historicoDefensor.length < 5) continue;
    for (const scout of ["finalizacoes", "gols", "participacoes"]) {
      candidatos.push(...gerarCandidatosConfronto({ atacante: atual.team, defensor: atual.opponent, historicoAtacante, historicoDefensor, baselines, scout, chaves }).map((item) => ({
        ...item, real: contagensPartida(atual, "shots_for", scout).get(item.chave) || 0,
      })));
    }
  }
  const destaques = selecionarDestaques(candidatos, { max: 8 });
  console.log("# Prévia editorial da rodada " + RODADA + "\n");
  console.log("> Selecionada apenas com jogos anteriores a " + cutoff + ". O resultado da rodada aparece somente na auditoria posterior.\n");
  for (const [indice, item] of destaques.entries()) {
    const frase = gerarFraseInsight(item);
    console.log("## " + (indice + 1) + ". " + frase.categoria + " — " + frase.titulo + "\n");
    console.log(frase.texto + "\n");
    const unidade = item.scout === "gols" ? "gol(ns)" : item.scout === "participacoes" ? "participação(ões) em gol" : "finalização(ões)";
    console.log("**Auditoria posterior:** ocorreram " + item.real + " " + unidade + " nesse recorte.\n");
  }
  console.log("---\n");
  console.log("Selecionados: " + destaques.length + " de " + candidatos.length + " candidatos; corte temporal preservado.");
}

main();
