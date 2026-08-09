const NIVEIS = new Set(["tendencia-inicial", "padrao-consistente", "padrao-consolidado"]);

function itensDoMapa(mapa) {
  return [...(mapa || new Map()).entries()].flatMap(([time, itens]) =>
    (itens || []).map((item) => ({ time, ...item })));
}

function taxaMudanca(atual, anteriores, campo) {
  let mudaram = 0, universo = 0, timesComMemoria = 0;
  for (const [time, itens] of atual || []) {
    const prev = anteriores?.get(time)?.[campo];
    if (!Array.isArray(prev) || !prev.length) continue;
    timesComMemoria++;
    const a = new Set((itens || []).map((item) => item.chave).filter(Boolean));
    const b = new Set(prev.map((item) => item.chave).filter(Boolean));
    const uniao = new Set([...a, ...b]);
    universo += uniao.size;
    mudaram += [...uniao].filter((chave) => a.has(chave) !== b.has(chave)).length;
  }
  return { timesComMemoria, taxa: universo ? mudaram / universo : 0 };
}

export function avaliarQualidade({
  timesEsperados = [],
  ofensivosPorTime = new Map(),
  defensivosPorTime = new Map(),
  anterioresPorTime = new Map(),
  resumoRodada,
  maxTaxaMudanca = 0.65,
} = {}) {
  const erros = [], avisos = [];
  const lados = [
    ["ofensivo", ofensivosPorTime, "evidenciasAtaca"],
    ["defensivo", defensivosPorTime, "evidenciasSofre"],
  ];

  for (const time of timesEsperados) {
    for (const [nome, mapa] of lados) {
      const itens = mapa.get(time);
      if (!Array.isArray(itens) || !itens.length) erros.push(time + ": lado " + nome + " sem frase valida");
    }
  }

  for (const [nome, mapa, campo] of lados) {
    for (const { time, frase, chave, confianca } of itensDoMapa(mapa)) {
      if (typeof frase !== "string" || !frase.includes("finaliza")) erros.push(time + ": frase " + nome + " sem scout explicito");
      if (/assist.ncia/i.test(frase)) erros.push(time + ": frase " + nome + " usa assistencia indevidamente");
      const palavras = frase.toLowerCase().replaceAll(".", " ").replaceAll(",", " ").split(" ").filter(Boolean);
      if (palavras.includes("gol") || palavras.includes("gols")) erros.push(time + ": frase " + nome + " transforma finalizacao em gol");
      if (!chave) erros.push(time + ": frase " + nome + " sem chave de persistencia");
      if (!NIVEIS.has(confianca)) erros.push(time + ": frase " + nome + " sem nivel de confianca");
    }
    const mudanca = taxaMudanca(mapa, anterioresPorTime, campo);
    if (mudanca.timesComMemoria >= Math.ceil(timesEsperados.length / 2) && mudanca.taxa > maxTaxaMudanca) {
      erros.push("mudanca em massa no lado " + nome + ": " + (mudanca.taxa * 100).toFixed(0) + "%");
    }
  }

  const conclusoes = resumoRodada?.conclusoes;
  if (!Array.isArray(conclusoes) || conclusoes.length < 2) erros.push("resumo geral sem diversidade minima");
  for (const conclusao of conclusoes || []) {
    if (!Array.isArray(conclusao.times) || conclusao.times.length < 2) {
      erros.push("conclusao geral " + (conclusao.tipo || "sem-tipo") + " baseada em menos de 2 times");
    }
  }

  const total = itensDoMapa(ofensivosPorTime).length + itensDoMapa(defensivosPorTime).length;
  const media = timesEsperados.length ? total / (timesEsperados.length * 2) : 0;
  if (media < 2.5) avisos.push("media baixa de frases: " + media.toFixed(2) + " por time/lado");

  return { ok: erros.length === 0, erros, avisos, metricas: { totalFrases: total, mediaPorTimeELado: media } };
}

export function exigirQualidade(entrada) {
  const resultado = avaliarQualidade(entrada);
  if (!resultado.ok) throw new Error("quality gate bloqueou a atualizacao: " + resultado.erros.join("; "));
  return resultado;
}
