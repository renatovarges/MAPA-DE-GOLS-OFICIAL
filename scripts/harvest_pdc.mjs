#!/usr/bin/env node
/**
 * Harvester provaveisdocartola.com.br -> data/provaveis.json
 * -------------------------------------------------------------------------
 * Portado do projeto dash-analise-futebol-main (harvest_pdc.mjs + lib/pdc.mjs,
 * já validados lá, reaproveitados sem reescrever a lógica de parsing) —
 * alimenta a aba Raio X Ofensivo: escalação provável por time (posição/
 * dúvida) + desfalques (lesionados/suspensos), e resolve o titular de cada
 * balde de posição pro caso de "brecha sem dono" (rival cede forte numa
 * posição sem ninguém de conquista própria ali).
 *
 * PRECISA DE PLAYWRIGHT — igual à fonte original: o HTML que o SERVIDOR
 * manda é um esqueleto SSR incompleto pra vários clubes (o JS da página
 * hidrata e completa depois). Este harvester espera a hidratação terminar
 * (contagem de `figure.player` estabilizar) antes de capturar o HTML.
 *
 * `data-id` no HTML deles JÁ é o atletaId oficial do Cartola — cruza direto
 * com o resto da base deste projeto, sem casar por nome.
 *
 * Crédito ao site aparece na UI (não escondido) — mesma decisão do projeto
 * de origem.
 *
 * Saída: POST /api/save-provaveis (arquivo único, sobrescrito por completo
 * a cada execução — não é dado por partida, é sempre "estado atual").
 *
 * Rodar: ENVIO_REAL=1 pra gravar de verdade, SITE_URL pra apontar servidor.
 */
import { chromium } from "playwright";
import { parsePdcHtml } from "./lib/pdc.mjs";

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";
const URL = "https://provaveisdocartola.com.br/";

const MIN_CLUBES = 15;
const MIN_FIGURAS_HIDRATADO = 200;

async function esperarHidratacao(page, { minimo = MIN_FIGURAS_HIDRATADO, timeout = 240000, folga = 1500 } = {}) {
  await page.waitForFunction(
    (min) => document.querySelectorAll("figure.player").length >= min,
    minimo,
    { timeout },
  );
  const antes = await page.evaluate(() => document.querySelectorAll("figure.player").length);
  await page.waitForTimeout(folga);
  const depois = await page.evaluate(() => document.querySelectorAll("figure.player").length);
  if (depois < antes) {
    throw new Error(`contagem de jogadores caiu entre duas leituras (${antes} → ${depois}) — página instável`);
  }
  return depois;
}

const agora = () => new Date().toISOString().slice(11, 23);

export async function harvestPdc() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    console.log(`  [${agora()}] goto ...`);
    await page.goto(URL, { waitUntil: "load", timeout: 30000 });
    console.log(`  [${agora()}] load disparou, esperando hidratar (até 4min) ...`);
    let totalFiguras;
    try {
      totalFiguras = await esperarHidratacao(page);
    } catch (e) {
      if (!/Execution context was destroyed/.test(e.message)) throw e;
      console.log(`  [${agora()}] contexto destruído por navegação, tentando de novo ...`);
      await page.waitForLoadState("load", { timeout: 30000 });
      totalFiguras = await esperarHidratacao(page);
    }
    console.log(`  [${agora()}] hidratado (${totalFiguras} figuras)`);

    const html = await page.content();
    const { rodadaInfo, teams } = parsePdcHtml(html);
    if (Object.keys(teams).length < MIN_CLUBES) {
      throw new Error(`só ${Object.keys(teams).length} clubes encontrados (esperado >= ${MIN_CLUBES}) — layout pode ter mudado`);
    }
    return { rodadaInfo, teams, totalFiguras };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`=== Harvester Prováveis (PDC) ===`);
  console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO (nada é gravado)"}`);
  console.log(`→ abrindo ${URL} e esperando a escalação hidratar ...`);
  const { rodadaInfo, teams, totalFiguras } = await harvestPdc();
  const totalJogadores = Object.values(teams).reduce((n, t) => n + t.players.length, 0);
  console.log(`  ${Object.keys(teams).length} clubes, ${totalJogadores} jogadores (${totalFiguras} figuras hidratadas, rodada ${rodadaInfo})`);
  for (const [slug, t] of Object.entries(teams)) {
    const outfield = t.players.filter((p) => !p.isCoach).length;
    if (outfield < 10) console.log(`  ! ${slug}: só ${outfield} jogadores de linha`);
  }

  if (!ENVIO_REAL) {
    console.log(`  [dry-run] gravaria data/provaveis.json`);
    return;
  }
  const res = await fetch(`${SITE_URL}/api/save-provaveis`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fonte: URL, geradoEm: new Date().toISOString(), rodadaInfo, teams }),
  });
  if (!res.ok) throw new Error(`falha ao salvar prováveis: HTTP ${res.status}`);
  console.log(`✓ data/provaveis.json`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exitCode = 1;
});
