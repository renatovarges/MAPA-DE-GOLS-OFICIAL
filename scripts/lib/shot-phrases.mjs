/**
 * Traduz um achado de `detectarPadroesInternos` (shot-patterns.mjs) numa
 * frase pronta — sem jargão, sem número de modelo, sem comparação com a
 * liga (o time é descrito por ele mesmo, ver decisão em shot-patterns.mjs).
 *
 * REGRA DO RENATO (2026-08, reforçada na 4ª rodada): "toda frase mostre
 * claramente a força ou fraqueza, em qual scout, pra qual posição e o
 * número" — os quatro são obrigatórios, não "quando o dado permitir". Por
 * isso `gerarFrase` DESCARTA (retorna null) qualquer achado que não consiga
 * apontar uma posição — ver `POSICAO_OBRIGATORIA` e `posicaoDominante` em
 * shot-patterns.mjs (limiar baixo de propósito: o objetivo deixou de ser
 * "só afirmo se for dominante" e passou a ser "sempre reporto a posição
 * mais associada"). As dimensões `posicao`/`assistentePosicao` já têm a
 * posição na própria categoria, então não passam por esse crivo de novo.
 *
 * REDESENHO (Renato, 2026-08, segunda rodada de feedback): a versão
 * anterior comparava com a liga ("mais que a maioria dos times") e incluía
 * categorias sem valor prático pro cartoleiro ("passe no chão" — é assim em
 * todo time, não diz o que fazer com a informação). As duas coisas saíram:
 *   1. Nada de comparação no texto — cada time é descrito por identidade
 *      própria ("O Vasco é um time que..."), não por ranking.
 *   2. "PASSE" nunca gera frase (ver `descrever`) — é jogada aberta comum,
 *      sem ligação com um perfil de jogador específico.
 */

/** dimensões cuja categoria JÁ É uma posição — não passam pelo crivo de posicaoDominante. */
const DIMENSAO_JA_TEM_POSICAO = new Set(["posicao", "assistentePosicao"]);

const POSICAO_LABEL = {
  "lateral-esquerdo": "lateral-esquerdo",
  "lateral-direito": "lateral-direito",
  "meia": "meia",
  "volante": "volante",
  "ponta-esquerda": "ponta-esquerda",
  "ponta-direita": "ponta-direita",
  "atacante-area": "atacante de área",
};

const ORIGEM_LABEL = {
  CRUZAMENTO: "cruzamento",
  ESCANTEIO: "escanteio",
  FALTA: "bola parada (falta)",
  LANCAMENTO: "lançamento longo",
  REBATIDA: "sobra de bola",
  // PASSE fica de fora de propósito — ver cabeçalho do arquivo.
};

const LADO_LABEL = { esquerda: "esquerdo", direita: "direito" };

/** "cerca de 2 por jogo" / "quase 1 por jogo" — número concreto, sem decimal quebrado. */
function frequencia(porJogo) {
  if (porJogo == null) return null;
  if (porJogo >= 1.5) return `cerca de ${Math.round(porJogo)} por jogo`;
  if (porJogo >= 0.8) return "cerca de 1 por jogo";
  if (porJogo >= 0.45) return "mais ou menos 1 a cada 2 jogos";
  return "de vez em quando";
}

/** clausula final apontando a posição — retorna null (não string vazia) quando não há posição válida, pra `gerarFrase` distinguir "sem posição" de "com posição". */
function clausulaPosicao(posDom, cede) {
  if (!posDom) return null;
  const label = POSICAO_LABEL[posDom.posicao];
  if (!label) return null;
  return cede ? ` Fique de olho no ${label} adversário nesses lances.` : ` Quem mais aparece nessas jogadas é o ${label}.`;
}

/**
 * Acima disso a categoria é "o default do futebol", não característica do
 * time: 93% de jogada trabalhada (em vez de contra-ataque) ou 84% de
 * finalização com o pé não informa nada.
 */
const TETO_TRIVIAL = 0.75;

/**
 * `lado`: "shots_for" (o que o time CRIA) | "shots_against" (o que CEDE).
 * Retorna null quando não há template — mais seguro que frase genérica errada.
 */
export function gerarFrase(achado, { time, lado } = {}) {
  const { dimensao, categoria, porJogo, share, posicaoDominante } = achado;
  if (share > TETO_TRIVIAL) return null;

  const cede = lado === "shots_against";
  const freq = frequencia(porJogo);

  // posição é obrigatória (ver cabeçalho) — exceto quando a própria
  // categoria já é uma posição, aí não há o que apontar de novo.
  let posClausula = "";
  if (!DIMENSAO_JA_TEM_POSICAO.has(dimensao)) {
    const clausula = clausulaPosicao(posicaoDominante, cede);
    if (!clausula) return null; // sem posição clara -> descarta o achado, não sai frase incompleta
    posClausula = clausula;
  }

  const corpo = descrever(dimensao, categoria, { time, cede, freq });
  if (!corpo) return null;

  return corpo + posClausula;
}

