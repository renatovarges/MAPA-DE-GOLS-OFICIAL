import { TIPOS_INSIGHT } from "./matchup-insights.mjs";

const NOMES_POSICAO = {
  atacante: "atacantes", centroavante: "centroavantes", meia: "meias",
  volante: "volantes", zagueiro: "zagueiros", lateral: "laterais",
  "lateral-direito": "laterais-direitos", "lateral-esquerdo": "laterais-esquerdos",
  "ponta-direita": "ponta direita", "ponta-esquerda": "ponta esquerda",
  "atacante-area": "atacantes de área",
};

const POSICAO_DO_TIME = {
  meia: "seus meias", volante: "seus volantes", zagueiro: "seus zagueiros",
  lateral: "seus laterais", "lateral-direito": "seus laterais-direitos",
  "lateral-esquerdo": "seus laterais-esquerdos", "ponta-direita": "seu ponta direita",
  "ponta-esquerda": "seu ponta esquerda", atacante: "seus atacantes",
  centroavante: "seu centroavante", "atacante-area": "seus atacantes de área",
};

const POSICAO_ADVERSARIA = {
  meia: "meias adversários", volante: "volantes adversários", zagueiro: "zagueiros adversários",
  lateral: "laterais adversários", "lateral-direito": "laterais-direitos adversários",
  "lateral-esquerdo": "laterais-esquerdos adversários", "ponta-direita": "pontas-direitas adversários",
  "ponta-esquerda": "pontas-esquerdas adversários", atacante: "atacantes adversários",
  centroavante: "centroavantes adversários", "atacante-area": "atacantes de área adversários",
};

function numero(valor, casas = 1) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function nomeTime(valor) {
  const especiais = {
    "athletico-pr": "Athletico-PR", "atletico-mg": "Atlético-MG", gremio: "Grêmio",
    "sao-paulo": "São Paulo", vitoria: "Vitória", "red-bull-bragantino": "Red Bull Bragantino",
  };
  if (especiais[valor]) return especiais[valor];
  return String(valor).split("-").map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1)).join(" ");
}

function substantivoEvento(chave, scout) {
  const [dimensao, valor] = String(chave).split(":");
  const prefixo = scout === "gols" ? "gols" : scout === "participacoes" ? "participações em gols" : "finalizações";
  const rotulos = {
    "corpo:cabeca": prefixo + " de cabeça",
    "transicao:contra-ataque": prefixo + " em contra-ataques",
    "area:dentro": prefixo + " de dentro da área",
    "area:fora": prefixo + " de fora da área",
    "origem:cruzamento": prefixo + " após cruzamentos",
    "origem:escanteio": prefixo + " após escanteios",
    "origem:falta": prefixo + " após cobranças de falta",
    "origem:lancamento": prefixo + " após lançamentos",
    "origem:rebatida": prefixo + " após sobras",
    "lado:esquerda": prefixo + " em jogadas iniciadas pela esquerda",
    "lado:direita": prefixo + " em jogadas iniciadas pela direita",
    "cruzamento:esquerda": prefixo + " em cruzamentos vindos da esquerda",
    "cruzamento:direita": prefixo + " em cruzamentos vindos da direita",
  };
  if (rotulos[chave]) return rotulos[chave];
  if (dimensao === "posicao") return prefixo + " de " + (NOMES_POSICAO[valor] || valor.replaceAll("-", " "));
  return prefixo + " nesse tipo de jogada";
}

function eventosPorPerspectiva(chave, scout) {
  const [dimensao, valor] = String(chave).split(":");
  const evento = substantivoEvento(chave, scout);
  if (dimensao !== "posicao") return { ataque: evento, defesa: evento };
  const prefixo = scout === "gols" ? "gols" : scout === "participacoes" ? "participações em gols" : "finalizações";
  const propria = POSICAO_DO_TIME[valor] || "seus " + (NOMES_POSICAO[valor] || valor.replaceAll("-", " "));
  const neutra = NOMES_POSICAO[valor] || valor.replaceAll("-", " ");
  const adversaria = POSICAO_ADVERSARIA[valor] || neutra + " adversários";
  return {
    ataque: prefixo + " com " + propria,
    defesa: scout === "gols" ? prefixo + " de " + neutra : prefixo + " para " + adversaria,
  };
}

