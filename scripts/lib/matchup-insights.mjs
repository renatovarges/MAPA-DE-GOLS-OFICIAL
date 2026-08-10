import { ladoDoCampo } from "./shot-patterns.mjs";

export const TIPOS_INSIGHT = {
  CONVERGENCIA: "convergencia",
  FORCA_PROPRIA: "forca-ofensiva-propria",
  FRAGILIDADE_PROPRIA: "fragilidade-defensiva-propria",
};

export function eventosDoChute(chute) {
  const eventos = [];
  if (chute?.posicao) eventos.push("posicao:" + chute.posicao);
  eventos.push("area:" + (chute?.dentroDaArea ? "dentro" : "fora"));
  if (chute?.perna === "CABECA") eventos.push("corpo:cabeca");
  if (chute?.contraAtaque) eventos.push("transicao:contra-ataque");
  const origens = new Set(["CRUZAMENTO", "ESCANTEIO", "FALTA", "LANCAMENTO", "REBATIDA"]);
  if (origens.has(chute?.origem)) eventos.push("origem:" + chute.origem.toLowerCase());
  const lado = ladoDoCampo(chute?.origemZona);
  if (lado && lado !== "centro") {
    eventos.push("lado:" + lado);
    if (chute?.origem === "CRUZAMENTO") eventos.push("cruzamento:" + lado);
  }
  return eventos;
}

export function contagensPartida(partida, lado, scout = "finalizacoes") {
  const contagens = new Map();
  for (const chute of partida?.[lado] || []) {
    if (scout === "gols" && !chute.gol) continue;
    for (const evento of eventosDoChute(chute)) contagens.set(evento, (contagens.get(evento) || 0) + 1);
  }
  return contagens;
}

function taxaJanela(historico, lado, scout, chave, tamanho) {
  const jogos = historico.slice(-tamanho);
  if (!jogos.length) return { taxa: 0, total: 0, jogosComEvento: 0, jogos: 0 };
  let total = 0, jogosComEvento = 0;
  for (const jogo of jogos) {
    const valor = contagensPartida(jogo, lado, scout).get(chave) || 0;
    total += valor;
    if (valor > 0) jogosComEvento++;
  }
  return { taxa: total / jogos.length, total, jogosComEvento, jogos: jogos.length };
}

export function perfilEvento(historico, lado, scout, chave) {
  return {
    j3: taxaJanela(historico, lado, scout, chave, 3),
    j5: taxaJanela(historico, lado, scout, chave, 5),
    j10: taxaJanela(historico, lado, scout, chave, 10),
  };
}

export function avaliarForca(perfil, baseline, scout) {
  if (!(baseline > 0) || perfil.j5.jogos < 5) return null;
  const minimo = scout === "gols" ? 2 : 5;
  const ratio = perfil.j10.taxa / baseline;
  const confirmacoes = [perfil.j3, perfil.j5, perfil.j10].filter((janela) => janela.taxa > baseline).length;
  const recorrencia = scout === "gols" ? perfil.j10.jogosComEvento >= 2 : perfil.j10.jogosComEvento >= 3;
  const ratioMinimo = scout === "gols" ? 1.45 : 1.25;
  if (perfil.j10.total < minimo || ratio < ratioMinimo || confirmacoes < 2 || !recorrencia) return null;
  const aceleracao = perfil.j3.taxa > perfil.j10.taxa * 1.15 ? 0.4 : 0;
  const score = Math.log2(ratio) * 2 + confirmacoes * 0.35 + Math.min(2, perfil.j10.total / minimo) * 0.25 + aceleracao;
  return { score, ratio, confirmacoes, aceleracao: aceleracao > 0 };
}

export function gerarCandidatosConfronto({
  atacante, defensor, historicoAtacante, historicoDefensor, baselines,
  scout = "finalizacoes", chaves = [],
} = {}) {
  const candidatos = [];
  for (const chave of chaves) {
    const baseline = baselines.get(scout + "|" + chave) || 0;
    const perfilAtaque = perfilEvento(historicoAtacante, "shots_for", scout, chave);
    const perfilDefesa = perfilEvento(historicoDefensor, "shots_against", scout, chave);
    const forca = avaliarForca(perfilAtaque, baseline, scout);
    const fragilidade = avaliarForca(perfilDefesa, baseline, scout);
    const base = { atacante, defensor, scout, chave, baseline, perfilAtaque, perfilDefesa };
    if (forca && fragilidade) {
      candidatos.push({ ...base, tipo: TIPOS_INSIGHT.CONVERGENCIA, score: forca.score + fragilidade.score + 1, forca, fragilidade });
    } else {
      if (forca) candidatos.push({ ...base, tipo: TIPOS_INSIGHT.FORCA_PROPRIA, score: forca.score, forca });
      if (fragilidade) candidatos.push({ ...base, tipo: TIPOS_INSIGHT.FRAGILIDADE_PROPRIA, score: fragilidade.score, fragilidade });
    }
  }
  return candidatos;
}

export function selecionarDestaques(candidatos, { max = 8 } = {}) {
  const limites = new Map([
    [TIPOS_INSIGHT.CONVERGENCIA, 4],
    [TIPOS_INSIGHT.FORCA_PROPRIA, 2],
    [TIPOS_INSIGHT.FRAGILIDADE_PROPRIA, 2],
  ]);
  const usadosTipo = new Map(), usadosScout = new Map(), usadosTime = new Map(), assinaturas = new Set(), saida = [];
  for (const item of [...candidatos].sort((a, b) => b.score - a.score)) {
    if (saida.length >= max) break;
    if ((usadosTipo.get(item.tipo) || 0) >= (limites.get(item.tipo) || max)) continue;
    if (item.tipo === TIPOS_INSIGHT.FRAGILIDADE_PROPRIA && item.score < 5) continue;
    if ((usadosScout.get(item.scout) || 0) >= Math.ceil(max / 2)) continue;
    if ((usadosTime.get(item.atacante) || 0) >= 2) continue;
    const assinatura = item.atacante + "|" + item.defensor + "|" + item.scout + "|" + item.chave;
    if (assinaturas.has(assinatura)) continue;
    assinaturas.add(assinatura);
    usadosTipo.set(item.tipo, (usadosTipo.get(item.tipo) || 0) + 1);
    usadosScout.set(item.scout, (usadosScout.get(item.scout) || 0) + 1);
    usadosTime.set(item.atacante, (usadosTime.get(item.atacante) || 0) + 1);
    saida.push(item);
  }
  return saida;
}

export function rotuloEvento(chave) {
  const [dimensao, valor] = String(chave).split(":");
  const rotulos = {
    "corpo:cabeca": "finalizações de cabeça",
    "transicao:contra-ataque": "finalizações em contra-ataques",
    "area:dentro": "finalizações de dentro da área",
    "area:fora": "finalizações de fora da área",
    "origem:cruzamento": "finalizações após cruzamentos",
    "origem:escanteio": "finalizações após escanteios",
    "origem:falta": "finalizações após faltas",
    "origem:lancamento": "finalizações após lançamentos",
    "origem:rebatida": "finalizações após sobras",
    "lado:esquerda": "jogadas iniciadas pela esquerda",
    "lado:direita": "jogadas iniciadas pela direita",
    "cruzamento:esquerda": "cruzamentos vindos da esquerda",
    "cruzamento:direita": "cruzamentos vindos da direita",
  };
  if (rotulos[chave]) return rotulos[chave];
  if (dimensao === "posicao") return "finalizações de " + valor.replaceAll("-", " ");
  return chave;
}