/**
 * monta a frase inteira (sem a cláusula de posição, que é anexada depois)
 * por dimensão.
 *
 * REGRA FIXA (Renato, 2026-08, terceira rodada): toda frase tem que deixar
 * explícito O QUE está sendo contado — "sofre do meia adversário" não diz
 * se é finalização, assistência ou gol; "sofre muitas finalizações do meia
 * adversário" não deixa dúvida. Por isso cada `switch` abaixo nomeia
 * "finalizações" (dimensões que contam chutes) ou "assistências" (as duas
 * dimensões que contam quem armou a jogada) explicitamente no corpo da
 * frase — nunca só implícito no verbo. Erro real que essa regra também
 * corrigiu: "sofre gol de cabeça" dizia GOL quando o dado é sobre
 * FINALIZAÇÃO (todo chute de cabeça, não só os que entraram) — imprecisão
 * factual, não só de estilo.
 */
function descrever(dimensao, categoria, { time, cede, freq }) {
  const f = freq ? ` — ${freq}.` : ".";
  const finaliza = cede ? "sofre muitas finalizações" : "cria muitas finalizações";

  switch (dimensao) {
    case "origem": {
      const l = ORIGEM_LABEL[categoria];
      if (!l) return null; // PASSE cai aqui
      return `O ${time} ${finaliza} de ${l}${f}`;
    }
    case "posicao": {
      const l = POSICAO_LABEL[categoria];
      if (!l) return null;
      return cede
        ? `O ${time} ${finaliza} do ${l} adversário${f}`
        : `No ${time}, o ${l} é quem mais finaliza${f}`;
    }
    case "assistentePosicao": {
      const l = POSICAO_LABEL[categoria];
      if (!l) return null;
      return cede
        ? `O ${time} sofre muitas assistências do ${l} adversário${f}`
        : `No ${time}, o ${l} é quem mais dá assistências${f}`;
    }
    case "parteDoCorpo":
      // "com o pé" é a esmagadora maioria — só cabeça informa algo.
      if (categoria !== "cabeca") return null;
      return `O ${time} ${finaliza} de cabeça${f}`;
    case "area": {
      const local = categoria === "dentro-da-area" ? "de dentro da área" : "de fora da área";
      return `O ${time} ${finaliza} ${local}${f}`;
    }
    case "contraAtaque":
      if (categoria !== "contra-ataque") return null;
      return `O ${time} ${finaliza} em contra-ataque${f}`;
    case "ladoDaJogada": {
      const l = LADO_LABEL[categoria];
      if (!l) return null;
      return cede
        ? `O ${time} ${finaliza} vindas do lado ${l} da própria defesa${f}`
        : `O ${time} ${finaliza} em jogadas construídas pelo lado ${l}${f}`;
    }
    case "origem+lado": {
      const [origem, ladoCampo] = categoria.split("|");
      const o = ORIGEM_LABEL[origem];
      const l = LADO_LABEL[ladoCampo];
      if (!o || !l) return null;
      return `O ${time} ${finaliza} de ${o} pelo lado ${l}${f}`;
    }
    case "origem+corpo": {
      const [origem, corpo] = categoria.split("|");
      const o = ORIGEM_LABEL[origem];
      if (!o || corpo !== "cabeca") return null;
      return `O ${time} ${finaliza} de cabeça em jogadas de ${o}${f}`;
    }
    case "lado+corpo": {
      const [ladoCampo, corpo] = categoria.split("|");
      const l = LADO_LABEL[ladoCampo];
      if (!l || corpo !== "cabeca") return null;
      return `O ${time} ${finaliza} de cabeça em jogadas pelo lado ${l}${f}`;
    }
    default:
      return null;
  }
}

/**
 * Aplica gerarFrase numa lista de achados e devolve os melhores.
 *
 * ORDEM: por distintividade (o quanto o time destoa dos outros naquela
 * categoria) — ver `distintividade` em shot-patterns.mjs. Isso decide QUAL
 * fato é mais digno de uma das poucas vagas de texto; não aparece no texto.
 *
 * `maxPorDimensao` evita cinco variações do mesmo fato (ex.: "cruzamento",
 * "cruzamento pela direita", "cruzamento de cabeça" na mesma lista).
 */
export function gerarFrases(achados, { time, lado, max = 5, maxPorDimensao = 1 } = {}) {
  const usadasPorDimensao = new Map();
  const saida = [];
  const ordenados = [...achados].sort((a, b) => {
    const da = a.distintividade?.valor ?? 0;
    const db = b.distintividade?.valor ?? 0;
    if (Math.abs(da - db) > 1e-9) return db - da;
    // Empate de distintividade acontece o tempo todo entre as duas metades
    // de um par (dentro/fora da área têm sempre a MESMA distância da
    // mediana, em direções opostas). Nesse caso vence a ponta de cima —
    // senão a frase sai afirmando "faz muito X" justamente sobre a metade
    // em que o time é dos que menos fazem.
    const altoA = a.distintividade?.direcao === "alto" ? 1 : 0;
    const altoB = b.distintividade?.direcao === "alto" ? 1 : 0;
    if (altoA !== altoB) return altoB - altoA;
    return b.pisoIC - a.pisoIC;
  });
  for (const achado of ordenados) {
    const jaUsadas = usadasPorDimensao.get(achado.dimensao) || 0;
    if (jaUsadas >= maxPorDimensao) continue;
    const frase = gerarFrase(achado, { time, lado });
    if (!frase) continue;
    usadasPorDimensao.set(achado.dimensao, jaUsadas + 1);
    saida.push({ achado, frase });
    if (saida.length >= max) break;
  }
  return saida;
}
