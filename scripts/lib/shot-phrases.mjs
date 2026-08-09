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
  CRUZAMENTO: "cruzamentos",
  ESCANTEIO: "escanteios",
  FALTA: "cobranças de falta",
  LANCAMENTO: "lançamentos longos",
  REBATIDA: "sobras de bola",
  // PASSE fica de fora de propósito — ver cabeçalho do arquivo.
};

const LADO_LABEL = { esquerda: "esquerdo", direita: "direito" };

/** Número concreto por jogo, inclusive para eventos abaixo de 1/jogo. */
function frequencia(porJogo) {
  if (!Number.isFinite(porJogo) || porJogo < 0) return null;
  const arredondado = porJogo >= 1.5 ? Math.round(porJogo) : Math.round(porJogo * 10) / 10;
  return `cerca de ${String(arredondado).replace(".", ",")} finalizações por jogo`;
}

/** clausula final apontando a posição — retorna null (não string vazia) quando não há posição válida, pra `gerarFrase` distinguir "sem posição" de "com posição". */
function clausulaPosicao(posDom, cede) {
  if (!posDom) return null;
  const label = POSICAO_LABEL[posDom.posicao];
  if (!label) return null;
  return cede
    ? ` Atenção: o ${label} adversário é quem mais finaliza nesses lances.`
    : ` O ${label} é quem mais finaliza nesse tipo de jogada.`;
}

/**
 * Acima disso a categoria é "o default do futebol", não característica do
 * time: 93% de jogada trabalhada (em vez de contra-ataque) ou 84% de
 * finalização com o pé não informa nada.
 */
const TETO_TRIVIAL = 0.75;
export function chaveDoAchado(achado) {
  if (!achado) return null;
  return [
    achado.dimensao,
    achado.categoria,
    achado.posicaoDominante?.posicao || "",
  ].join("|");
}

export function nivelConfianca(achado) {
  const jogos = Number(achado?.jogosUsados);
  if (!Number.isFinite(jogos) || jogos < 1) return "indefinido";
  if (jogos < 8) return "tendencia-inicial";
  if (jogos < 15) return "padrao-consistente";
  return "padrao-consolidado";
}

function aplicarConfiancaEditorial(frase, achado) {
  if (nivelConfianca(achado) !== "tendencia-inicial") return frase;
  const jogos = Number(achado.jogosUsados);
  return `Com apenas ${jogos} jogos na amostra, ${frase[0].toLowerCase()}${frase.slice(1)}`;
}


/**
 * `lado`: "shots_for" (o que o time CRIA) | "shots_against" (o que CEDE).
 * Retorna null quando não há template — mais seguro que frase genérica errada.
 */
