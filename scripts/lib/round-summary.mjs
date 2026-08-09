const POSICAO_PLURAL = {
  "lateral-esquerdo": "laterais-esquerdos",
  "lateral-direito": "laterais-direitos",
  meia: "meias",
  volante: "volantes",
  "ponta-esquerda": "pontas pelo lado esquerdo",
  "ponta-direita": "pontas pelo lado direito",
  "atacante-area": "atacantes de área",
};

function nomePadrao(dimensao, categoria) {
  if (dimensao === "area") return categoria === "dentro-da-area" ? "finalizações de dentro da área" : "finalizações de fora da área";
  if (dimensao === "parteDoCorpo" && categoria === "cabeca") return "finalizações de cabeça";
  if (dimensao === "contraAtaque") return "finalizações em contra-ataques";
  if (dimensao === "ladoDaJogada") return `jogadas construídas pelo lado ${categoria === "esquerda" ? "esquerdo" : "direito"}`;
  const origem = { CRUZAMENTO: "cruzamentos", ESCANTEIO: "escanteios", FALTA: "cobranças de falta", LANCAMENTO: "lançamentos longos", REBATIDA: "sobras de bola" };
  if (dimensao === "origem") return origem[categoria] || null;
  return null;
}

function entradas(mapa) {
  const saida = [];
  for (const [time, itens] of mapa || []) {
    for (const item of itens || []) {
      if (!item?.achado || !item?.frase) continue;
      if (item.achado.distintividade?.direcao !== "alto") continue;
      saida.push({ time, ...item });
    }
  }
  return saida;
}

function melhorGrupo(lista, chaveFn) {
  const grupos = new Map();
  for (const item of lista) {
    const chave = chaveFn(item);
    if (!chave) continue;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }
  return [...grupos.entries()].sort((a, b) => {
    if (a[1].length !== b[1].length) return b[1].length - a[1].length;
    const media = (xs) => xs.reduce((n, x) => n + (x.achado.distintividade?.valor || 0), 0) / xs.length;
    return media(b[1]) - media(a[1]);
  })[0] || null;
}

function destaque(grupo) {
  return [...grupo].sort((a, b) => (b.achado.porJogo || 0) - (a.achado.porJogo || 0))[0];
}

export function gerarResumoRodada({ ofensivosPorTime, defensivosPorTime, rodada = null, janelaAte = null, geradoEm = new Date().toISOString() } = {}) {
  const ofensivos = entradas(ofensivosPorTime);
  const defensivos = entradas(defensivosPorTime);
  const conclusoes = [];

  const posAtaque = melhorGrupo(ofensivos.filter((x) => x.achado.dimensao === "posicao"), (x) => x.achado.categoria);
  if (posAtaque) {
    const [posicao, casos] = posAtaque, top = destaque(casos), plural = POSICAO_PLURAL[posicao];
    if (plural) conclusoes.push({ tipo: "posicao-ofensiva", frase: `${plural[0].toUpperCase() + plural.slice(1)} aparecem entre os destaques ofensivos de ${casos.length} ${casos.length === 1 ? "time" : "times"}. ${top.frase}`, times: casos.map((x) => x.time) });
  }

  const posDefesa = melhorGrupo(defensivos.filter((x) => x.achado.dimensao === "posicao"), (x) => x.achado.categoria);
  if (posDefesa) {
    const [posicao, casos] = posDefesa, top = destaque(casos), plural = POSICAO_PLURAL[posicao];
    if (plural) conclusoes.push({ tipo: "alvo-defensivo", frase: `${plural[0].toUpperCase() + plural.slice(1)} são a posição adversária que mais se repete entre os alertas defensivos (${casos.length} ${casos.length === 1 ? "time" : "times"}). ${top.frase}`, times: casos.map((x) => x.time) });
  }

  for (const [tipo, lista, prefixo] of [["padrao-ofensivo", ofensivos, "Entre os ataques"], ["fragilidade-recorrente", defensivos, "Entre as fragilidades"]]) {
    const grupo = melhorGrupo(lista.filter((x) => nomePadrao(x.achado.dimensao, x.achado.categoria)), (x) => `${x.achado.dimensao}|${x.achado.categoria}`);
    if (!grupo) continue;
    const [chave, casos] = grupo, top = destaque(casos), [dimensao, ...resto] = chave.split("|");
    const nome = nomePadrao(dimensao, resto.join("|"));
    conclusoes.push({ tipo, frase: `${prefixo}, ${nome} são o padrão que mais se repete (${casos.length} ${casos.length === 1 ? "time" : "times"}). ${top.frase}`, times: casos.map((x) => x.time) });
  }

  return { versao: 1, rodada, janelaAte, geradoEm, conclusoes };
}
