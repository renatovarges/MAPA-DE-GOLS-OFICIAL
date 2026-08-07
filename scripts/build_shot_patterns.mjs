import { fetchJsonWithRetry } from "./lib/http.mjs";
import { finalizacoesPonderadas, detectarPadroesInternos, distintividade, agruparPorCategoria, DIMENSOES } from "./lib/shot-patterns.mjs";
import { gerarFrases } from "./lib/shot-phrases.mjs";

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
 *   JSON=1                -> imprime JSON em vez de texto (pra alimentar a UI)
 */

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const MAX_FRASES = Number(process.env.MAX_FRASES) || 4;
const PISO_MINIMO = Number(process.env.PISO_MINIMO) || 0.12;
const TIME_ALVO = process.env.TIME_ALVO || null;
const SAIDA_JSON = process.env.JSON === "1";

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
  try {
    return await fetchJsonWithRetry(`${SITE_URL}/data/finalizacoes/${slug}.json?t=${Date.now()}`, { retries: 1 });
  } catch {
    return { matches: {} };
  }
}

/** roda um lado (shots_for | shots_against) pra todos os times. */
function analisarLado(dadosPorTime, lado) {
  const ponderadoPorTime = new Map();
  for (const [slug, dados] of dadosPorTime) {
    ponderadoPorTime.set(slug, finalizacoesPonderadas(dados.matches, { lado }));
  }

  // share de cada (dimensão|categoria) em cada time — base da distintividade,
  // que decide quais padrões ganham as poucas vagas de texto e como a frase
  // é redigida (ver shot-patterns.mjs).
  const sharesPorChave = new Map();
  for (const [, { shots }] of ponderadoPorTime) {
    for (const dimensao of DIMENSOES) {
      const { grupos, pesosTotais } = agruparPorCategoria(shots, dimensao);
      const total = pesosTotais.reduce((a, b) => a + b, 0);
      if (!total) continue;
      for (const [categoria, pesos] of grupos) {
        const chave = `${dimensao}|${categoria}`;
        if (!sharesPorChave.has(chave)) sharesPorChave.set(chave, []);
        sharesPorChave.get(chave).push(pesos.reduce((a, b) => a + b, 0) / total);
      }
    }
  }

  const resultado = new Map();
  for (const [slug, { shots, jogosUsados }] of ponderadoPorTime) {
    if (!shots.length) { resultado.set(slug, []); continue; }

    const achados = [];
    for (const dimensao of DIMENSOES) {
      achados.push(...detectarPadroesInternos({ shots, jogosUsados, dimensao, pisoMinimo: PISO_MINIMO }));
    }
    for (const a of achados) {
      a.distintividade = distintividade(a.share, sharesPorChave.get(`${a.dimensao}|${a.categoria}`) || []);
    }

    resultado.set(slug, gerarFrases(achados, { time: rotuloTime(slug), lado, max: MAX_FRASES }));
  }
  return resultado;
}

async function main() {
  if (!SAIDA_JSON) console.log(`→ carregando finalizações de ${TIMES.length} times...`);

  const dadosPorTime = new Map();
  await Promise.all(TIMES.map(async (slug) => { dadosPorTime.set(slug, await carregar(slug)); }));

  const comDado = [...dadosPorTime.values()].filter((d) => Object.keys(d.matches || {}).length).length;
  if (!comDado) {
    console.log("\n⚠ nenhum time tem dado em data/finalizacoes/ ainda — o harvester de finalizações precisa rodar em produção primeiro (ver harvest_footstats_shots.mjs).");
    return;
  }

  const criadas = analisarLado(dadosPorTime, "shots_for");
  const cedidas = analisarLado(dadosPorTime, "shots_against");
  const alvos = TIME_ALVO ? [TIME_ALVO] : TIMES;

  if (SAIDA_JSON) {
    const saida = {};
    for (const slug of alvos) {
      saida[slug] = {
        potencialOfensivo: (criadas.get(slug) || []).map((r) => r.frase),
        fragilidadeDefensiva: (cedidas.get(slug) || []).map((r) => r.frase),
      };
    }
    console.log(JSON.stringify(saida, null, 2));
    return;
  }

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
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exitCode = 1;
});
