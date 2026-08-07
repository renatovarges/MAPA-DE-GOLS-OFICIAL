/**
 * Detecção de padrão de como um time cria/cede finalização — núcleo
 * estatístico puro (sem I/O), sobre `data/finalizacoes/{time}.json`.
 *
 * DECISÃO DE DESENHO (Renato, 2026-08, corrigindo a primeira versão): o que
 * interessa é o PADRÃO DO PRÓPRIO TIME, não se ele é acima ou abaixo da
 * liga. Se o Vasco sofre muito cruzamento pela direita, isso é explorável
 * mesmo que a liga inteira sofra o mesmo tanto. Então a comparação com a
 * liga saiu do critério de entrada e virou só ANOTAÇÃO opcional
 * (`compararComLiga`), enquanto o teste de confiança passou a ser a
 * MARGEM DE ERRO da própria medida (intervalo de Wilson): só vira padrão o
 * que, lido do jeito mais pessimista, ainda é um pedaço relevante.
 *
 * JANELA PONDERADA (mesma ideia do decaimento da Montagem Defensiva): usa a
 * temporada inteira, mas os jogos recentes pesam mais — PESOS 3/2/1
 * (últimos 5 / 6º-10º / resto). Medido com dado real (13,2 finalizações por
 * time por jogo, 21 jogos): a ponderação custa ~19% de amostra efetiva e
 * quase nada em poder de detecção (padrão mínimo detectável vai de 9% para
 * 9%), então dá pra ter recência sem perder granularidade.
 *
 * A conta de amostra efetiva é a de Kish — (Σw)²/Σw² — e NÃO a contagem
 * bruta: sem isso o intervalo de confiança ficaria otimista demais, e a
 * ponderação viraria uma forma de fingir mais dado do que se tem.
 */

/** pesos por recência — índice 0 = jogo mais recente. */
export const PESOS = { recentes: 3, medios: 2, antigos: 1 };
export function pesoDoJogo(indice) {
  if (indice < 5) return PESOS.recentes;
  if (indice < 10) return PESOS.medios;
  return PESOS.antigos;
}

/** ordena por data real (Regra de Ouro do projeto: nunca por número de rodada) e anexa o peso de recência a cada finalização. */
export function finalizacoesPonderadas(matchesObj, { lado, maxJogos = 40 } = {}) {
  const partidas = Object.values(matchesObj || {})
    .filter((m) => m && m.date && Array.isArray(m[lado]))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, maxJogos);

  const shots = [];
  partidas.forEach((p, i) => {
    const peso = pesoDoJogo(i);
    for (const s of p[lado]) shots.push({ ...s, _peso: peso });
  });
  return { shots, jogosUsados: partidas.length };
}

/** amostra efetiva de Kish: (Σw)²/Σw². Com pesos todos iguais devolve o próprio n. */
export function amostraEfetiva(pesos) {
  let sw = 0, sw2 = 0;
  for (const w of pesos) { sw += w; sw2 += w * w; }
  if (sw2 === 0) return 0;
  return (sw * sw) / sw2;
}

/**
 * Intervalo de Wilson pra uma proporção — melhor que a aproximação normal
 * justamente no nosso regime (proporções pequenas, amostra moderada), onde
 * a normal chega a devolver piso negativo.
 */
export function intervaloWilson(p, n, z = 1.96) {
  if (!(n > 0)) return { p, lo: 0, hi: 1 };
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centro = (p + z2 / (2 * n)) / denom;
  const margem = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centro - margem), hi: Math.min(1, centro + margem) };
}

// ---------------------------------------------------------------------------
// Dimensões
// ---------------------------------------------------------------------------

/** lado do campo a partir do eixo Y (0-68). Confirmado empiricamente contra
 * as posições reais dos jogadores: Y baixo = esquerda, Y alto = direita
 * (laterais-esquerdos concentram 74% das assistências em Y baixo;
 * laterais-direitos, 87% em Y alto; meias e volantes ficam distribuídos,
 * que é o controle negativo esperado). */
export function ladoDoCampo(ponto) {
  if (!ponto || typeof ponto.y !== "number") return null;
  if (ponto.y < 68 / 3) return "esquerda";
  if (ponto.y > (68 * 2) / 3) return "direita";
  return "centro";
}

