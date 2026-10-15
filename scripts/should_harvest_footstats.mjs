#!/usr/bin/env node
/**
 * Porteiro BARATO da coleta de gols (FootStats): "algum jogo terminou desde
 * a última coleta?". Roda num job sem navegador (só Node + fetch) — o job
 * pesado do harvest-footstats.yml só roda quando este script imprime "sim".
 *
 * Regra (pedido do Renato, 2026-10): coletar só DEPOIS dos jogos, nos dias
 * em que houve jogo, em vez de todo dia.
 *   - Lê os horários dos jogos do calendário do site (proximo-confronto.json)
 *     E da API pública do Cartola (todas as rodadas, pega jogo
 *     adiado/remarcado de qualquer rodada). Datas em horário de Brasília, sem fuso.
 *   - Uma coleta por DIA de jogo: 3h depois do início do ÚLTIMO jogo do dia
 *     (90 min + intervalo + acréscimos + folga pra FootStats publicar).
 *   - "Última coleta" = geradoEm de data/resumo-rodada.json, regravado a cada
 *     execução completa deste workflow.
 *   - Coleta se existe dia de jogo cujo último jogo já terminou depois da última coleta.
 *   - Jogo com placar no Cartola e sem dados no site (e fora da lista de
 *     ocorrências conhecidas) também libera, 1x a cada 24h no máximo.
 *   - Rede de segurança: se faz >= 5 dias que não coleta (jogo adiado,
 *     calendário velho, falha silenciosa), coleta também.
 *   - Se não conseguir ler o calendário ou a última coleta, coleta (na dúvida,
 *     melhor gastar minutos do que ficar sem gols).
 * O calendário só avança quando o próprio harvest roda (build_proximo_confronto),
 * então depois do último jogo de uma rodada a coleta acontece e o calendário
 * passa pra rodada seguinte sozinho.
 *
 * Imprime só "sim" ou "nao" em stdout; o motivo vai pro stderr (log).
 */
import "./lib/site-auth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./lib/http.mjs";

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const SIGLA_PARA_TIME = {
  BAH: "bahia", BOT: "botafogo", CAM: "atletico-mg", CAP: "athletico-pr", CFC: "coritiba",
  CHA: "chapecoense", COR: "corinthians", CRU: "cruzeiro", FLA: "flamengo", FLU: "fluminense",
  GRE: "gremio", INT: "internacional", MIR: "mirassol", PAL: "palmeiras", RBB: "red-bull-bragantino",
  REM: "remo", SAN: "santos", SAO: "sao-paulo", VAS: "vasco", VIT: "vitoria",
};
const HORAS_ENTRE_TENTATIVAS_POR_PLACAR = 24;
const ARQUIVO_CONHECIDOS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "jogos-sem-dados-conhecidos.json");
const CARTOLA_API = "https://api.cartola.globo.com";
const HORAS_ATE_FIM_DO_JOGO = 3;
const DIAS_REDE_DE_SEGURANCA = 5;

