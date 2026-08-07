import { fetchJsonWithRetry } from "./lib/http.mjs";
import { ultimasFinalizacoes, detectarPadroes } from "./lib/shot-patterns.mjs";
import { gerarFrases } from "./lib/shot-phrases.mjs";

/**
 * Junta a detecção de padrão pra TODOS os times, a partir do dataset de
 * finalizações (`data/finalizacoes/{time}.json` — ver
 * harvest_footstats_shots.mjs). NÃO precisa de login na FootStats — só lê
 * o que o harvester já publicou no site.
 *
 * Saída: pra cada time, até `MAX_FRASES` frases (as de |z| mais alto),
 * misturando o que ele CRIA (shots_for) e o que CEDE (shots_against), nas 5
 * dimensões (origem da jogada, posição de quem finaliza, posição de quem
 * assiste, dentro/fora da área, contra-ataque).
 *
 * IMPORTANTE: só produz algo com sentido depois que
 * harvest_footstats_shots.mjs já rodou pelo menos uma vez em produção (ver
 * cabeçalho daquele arquivo — depende do endpoint /api/save-shots, que por
 * sua vez depende de um deploy manual do server.py no Render).
 *
 * Rodar: node scripts/build_shot_patterns.mjs
 * (SITE_URL, ULTIMAS_N e TIME_ALVO são opcionais — ver env vars abaixo)
 */

const SITE_URL = process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com";
const ULTIMAS_N = Number(process.env.ULTIMAS_N) || 6;
const MAX_FRASES = Number(process.env.MAX_FRASES) || 5;
const TIME_ALVO = process.env.TIME_ALVO || null; // pra depurar 1 time só

const TIMES = [
  "flamengo", "botafogo", "corinthians", "bahia", "fluminense", "vasco", "palmeiras",
  "sao-paulo", "santos", "red-bull-bragantino", "atletico-mg", "cruzeiro", "gremio",
  "internacional", "vitoria", "athletico-pr", "coritiba", "chapecoense", "remo", "mirassol",
];

const DIMENSOES = ["origem", "posicao", "assistentePosicao", "area", "contraAtaque"];

async function carregarFinalizacoes(slug) {
  try {
    return await fetchJsonWithRetry(`${SITE_URL}/data/finalizacoes/${slug}.json?t=${Date.now()}`);
  } catch {
    return { matches: {} };
  }
}

/** roda a detecção pra um `lado` (shots_for | shots_against) através de todos os times, e devolve Map<timeSlug, frases[]>. */
function analisarLado(dadosPorTime, lado) {
  const porTimeMap = new Map();
  for (const [slug, dados] of dadosPorTime) {
    porTimeMap.set(slug, ultimasFinalizacoes(dados.matches, { lado, ultimasN: ULTIMAS_N }));
  }

  const frasesPorTime = new Map();
  for (const slug of porTimeMap.keys()) {
    let achados = [];
    for (const dimensao of DIMENSOES) {
      achados.push(...detectarPadroes({ timeSlug: slug, porTimeMap, dimensao }));
    }
    const frases = gerarFrases(achados, { time: rotuloTime(slug), lado });
    frasesPorTime.set(slug, frases);
  }
  return frasesPorTime;
}

function rotuloTime(slug) {
  // rótulo só pra leitura no console/relatório — a UI real usa o nome já
  // exibido em cada tela do site, isso aqui não decide layout nenhum.
  return slug
    .split("-")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

async function main() {
  console.log(`→ carregando finalizações de ${TIMES.length} times (últimas ${ULTIMAS_N} partidas cada)...`);
  const alvos = TIME_ALVO ? [TIME_ALVO] : TIMES;

  const dadosPorTime = new Map();
  for (const slug of TIMES) {
    dadosPorTime.set(slug, await carregarFinalizacoes(slug));
  }

  const vazios = [...dadosPorTime.entries()].filter(([, d]) => !Object.keys(d.matches || {}).length);
  if (vazios.length === TIMES.length) {
    console.log("\n⚠ nenhum time tem dado em data/finalizacoes/ ainda — o harvester de finalizações precisa rodar em produção primeiro (ver harvest_footstats_shots.mjs).");
    return;
  }
  if (vazios.length) {
    console.log(`  (${vazios.length} time(s) ainda sem dado: ${vazios.map(([s]) => s).join(", ")})`);
  }

  const frasesCriadas = analisarLado(dadosPorTime, "shots_for");
  const frasesCedidas = analisarLado(dadosPorTime, "shots_against");

  for (const slug of alvos) {
    const criadas = frasesCriadas.get(slug) || [];
    const cedidas = frasesCedidas.get(slug) || [];
    const combinadas = [...criadas, ...cedidas]
      .sort((a, b) => Math.abs(b.achado.z) - Math.abs(a.achado.z))
      .slice(0, MAX_FRASES);

    console.log(`\n=== ${rotuloTime(slug)} ===`);
    if (!combinadas.length) {
      console.log("  (nenhum padrão significativo nas últimas partidas — nada mensurável, fica quieto)");
      continue;
    }
    for (const { frase, achado } of combinadas) {
      console.log(`  · ${frase}  [z=${achado.z.toFixed(2)}]`);
    }
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exitCode = 1;
});
