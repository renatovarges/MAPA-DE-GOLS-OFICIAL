/**
 * Motor de cálculo do Raio X Ofensivo — lógica pura, sem rede/DOM, opera em
 * cima dos dados já gravados por harvest_raio_x.mjs (data/raio-x/{time}.json).
 * Conceito fechado por escrito com o Renato em 2026-08-19 (ver histórico da
 * conversa) — regras replicadas aqui:
 *
 *   - aparição: jogador entra se CONQUISTA relevante OU o rival CEDE
 *     relevante na posição/balde dele (relevante = algum sinal registrado
 *     na janela filtrada — os dados já só guardam sinal real, então ter uma
 *     entrada agregada já satisfaz "relevante").
 *   - desempate (quando 2+ jogadores disputam o mesmo balde): cascata
 *     simples — média de gols/jogo, empate → média de assistências/jogo,
 *     empate → média de finalizações/jogo. Cada critério só entra em jogo
 *     se o jogador tiver PRESENÇA em pelo menos 50% dos jogos da janela
 *     filtrada (arredondado pra cima) — usa `presentes` (jogou de verdade),
 *     não a contagem de partidas com sinal (que subestimaria presença real:
 *     um jogador pode jogar 90min sem registrar nada).
 *
 * Este arquivo é a fonte de verdade validada — a versão que roda no
 * navegador (raiox.js, ainda não escrita) porta esta lógica.
 */

/** ordena por data (string ISO) e corta os últimos N — mesmo critério cronológico já usado em desarmes.js/finalizações. */
export function filtrarPartidas(matchesObj, { mando = null, ultimosN = 5 } = {}) {
  let arr = Object.values(matchesObj || {});
  if (mando === "casa") arr = arr.filter((m) => m.home === true);
  if (mando === "fora") arr = arr.filter((m) => m.home === false);
  arr.sort((a, b) => {
    const dA = a.date || "", dB = b.date || "";
    return dA < dB ? -1 : dA > dB ? 1 : 0;
  });
  return arr.slice(Math.max(0, arr.length - ultimosN));
}

const METRICAS = ["gol", "assistencia", "finalizacoes", "xg", "xa", "grandeChanceCriada"];

/** agrega `for` (conquista) ou `against` (cede) por jogador, dentro da janela já filtrada. */
export function agregarPorJogador(partidasFiltradas, campo) {
  const porJogador = new Map();
  for (const m of partidasFiltradas) {
    for (const ev of m[campo] || []) {
      const key = ev.jogadorId;
      if (!porJogador.has(key)) {
        porJogador.set(key, {
          jogadorId: key, nome: ev.nome, posicao: ev.posicao, balde: ev.balde,
          gol: 0, assistencia: 0, finalizacoes: 0, xg: 0, xa: 0, grandeChanceCriada: 0,
          jogosComSinal: 0,
        });
      }
      const acc = porJogador.get(key);
      for (const met of METRICAS) acc[met] += ev[met] || 0;
      acc.jogosComSinal++;
    }
  }
  return porJogador;
}

/** conta presenças reais (jogou, com sinal ou não) por jogador, dentro da janela já filtrada. */
export function contarPresencas(partidasFiltradas) {
  const porJogador = new Map();
  for (const m of partidasFiltradas) {
    for (const id of m.presentes || []) {
      porJogador.set(id, (porJogador.get(id) || 0) + 1);
    }
  }
  return porJogador;
}

/** o que um time CEDE, somado por balde de posição — usa as entradas `against` já gravadas. */
export function cedePorBalde(partidasFiltradas) {
  const porBalde = new Map();
  for (const m of partidasFiltradas) {
    for (const ev of m.against || []) {
      if (!porBalde.has(ev.balde)) {
        porBalde.set(ev.balde, { gol: 0, assistencia: 0, finalizacoes: 0, xg: 0, xa: 0, grandeChanceCriada: 0 });
      }
      const acc = porBalde.get(ev.balde);
      for (const met of METRICAS) acc[met] += ev[met] || 0;
    }
  }
  return porBalde;
}

/**
 * slot dos prováveis (ex.: "ZAG-L", "LAT-R", "MEI", "ATA-C") -> nosso balde
 * (ATA/MEI/VOL/ZAG/LAT-ESQ/LAT-DIR). ZAG não distingue lado no nosso
 * sistema (regra do Renato: "mesmo que os três melhores sejam laterais
 * direitos... é assim que a arte ficará" — só LAT distingue). GOL não tem
 * balde (fora do escopo ofensivo da aba).
 */
export function baldeDoSlotProvaveis(slot) {
  if (!slot) return null;
  const s = String(slot).toUpperCase();
  if (s.startsWith("GOL")) return null;
  if (s.startsWith("ZAG")) return "ZAG";
  if (s.startsWith("LAT")) return s.endsWith("R") || s.includes("DIR") ? "LAT-DIR" : "LAT-ESQ";
  if (s.startsWith("VOL")) return "VOL";
  if (s.startsWith("MEI")) return "MEI";
  if (s.startsWith("ATA")) return "ATA";
  return null;
}

