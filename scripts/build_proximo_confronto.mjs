import "./lib/site-auth.mjs"; // envia a chave do robô ao site ao vivo (ver lib/site-auth.mjs)
import { fetchJsonWithRetry } from "./lib/http.mjs";
import { rodadaAbertaDoCartola, confrontosPorTime } from "./lib/rodada-cartola.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";

/**
 * Confrontos da rodada ABERTA no Cartola (mando por time) — usado pelo filtro
 * "rodada atual" dos Líderes, pelo Raio X, pelo "Baixar tudo" e pela
 * frequência da coleta de prováveis.
 *
 * Achado real (2026-11): antes vinha da FootStats e exigia uma rodada com os
 * 10 jogos ainda por jogar. Bastou um jogo da R37 ser disputado antes para o
 * site pular para a R38 com o mercado da R37 ainda aberto. Agora vale a rodada
 * do Cartola, só com os jogos válidos: time sem jogo válido fica de fora.
 *
 * Arquivo único, sobrescrito por completo — e só quando o conteúdo muda,
 * porque roda a cada 2h e cada gravação vira um commit.
 */

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";

const assinatura = (porTime) =>
  Object.keys(porTime || {}).sort()
    .map((t) => [t, porTime[t].mando, porTime[t].adversario, porTime[t].data, porTime[t].rodada].join("|"))
    .join(";");

async function main() {
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é enviado — rode com ENVIO_REAL=1 pra gravar de verdade)"}`);
  console.log(`→ site alvo: ${SITE_URL}`);

  const { rodada, jogos } = await rodadaAbertaDoCartola();
  if (!jogos.length) {
    console.log(`→ rodada ${rodada} sem jogos válidos no Cartola — mantém o arquivo atual.`);
    return;
  }
  const porTime = confrontosPorTime(rodada, jogos);
  console.log(`→ rodada ${rodada} do Cartola: ${jogos.length} jogos válidos, ${Object.keys(porTime).length} times`);
  for (const j of jogos) console.log(`  ${j.data}  ${j.mandante} x ${j.visitante}`);

  const atual = await fetchJsonWithRetry(`${SITE_URL}/data/proximo-confronto.json?t=${Date.now()}`).catch(() => null);
  if (atual && assinatura(atual) === assinatura(porTime)) {
    console.log("✓ sem mudança — nada a gravar");
    return;
  }
  if (!ENVIO_REAL) {
    console.log(`  [SIMULAÇÃO] enviaria próximo confronto de ${Object.keys(porTime).length} times`);
    return;
  }
  const res = await fetch(`${SITE_URL}/api/save-proximo-confronto`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(porTime),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-proximo-confronto falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  console.log(`✓ próximo confronto salvo para ${Object.keys(porTime).length} times`);
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
