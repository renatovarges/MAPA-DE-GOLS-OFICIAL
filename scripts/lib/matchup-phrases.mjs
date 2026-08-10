import { TIPOS_INSIGHT } from "./matchup-insights.mjs";

const NOMES_POSICAO = {
  atacante: "atacantes", centroavante: "centroavantes", meia: "meias",
  volante: "volantes", zagueiro: "zagueiros", lateral: "laterais",
  "lateral-direito": "laterais-direitos", "lateral-esquerdo": "laterais-esquerdos",
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
  const prefixo = scout === "gols" ? "gols" : "finalizações";
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

function orientacao(chave) {
  const [dimensao, valor] = String(chave).split(":");
  if (dimensao === "posicao") return "priorize os jogadores dessa posição que tenham participação ofensiva recorrente";
  if (dimensao === "cruzamento" || chave === "origem:cruzamento" || chave === "corpo:cabeca") return "observe os jogadores mais envolvidos nas bolas aéreas e na conclusão de cruzamentos";
  if (dimensao === "lado") return "observe quem participa com mais frequência das jogadas construídas por esse setor";
  if (chave === "area:fora") return "observe os jogadores com liberdade e volume para chutar de média distância";
  if (chave === "area:dentro") return "observe os jogadores que mais recebem e finalizam dentro da área";
  return "observe os jogadores mais presentes nesse caminho de ataque";
}

function frequencia(perfil, scout) {
  return numero(perfil.j10.taxa, scout === "gols" ? 2 : 1) + " por jogo, aparecendo em " + perfil.j10.jogosComEvento + " dos últimos " + perfil.j10.jogos + " jogos";
}

export function gerarFraseInsight(item) {
  const atacante = nomeTime(item.atacante);
  const defensor = nomeTime(item.defensor);
  const evento = substantivoEvento(item.chave, item.scout);
  const casas = item.scout === "gols" ? 2 : 1;
  const mediaLiga = numero(item.baseline, casas);
  const ataque = frequencia(item.perfilAtaque, item.scout);
  const defesa = frequencia(item.perfilDefesa, item.scout);
  const pratica = "Na prática, " + orientacao(item.chave) + ".";

  if (item.tipo === TIPOS_INSIGHT.CONVERGENCIA) {
    return {
      categoria: "Encaixe favorável",
      titulo: atacante + " pode explorar " + evento + " contra o " + defensor,
      texto: "O " + atacante + " produz " + evento + " a uma média de " + ataque + ". O " + defensor + " cede esse mesmo caminho a uma média de " + defesa + ", enquanto a referência do campeonato é " + mediaLiga + " por jogo. " + pratica,
    };
  }
  if (item.tipo === TIPOS_INSIGHT.FORCA_PROPRIA) {
    return {
      categoria: "Força ofensiva própria",
      titulo: atacante + " mantém um caminho ofensivo recorrente",
      texto: "O " + atacante + " registra " + evento + " a uma média de " + ataque + ", acima da referência de " + mediaLiga + " do campeonato. O " + defensor + " não apresenta uma fragilidade igualmente forte nesse recorte, mas a recorrência do próprio " + atacante + " mantém o padrão relevante. " + pratica,
    };
  }
  return {
    categoria: "Fragilidade defensiva excepcional",
    titulo: defensor + " oferece um caminho que merece atenção",
    texto: "O " + defensor + " cede " + evento + " a uma média de " + defesa + ", acima da referência de " + mediaLiga + " do campeonato. Esse não é um padrão ofensivo dominante do " + atacante + ", mas a vulnerabilidade defensiva é forte e recorrente o suficiente para entrar no radar. " + pratica,
  };
}

export { substantivoEvento };
