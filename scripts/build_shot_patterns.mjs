import { fetchJsonWithRetry } from "./lib/http.mjs";
import { finalizacoesPonderadas, detectarPadroesInternos, distintividade, distribuicoesDeShare, DIMENSOES } from "./lib/shot-patterns.mjs";
import { gerarFrases } from "./lib/shot-phrases.mjs";
import { dispatchAlert } from "./lib/alerts.mjs";
import { gerarResumoRodada } from "./lib/round-summary.mjs";

import { exigirQualidade } from "./lib/quality-gate.mjs";
/**
 * Monta o retrato de cada time (o que ele CRIA e o que CEDE) a partir de
 * `data/finalizacoes/{time}.json` — ver harvest_footstats_shots.mjs.
 * Não precisa de login na FootStats: só lê o que já está publicado no site.
 *
 * O padrão é do PRÓPRIO time, não uma comparação com a liga (ver decisão de
 * desenho no topo de shot-patterns.mjs). A liga só entra como anotação
 * quando o time também destoa dela.
 *
 * Rodar: node scripts/build_shot_patterns.mjs
 *   TIME_ALVO=vasco       -> só um time
 *   MAX_FRASES=3          -> teto de frases por lado
 *   PISO_MINIMO=0.15      -> quão grande a fatia precisa ser pra virar padrão
 *   JSON=1                -> imprime JSON em vez de texto (só leitura, não grava)
 *   ENVIO_REAL=1          -> grava de verdade em data/padroes/{time}.json
 *                            (via POST /api/save-patterns, mesmo servidor)
 *
 * Roda como 3º passo do mesmo workflow do harvester (depois das
 * finalizações já estarem atualizadas) — ver .github/workflows.
 */

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const MAX_FRASES = Number(process.env.MAX_FRASES) || 4;
const PISO_MINIMO = Number(process.env.PISO_MINIMO) || 0.12;
const TIME_ALVO = process.env.TIME_ALVO || null;
const SAIDA_JSON = process.env.JSON === "1";
const ENVIO_REAL = process.env.ENVIO_REAL === "1";

const TIMES = [
  "flamengo", "botafogo", "corinthians", "bahia", "fluminense", "vasco", "palmeiras",
  "sao-paulo", "santos", "red-bull-bragantino", "atletico-mg", "cruzeiro", "gremio",
  "internacional", "vitoria", "athletico-pr", "coritiba", "chapecoense", "remo", "mirassol",
];