const EXTRATORES = {
  origem: (s) => s.origem || null,
  posicao: (s) => s.posicao || null,
  assistentePosicao: (s) => s.assistentePosicao || null,
  area: (s) => (s.dentroDaArea ? "dentro-da-area" : "fora-da-area"),
  contraAtaque: (s) => (s.contraAtaque ? "contra-ataque" : "jogada-organizada"),
  parteDoCorpo: (s) => (s.perna === "CABECA" ? "cabeca" : s.perna ? "pe" : null),
  // lado de ONDE NASCEU a jogada — medir pelo chute não funciona (ponta
  // corta pra dentro e todo mundo finaliza pelo meio); verificado com dado
  // real antes de virar dimensão.
  ladoDaJogada: (s) => ladoDoCampo(s.origemZona),
  // combinações — é aqui que o padrão deixa de ser trivialidade ("passe no
  // chão" é maioria em todo time) e vira algo específico e explorável.
  "origem+lado": (s) => {
    const l = ladoDoCampo(s.origemZona);
    return s.origem && l && l !== "centro" ? `${s.origem}|${l}` : null;
  },
  "origem+corpo": (s) => {
    const c = EXTRATORES.parteDoCorpo(s);
    return s.origem && c ? `${s.origem}|${c}` : null;
  },
  "lado+corpo": (s) => {
    const l = ladoDoCampo(s.origemZona);
    const c = EXTRATORES.parteDoCorpo(s);
    return l && l !== "centro" && c ? `${l}|${c}` : null;
  },
};

export const DIMENSOES = Object.keys(EXTRATORES);

export function extrairValor(shot, dimensao) {
  const fn = EXTRATORES[dimensao];
  if (!fn) throw new Error(`dimensão desconhecida: ${dimensao}`);
  return fn(shot);
}

/** soma os pesos por categoria e guarda os pesos individuais (necessários pra amostra efetiva). */
export function agruparPorCategoria(shots, dimensao) {
  const grupos = new Map();
  const pesosTotais = [];
  for (const s of shots) {
    const w = s._peso ?? 1;
    pesosTotais.push(w);
    const valor = extrairValor(s, dimensao);
    if (valor == null) continue;
    if (!grupos.has(valor)) grupos.set(valor, []);
    grupos.get(valor).push(w);
  }
  return { grupos, pesosTotais };
}

// ---------------------------------------------------------------------------
// Detecção
// ---------------------------------------------------------------------------

/**
 * Padrão INTERNO do time: quais categorias ocupam uma fatia relevante do
 * que ele cria/cede, com confiança suficiente. Sem comparar com ninguém.
 *
 * `pisoMinimo`: o piso do intervalo de Wilson tem que ficar acima disso pra
 *   valer como padrão (default 12% — abaixo disso não é "muito", é detalhe).
 * `minOcorrencias`: contagem bruta mínima, independente de peso — trava de
 *   segurança contra categoria que só existe em 3 jogos recentes e o peso
 *   inflou.
 */
export function detectarPadroesInternos({
  shots,
  jogosUsados,
  dimensao,
  pisoMinimo = 0.12,
  minOcorrencias = 10,
}) {
  if (!shots || !shots.length) return [];
  const { grupos, pesosTotais } = agruparPorCategoria(shots, dimensao);
  const pesoTotal = pesosTotais.reduce((a, b) => a + b, 0);
  const nEfetivoTotal = amostraEfetiva(pesosTotais);
  if (!pesoTotal || !nEfetivoTotal) return [];

  const achados = [];
  for (const [categoria, pesos] of grupos) {
    if (pesos.length < minOcorrencias) continue;
    const share = pesos.reduce((a, b) => a + b, 0) / pesoTotal;
    const { lo, hi } = intervaloWilson(share, nEfetivoTotal);
    if (lo < pisoMinimo) continue;
    achados.push({
      dimensao, categoria,
      share, pisoIC: lo, tetoIC: hi,
      ocorrencias: pesos.length,
      porJogo: jogosUsados ? pesos.length / jogosUsados : null,
      nEfetivo: nEfetivoTotal,
      jogosUsados,
    });
  }
  // ordena pelo piso do IC: o que sobrevive melhor à leitura pessimista
  return achados.sort((a, b) => b.pisoIC - a.pisoIC);
}

