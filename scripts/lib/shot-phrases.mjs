/**
 * Traduz um achado de `detectarPadroesInternos` (shot-patterns.mjs) numa
 * frase pronta — sem jargão e sem número de modelo, mesma regra do projeto
 * "Linha": a tela mostra frase, não estatística.
 *
 * A frase descreve o PADRÃO DO TIME ("boa parte do que o Vasco sofre vem de
 * cruzamento pela direita"), não uma comparação. A liga entra só como
 * complemento opcional, quando o time também destoa dela — ver `sufixoLiga`.
 *
 * O único número que aparece é a frequência por jogo, que é concreta e
 * intuitiva ("cerca de 2 por jogo"). A porcentagem do modelo e o intervalo
 * de confiança ficam disponíveis no objeto do achado, mas fora do texto.
 */

const POSICAO_LABEL = {
  "lateral-esquerdo": "lateral pela esquerda",
  "lateral-direito": "lateral pela direita",
  "meia": "meia",
  "volante": "volante",
  "ponta-esquerda": "ponta pela esquerda",
  "ponta-direita": "ponta pela direita",
  "atacante-area": "atacante de área",
};

const ORIGEM_LABEL = {
  PASSE: "passe no chão",
  CRUZAMENTO: "cruzamento",
  ESCANTEIO: "escanteio",
  FALTA: "cobrança de falta",
  LANCAMENTO: "lançamento longo",
  REBATIDA: "sobra de bola",
};

const CORPO_LABEL = { cabeca: "de cabeça", pe: "com o pé" };
const LADO_LABEL = { esquerda: "pela esquerda", direita: "pela direita", centro: "pelo meio" };

/** "cerca de 2 por jogo" / "quase 1 por jogo" — número concreto, sem decimal quebrado. */
function frequencia(porJogo) {
  if (porJogo == null) return null;
  if (porJogo >= 1.5) return `cerca de ${Math.round(porJogo)} por jogo`;
  if (porJogo >= 0.8) return "cerca de 1 por jogo";
  if (porJogo >= 0.45) return "mais ou menos 1 a cada 2 jogos";
  return "de vez em quando";
}

/**
 * Qualificador de intensidade a partir da posição do time na liga.
 * "alto" = está na ponta de cima; "meio" = parecido com os outros.
 * Nunca sai "baixo" aqui: quando o time é ponta de baixo numa categoria,
 * quem vira frase é a categoria oposta da mesma dimensão, onde ele é ponta
 * de cima (ver gerarFrases) — dizer "faz pouco de X" é mais confuso que
 * dizer "faz muito de Y".
 */
function qualificador(distint) {
  if (!distint || distint.direcao !== "alto") return "com frequência";
  return distint.percentil >= 0.9 ? "muito mais que a maioria dos times" : "mais que a maioria dos times";
}

/**
 * `lado`: "shots_for" (o que o time CRIA) | "shots_against" (o que CEDE).
 * Retorna null quando não há template — mais seguro que frase genérica errada.
 */
/**
 * Acima disso a categoria é "o default do futebol", não padrão do time:
 * dizer que 93% do que o time sofre veio de jogada trabalhada (em vez de
 * contra-ataque) ou que 84% das finalizações são com o pé não informa nada
 * a ninguém. Nesses pares a informação mora sempre no lado minoritário, e
 * se o lado minoritário não alcança o piso, a dimensão não tem o que dizer.
 * Aferido no dado real: as categorias que ficam entre ~40% e ~65% (dentro
 * da área, passe no chão) variam bastante entre times e seguem valendo.
 */
const TETO_TRIVIAL = 0.75;

export function gerarFrase(achado, { time, lado } = {}) {
  const { dimensao, categoria, porJogo, distintividade, share } = achado;
  if (share > TETO_TRIVIAL) return null;

  const cede = lado === "shots_against";
  const freq = frequencia(porJogo);
  const verbo = cede ? "sofre" : "cria";
  const qual = qualificador(distintividade);

  const descricao = descrever(dimensao, categoria);
  if (!descricao) return null;

  const miolo = `O ${time} ${verbo} ${descricao} ${qual}`;
  return freq ? `${miolo} — ${freq}.` : `${miolo}.`;
}

/** devolve o miolo da frase ("chance de cruzamento pela direita"), ou null se a categoria não tiver rótulo. */
function descrever(dimensao, categoria) {
  switch (dimensao) {
    case "origem": {
      const l = ORIGEM_LABEL[categoria];
      return l ? `chance de ${l}` : null;
    }
    case "posicao": {
      const l = POSICAO_LABEL[categoria];
      return l ? `finalização de ${l}` : null;
    }
    case "assistentePosicao": {
      const l = POSICAO_LABEL[categoria];
      return l ? `chance armada por ${l}` : null;
    }
    case "parteDoCorpo":
      // "com o pé" é ~84% em todo time; só vira frase quando o time é ponta
      // de cima nisso, e aí o que interessa dizer é que ele quase não
      // cabeceia. Quem decide qual das duas aparece é o maxPorDimensao.
      return categoria === "cabeca" ? "finalização de cabeça" : "finalização com o pé (quase nada de cabeça)";
    case "ladoDaJogada": {
      const l = LADO_LABEL[categoria];
      return l && categoria !== "centro" ? `jogada construída ${l}` : null;
    }
    case "area":
      // as duas metades são elegíveis — vence a em que o time é mais
      // extremo na liga. Fixar "dentro da área" fazia a frase afirmar o
      // contrário do dado pra quem chuta muito de fora (caso real do Vasco,
      // 18º de 20 em finalizar de dentro).
      return categoria === "dentro-da-area" ? "finalização de dentro da área" : "finalização de fora da área";
    case "contraAtaque":
      return categoria === "contra-ataque" ? "chance em contra-ataque" : "chance em jogada trabalhada";
    case "origem+lado": {
      const [origem, ladoCampo] = categoria.split("|");
      const o = ORIGEM_LABEL[origem];
      const l = LADO_LABEL[ladoCampo];
      return o && l ? `chance de ${o} ${l}` : null;
    }
    case "origem+corpo": {
      const [origem, corpo] = categoria.split("|");
      const o = ORIGEM_LABEL[origem];
      // só cabeça vira frase aqui — "de pé" seria trivialidade
      return o && corpo === "cabeca" ? `chance de ${o} finalizada de cabeça` : null;
    }
    case "lado+corpo": {
      const [ladoCampo, corpo] = categoria.split("|");
      const l = LADO_LABEL[ladoCampo];
      return l && corpo === "cabeca" ? `finalização de cabeça em jogada ${l}` : null;
    }
    default:
      return null;
  }
}

/**
 * Aplica gerarFrase numa lista de achados e devolve os melhores.
 *
 * ORDEM: por distintividade (o quanto o time destoa dos outros naquela
 * categoria), não pelo tamanho da fatia — ver o porquê documentado em
 * `distintividade` (shot-patterns.mjs). Isso NÃO filtra nada: um padrão
 * comum a toda liga continua elegível e aparece quando o time não tem nada
 * mais marcante; só perde a vaga pra algo mais característico quando há.
 * O `pisoIC` entra como desempate, pra preferir o achado mais bem sustentado
 * entre dois igualmente distintivos.
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