function orientacao(chave) {
  const [dimensao, valor] = String(chave).split(":");
  if (dimensao === "posicao") return "priorize os jogadores dessa posição que tenham participação ofensiva recorrente";
  if (dimensao === "cruzamento" || chave === "origem:cruzamento" || chave === "corpo:cabeca") return "observe os jogadores mais envolvidos nas bolas aéreas e na conclusão de cruzamentos";
  if (dimensao === "lado") return "observe quem participa com mais frequência das jogadas construídas por esse setor";
  if (chave === "area:fora") return "observe os jogadores com liberdade e volume para chutar de média distância";
  if (chave === "area:dentro") return "observe os jogadores que mais recebem e finalizam dentro da área";
  return "observe os jogadores mais presentes nessa característica ofensiva";
}

function frequencia(perfil, scout) {
  return numero(perfil.j10.taxa, scout === "finalizacoes" ? 1 : 2) + " por jogo, aparecendo em " + perfil.j10.jogosComEvento + " dos últimos " + perfil.j10.jogos + " jogos";
}

function chamadaDoInsight(item, evento) {
  const texto = evento.toUpperCase();
  if (item.tipo === TIPOS_INSIGHT.FRAGILIDADE_PROPRIA) {
    if (item.scout === "gols") return "SOFRE " + texto;
    if (item.scout === "participacoes") return "CEDE " + texto;
    return "CEDE " + texto;
  }
  if (item.scout === "gols") return "MARCA " + texto;
  return texto;
}

function verboAtaque(scout) {
  if (scout === "gols") return "marca";
  if (scout === "participacoes") return "soma";
  return "produz";
}

function verboDefesa(scout) {
  if (scout === "gols") return "sofre";
  return "cede";
}

export function gerarFraseInsight(item) {
  const atacante = nomeTime(item.atacante);
  const defensor = nomeTime(item.defensor);
  const eventos = eventosPorPerspectiva(item.chave, item.scout);
  const evento = eventos.ataque;
  const casas = item.scout === "finalizacoes" ? 1 : 2;
  const mediaLiga = numero(item.baseline, casas);
  const ataque = frequencia(item.perfilAtaque, item.scout);
  const defesa = frequencia(item.perfilDefesa, item.scout);
  const pratica = "Na prática, " + orientacao(item.chave) + ".";
  const acaoAtaque = verboAtaque(item.scout);
  const acaoDefesa = verboDefesa(item.scout);
  const eventoDefesa = eventos.defesa;

  if (item.tipo === TIPOS_INSIGHT.CONVERGENCIA) {
    return {
      categoria: "Encaixe favorável",
      timeDestaque: item.atacante,
      chamada: chamadaDoInsight(item, evento),
      titulo: atacante + " tem um encaixe favorável contra o " + defensor,
      texto: "O " + atacante + " " + acaoAtaque + " " + evento + " a uma média de " + ataque + ". O " + defensor + " " + acaoDefesa + " " + eventoDefesa + " a uma média de " + defesa + ", enquanto a referência do campeonato é " + mediaLiga + " por jogo. " + pratica,
    };
  }
  if (item.tipo === TIPOS_INSIGHT.FORCA_PROPRIA) {
    return {
      categoria: "Força ofensiva própria",
      timeDestaque: item.atacante,
      chamada: chamadaDoInsight(item, evento),
      titulo: atacante + " mantém um padrão ofensivo recorrente",
      texto: "O " + atacante + " " + acaoAtaque + " " + evento + " a uma média de " + ataque + ", acima da referência de " + mediaLiga + " do campeonato. O " + defensor + " não apresenta uma fragilidade igualmente forte nesse recorte, mas a repetição desse padrão pelo " + atacante + " mantém o alerta. " + pratica,
    };
  }
  return {
    categoria: "Fragilidade defensiva excepcional",
    timeDestaque: item.defensor,
    chamada: chamadaDoInsight(item, eventoDefesa),
    titulo: defensor + " apresenta uma vulnerabilidade que merece atenção",
    texto: "O " + defensor + " " + acaoDefesa + " " + eventoDefesa + " a uma média de " + defesa + ", acima da referência de " + mediaLiga + " do campeonato. O " + atacante + " não tem essa característica entre suas marcas ofensivas mais fortes, mas a vulnerabilidade do adversário é recorrente e merece atenção. " + pratica,
  };
}

export { substantivoEvento };