const NOMES = {
  "red-bull-bragantino": "Red Bull Bragantino", "atletico-mg": "Atlético-MG",
  "athletico-pr": "Athletico-PR", "sao-paulo": "São Paulo", "gremio": "Grêmio",
  "vitoria": "Vitória",
};
function rotuloTime(slug) {
  return NOMES[slug] || slug.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

async function carregar(slug) {
  return fetchJsonWithRetry(`${SITE_URL}/data/finalizacoes/${slug}.json?t=${Date.now()}`, { retries: 3 });
}

async function carregarPadraoAnterior(slug) {
  try {
    const response = await fetch(`${SITE_URL}/data/padroes/${slug}.json?t=${Date.now()}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/** roda um lado (shots_for | shots_against) pra todos os times. */
function analisarLado(dadosPorTime, lado, anterioresPorTime = new Map()) {
  const ponderadoPorTime = new Map();
  for (const [slug, dados] of dadosPorTime) {
    ponderadoPorTime.set(slug, finalizacoesPonderadas(dados.matches, { lado }));
  }

  // share de cada (dimensão|categoria) em cada time — base da distintividade,
  // que decide quais padrões ganham as poucas vagas de texto e como a frase
  // é redigida (ver shot-patterns.mjs).
  const sharesPorChave = distribuicoesDeShare([...ponderadoPorTime.values()].map((item) => item.shots));

  const resultado = new Map();
  for (const [slug, { shots, jogosUsados, pesoTotalJogos }] of ponderadoPorTime) {
    if (!shots.length) { resultado.set(slug, []); continue; }

    const achados = [];
    for (const dimensao of DIMENSOES) {
      achados.push(...detectarPadroesInternos({ shots, jogosUsados, pesoTotalJogos, dimensao, pisoMinimo: PISO_MINIMO }));
    }
    for (const a of achados) {
      a.distintividade = distintividade(a.share, sharesPorChave.get(`${a.dimensao}|${a.categoria}`) || []);
    }

    const campo = lado === "shots_for" ? "evidenciasAtaca" : "evidenciasSofre";
    const chavesAnteriores = (anterioresPorTime.get(slug)?.[campo] || []).map((item) => item.chave).filter(Boolean);
    resultado.set(slug, gerarFrases(achados, { time: rotuloTime(slug), lado, max: MAX_FRASES, chavesAnteriores }));
  }
  return resultado;
}

async function salvarPadrao(slug, payload) {
  if (!ENVIO_REAL) return { ok: true, simulado: true };
  const res = await fetch(`${SITE_URL}/api/save-patterns`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-patterns falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function salvarResumoRodada(payload) {
  if (!ENVIO_REAL) return { ok: true, simulado: true };
  const res = await fetch(`${SITE_URL}/api/save-round-summary`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`save-round-summary falhou (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body;
}

function calcularMetricasDefensivas(dadosPorTime) {
  const resultado = new Map();
  for (const [slug, dados] of dadosPorTime) {
    const { shots, jogosUsados, pesoTotalJogos } = finalizacoesPonderadas(dados.matches, { lado: "shots_against" });
    if (!pesoTotalJogos) continue;
    const totalPonderado = shots.reduce((soma, chute) => soma + (Number(chute._peso) || 0), 0);
    resultado.set(slug, { finalizacoesCedidasPorJogo: totalPonderado / pesoTotalJogos, jogosUsados });
  }
  return resultado;
}
async function main() {
  if (!SAIDA_JSON) console.log(`→ modo: ${ENVIO_REAL ? "ENVIO REAL (grava no site ao vivo)" : "SIMULAÇÃO"}`);
  if (!SAIDA_JSON) console.log(`→ carregando finalizações de ${TIMES.length} times...`);

  const dadosPorTime = new Map();
  const anterioresPorTime = new Map();
  await Promise.all(TIMES.map(async (slug) => {
    const [dados, anterior] = await Promise.all([carregar(slug), carregarPadraoAnterior(slug)]);
    dadosPorTime.set(slug, dados);
    anterioresPorTime.set(slug, anterior);
  }));

  const comDado = [...dadosPorTime.values()].filter((d) => Object.keys(d.matches || {}).length).length;
  if (!comDado) {
    console.log("\n⚠ nenhum time tem dado em data/finalizacoes/ ainda — o harvester de finalizações precisa rodar em produção primeiro (ver harvest_footstats_shots.mjs).");
    return;
  }

  const criadas = analisarLado(dadosPorTime, "shots_for", anterioresPorTime);
  const cedidas = analisarLado(dadosPorTime, "shots_against", anterioresPorTime);
  const alvos = TIME_ALVO ? [TIME_ALVO] : TIMES;

  const geradoEm = new Date().toISOString();
  const partidas = [...dadosPorTime.values()].flatMap((d) => Object.values(d.matches || {}));
  const rodadas = partidas.map((m) => Number(m.roundNumber)).filter(Number.isFinite);
  const datas = partidas.map((m) => m.date).filter(Boolean).sort();
  const resumoRodada = gerarResumoRodada({
    ofensivosPorTime: criadas, defensivosPorTime: cedidas, metricasDefensivasPorTime: calcularMetricasDefensivas(dadosPorTime),
    rodada: rodadas.length ? Math.max(...rodadas) : null,
    janelaAte: datas.length ? datas[datas.length - 1] : null,
    geradoEm,
  });
  const auditoria = exigirQualidade({
    timesEsperados: TIMES,
    ofensivosPorTime: criadas,
    defensivosPorTime: cedidas,
    anterioresPorTime,
    resumoRodada,
  });
  if (!SAIDA_JSON) {
    console.log(`quality gate: ${auditoria.metricas.totalFrases} frases validadas, media ${auditoria.metricas.mediaPorTimeELado.toFixed(2)} por time/lado`);
    for (const aviso of auditoria.avisos) console.log(`  AVISO: ${aviso}`);
  }


  if (SAIDA_JSON) {
    const saida = {};
    for (const slug of alvos) {
      saida[slug] = {
        potencialOfensivo: (criadas.get(slug) || []).map((r) => r.frase),
        fragilidadeDefensiva: (cedidas.get(slug) || []).map((r) => r.frase),
      };
    }
    saida.resumoRodada = resumoRodada;
    saida.auditoria = auditoria;
    console.log(JSON.stringify(saida, null, 2));
    return;
  }

  let salvos = 0, falhas = 0;
  for (const slug of alvos) {
    const ofensivo = criadas.get(slug) || [];
    const defensivo = cedidas.get(slug) || [];
    console.log(`\n=== ${rotuloTime(slug)} ===`);
    console.log("  COMO ATACA:");
    if (!ofensivo.length) console.log("    (nada mensurável)");
    for (const { frase, achado } of ofensivo) {
      console.log(`    · ${frase}  [${(achado.share * 100).toFixed(0)}%, piso ${(achado.pisoIC * 100).toFixed(0)}%, n=${achado.ocorrencias}]`);
    }
    console.log("  COMO SOFRE:");
    if (!defensivo.length) console.log("    (nada mensurável)");
    for (const { frase, achado } of defensivo) {
      console.log(`    · ${frase}  [${(achado.share * 100).toFixed(0)}%, piso ${(achado.pisoIC * 100).toFixed(0)}%, n=${achado.ocorrencias}]`);
    }

    try {
      await salvarPadrao(slug, {
        teamKey: slug, geradoEm,
        ataca: ofensivo.map((r) => r.frase),
        evidenciasAtaca: ofensivo.map((r) => ({
          chave: r.chave,
          confianca: r.confianca,
        })),
        evidenciasSofre: defensivo.map((r) => ({
          chave: r.chave,
          confianca: r.confianca,
        })),
        sofre: defensivo.map((r) => r.frase),
      });
      salvos++;
    } catch (e) {
      falhas++;
      console.log(`  ! falha ao salvar padrão de ${slug}: ${e.message}`);
    }
  }

  if (ENVIO_REAL) console.log(`\n✓ ${salvos} time(s) salvos, ${falhas} falha(s)`);
  else console.log("\nEssa foi uma SIMULAÇÃO — rode com ENVIO_REAL=1 pra gravar de verdade no site ao vivo.");

  console.log("\n=== VISÃO GERAL DA RODADA ===");
  for (const conclusao of resumoRodada.conclusoes) console.log(`  · ${conclusao.frase}`);
  try {
    await salvarResumoRodada(resumoRodada);
    if (ENVIO_REAL) console.log("  ✓ resumo geral salvo");
  } catch (e) {
    falhas++;
    console.log(`  ! falha ao salvar resumo geral: ${e.message}`);
  }
}

main().catch(async (e) => {
  console.error("✗", e);
  if (process.env.ENVIO_REAL === "1") {
    await dispatchAlert({
      title: "build_shot_patterns falhou por completo — retrato dos times não foi atualizado",
      details: String(e && e.stack ? e.stack : e),
    }).catch(() => {});
  }
  process.exitCode = 1;
});
