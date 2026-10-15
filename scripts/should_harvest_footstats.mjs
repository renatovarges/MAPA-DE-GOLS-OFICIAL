#!/usr/bin/env node
/**
 * Porteiro BARATO da coleta de gols (FootStats): "algum jogo terminou desde
 * a última coleta?". Roda num job sem navegador (só Node + fetch) — o job
 * pesado do harvest-footstats.yml só roda quando este script imprime "sim".
 *
 * Regra (pedido do Renato, 2026-10): coletar só DEPOIS dos jogos, nos dias
 * em que houve jogo, em vez de todo dia.
 *   - Lê o calendário já publicado (data/proximo-confronto.json; datas em
 *     horário de Brasília, sem fuso no arquivo).
 *   - Uma coleta por DIA de jogo: 3h depois do início do ÚLTIMO jogo do dia
 *     (90 min + intervalo + acréscimos + folga pra FootStats publicar).
 *   - "Última coleta" = geradoEm de data/resumo-rodada.json, regravado a cada
 *     execução completa deste workflow.
 *   - Coleta se existe dia de jogo cujo último jogo já terminou depois da última coleta.
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
import { fetchJsonWithRetry } from "./lib/http.mjs";

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
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

  let calendario;
  try {
    calendario = await fetchJsonWithRetry(`${SITE_URL}/data/proximo-confronto.json?t=${Date.now()}`);
  } catch {
    return { sim: true, motivo: "não consegui ler o calendário" };
  }
  // Agrupa os jogos por DIA (calendário de Brasília) e pega o fim do ÚLTIMO jogo
  // de cada dia: uma coleta por dia de jogo, depois do último jogo do dia.
  const porDia = {};
  for (const c of Object.values(calendario || {})) {
    if (!c || !c.data) continue;
    const inicio = emBrasilia(c.data).getTime();
    if (Number.isNaN(inicio)) continue;
    const dia = String(c.data).slice(0, 10);
    porDia[dia] = Math.max(porDia[dia] || 0, inicio + HORAS_ATE_FIM_DO_JOGO * 3_600_000);
  }
  const fins = Object.values(porDia);
  if (!fins.length) return { sim: true, motivo: "calendário vazio" };

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