export function gerarFrase(achado, { time, lado } = {}) {
  if (!achado || typeof time !== "string" || !time.trim()) return null;
  if (lado !== "shots_for" && lado !== "shots_against") return null;
  const { dimensao, categoria, porJogo, share, posicaoDominante } = achado;
  if (!Number.isFinite(share) || share < 0 || share > 1) return null;
  if (share > TETO_TRIVIAL) return null;

  const cede = lado === "shots_against";
  const freq = frequencia(porJogo);
  if (!freq) return null;

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

  return aplicarConfiancaEditorial(corpo + posClausula, achado);
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
  const acao = cede ? "cede" : "registra";
  switch (dimensao) {
    case "origem": {
      const l = ORIGEM_LABEL[categoria];
      if (!l) return null; // PASSE cai aqui
      return `O ${time} ${acao} ${freq} após ${l}.`;
    }
    case "posicao": {
      const l = POSICAO_LABEL[categoria];
      if (!l) return null;
      return cede
        ? `O ${time} cede ${freq} ao ${l} adversário. É uma posição a observar contra essa defesa.`
        : `No ${time}, o ${l} registra ${freq}. É uma posição a observar na escalação.`;
    }
    case "assistentePosicao": {
      const l = POSICAO_LABEL[categoria];
      if (!l) return null;
      return cede
        ? `O ${time} cede ${freq} após passes do ${l} adversário.`
        : `No ${time}, passes do ${l} originam ${freq}.`;
    }
    case "parteDoCorpo":
      // "com o pé" é a esmagadora maioria — só cabeça informa algo.
      if (categoria !== "cabeca") return null;
      return `O ${time} ${acao} ${freq} de cabeça.`;
    case "area": {
      const local = categoria === "dentro-da-area" ? "de dentro da área" : "de fora da área";
      return `O ${time} ${acao} ${freq} ${local}.`;
    }
    case "contraAtaque":
      if (categoria !== "contra-ataque") return null;
      return `O ${time} ${acao} ${freq} em contra-ataques.`;
    case "ladoDaJogada": {
      const l = LADO_LABEL[categoria];
      if (!l) return null;
      return cede
        ? `O ${time} cede ${freq} em ataques pelo lado ${l} de sua defesa.`
        : `O ${time} registra ${freq} em jogadas construídas pelo lado ${l}.`;
    }
    case "origem+lado": {
      const [origem, ladoCampo] = categoria.split("|");
      const o = ORIGEM_LABEL[origem];
      const l = LADO_LABEL[ladoCampo];
      if (!o || !l) return null;
      return `O ${time} ${acao} ${freq} após ${o} pelo lado ${l}.`;
    }
    case "origem+corpo": {
      const [origem, corpo] = categoria.split("|");
      const o = ORIGEM_LABEL[origem];
      if (!o || corpo !== "cabeca") return null;
      return `O ${time} ${acao} ${freq} de cabeça após ${o}.`;
    }
    case "lado+corpo": {
      const [ladoCampo, corpo] = categoria.split("|");
      const l = LADO_LABEL[ladoCampo];
      if (!l || corpo !== "cabeca") return null;
      return `O ${time} ${acao} ${freq} de cabeça em jogadas pelo lado ${l}.`;
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
export function gerarFrases(achados, { time, lado, max = 5, maxPorDimensao = 1, maxPorPosicao = 2, chavesAnteriores = [], margemPersistencia = 0.1 } = {}) {
  const usadasPorDimensao = new Map();
  const usadasPorPosicao = new Map();
  const saida = [];
  const anteriores = new Set(chavesAnteriores || []);

  function chavePosicao(achado) {
    if (achado.dimensao === "assistentePosicao") return `criador:${achado.categoria}`;
    const posicao = achado.dimensao === "posicao"
      ? achado.categoria
      : achado.posicaoDominante?.posicao;
    return posicao ? `finalizador:${posicao}` : null;
  }
  const ordenados = [...achados].sort((a, b) => {
    const scoreA = (a.distintividade?.valor ?? 0) + (anteriores.has(chaveDoAchado(a)) ? margemPersistencia : 0);
    const scoreB = (b.distintividade?.valor ?? 0) + (anteriores.has(chaveDoAchado(b)) ? margemPersistencia : 0);
    if (Math.abs(scoreA - scoreB) > 1e-9) return scoreB - scoreA;

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
    // Estar no extremo inferior torna a AUSENCIA da categoria distintiva.
    // Como os templates descrevem presenca, promove-la inverteria o achado.
    if (achado.distintividade?.direcao === "baixo") continue;
    const jaUsadas = usadasPorDimensao.get(achado.dimensao) || 0;
    if (jaUsadas >= maxPorDimensao) continue;
    const chave = chavePosicao(achado);
    const repeticoes = chave ? (usadasPorPosicao.get(chave) || 0) : 0;
    if (chave && repeticoes >= maxPorPosicao) continue;
    const frase = gerarFrase(achado, { time, lado });
    if (!frase) continue;
    usadasPorDimensao.set(achado.dimensao, jaUsadas + 1);
    if (chave) usadasPorPosicao.set(chave, repeticoes + 1);
    saida.push({ achado, frase, chave: chaveDoAchado(achado), confianca: nivelConfianca(achado) });
    if (saida.length >= max) break;
  }
  return saida;
}
