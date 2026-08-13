import { getFootstatsToken } from "./lib/footstats-auth.mjs";
import { fetchJsonWithRetry } from "./lib/http.mjs";
import { proximaRodadaCompleta } from "./lib/next-round.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";

/**
 * Mando do PRÓXIMO confronto de cada time — insumo do filtro "rodada
 * atual" na aba Líderes (pedido do Renato em 2026-08-13: "rodada atual é
 * a próxima que o time do jogador vai disputar"). Reaproveita
 * proximaRodadaCompleta() (já usada pela leitura estratégica) em vez de
 * duplicar a lógica de achar a próxima rodada completa (10 jogos, 20
 * times distintos).
 *
 * Arquivo único, sempre sobrescrito por completo — não é por partida.
 */

const CAMPEONATO_ID = 1395;
const API_BASE = "https://gather-api-app.footstats.com.br";
const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";
const TIMES = ["flamengo", "botafogo", "corinthians", "bahia", "fluminense", "vasco", "palmeiras", "sao-paulo", "santos", "red-bull-bragantino", "atletico-mg", "cruzeiro", "gremio", "internacional", "vitoria", "athletico-pr", "coritiba", "chapecoense", "remo", "mirassol"];

function contagemRodada(dadosPorTime) {
  const contagem = new Map();
  for (const dados of dadosPorTime.values()) {
    for (const partida of Object.values(dados.matches || {})) {
      const rodada = Number(partida.roundNumber ?? partida.round);
      if (rodada > 0) contagem.set(rodada, (contagem.get(rodada) || new Set()).add(String(partida.matchId)));
    }
  }
  return [...contagem].filter(([, ids]) => ids.size >= 10).sort((a, b) => b[0] - a[0])[0]?.[0] || 0;
}

async function salvar(payload) {
  if (!ENVIO_REAL) {
    console.log(`  [SIMULAÇÃO] enviaria próximo confronto de ${Object.keys(payload).length} times`);
    return { ok: true, simulado: true };
  }
  const res = await fetch(`${SITE_URL}/api/save-proximo-confronto`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-proximo-confronto falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é enviado — rode com ENVIO_REAL=1 pra gravar de verdade)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  // rodadaDados: usa o dataset de finalizações (mesmo critério da leitura
  // estratégica) — já é coletado todo dia antes deste passo no workflow.
  const dadosPorTime = new Map();
  await Promise.all(TIMES.map(async (time) => {
    try {
      dadosPorTime.set(time, await fetchJsonWithRetry(`${SITE_URL}/data/finalizacoes/${time}.json?t=${Date.now()}`));
    } catch {
      dadosPorTime.set(time, { matches: {} });
    }
  }));
  const rodadaDados = contagemRodada(dadosPorTime);
  console.log(`→ rodada de dados já processada: ${rodadaDados}`);

  const token = await getFootstatsToken();
  const partidas = await fetchJsonWithRetry(`${API_BASE}/api/1.0/campeonatos/${CAMPEONATO_ID}/partidas`, { headers: { Authorization: `Bearer ${token}` } });
  const proxima = proximaRodadaCompleta(partidas, rodadaDados);
  if (!proxima) {
    console.log("→ nenhuma rodada futura completa encontrada — nada a salvar (temporada pode ter terminado ou calendário incompleto).");
    return;
  }
  console.log(`→ próxima rodada completa: ${proxima.rodada} (${proxima.jogos.length} jogos)`);

  const porTime = {};
  for (const jogo of proxima.jogos) {
    porTime[jogo.mandante] = { mando: "casa", adversario: jogo.visitante, data: jogo.data, rodada: proxima.rodada };
    porTime[jogo.visitante] = { mando: "fora", adversario: jogo.mandante, data: jogo.data, rodada: proxima.rodada };
  }

  await salvar(porTime);
  console.log(`✓ próximo confronto ${ENVIO_REAL ? "salvo" : "que seria salvo"} para ${Object.keys(porTime).length} times`);
  if (!ENVIO_REAL) {
    console.log("\nEssa foi uma SIMULAÇÃO — rode com ENVIO_REAL=1 pra gravar de verdade no site ao vivo.");
  }
}

main().catch(async (e) => {
  console.error("✗", e);
  if (process.env.ENVIO_REAL === "1") {
    await dispatchAlert({
      title: "build_proximo_confronto falhou por completo",
      details: String(e && e.stack ? e.stack : e),
    }).catch(() => {});
  }
  process.exitCode = 1;
});