const emBrasilia = (iso) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}-03:00`);

export async function deveColetarGols() {
  if (process.env.FORCE_RUN === "1") return { sim: true, motivo: "FORCE_RUN=1" };

  let ultima = null;
  try {
    const resumo = await fetchJsonWithRetry(`${SITE_URL}/data/resumo-rodada.json?t=${Date.now()}`);
    const t = resumo?.geradoEm ? new Date(resumo.geradoEm) : null;
    if (t && !Number.isNaN(t.getTime())) ultima = t;
  } catch { /* trata como "nunca coletado" */ }
  if (!ultima) return { sim: true, motivo: "não consegui ler a data da última coleta" };

  const diasParado = (Date.now() - ultima.getTime()) / 86_400_000;
  if (diasParado >= DIAS_REDE_DE_SEGURANCA) {
    return { sim: true, motivo: `rede de segurança: ${diasParado.toFixed(1)} dias sem coletar` };
  }

  // Datas de início dos jogos: (1) calendário do site (próxima rodada) e
  // (2) API pública do Cartola (sem login) com TODAS as rodadas até atual+1 —
  // é ela que pega jogo ADIADO/REMARCADO (de qualquer rodada, ex.: R4 jogada
  // na R31), que não está no calendário do site. Só conta jogo cuja data cai
  // depois da última coleta, então rodada antiga normal nunca dispara nada. Se uma das fontes falhar, usa a outra.
  const inicios = [];
  const comPlacar = []; // jogos com placar no Cartola: { rodada, casa, fora }
  let leuAlgumaFonte = false;
  try {
    const calendario = await fetchJsonWithRetry(`${SITE_URL}/data/proximo-confronto.json?t=${Date.now()}`);
    for (const c of Object.values(calendario || {})) if (c?.data) inicios.push(String(c.data));
    leuAlgumaFonte = true;
  } catch { /* segue com o Cartola */ }
  try {
    const atual = await fetchJsonWithRetry(`${CARTOLA_API}/partidas`);
    const r = Number(atual?.rodada);
    if (r > 0) {
      const rodadas = Array.from({ length: Math.min(38, r + 1) }, (_, i) => i + 1); // todas: pega adiado de qualquer rodada
      const listas = await Promise.all(rodadas.map((n) => n === r ? atual : fetchJsonWithRetry(`${CARTOLA_API}/partidas/${n}`).catch(() => null)));
      for (const l of listas) for (const j of l?.partidas || []) {
        if (j?.partida_data) inicios.push(String(j.partida_data).replace(" ", "T"));
        if (j?.placar_oficial_mandante != null && j?.placar_oficial_visitante != null) {
          const casa = SIGLA_PARA_TIME[l.clubes?.[j.clube_casa_id]?.abreviacao];
          const fora = SIGLA_PARA_TIME[l.clubes?.[j.clube_visitante_id]?.abreviacao];
          if (casa && fora && l.rodada) comPlacar.push({ rodada: Number(l.rodada), casa, fora });
        }
      }
      leuAlgumaFonte = true;
    }
  } catch { /* segue com o calendário do site */ }
  if (!leuAlgumaFonte) return { sim: true, motivo: "não consegui ler nenhum calendário" };

  // Agrupa os jogos por DIA (calendário de Brasília) e pega o fim do ÚLTIMO jogo
  // de cada dia: uma coleta por dia de jogo, depois do último jogo do dia.
  const porDia = {};
  for (const data of inicios) {
    const inicio = emBrasilia(data).getTime();
    if (Number.isNaN(inicio)) continue;
    const dia = data.slice(0, 10);
    porDia[dia] = Math.max(porDia[dia] || 0, inicio + HORAS_ATE_FIM_DO_JOGO * 3_600_000);
  }
  const fins = Object.values(porDia);
  if (!fins.length) return { sim: true, motivo: "calendário vazio" };

  // Rede extra: jogo COM PLACAR no Cartola que o nosso site ainda não tem
  // (cobre jogo remarcado sem data nova no Cartola, ex.: Chapecoense x Vasco R21).
  // Só conta ocorrência NOVA (fora de data/jogos-sem-dados-conhecidos.json — jogos
  // que a FootStats nunca registrou) e no máximo 1 tentativa a cada 24h.
  try {
    const times = [...new Set(comPlacar.flatMap((j) => [j.casa, j.fora]))];
    const rodadasDoTime = {};
    await Promise.all(times.map(async (t) => {
      const d = await fetchJsonWithRetry(`${SITE_URL}/data/${t}.json?t=${Date.now()}`);
      rodadasDoTime[t] = new Set(Object.keys(d?.rounds || {}));
    }));
    let conhecidos = new Set();
    try { conhecidos = new Set(JSON.parse(fs.readFileSync(ARQUIVO_CONHECIDOS, "utf8"))); } catch { /* sem lista = tudo é novo */ }
    const faltando = comPlacar
      .filter((j) => !rodadasDoTime[j.casa]?.has(String(j.rodada)) || !rodadasDoTime[j.fora]?.has(String(j.rodada)))
      .map((j) => `${j.rodada}|${j.casa}|${j.fora}`);
    const novos = faltando.filter((k) => !conhecidos.has(k));
    if (novos.length && diasParado * 24 >= HORAS_ENTRE_TENTATIVAS_POR_PLACAR) {
      return { sim: true, motivo: `jogo(s) com placar no Cartola e sem dados no site: ${novos.slice(0, 3).join(", ")}${novos.length > 3 ? "…" : ""}` };
    }
  } catch { /* sem a checagem extra, vale o resto */ }

  const agora = Date.now();
  const pendentes = fins.filter((t) => t <= agora && t > ultima.getTime());
  if (pendentes.length) {
    return { sim: true, motivo: `${pendentes.length} dia(s) de jogo com o último jogo já terminado depois da última coleta (${ultima.toISOString()})` };
  }
  const proximo = fins.filter((t) => t > agora).sort((a, b) => a - b)[0];
  const quando = proximo ? `último jogo do próximo dia de jogo termina em ${((proximo - agora) / 3_600_000).toFixed(1)}h` : "sem jogos futuros no calendário";
  return { sim: false, motivo: `nenhum dia de jogo concluído desde a última coleta; ${quando}` };
}

const { sim, motivo } = await deveColetarGols();
console.error(`[should_harvest_footstats] ${sim ? "SIM" : "não"} — ${motivo}`);
process.stdout.write(sim ? "sim" : "nao");