/**
 * Titular provável de um balde, pra resolver o nome na "brecha sem dono"
 * (rival cede forte, ninguém tem conquista própria ali). `teamProvaveis` =
 * `provaveis.teams[slug]` (ver data/provaveis.json, harvest_pdc.mjs).
 * Prefere "provavel" sobre "duvida"; entre vários no mesmo balde (times com
 * mais de um jogador no setor), pega o primeiro (ordem que a fonte desenhou
 * o campo, geralmente já é a leitura mais provável).
 */
export function titularDoBalde(teamProvaveis, balde) {
  if (!teamProvaveis?.players?.length) return null;
  const candidatos = teamProvaveis.players.filter((p) => !p.isCoach && baldeDoSlotProvaveis(p.slot) === balde);
  if (!candidatos.length) return null;
  const provaveis = candidatos.filter((p) => p.sit === "provavel");
  return provaveis[0] || candidatos[0];
}

/** true se a soma das métricas registradas for > 0 (qualquer sinal real conta). */
function temSinal(obj) {
  return METRICAS.some((m) => (obj[m] || 0) > 0);
}

const CRITERIOS_DESEMPATE = ["gol", "assistencia", "finalizacoes"];

/**
 * Cascata de desempate: gol/jogo -> assistência/jogo -> finalização/jogo,
 * cada critério só válido se `jogosPresente >= metade dos jogos da janela`
 * (arredondado pra cima). Retorna lista ordenada (melhor primeiro) — quem
 * não bate o corte de presença em NENHUM critério some pro final, mantendo
 * ordem de entrada (ainda aparece no card, só não disputa o destaque).
 */
export function ordenarPorDesempate(candidatos, presencas, totalJogosJanela) {
  const minimoPresenca = Math.ceil(totalJogosJanela / 2);
  const withMeta = candidatos.map((c) => {
    const jogosPresente = presencas.get(c.jogadorId) || 0;
    const elegivel = jogosPresente >= minimoPresenca && jogosPresente > 0;
    return { ...c, jogosPresente, elegivel };
  });
  const chave = (c, criterio) => (c.elegivel ? c[criterio] / c.jogosPresente : -Infinity);
  withMeta.sort((a, b) => {
    for (const criterio of CRITERIOS_DESEMPATE) {
      const diff = chave(b, criterio) - chave(a, criterio);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return withMeta;
}

/**
 * Monta o Raio X de UM time (times A) contra o adversário (time B) num
 * balde de posição — cruza conquista de A com o que B cede, aplica a regra
 * de aparição (OR) e devolve os candidatos já ordenados pelo desempate.
 *
 * `matchesA`/`matchesB` = objeto `matches` cru de data/raio-x/{time}.json.
 * `mandoA` = "casa"|"fora"|null — mando que o time A joga no confronto (o
 * mando de B é automaticamente o espelho: se A joga em casa, filtramos o
 * histórico de B jogando fora, e vice-versa).
 * `teamAProvaveis` = `provaveis.teams[slugDeA]` (opcional) — usado só pra
 * resolver o NOME do titular na "brecha sem dono"; sem isso, a brecha ainda
 * é sinalizada (brechaSemDono:true), só sem `titular` preenchido.
 */
export function montarRaioXConfronto(matchesA, matchesB, { mandoA = null, ultimosN = 5, teamAProvaveis = null } = {}) {
  const mandoB = mandoA === "casa" ? "fora" : mandoA === "fora" ? "casa" : null;

  const partidasA = filtrarPartidas(matchesA, { mando: mandoA, ultimosN });
  const partidasB = filtrarPartidas(matchesB, { mando: mandoB, ultimosN });

  const conquistaA = agregarPorJogador(partidasA, "for");
  const presencasA = contarPresencas(partidasA);
  const cedeB = cedePorBalde(partidasB);

  // agrupa candidatos de A por balde (só quem tem sinal de conquista)
  const porBalde = new Map();
  for (const c of conquistaA.values()) {
    if (!c.balde || !temSinal(c)) continue;
    if (!porBalde.has(c.balde)) porBalde.set(c.balde, []);
    porBalde.get(c.balde).push(c);
  }

  const resultado = {};
  const baldesComCede = new Set([...cedeB.keys()].filter((b) => temSinal(cedeB.get(b))));
  const todosOsBaldes = new Set([...porBalde.keys(), ...baldesComCede]);

  for (const balde of todosOsBaldes) {
    const candidatos = porBalde.get(balde) || [];
    const cedeRelevante = baldesComCede.has(balde);
    // regra de aparição: só entra o balde se tem candidato com conquista OU o rival cede ali.
    if (!candidatos.length && !cedeRelevante) continue;
    const brecha = cedeRelevante && candidatos.length === 0;
    resultado[balde] = {
      cedeRival: cedeB.get(balde) || null,
      candidatos: ordenarPorDesempate(candidatos, presencasA, partidasA.length),
      brechaSemDono: brecha,
      titular: brecha && teamAProvaveis ? titularDoBalde(teamAProvaveis, balde) : null,
    };
  }
  return { partidasUsadasA: partidasA.length, partidasUsadasB: partidasB.length, baldes: resultado };
}