/**
 * ANOTAÇÃO opcional: o quanto esse padrão destoa do resto da liga. NÃO é
 * critério de entrada (ver decisão de desenho no topo) — serve só pra
 * enriquecer a frase quando o time também for um caso fora da curva.
 * `shotsLiga` deve ser a união dos outros 19 times, mesmo lado e janela.
 */
export function compararComLiga({ achado, shotsLiga }) {
  const { grupos, pesosTotais } = agruparPorCategoria(shotsLiga, achado.dimensao);
  const pesoTotal = pesosTotais.reduce((a, b) => a + b, 0);
  if (!pesoTotal) return null;
  const pesosCategoria = grupos.get(achado.categoria) || [];
  const shareLiga = pesosCategoria.reduce((a, b) => a + b, 0) / pesoTotal;
  const nEfLiga = amostraEfetiva(pesosTotais);
  const icLiga = intervaloWilson(shareLiga, nEfLiga);
  // "destoa" = os intervalos do time e da liga nem se encostam
  let destaque = null;
  if (achado.pisoIC > icLiga.hi) destaque = "acima";
  else if (achado.tetoIC < icLiga.lo) destaque = "abaixo";
  return { shareLiga, destaque };
}

/**
 * DISTINTIVIDADE — onde o time cai na distribuição dos 20 naquela
 * categoria. Serve pra ORDENAR quais padrões merecem as poucas vagas de
 * texto e pra escolher COMO redigir, NÃO pra filtrar: um padrão comum a
 * toda liga continua valendo (decisão do Renato).
 *
 * POR QUE ISSO É NECESSÁRIO (medido no dado real, 2026-08): ordenar só pelo
 * tamanho da fatia produzia texto ruim de duas formas.
 *
 * 1. Fatia grande não é a mesma coisa que característica marcante. Mas
 *    cuidado — o inverso também não vale: parecia que "cria chance de passe
 *    no chão" (Vasco, 57%) era trivialidade de todo time, e não é: o Vasco é
 *    o 2º de 20 nisso (o último tem 42%). É característica real dele. Só o
 *    ranking na liga distingue os dois casos; o share sozinho não.
 *
 * 2. Pior: sem saber o ranking, a frase pode afirmar o CONTRÁRIO do que o
 *    dado diz. O Vasco finaliza 52% de dentro da área, o que parece muito —
 *    mas é o 18º de 20 (o líder tem 65%). Dizer "finaliza de dentro da área
 *    com frequência" seria enganoso; a informação verdadeira é que ele
 *    chuta de fora mais que quase todo mundo.
 *
 * Por isso a saída tem valor E direção: `direcao: "alto"` quando o time está
 * na ponta de cima da liga, `"baixo"` quando está na de baixo — e a camada
 * de frase usa isso pra escolher a categoria certa de cada dimensão (ver
 * maxPorDimensao em shot-phrases.mjs) e o texto certo.
 *
 * `sharesDaLiga`: share dessa mesma categoria em cada time (inclusive o
 * próprio), mesma dimensão e mesmo lado.
 */
export function distintividade(shareDoTime, sharesDaLiga) {
  if (!sharesDaLiga || sharesDaLiga.length < 3) return { valor: 0, direcao: "meio", percentil: 0.5 };
  // percentil "midrank" — conta metade dos empates de cada lado. Com a
  // contagem ingênua (só os estritamente menores), o percentil de uma
  // categoria e o da sua complementar não somam 1, e as duas metades de um
  // par binário saíam com distintividades diferentes (dentro da área 0,80 x
  // fora da área 0,70) quando por construção elas são a MESMA distância da
  // mediana. Isso quebrava o desempate por direção em shot-phrases.mjs.
  const abaixo = sharesDaLiga.filter((s) => s < shareDoTime).length;
  const iguais = sharesDaLiga.filter((s) => s === shareDoTime).length;
  const percentil = (abaixo + iguais / 2) / sharesDaLiga.length;
  const valor = Math.abs(percentil - 0.5) * 2; // 0 = mediana da liga, 1 = extremo
  let direcao = "meio";
  if (percentil >= 0.75) direcao = "alto";
  else if (percentil <= 0.25) direcao = "baixo";
  return { valor, direcao, percentil };
}
