/**
 * Traduz um achado de `detectarPadroes` (shot-patterns.mjs) numa frase
 * pronta, sem número cru e sem jargão — mesma regra do projeto "Linha":
 * a UI mostra frase, não estatística. Ver `gerarFrase`.
 */

const POSICAO_LABEL = {
  "lateral-esquerdo": "laterais pela esquerda",
  "lateral-direito": "laterais pela direita",
  "meia": "meias",
  "volante": "volantes",
  "ponta-esquerda": "pontas pela esquerda",
  "ponta-direita": "pontas pela direita",
  "atacante-area": "atacantes de área",
};

const ORIGEM_LABEL = {
  PASSE: "passe no chão",
  CRUZAMENTO: "cruzamento",
  ESCANTEIO: "escanteio",
  FALTA: "bola parada (falta)",
  LANCAMENTO: "lançamento longo",
  REBATIDA: "sobra/rebate de bola",
};

function pct(taxa) {
  return `${Math.round(taxa * 100)}%`;
}

/**
 * `lado`: "shots_for" (o que o time CRIA) ou "shots_against" (o que CEDE).
 * Retorna null quando não há um template pra essa combinação dimensão×
 * categoria×direção (mais seguro que uma frase genérica errada).
 */
export function gerarFrase(achado, { time, lado }) {
  const { dimensao, categoria, direcao, taxaTime, taxaLiga } = achado;
  const nome = time;
  const comparativo = direcao === "acima" ? "bem mais" : "bem menos";

  if (dimensao === "origem") {
    const label = ORIGEM_LABEL[categoria];
    if (!label) return null;
    if (lado === "shots_for") {
      return direcao === "acima"
        ? `O ${nome} cria ${comparativo} chance de ${label} do que a média da liga (${pct(taxaTime)} das finalizações, contra ${pct(taxaLiga)} da liga).`
        : `O ${nome} quase não cria chance de ${label} — bem menos que a média da liga.`;
    }
    return direcao === "acima"
      ? `O ${nome} sofre ${comparativo} chance de ${label} do que a média da liga (${pct(taxaTime)} das finalizações que toma, contra ${pct(taxaLiga)} da liga) — um ponto pra explorar contra ele.`
      : `O ${nome} raramente sofre chance de ${label} — bem menos que a média da liga.`;
  }

  if (dimensao === "posicao") {
    const label = POSICAO_LABEL[categoria];
    if (!label) return null;
    if (lado === "shots_for") {
      return direcao === "acima"
        ? `Boa parte das finalizações do ${nome} sai com ${label} — bem mais que a média da liga.`
        : `${label[0].toUpperCase()}${label.slice(1)} quase não finalizam pelo ${nome} — bem menos que a média da liga.`;
    }
    return direcao === "acima"
      ? `O ${nome} costuma sofrer finalização de ${label} adversários, mais que a média da liga.`
      : `O ${nome} raramente sofre finalização de ${label} adversários.`;
  }

  if (dimensao === "assistentePosicao") {
    const label = POSICAO_LABEL[categoria];
    if (!label) return null;
    if (lado === "shots_for") {
      return direcao === "acima"
        ? `Boa parte das assistências do ${nome} vem de ${label} — mais que a média da liga.`
        : null;
    }
    return direcao === "acima"
      ? `O ${nome} costuma sofrer chance armada por ${label} adversários — mais que a média da liga.`
      : null;
  }

  if (dimensao === "area") {
    if (categoria === "dentro-da-area") {
      if (lado === "shots_for") {
        return direcao === "acima"
          ? `O ${nome} concentra as chances que cria dentro da área, mais que a média da liga.`
          : `O ${nome} arrisca proporcionalmente mais chute de fora da área que a média da liga.`;
      }
      return direcao === "acima"
        ? `O ${nome} costuma sofrer chance de dentro da área, mais que a média da liga.`
        : `O ${nome} sofre proporcionalmente mais chute de fora da área — sinal de que raramente é furado por dentro.`;
    }
    return null; // "fora-da-area" é o espelho de "dentro-da-area" — evita frase duplicada
  }

  if (dimensao === "contraAtaque") {
    if (categoria !== "contra-ataque") return null; // espelho de "jogada-organizada" — evita duplicar
    if (lado === "shots_for") {
      return direcao === "acima"
        ? `O ${nome} usa o contra-ataque como arma — cria chance assim mais que a média da liga.`
        : `O ${nome} cria pouca chance de contra-ataque — joga mais no posicional que a média da liga.`;
    }
    return direcao === "acima"
      ? `O ${nome} é vulnerável ao contra-ataque — sofre chance assim mais que a média da liga.`
      : `O ${nome} raramente é pego de contra-ataque.`;
  }

  return null;
}

/** aplica gerarFrase numa lista de achados, descartando os que não têm template e ordenando pelo mais forte (|z|). */
export function gerarFrases(achados, opts) {
  return achados
    .map((a) => ({ achado: a, frase: gerarFrase(a, opts) }))
    .filter((r) => r.frase != null)
    .sort((a, b) => Math.abs(b.achado.z) - Math.abs(a.achado.z));
}
