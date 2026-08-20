/*
 * Aba "Raio X Ofensivo" — arquivo isolado (IIFE), mesmo padrão do
 * desarmes.js (identificadores prefixados "rx"/"Rx" pra nunca colidir).
 *
 * REESCRITO em 2026-08-19 depois do Renato rejeitar a primeira versão
 * (campinho lotado de gente irrelevante, cedido escondido num rodapé). A
 * mudança de fundo: quem aparece no campinho não é mais "quem tem algum
 * sinal de conquista" — é "quem está nos PROVÁVEIS do Cartola" pra aquela
 * posição, no máximo 2 por balde, ranqueados pela mesma cascata de
 * desempate (gol > assistência > finalização) só pra decidir a ORDEM entre
 * os prováveis, nunca pra decidir SE alguém aparece. E o cedido virou um
 * bloco do mesmo peso visual do card do jogador, com um "topo" grande
 * (gols+assistências cedidos) e uma granulação embaixo listando os
 * jogadores REAIS que fizeram esses gols/assistências, com escudo do time
 * deles e todos os scouts daquele jogo específico.
 *
 * Fontes: data/raio-x/{time}.json (produção/cessão por jogador/partida, já
 * com balde de posição — agora 8, não 6: PONTA-ESQ/CENTROAVANTE/PONTA-DIR/
 * MEI/VOL/LAT-ESQ/ZAG/LAT-DIR), data/provaveis.json (escalação provável,
 * provaveisdocartola.com.br), jogadores/{atletaId}.webp (banco de fotos).
 */
(function () {
  "use strict";

  const TEAMS = [
    ['atletico-mg', 'Atlético-MG'], ['athletico-pr', 'Athletico-PR'], ['bahia', 'Bahia'],
    ['botafogo', 'Botafogo'], ['chapecoense', 'Chapecoense'], ['corinthians', 'Corinthians'],
    ['coritiba', 'Coritiba'], ['cruzeiro', 'Cruzeiro'], ['flamengo', 'Flamengo'],
    ['fluminense', 'Fluminense'], ['gremio', 'Grêmio'], ['internacional', 'Internacional'],
    ['mirassol', 'Mirassol'], ['palmeiras', 'Palmeiras'], ['red-bull-bragantino', 'Red Bull Bragantino'],
    ['remo', 'Remo'], ['santos', 'Santos'], ['sao-paulo', 'São Paulo'],
    ['vasco', 'Vasco'], ['vitoria', 'Vitória'],
  ];
  function rxTeamName(key) {
    const found = TEAMS.find(([k]) => k === key);
    return found ? found[1] : key;
  }
  // mesma pasta/arquivos que o script.js do Mapa de Gols já usa (CREST_MAP) —
  // duplicado aqui de propósito (arquivo isolado, sem depender do escopo
  // interno de outro script).
  const RX_CREST_MAP = {
    'atletico-mg': 'atlético mg.png', 'athletico-pr': 'athletico-pr.png', bahia: 'bahia.png',
    botafogo: 'botafogo.png', chapecoense: 'chapecoense.png', corinthians: 'corinthians.png',
    coritiba: 'coritiba.png', cruzeiro: 'cruzeiro.png', flamengo: 'flamengo.png',
    fluminense: 'fluminense.png', gremio: 'gremio.png', internacional: 'internacional.png',
    mirassol: 'mirassol.png', palmeiras: 'palmeiras.png', 'red-bull-bragantino': 'red bull bragantino.png',
    remo: 'remo.png', santos: 'santos.png', 'sao-paulo': 'são paulo.png',
    vasco: 'vasco.png', vitoria: 'vitória.png',
  };
  function rxEscudoUrl(key) {
    const file = RX_CREST_MAP[key];
    return file ? `escudos  série A 2025/${file}` : '';
  }

  // 8 baldes (não 6) -- pedido do Renato: ponta esq/dir e centroavante
  // precisam aparecer separados, não escondidos num "ATA" genérico.
  const LABEL_BALDE = {
    'PONTA-ESQ': 'Ponta Esquerda', 'CENTROAVANTE': 'Centroavante', 'PONTA-DIR': 'Ponta Direita',
    'MEI': 'Meia', 'VOL': 'Volante',
    'LAT-ESQ': 'Lateral Esquerdo', 'ZAG': 'Zagueiro', 'LAT-DIR': 'Lateral Direito',
  };
  // REESCRITO 2026-08-19 (2a rodada): Renato mandou um mockup mostrando que
  // cada POSTO da formação real é 1 jogador + 1 caixa de cedido lado a lado
  // -- não mais "até 2 candidatos disputando um balde". Ataque e defesa vêm
  // direto do slot exato dos prováveis (ATA-L/ATA-C/ATA-R, LAT-L/ZAG-*/
  // LAT-R já são pessoas distintas, sem disputa). Só o meio-campo continua
  // ranqueado (meia+volante juntos, sem separar — pedido dele), pegando só
  // o topo 1-2 por scouts ofensivos, porque a formação pode listar mais
  // gente ali do que vale mostrar. Reduzido de 2 pra 1 (2026-08-19, 6a
  // rodada): Renato já tinha mostrado só 1 meia no mockup dele, e com o
  // card maior, 2 meias verticalmente próximos do centroavante colidiam.
  const MAX_MEIO = 1;
  const ORDEM_DEFESA = { 'LAT-ESQ': 0, 'ZAG': 1, 'LAT-DIR': 2 };
  const ORDEM_ATAQUE = { 'PONTA-ESQ': 0, 'CENTROAVANTE': 1, 'PONTA-DIR': 2 };

  // -----------------------------------------------------------------------
  // Motor de cálculo.
  // -----------------------------------------------------------------------
  function rxFiltrarPartidas(matchesObj, { mando = null, ultimosN = 5 } = {}) {
    let arr = Object.values(matchesObj || {});
    if (mando === "casa") arr = arr.filter((m) => m.home === true);
    if (mando === "fora") arr = arr.filter((m) => m.home === false);
    arr.sort((a, b) => {
      const dA = a.date || "", dB = b.date || "";
      return dA < dB ? -1 : dA > dB ? 1 : 0;
    });
    return arr.slice(Math.max(0, arr.length - ultimosN));
  }

  const RX_METRICAS = ["gol", "assistencia", "finalizacoes", "xg", "xa", "grandeChanceCriada"];

  /** conquista agregada por jogador (dentro da janela já filtrada), indexado por jogadorId. */
  function rxAgregarConquista(partidasFiltradas) {
    const porJogador = new Map();
    for (const m of partidasFiltradas) {
      for (const ev of m.for || []) {
        const key = ev.jogadorId;
        if (!porJogador.has(key)) {
          porJogador.set(key, {
            jogadorId: key, nome: ev.nome, posicao: ev.posicao, balde: ev.balde,
            gol: 0, assistencia: 0, finalizacoes: 0, xg: 0, xa: 0, grandeChanceCriada: 0,
          });
        }
        const acc = porJogador.get(key);
        for (const met of RX_METRICAS) acc[met] += ev[met] || 0;
      }
    }
    return porJogador;
  }

  function rxContarPresencas(partidasFiltradas) {
    const porJogador = new Map();
    for (const m of partidasFiltradas) {
      for (const id of m.presentes || []) {
        porJogador.set(id, (porJogador.get(id) || 0) + 1);
      }
    }
    return porJogador;
  }

  /**
   * Cedido narrado: por balde, os TOTAIS (gol/assistência em destaque, mais
   * os outros scouts) somados na janela filtrada, MAIS a lista de eventos
   * individuais (um por partida-jogador) de quem de fato marcou gol ou deu
   * assistência contra o time -- só esses entram na granulação, com o
   * time adversário daquela partida específica e todos os scouts dele
   * NAQUELE jogo (pedido explícito do Renato: "quero todos os scouts
   * deles, com gol e assistência destacado").
   */
  function rxCedeNarradoPorBalde(partidasFiltradas) {
    const porBalde = new Map();
    for (const m of partidasFiltradas) {
      for (const ev of m.against || []) {
        if (!ev.balde) continue;
        if (!porBalde.has(ev.balde)) {
          porBalde.set(ev.balde, { gol: 0, assistencia: 0, finalizacoes: 0, xg: 0, xa: 0, grandeChanceCriada: 0, eventos: [] });
        }
        const acc = porBalde.get(ev.balde);
        for (const met of RX_METRICAS) acc[met] += ev[met] || 0;
        if ((ev.gol || 0) > 0 || (ev.assistencia || 0) > 0) {
          acc.eventos.push({
            jogadorId: ev.jogadorId, nome: ev.nome, timeAdversario: m.opponent, data: m.date,
            gol: ev.gol || 0, assistencia: ev.assistencia || 0, finalizacoes: ev.finalizacoes || 0,
            xg: ev.xg || 0, xa: ev.xa || 0, grandeChanceCriada: ev.grandeChanceCriada || 0,
          });
        }
      }
    }
    return porBalde;
  }

  const RX_CRITERIOS_DESEMPATE = ["gol", "assistencia", "finalizacoes"];

  /**
   * Ranqueia pela PRODUÇÃO TOTAL na janela (gol->assistência->finalização),
   * não mais por média/jogo com corte de 50%. Achado real (2026-08-19,
   * questionado pelo Renato): o corte de presença original fazia um titular
   * de verdade (2 gols reais, só não bateu 3 de 5 jogos por rotação/lesão)
   * perder pra reservas com ZERO produção, porque não-elegível virava
   * -Infinity em TODOS os critérios -- pior que qualquer sinal real, por
   * menor que fosse. "Amostra curta" agora é só informativo (mostrado no
   * card), nunca derruba quem realmente produziu.
   */
  function rxOrdenarPorDesempate(candidatos, presencas, totalJogosJanela) {
    const minimoPresenca = Math.min(2, totalJogosJanela) || 1;
    const withMeta = candidatos.map((c) => {
      const jogosPresente = presencas.get(c.jogadorId) || 0;
      const elegivel = jogosPresente >= minimoPresenca;
      return Object.assign({}, c, { jogosPresente, elegivel });
    });
    withMeta.sort((a, b) => {
      for (const criterio of RX_CRITERIOS_DESEMPATE) {
        const diff = (b[criterio] || 0) - (a[criterio] || 0);
        if (diff !== 0) return diff;
      }
      // empate real na produção -- desempata por quem jogou mais (mais confiável), nunca zera quem produziu.
      if (a.jogosPresente !== b.jogosPresente) return b.jogosPresente - a.jogosPresente;
      return 0;
    });
    return withMeta;
  }

  /** slot dos prováveis -> {grupo: ataque/meio/defesa, balde: onde bater o cedido}. */
  function rxInfoDoSlot(slot) {
    if (!slot) return null;
    const s = String(slot).toUpperCase();
    if (s.startsWith("GOL")) return null;
    if (s.startsWith("ZAG")) return { grupo: 'defesa', balde: 'ZAG' };
    if (s.startsWith("LAT")) return { grupo: 'defesa', balde: s.endsWith("R") || s.includes("DIR") ? "LAT-DIR" : "LAT-ESQ" };
    if (s.startsWith("VOL") || s.startsWith("MEI")) return { grupo: 'meio', balde: 'MEI' };
    if (s.startsWith("ATA")) {
      if (s.endsWith("L")) return { grupo: 'ataque', balde: 'PONTA-ESQ' };
      if (s.endsWith("R")) return { grupo: 'ataque', balde: 'PONTA-DIR' };
      return { grupo: 'ataque', balde: 'CENTROAVANTE' };
    }
    return null;
  }

  /**
   * Posição de ORIGEM (mesmo mapa baldeDaPosicao do harvester) ->
   * {grupo, balde}. Fonte de verdade pra ONDE o jogador aparece no
   * campinho -- tem prioridade sobre o slot tático do PDC daquele jogo
   * específico (rxInfoDoSlot vira só um fallback pra quem não está no
   * acervo de posições granulares).
   */
  function rxInfoDaPosicaoCanonica(label) {
    const MAPA = {
      zagueiro: { grupo: 'defesa', balde: 'ZAG' },
      'lateral-esquerdo': { grupo: 'defesa', balde: 'LAT-ESQ' },
      'lateral-direito': { grupo: 'defesa', balde: 'LAT-DIR' },
      volante: { grupo: 'meio', balde: 'MEI' },
      meia: { grupo: 'meio', balde: 'MEI' },
      'atacante-area': { grupo: 'ataque', balde: 'CENTROAVANTE' },
      'ponta-esquerda': { grupo: 'ataque', balde: 'PONTA-ESQ' },
      'ponta-direita': { grupo: 'ataque', balde: 'PONTA-DIR' },
    };
    return MAPA[label] || null;
  }

  /**
   * Posição de exibição no campinho de confronto NÃO usa mais o x/y REAL do
   * PDC daquele jogo -- mudança de rota (2026-08-20, 4a intervenção): a
   * posição real variava demais entre partidas (lateral empurrado até o
   * meio-campo, zagueiro largo lendo como lateral, altura do campinho
   * mudando MUITO de confronto pra confronto) e o campinho ficava "torto" e
   * imprevisível. Pedido explícito do Renato: "jogadores de cada posição na
   * sua respectiva posição, respeitando os limites do campinho". Agora cada
   * balde tem uma ÂNCORA FIXA (ver RX_ANCORA_CONFRONTO, mesma filosofia já
   * comprovada no campinho GERAL da rodada, que nunca teve esse problema).
   */
  function rxJogadorComConquista(p, conquistaPorJogador, balde) {
    const conquista = conquistaPorJogador.get(String(p.id));
    const base = { jogadorId: String(p.id), balde, duvida: p.sit === 'duvida' };
    return conquista
      ? Object.assign({}, conquista, base, { nome: conquista.nome || p.nome })
      : Object.assign(base, { nome: p.nome, gol: 0, assistencia: 0, finalizacoes: 0, xg: 0, xa: 0, grandeChanceCriada: 0 });
  }

  /**
   * Monta os POSTOS da formação real: ataque e defesa vêm 1:1 do slot exato
   * dos prováveis (cada ATA-L/ATA-C/ATA-R/LAT-L/ZAG/LAT-R já é uma pessoa
   * distinta, sem disputa); meio-campo (meia+volante juntos) é ranqueado
   * pelos scouts ofensivos e cortado no topo 1-2 -- pedido do Renato depois
   * de ver que "3 meias sempre" lotava demais quando a formação tinha mais
   * gente ali do que valia mostrar.
   */
  function rxMontarConfronto(matchesA, matchesB, { mandoA = null, ultimosN = 5, teamAProvaveis = null, maxMeio = MAX_MEIO, posicoesGranulares = null } = {}) {
    const mandoB = mandoA === "casa" ? "fora" : mandoA === "fora" ? "casa" : null;
    const partidasA = rxFiltrarPartidas(matchesA, { mando: mandoA, ultimosN });
    const partidasB = rxFiltrarPartidas(matchesB, { mando: mandoB, ultimosN });

    const conquistaA = rxAgregarConquista(partidasA);
    const presencasA = rxContarPresencas(partidasA);
    const cedeB = rxCedeNarradoPorBalde(partidasB);

    // 1a passada: junta origem (acervo) e slot tático REAL daquele jogo pra
    // cada jogador. `alinhado` = os dois concordam (ou não há origem
    // cadastrada) -- ninguém "roubou" o posto de outro.
    const candidatos = [];
    for (const p of (teamAProvaveis && teamAProvaveis.players) || []) {
      if (p.isCoach) continue;
      const labelCanonico = posicoesGranulares && posicoesGranulares[String(p.id)];
      const infoSlot = rxInfoDoSlot(p.slot);
      const infoCanonico = labelCanonico && rxInfoDaPosicaoCanonica(labelCanonico);
      // posição de origem tem prioridade; slot do PDC (tático, daquele jogo
      // específico) só entra como fallback pra quem não está no acervo.
      const info = infoCanonico || infoSlot;
      if (!info) continue;
      const alinhado = !infoCanonico || !infoSlot || infoCanonico.balde === infoSlot.balde;
      candidatos.push({ p, info, infoSlot, alinhado });
    }
    // 2a passada: cada balde de ataque/lateral tem 1 titular fixo no
    // campinho (ZAG suporta 2 -- back four; MEI é ranqueado à parte, sem
    // limite aqui). Se a posição de ORIGEM colocar 2+ jogadores no mesmo
    // balde (achado real, 2026-08-20: um ponta de origem escalado no
    // meio-campo essa rodada colide com o ponta real da vez, ex.
    // Vitinho x Johan Carbonero, Internacional) -- processa quem está
    // REALMENTE jogando ali hoje primeiro (alinhado=true), garantindo que
    // ele fique com o posto natural. Quem perde a disputa simplesmente
    // fica de fora dessa exibição -- pedido do Renato (2026-08-20):
    // reclassificar o perdedor pro slot tático real (ex.: "Vitinho" virar
    // "Meia") ficava estranho pra quem conhece o jogador. Melhor não
    // mostrar do que mostrar num rótulo genérico que não é a cara dele.
    candidatos.sort((a, b) => (b.alinhado ? 1 : 0) - (a.alinhado ? 1 : 0));
    const capacidade = (balde) => (balde === 'ZAG' ? 2 : balde === 'MEI' ? Infinity : 1);
    const ocupantes = new Map();
    const postosAtaque = [], postosDefesa = [], candidatosMeio = [];
    for (const c of candidatos) {
      const info = c.info;
      if ((ocupantes.get(info.balde) || 0) >= capacidade(info.balde)) continue;
      ocupantes.set(info.balde, (ocupantes.get(info.balde) || 0) + 1);
      const jogador = rxJogadorComConquista(c.p, conquistaA, info.balde);
      if (info.grupo === 'ataque') postosAtaque.push({ balde: info.balde, jogador });
      else if (info.grupo === 'defesa') postosDefesa.push({ balde: info.balde, jogador });
      else candidatosMeio.push(jogador);
    }
    postosAtaque.sort((a, b) => (ORDEM_ATAQUE[a.balde] ?? 9) - (ORDEM_ATAQUE[b.balde] ?? 9));
    postosDefesa.sort((a, b) => (ORDEM_DEFESA[a.balde] ?? 9) - (ORDEM_DEFESA[b.balde] ?? 9));
    const postosMeio = rxOrdenarPorDesempate(candidatosMeio, presencasA, partidasA.length)
      .slice(0, maxMeio)
      .map((jogador) => ({ balde: 'MEI', jogador }));

    const anexarCede = (postos) => postos.map((posto) => Object.assign({}, posto, { cede: cedeB.get(posto.balde) || null }));
    // Posto sem NADA a mostrar (zero conquistado E zero cedido nos 4
    // números) não aparece no campinho -- pedido explícito do Renato
    // (2026-08-20): um card inteiro em branco não ajuda em nada, só
    // ocupa espaço. Mesmo critério que o campinho GERAL da rodada já usa
    // (rxClassificarCandidatoRodada).
    const semDadoAlgum = (posto) => {
      const j = posto.jogador, c = posto.cede;
      return (j.gol || 0) + (j.assistencia || 0) + ((c && c.gol) || 0) + ((c && c.assistencia) || 0) === 0;
    };
    const filtrarZerados = (postos) => postos.filter((posto) => !semDadoAlgum(posto));

    return {
      partidasUsadasA: partidasA.length, partidasUsadasB: partidasB.length,
      postosAtaque: filtrarZerados(anexarCede(postosAtaque)),
      postosMeio: filtrarZerados(anexarCede(postosMeio)),
      postosDefesa: filtrarZerados(anexarCede(postosDefesa)),
    };
  }

  // -----------------------------------------------------------------------
  // Ranking da RODADA (todos os confrontos reais de uma vez, por posição).
  // Critério confirmado pelo Renato (2026-08-19), em ordem de prioridade:
  // 1) cruzamento forte (produção própria E fragilidade do rival, os dois
  //    presentes), 2) produção individual isolada, 3) fragilidade do rival
  //    isolada. Candidato com os dois sinais zerados nem entra -- mesma
  //    filosofia já usada no resto da plataforma (zona fraca fica ausente).
  // -----------------------------------------------------------------------
  function rxClassificarCandidatoRodada(jogador, cede) {
    const propria = (jogador.gol || 0) + (jogador.assistencia || 0);
    const cedeTotal = cede ? (cede.gol || 0) + (cede.assistencia || 0) : 0;
    let tier;
    if (propria > 0 && cedeTotal > 0) tier = 1;
    else if (propria > 0) tier = 2;
    else if (cedeTotal > 0) tier = 3;
    else return null;
    return { tier, propria, cedeTotal };
  }

  /**
   * Roda o mesmo motor de confronto (rxMontarConfronto) pra TODO time que
   * tem próximo confronto real + prováveis carregados, junta os candidatos
   * de todos os times por balde, classifica pelo critério de prioridade e
   * ordena. maxMeio:Infinity porque aqui não existe a restrição de "1 posto
   * só" do campinho de confronto individual -- queremos TODOS os candidatos
   * de meio-campo pra competir no ranking da rodada.
   */
  async function rxMontarRodada(ultimosN, respeitarMando) {
    const [provaveis, proximoConfronto, posicoesGranulares] = await Promise.all([
      rxGetProvaveis(), rxGetProximoConfronto(), rxGetPosicoesGranulares(),
    ]);
    const timesComConfronto = Object.keys(proximoConfronto).filter((t) => provaveis.teams && provaveis.teams[t]);
    const matchesPorTime = new Map();
    await Promise.all(timesComConfronto.map(async (t) => {
      matchesPorTime.set(t, await rxGetRaioXData(t));
    }));

    const porBalde = new Map();
    for (const timeKey of timesComConfronto) {
      const info = proximoConfronto[timeKey];
      const rivalKey = info.adversario;
      if (!matchesPorTime.has(rivalKey)) continue;
      // Mando real do confronto (padrão) vs. últimos N jogos gerais do time,
      // ignorando mando -- pedido do Renato (2026-08-19): às vezes a amostra
      // só-em-casa/só-fora fica curta demais, e ele quer poder olhar a forma
      // geral recente em vez de travar sempre no mando real daquele jogo.
      const resultado = rxMontarConfronto(matchesPorTime.get(timeKey), matchesPorTime.get(rivalKey), {
        mandoA: respeitarMando ? info.mando : null, ultimosN, teamAProvaveis: provaveis.teams[timeKey], maxMeio: Infinity, posicoesGranulares,
      });
      const todosPostos = [...resultado.postosAtaque, ...resultado.postosMeio, ...resultado.postosDefesa];
      for (const posto of todosPostos) {
        const meta = rxClassificarCandidatoRodada(posto.jogador, posto.cede);
        if (!meta) continue;
        if (!porBalde.has(posto.balde)) porBalde.set(posto.balde, []);
        porBalde.get(posto.balde).push(Object.assign({}, posto.jogador, meta, {
          balde: posto.balde, cede: posto.cede, timeKey, rivalKey,
        }));
      }
    }

    // Dentro de cada categoria (tier), critério confirmado pelo Renato
    // (2026-08-19, refinamento): gols marcados > gols cedidos pelo rival >
    // assistências conquistadas > assistências cedidas pelo rival, nessa
    // ordem exata -- "um jogador com mais gols que os outros tem que ser
    // melhor ranqueado". Cruzamento forte/produção/fragilidade continua
    // sendo a prioridade MAIOR (confirmado antes); isso só desempata DENTRO
    // de cada categoria.
    for (const candidatos of porBalde.values()) {
      candidatos.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if ((b.gol || 0) !== (a.gol || 0)) return (b.gol || 0) - (a.gol || 0);
        const cedeGolA = (a.cede && a.cede.gol) || 0, cedeGolB = (b.cede && b.cede.gol) || 0;
        if (cedeGolB !== cedeGolA) return cedeGolB - cedeGolA;
        if ((b.assistencia || 0) !== (a.assistencia || 0)) return (b.assistencia || 0) - (a.assistencia || 0);
        const cedeAssistA = (a.cede && a.cede.assistencia) || 0, cedeAssistB = (b.cede && b.cede.assistencia) || 0;
        return cedeAssistB - cedeAssistA;
      });
    }
    return porBalde; // Map<balde, candidato[] já ordenado>
  }

  let __rxRodadaCache = null; // { ultimosN, respeitarMando, promise }
  function rxGetRodada(ultimosN, respeitarMando) {
    if (__rxRodadaCache && __rxRodadaCache.ultimosN === ultimosN && __rxRodadaCache.respeitarMando === respeitarMando) {
      return __rxRodadaCache.promise;
    }
    const promise = rxMontarRodada(ultimosN, respeitarMando);
    __rxRodadaCache = { ultimosN, respeitarMando, promise };
    return promise;
  }

  // -----------------------------------------------------------------------
  // Dado compartilhado — carregado uma vez, cacheado em memória.
  // -----------------------------------------------------------------------
  const __rxRaioXCache = new Map();
  async function rxGetRaioXData(teamKey) {
    if (__rxRaioXCache.has(teamKey)) return __rxRaioXCache.get(teamKey);
    const promise = (async () => {
      try {
        const res = await fetch(`data/raio-x/${teamKey}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        const data = await res.json();
        return data.matches || {};
      } catch (err) {
        console.warn(`[raiox] Não foi possível carregar dado (${teamKey}).`, err);
        return {};
      }
    })();
    __rxRaioXCache.set(teamKey, promise);
    return promise;
  }

  let __rxProvaveisCache = null;
  async function rxGetProvaveis() {
    if (__rxProvaveisCache) return __rxProvaveisCache;
    __rxProvaveisCache = (async () => {
      try {
        const res = await fetch(`data/provaveis.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        return await res.json();
      } catch (err) {
        console.warn('[raiox] Não foi possível carregar prováveis.', err);
        return { teams: {} };
      }
    })();
    return __rxProvaveisCache;
  }

  /**
   * Posição de ORIGEM de cada jogador (atletaId -> label granular), mesmo
   * acervo já usado pra classificar a produção própria dele (scripts/
   * posicoes-granulares.json, 533 jogadores). Fonte de verdade pra ONDE ele
   * aparece no campinho -- achado real (2026-08-19): o slot tático do PDC
   * pra aquele jogo específico ("Vitinho" listado como MEI-R na escalação
   * prevista do Internacional) não batia com a posição de carteirinha
   * (ponta-esquerda, confirmado tanto aqui quanto no posicao_id=5/Atacante
   * da API do Cartola), confundindo quem já conhece o jogador. Pedido
   * explícito do Renato: "deixar cada jogador na sua posição de origem".
   */
  let __rxPosicoesGranularesCache = null;
  async function rxGetPosicoesGranulares() {
    if (__rxPosicoesGranularesCache) return __rxPosicoesGranularesCache;
    __rxPosicoesGranularesCache = (async () => {
      try {
        // Fica em scripts/, não em data/ -- data/ é disco persistente no
        // Render, só ganha arquivo NOVO via POST em runtime (harvester),
        // nunca via deploy de código. Esse arquivo é estático (não muda por
        // harvest), então serve direto do que o deploy normal já entrega.
        const res = await fetch(`scripts/posicoes-granulares.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        return await res.json();
      } catch (err) {
        console.warn('[raiox] Não foi possível carregar posições granulares.', err);
        return {};
      }
    })();
    return __rxPosicoesGranularesCache;
  }

  let __rxFotosIdsCache = null;
  async function rxGetFotosIds() {
    if (__rxFotosIdsCache) return __rxFotosIdsCache;
    __rxFotosIdsCache = (async () => {
      try {
        // Mesma razão do posicoes-granulares.json acima: estático, fica em
        // scripts/ pra não cair no buraco do disco persistente de data/.
        const res = await fetch(`scripts/fotos-jogadores.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        const data = await res.json();
        return new Set((data.ids || []).map(String));
      } catch (err) {
        console.warn('[raiox] Não foi possível carregar banco de fotos.', err);
        return new Set();
      }
    })();
    return __rxFotosIdsCache;
  }

  /** {teamKey: {mando, adversario, data, rodada}} -- mando REAL de cada time na próxima rodada (build_proximo_confronto.mjs). Usado pra pré-selecionar o filtro de mando, em vez de abrir em "não filtrar" misturando casa e fora (achado real, 2026-08-19: Renato apontou que isso não estava sendo usado). */
  let __rxProximoConfrontoCache = null;
  async function rxGetProximoConfronto() {
    if (__rxProximoConfrontoCache) return __rxProximoConfrontoCache;
    __rxProximoConfrontoCache = (async () => {
      try {
        const res = await fetch(`data/proximo-confronto.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        return await res.json();
      } catch (err) {
        console.warn('[raiox] Não foi possível carregar próximo confronto.', err);
        return {};
      }
    })();
    return __rxProximoConfrontoCache;
  }

  function rxIniciais(nome) {
    return String(nome || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  }
  function rxFmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }
  function rxFoto(id, nome, fotosIds) {
    const has = fotosIds.has(String(id));
    return has ? `<img src="jogadores/${id}.webp" alt="${nome || ''}" />` : rxIniciais(nome);
  }

  // -----------------------------------------------------------------------
  // Renderização.
  // -----------------------------------------------------------------------
  const RX_LINHAS_STAT = [
    ['Finaliz.', 'finalizacoes'], ['xG', 'xg'], ['xA', 'xa'], ['G. chance', 'grandeChanceCriada'],
  ];

  /**
   * Card ÚNICO por jogador (produção + cedido empilhados, não mais lado a
   * lado) -- achado real (2026-08-19, 3a intervenção): com o cedido
   * pendurado do lado, o conjunto card+cedido ficava com o centro visual
   * fora da posição real do jogador (o card sozinho estava certo, mas o
   * "bloco" inteiro parecia torto/desalinhado do resto da formação).
   * Empilhando tudo num card só, ele fica centralizado de verdade na
   * posição x/y, sem perder nem o impacto do card premium nem o destaque
   * do cedido (mantém as duas seções visualmente diferentes por dentro).
   */
  function rxCardUnificado(c, fotosIds, isDestaque, cede, janelaLabel) {
    const temFoto = fotosIds.has(String(c.jogadorId));
    const outrosStats = RX_LINHAS_STAT.map(([label, campo]) => {
      const valor = c[campo] || 0;
      return `<div class="rx-card-stat-row"><span>${label}</span><span>${rxFmt(valor)}</span></div>`;
    }).join('');

    let cedeHtml;
    if (!cede || (!cede.gol && !cede.assistencia)) {
      cedeHtml = `
        <div class="rx-cede-topo-label">Cedido pelo rival ${janelaLabel}</div>
        <div class="rx-cede-vazio-txt">Sem gol ou assistência sofridos nessa posição no recorte.</div>`;
    } else {
      // Cap na granulação: sem isso a altura do card fica imprevisível (uma
      // posição bem "vazada" pelo rival podia ter 6+ eventos, estourando
      // muito além do card comum e colidindo com o posto vizinho no
      // campinho -- achado real, 2026-08-20). Os TOTAIS lá em cima
      // continuam somando tudo, sempre; aqui é só a lista granular que
      // mostra os mais relevantes (mais gol+assistência primeiro).
      const RX_CEDE_EVENTOS_MAX = 4;
      const eventosOrdenados = [...cede.eventos].sort((a, b) => (b.gol + b.assistencia) - (a.gol + a.assistencia));
      const eventosTruncados = eventosOrdenados.length - RX_CEDE_EVENTOS_MAX;
      const eventosHtml = eventosOrdenados.slice(0, RX_CEDE_EVENTOS_MAX).map((ev) => `
        <div class="rx-cede-evento">
          <img class="rx-cede-evento-escudo" src="${rxEscudoUrl(ev.timeAdversario)}" alt="${rxTeamName(ev.timeAdversario)}" />
          <div class="rx-cede-evento-foto">${rxFoto(ev.jogadorId, ev.nome, fotosIds)}</div>
          <div class="rx-cede-evento-info">
            <div class="rx-cede-evento-nome">${ev.nome || '—'} <span class="rx-cede-evento-time">(${rxTeamName(ev.timeAdversario)})</span></div>
            <div class="rx-cede-evento-scouts">
              ${ev.gol ? `<span class="rx-pill rx-pill-gol">${ev.gol} gol${ev.gol > 1 ? 's' : ''}</span>` : ''}
              ${ev.assistencia ? `<span class="rx-pill rx-pill-gol">${ev.assistencia} assist.</span>` : ''}
              <span>Final. ${ev.finalizacoes}</span><span>xG ${rxFmt(ev.xg)}</span><span>xA ${rxFmt(ev.xa)}</span><span>G.chance ${ev.grandeChanceCriada}</span>
            </div>
          </div>
        </div>`).join('');
      cedeHtml = `
        <div class="rx-cede-topo-label">Cedido pelo rival ${janelaLabel}</div>
        <div class="rx-cede-topo-numeros">
          <div><span class="rx-cede-num">${cede.gol}</span><span class="rx-cede-num-lbl">Gol${cede.gol === 1 ? '' : 's'}</span></div>
          <div><span class="rx-cede-num">${cede.assistencia}</span><span class="rx-cede-num-lbl">Assist.</span></div>
        </div>
        <div class="rx-cede-granular">${eventosHtml}${eventosTruncados > 0 ? `<div class="rx-cede-evento-mais">+${eventosTruncados} outro${eventosTruncados > 1 ? 's' : ''} evento${eventosTruncados > 1 ? 's' : ''} nos totais acima</div>` : ''}</div>`;
    }

    return `
      <div class="rx-card${isDestaque ? ' rx-destaque' : ''}">
        <div class="rx-card-foto" style="${temFoto ? '' : 'background:#cfcabb'}">${rxFoto(c.jogadorId, c.nome, fotosIds)}</div>
        <div class="rx-card-nome">${c.nome || '—'}${c.duvida ? ' <span class="rx-duvida-tag">dúvida</span>' : ''}</div>
        ${isDestaque ? '<div class="rx-card-estrela">★ DESTAQUE DA RODADA</div>' : ''}
        <div class="rx-card-goloassist">
          <div><span class="rx-goloassist-num">${c.gol || 0}</span><span class="rx-goloassist-lbl">Gol</span></div>
          <div><span class="rx-goloassist-num">${c.assistencia || 0}</span><span class="rx-goloassist-lbl">Assist.</span></div>
        </div>
        <div class="rx-card-block-title">Outros scouts</div>
        <div class="rx-card-stats">${outrosStats}</div>
        <div class="rx-cede-secao">${cedeHtml}</div>
      </div>`;
  }

  /**
   * Card RESUMO -- o que aparece no campinho (tela e download), tanto o
   * confronto individual quanto (futuramente) outras telas. Só o essencial
   * pra bater o olho: Gol+Assistência conquistados e cedidos, nada de
   * finalização/xG/xA/grande chance nem a lista granular de quem marcou
   * contra -- isso tudo fica RESTRITO ao card completo (rxCardUnificado),
   * que só aparece no modal ao clicar. Pedido do Renato (2026-08-20):
   * "o campinho no site... eu preciso que ele seja de um tamanho um pouco
   * mais natural... o modelo de download individual não ter os detalhes
   * do card que eu clico no site". Foto pequena de propósito (só pra
   * reconhecer o jogador, não protagonista).
   */
  function rxCardResumo(c, fotosIds, isDestaque, cede) {
    const cedeGol = (cede && cede.gol) || 0;
    const cedeAssist = (cede && cede.assistencia) || 0;
    // Cedido alto é OPORTUNIDADE pro nosso jogador, não notícia ruim -- por
    // isso vira verde (classe condicional por valor), nunca vermelho. Ver
    // .rx-resumo-num-positivo/.rx-resumo-cede em raiox.css.
    const classeCede = (v) => 'rx-resumo-num' + (v > 0 ? ' rx-resumo-num-positivo' : '');
    return `
      <div class="rx-resumo${isDestaque ? ' rx-resumo-destaque' : ''}">
        <div class="rx-resumo-foto">${rxFoto(c.jogadorId, c.nome, fotosIds)}</div>
        <div class="rx-resumo-nome">${c.nome || '—'}${c.duvida ? ' <span class="rx-duvida-tag-resumo">dúvida</span>' : ''}</div>
        ${isDestaque ? '<div class="rx-resumo-estrela">★ DESTAQUE DA RODADA</div>' : ''}
        <div class="rx-resumo-bloco rx-resumo-produz">
          <div class="rx-resumo-bloco-label">Conquistou</div>
          <div class="rx-resumo-numeros">
            <div><span class="rx-resumo-num">${c.gol || 0}</span><span class="rx-resumo-lbl">Gol</span></div>
            <div><span class="rx-resumo-num">${c.assistencia || 0}</span><span class="rx-resumo-lbl">Assist.</span></div>
          </div>
        </div>
        <div class="rx-resumo-bloco rx-resumo-cede">
          <div class="rx-resumo-bloco-label">Rival cedeu</div>
          <div class="rx-resumo-numeros">
            <div><span class="${classeCede(cedeGol)}">${cedeGol}</span><span class="rx-resumo-lbl">Gol</span></div>
            <div><span class="${classeCede(cedeAssist)}">${cedeAssist}</span><span class="rx-resumo-lbl">Assist.</span></div>
          </div>
        </div>
      </div>`;
  }

  /**
   * Um posto = rótulo da posição + UM card único (produção + cedido
   * empilhados dentro do mesmo card, ver rxCardUnificado) centralizado na
   * posição real x/y. Achado real (2026-08-19, 3a intervenção): tentar
   * ancorar só o card e deixar uma caixa de cedido pendurada do lado fazia
   * o CONJUNTO parecer torto/descentralizado da formação, mesmo o card em
   * si estando no lugar certo -- "quando coloca os box de pontos fica muito
   * estranho, tudo desalinhado" (Renato). Um card só, centralizado de
   * verdade, resolve isso na raiz.
   */
  // Geometria do campinho -- proporção real de campo (68x105m ≈ 0.647
  // largura/altura), com marcação de verdade (mesmo traço do
  // dsmDrawPitchMarkings dos outros mapas do site, transposto pra pé).
  // Achado real (2026-08-19, 3a intervenção): o card único ficou bem mais
  // ALTO que antes (cedido empilhado dentro, não mais do lado) -- 1700 de
  // largura (proporcional ≈2625 de altura) não dava vão vertical suficiente
  // entre linhas próximas da formação real (ex.: centroavante y=15% batendo
  // no meia y=38%, só 23% de distância = pouco mais de 600px, menos que a
  // altura de um card com cedido granular cheio). 2600 dá altura ≈4015,
  // vão suficiente em qualquer ponto testado da formação real.
  // 6a rodada (2026-08-19): "os números ainda estão tímidos, especialmente
  // os scouts granulares, quase ilegível" + centroavante encostando no
  // meia. Salto decisivo em vez de incremento tímido de novo -- card e
  // fonte bem maiores, pitch cresce proporcionalmente mais que o
  // necessário (folga extra, não só o mínimo calculado) pra não precisar
  // de uma 7a rodada só de tamanho.
  // Card 480->760 + fontes acompanhando (pedido do Renato, 2026-08-20:
  // "não adianta aumentar o card e não aumentar as fontes"). Pitch cresce
  // um pouco menos que proporcionalmente ao card (4200->5200, não 6650) --
  // aqui as posições vêm de x/y REAL dos prováveis (formação de verdade,
  // não âncora canônica como no campinho geral), então não dá pra comprimir
  // o espaço vazio como fizemos lá; o gargalo é só legibilidade, resolvido
  // pelo card+fonte maiores. Testado por colisão real de bounding rect
  // antes de fechar (ver histórico: braças de segurança já foram tateadas
  // por 6 rodadas de tentativa/erro pra esse mesmo campinho).
  // Altura DESACOPLADA da largura (2026-08-20, achado real): o card ficou
  // bem mais alto (até ~2300px, mesmo com o cap de 4 eventos na
  // granulação do cedido) e as posições aqui são x/y REAIS dos prováveis
  // (formação de verdade), não âncora fixa -- então o vão vertical entre
  // ataque e meio-campo pode ser só ~15-20% da altura em formações reais,
  // pouco pra um card desse tamanho. Seguir a proporção real de campo
  // (105/68) deixaria a altura curta demais pra caber os cards sem colidir
  // (testado: Fernandinho x Japa, Internacional x Atlético-MG). Altura
  // maior que a largura proporcional é intencional aqui.
  // 2a intervenção (2026-08-20): o card virou um RESUMO pequeno
  // (rxCardResumo -- só Gol+Assist, o card completo agora é só do modal),
  // então o campinho inteiro encolhe MUITO em relação ao card gigante de
  // antes (760px/altura imprevisível) -- não precisa mais da altura
  // desacoplada gigante pra evitar colisão.
  // 3a intervenção (2026-08-20): a altura seguindo a proporção real de
  // campo (105/68) forçava a escala de tela a encolher demais pra caber na
  // ALTURA disponível (que é sempre menor que a largura numa tela normal),
  // mesmo com o card resumo já pequeno -- achado real: card renderizando a
  // 36x51px na tela, ilegível de verdade (não era ilusão de ótica dessa
  // vez). O card resumo agora tem altura FIXA e previsível (~460px, sem
  // lista de tamanho variável), então dá pra desacoplar a altura do campo
  // de novo e ajustar só pelo que o card realmente precisa.
  const RX_PITCH_W = 2200;
  const RX_PITCH_H = 2600;
  const RX_CARD_W = 450;
  const RX_MARGIN_X = RX_CARD_W / 2 + 70;
  // 340 (era 220, 2026-08-20): rótulo do posto mais ao topo (ex.:
  // "CENTROAVANTE") estava encostando na linha do campinho -- o bloco
  // rótulo+card é centralizado (translate -50%,-50%), então metade da sua
  // altura precisa caber ACIMA da linha do gramado pros postos perto de
  // y=0.
  const RX_MARGIN_Y = 340;
  const RX_CANVAS_W = RX_PITCH_W + RX_MARGIN_X * 2;
  const RX_CANVAS_H = RX_PITCH_H + RX_MARGIN_Y * 2;

  // ---- geometria do campinho GERAL DA RODADA (pódio empilhado por posto) --
  // Não usa x/y real de jogador (não existe "o" jogador daquele posto na
  // rodada inteira -- são vários, de times diferentes), então cada balde tem
  // uma coordenada CANÔNICA fixa, na mesma silhueta tática de sempre. Cards
  // aqui são bem menores que o do confronto individual (pódio de 3, não 1
  // card premium cheio), então o campo pode ser mais estreito.
  // 2a intervenção (2026-08-19): a 1a rodada (card 380->620, campo
  // encolhido só até o mínimo de colisão HORIZONTAL) ainda deixava "muito
  // vazio, dados pequenos pro tamanho da arte" (Renato). O gargalo real era
  // a distância VERTICAL entre as faixas de posição, que seguia a
  // proporção de campo real (105/68) mesmo sem precisar -- aqui as
  // posições são canônicas/simbólicas, não coordenada real de jogador (só
  // importa no campinho de CONFRONTO individual). Aproximei as faixas em Y
  // além de aumentar o card de novo -- os dois motivos têm que mexer
  // juntos, só aumentar o card sozinho não reduz o vão vazio no meio.
  const RX_R_COORDS = {
    'PONTA-ESQ': { x: 15, y: 23 }, 'CENTROAVANTE': { x: 50, y: 18 }, 'PONTA-DIR': { x: 85, y: 23 },
    'MEI': { x: 50, y: 50 },
    'LAT-ESQ': { x: 15, y: 72 }, 'ZAG': { x: 50, y: 80 }, 'LAT-DIR': { x: 85, y: 72 },
  };
  const RX_R_ORDEM_BALDES = ['PONTA-ESQ', 'CENTROAVANTE', 'PONTA-DIR', 'MEI', 'LAT-ESQ', 'ZAG', 'LAT-DIR'];
  // Card 850->1000 (4a intervenção, 2026-08-19): "puxe mais a altura,
  // acompanhe com fonte" fez o nome do jogador truncar com "..." -- o
  // card não cresceu em LARGURA junto com a fonte/foto/medalha maiores,
  // sobrando menos espaço pro texto do nome. Largura do campo cresce junto
  // (proporcionalmente) só pra manter o mesmo respiro da linha lateral que
  // já tínhamos conquistado -- a ALTURA do campo continua desacoplada
  // (fixa), não reabre o vão vertical.
  const RX_R_CARD_W = 1100;
  const RX_R_PITCH_W = 4550;
  const RX_R_PITCH_H = 4169;
  const RX_R_MARGIN_X = RX_R_CARD_W / 2 + 90;
  const RX_R_MARGIN_Y = 480;
  const RX_R_CANVAS_W = RX_R_PITCH_W + RX_R_MARGIN_X * 2;
  const RX_R_CANVAS_H = RX_R_PITCH_H + RX_R_MARGIN_Y * 2;

  /** marcação real de campo, transposta pra orientação em pé (grande área embaixo e em cima) -- mesmo traço do dsmDrawPitchMarkings dos outros mapas do site. */
  function rxPitchMarkingsSvg() {
    return `<svg class="rx-pitch-svg" viewBox="0 0 68 105" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="68" height="105" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width=".4" />
      <line x1="0" y1="52.5" x2="68" y2="52.5" stroke="#ffffff" stroke-opacity=".4" stroke-width=".35" />
      <circle cx="34" cy="52.5" r="9.15" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width=".35" />
      <circle cx="34" cy="52.5" r=".6" fill="#ffffff" fill-opacity=".5" />
      <rect x="13.85" y="0" width="40.3" height="16.5" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width=".35" />
      <rect x="24.85" y="0" width="18.3" height="5.5" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width=".35" />
      <rect x="30.6" y="-2" width="6.8" height="2" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".35" />
      <rect x="13.85" y="88.5" width="40.3" height="16.5" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width=".35" />
      <rect x="24.85" y="99.5" width="18.3" height="5.5" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width=".35" />
      <rect x="30.6" y="105" width="6.8" height="2" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".35" />
    </svg>`;
  }

  // Destaque = "claro destaque da rodada" -- critério confirmado pelo
  // Renato (2026-08-19, refinamento): não é mais um corte relativo (top 5
  // do balde), é um patamar ABSOLUTO de produção própria -- gol >= 3 no
  // recorte, "bem acima da média". Um jogador pode não ser o 1º do balde
  // dele (balde concorrido) e ainda assim acender a estrela, e vice-versa.
  const RX_DESTAQUE_GOL_MINIMO = 3;
  // Registro dos dados COMPLETOS de cada posto (jogador+cede+janelaLabel),
  // indexado por um id sequencial gravado no DOM (data-rx-modal-id) --
  // usado pra montar o card completo (rxCardUnificado) sob demanda quando
  // o modal abre, já que o campinho em si só desenha o resumo agora.
  let __rxModalRegistro = [];
  // Altura aproximada só do CARD (sem rótulo) -- usada pra "encolher" o
  // range de mapeamento do x/y real (ver rxCalcularPosicoes) e garantir por
  // CONSTRUÇÃO que o card nunca ultrapassa a linha do campinho, mesmo pra
  // jogador em posição real bem extrema (y perto de 0% ou 100%). Achado
  // real (2026-08-20, Renato): "cards saindo do campinho... tem uma outra
  // área verde em volta que você usou como se estivesse no campinho" -- o
  // fundo do canvas é do mesmo verde do gramado, então qualquer card que
  // encoste na linha branca lê como "saiu de campo", mesmo estando dentro
  // da margem técnica reservada.
  const RX_CARD_H = 600;
  // Altura aproximada do card + rótulo + folga mínima de segurança -- usada
  // só como rede de segurança residual (empurra pra baixo, não pra
  // afastar), já que a posição de cada balde agora é fixa por âncora
  // (RX_ANCORA_CONFRONTO, já verificada pra não colidir entre si). Valor
  // amarrado ao card de verdade (RX_CARD_H=600) + rótulo + respiro, não um
  // número arbitrário grande -- um valor inflado demais fazia esse
  // empurrão disparar sem necessidade em pares que já tinham folga visual
  // de sobra (achado real, 2026-08-20).
  const RX_CARD_H_SEGURA = 660;

  /**
   * Âncora fixa (x/y %) por balde -- cada posição tem uma REGIÃO definida
   * do campinho, não a coordenada real do PDC daquele jogo (mesma
   * filosofia já comprovada no campinho GERAL da rodada, RX_R_COORDS, que
   * nunca teve problema de posição "torta"). ZAG entra com 2 slots lado a
   * lado (não empilhados) porque uma linha de 4 real quase sempre tem 2
   * zagueiros titulares -- ler como uma zaga de verdade, não uma pilha.
   */
  // Cada par de âncoras foi verificado pra ficar longe o bastante em X
  // (>=27%, folga sobre o mínimo de 25.7% = RX_CARD_W/(RX_PITCH_W-RX_CARD_W))
  // OU em Y (>=33% do range, folga sobre RX_CARD_H_SEGURA) -- achado real
  // (2026-08-20): um par "quase no limite" (MEI a 36% de ZAG, precisa de
  // 38%) fazia o empurrão de colisão disparar sem necessidade e os dois
  // zagueiros saíam de uma linha reta lado a lado pra um zigue-zague torto.
  // Mexer numa âncora aqui exige reconferir a distância pros vizinhos.
  const RX_ANCORA_CONFRONTO = {
    'CENTROAVANTE': [{ x: 50, y: 8 }],
    'PONTA-ESQ': [{ x: 14, y: 22 }],
    'PONTA-DIR': [{ x: 86, y: 22 }],
    'MEI': [{ x: 50, y: 48 }],
    'LAT-ESQ': [{ x: 4, y: 80 }],
    'ZAG': [{ x: 35, y: 88 }, { x: 65, y: 88 }],
    'LAT-DIR': [{ x: 96, y: 80 }],
  };

  /**
   * Calcula left/top de cada posto a partir da âncora fixa do balde dele
   * (RX_ANCORA_CONFRONTO) -- mudança de rota (2026-08-20, 4a intervenção):
   * usar a posição REAL do PDC deixava o campinho "torto" e imprevisível
   * (lateral lá no meio-campo, zagueiro largo, altura variando muito de
   * confronto pra confronto). Com âncora fixa, a posição de cada jogador é
   * sempre previsível e o layout final é praticamente sempre o mesmo.
   *
   * rxMontarConfronto já garante 1 titular por balde (2 pra ZAG) antes de
   * chegar aqui -- conflito de origem (ex.: um ponta de origem escalado no
   * meio-campo essa rodada) é resolvido lá, dando o posto pra quem
   * realmente joga ali hoje e recolocando o outro no PRÓPRIO slot real (ou
   * descartando, no caso raríssimo de nem isso ter vaga). O `extras`
   * abaixo é só uma rede de segurança defensiva -- não deveria disparar na
   * prática; testado (2026-08-20) que tentar encaixar um excedente perto
   * da posição natural dele acabava pousando no meio do campo, lendo como
   * outra posição -- por isso, se algum dia disparar, cai numa fileira
   * reservada no fundo em vez de tentar ser "esperto".
   */
  function rxCalcularPosicoes(todosPostos) {
    const leftMin = RX_MARGIN_X + RX_CARD_W / 2;
    const leftMax = RX_MARGIN_X + RX_PITCH_W - RX_CARD_W / 2;
    const topMin = RX_MARGIN_Y + RX_CARD_H / 2;
    const topMax = RX_MARGIN_Y + RX_PITCH_H - RX_CARD_H / 2;
    const mapear = (xPct, yPct) => ({
      left: leftMin + (xPct / 100) * (leftMax - leftMin),
      top: topMin + (yPct / 100) * (topMax - topMin),
    });
    const porBalde = new Map();
    for (const posto of todosPostos) {
      if (!porBalde.has(posto.balde)) porBalde.set(posto.balde, []);
      porBalde.get(posto.balde).push(posto);
    }
    const posicoes = [];
    const extras = [];
    for (const [balde, postos] of porBalde) {
      const slots = RX_ANCORA_CONFRONTO[balde] || [{ x: 50, y: 50 }];
      postos.forEach((posto, i) => {
        if (i < slots.length) posicoes.push(Object.assign({ posto }, mapear(slots[i].x, slots[i].y)));
        else extras.push(posto);
      });
    }
    extras.forEach((posto, i) => {
      // Espaçamento >=32% entre extras -- folga real sobre o mínimo de
      // 25.7% (RX_CARD_W/(RX_PITCH_W-RX_CARD_W)), mesma lição da âncora
      // principal: espaçamento "quase no limite" dispara o empurrão de
      // colisão sem necessidade e desalinha a fileira.
      const xPct = Math.min(94, Math.max(6, 12 + i * 32));
      posicoes.push(Object.assign({ posto }, mapear(xPct, 95)));
    });
    posicoes.sort((a, b) => a.top - b.top);
    for (let i = 1; i < posicoes.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = posicoes[j], b = posicoes[i];
        const sobreporHorizontal = Math.abs(a.left - b.left) < RX_CARD_W;
        if (sobreporHorizontal && b.top - a.top < RX_CARD_H_SEGURA) {
          b.top = a.top + RX_CARD_H_SEGURA;
        }
      }
    }
    return posicoes;
  }

  function rxRenderPosto(posicao, fotosIds, janelaLabel) {
    const { posto, left, top } = posicao;
    const jog = posto.jogador;
    const destaque = (jog.gol || 0) >= RX_DESTAQUE_GOL_MINIMO;
    const modalId = __rxModalRegistro.length;
    __rxModalRegistro.push({ jogador: jog, cede: posto.cede, janelaLabel, destaque, fotosIds });
    const cardHtml = rxCardResumo(jog, fotosIds, destaque, posto.cede);
    // card único, centralizado de verdade na posição real (translate -50%
    // nos dois eixos) -- sem caixa lateral pra desalinhar o conjunto.
    return `<div class="rx-posto" data-rx-modal-id="${modalId}" style="left:${left}px;top:${top}px;transform:translate(-50%,-50%)">
      <div class="rx-posto-label">${LABEL_BALDE[posto.balde] || posto.balde}</div>
      ${cardHtml}
    </div>`;
  }

  function rxRenderCampinho(containerId, teamKey, rivalKey, resultado, fotosIds, mandoA) {
    const container = document.getElementById(containerId);
    if (!container) return;
    __rxModalRegistro = [];
    const todosPostos = [...resultado.postosAtaque, ...resultado.postosMeio, ...resultado.postosDefesa];
    const janelaLabel = `(últimos ${resultado.partidasUsadasB} jogo${resultado.partidasUsadasB === 1 ? '' : 's'}${mandoA === 'casa' ? ' fora' : mandoA === 'fora' ? ' em casa' : ''})`;
    let html = `
      <div class="rx-pitch-head">
        <img src="${rxEscudoUrl(teamKey)}" alt="${rxTeamName(teamKey)}" />
        <span class="rx-team-name">${rxTeamName(teamKey)}</span>
      </div>
      <div class="rx-pitch-sub">quem pode se beneficiar do que o ${rxTeamName(rivalKey)} cede</div>
    `;
    if (!todosPostos.length) {
      html += '<div class="rx-empty">Sem prováveis carregados pra esse time ainda (ou nenhuma posição bateu com o dado disponível).</div>';
      container.innerHTML = html;
      container.style.transform = 'none';
      const wrapVazio = document.getElementById('rxPitchScaleWrap');
      if (wrapVazio) wrapVazio.style.height = 'auto';
      return;
    }
    const posicoes = rxCalcularPosicoes(todosPostos);
    // O GRAMADO em si (não só o canvas) precisa crescer junto quando o
    // empurrão de colisão (rxCalcularPosicoes) manda algum card pra baixo
    // do limite -- senão o card nudged renderiza fora do retângulo
    // desenhado, no verde "solto" do canvas, lendo como "saiu do campo"
    // (achado real, 2026-08-20). Caso raro (só pares apertados), o gramado
    // normal já cobre a formação inteira sem precisar disso.
    const menorBaseCard = Math.max(...posicoes.map((p) => p.top)) + RX_CARD_H / 2;
    const gramadoH = Math.max(RX_PITCH_H, menorBaseCard - RX_MARGIN_Y + 40);
    const canvasH = RX_MARGIN_Y + gramadoH + RX_MARGIN_Y;
    html += `<div class="rx-pitch-canvas" style="width:${RX_CANVAS_W}px;height:${canvasH}px">`;
    html += `<div class="rx-pitch-gramado" style="left:${RX_MARGIN_X}px;top:${RX_MARGIN_Y}px;width:${RX_PITCH_W}px;height:${gramadoH}px">${rxPitchMarkingsSvg()}</div>`;
    posicoes.forEach((posicao) => {
      html += rxRenderPosto(posicao, fotosIds, janelaLabel);
    });
    html += '</div>';
    container.innerHTML = html;
    // clique em qualquer card do confronto individual abre ele grande, em
    // resolução natural, num modal -- pedido do Renato (2026-08-20), só pra
    // essa tela (não pro pódio do campinho geral).
    container.querySelectorAll('.rx-posto').forEach((el) => {
      el.classList.add('rx-posto-clicavel');
      el.addEventListener('click', () => rxAbrirModalCard(el));
    });
    rxAplicarEscalaTela('rxPitchScaleWrap', 'rxPitchAtivo', false);
  }

  /**
   * O campinho é construído gigante de propósito (resolução de exportação),
   * mas exibido na tela do site precisa caber numa janela normal -- pedido
   * do Renato (2026-08-20, 2a intervenção): "só metade dele aparece no meu
   * monitor" -- a 1a versão só encolhia pela LARGURA, deixando a altura
   * (que segue a mesma escala) maior que a tela disponível. Agora encolhe
   * pra caber nos DOIS eixos ao mesmo tempo (como uma foto se ajustando
   * numa moldura, nunca maior que o espaço em nenhum dos dois sentidos).
   * Genérica (recebe wrapId/elId) pra servir tanto o confronto individual
   * quanto o campinho geral da rodada -- mesma lógica, pedido explícito.
   * O DOM interno continua no tamanho nativo; só a APARÊNCIA encolhe via
   * transform:scale, então o download (que desliga esse transform antes de
   * capturar, ver rxBaixarImagemDe) sai sempre em resolução cheia.
   */
  function rxAplicarEscalaTela(wrapId, elId, respeitarAltura) {
    const wrap = document.getElementById(wrapId);
    const el = document.getElementById(elId);
    if (!wrap || !el || el.style.display === 'none' || !el.children.length) return;
    // margin:0 auto (CSS) + transform-origin:center não se comportam de
    // forma previsível quando o elemento é MUITO mais largo que o
    // contêiner -- achado real (2026-08-20): o campinho renderizava
    // inteiro fora da tela. transform-origin:top left + margem esquerda
    // calculada manualmente é explícito, sem depender de como o navegador
    // resolve auto-centering nesse caso extremo.
    el.style.margin = '0';
    el.style.transform = 'none';
    const naturalW = el.offsetWidth;
    const naturalH = el.offsetHeight;
    if (!naturalW || !naturalH) return;
    const larguraDisponivel = wrap.clientWidth || naturalW;
    let escala = Math.min(1, larguraDisponivel / naturalW);
    // No confronto individual, respeitar a ALTURA disponível força o card
    // pequeno demais pra ler (achado real, 2026-08-20: 74x102px numa tela
    // 1920x1080) -- a formação usa posição REAL do jogador em 3 faixas
    // (ataque/meio/defesa), então não dá pra comprimir a altura sem
    // sobrepor. "Card legível" venceu "zero rolagem" aqui: ajusta só pela
    // LARGURA, aceita rolar um pouco na vertical. O campinho geral (mais
    // compacto/canônico) continua ajustando nos dois eixos normalmente.
    if (respeitarAltura) {
      const topoWrap = wrap.getBoundingClientRect().top;
      const alturaDisponivel = Math.max(320, window.innerHeight - topoWrap - 24);
      escala = Math.min(escala, alturaDisponivel / naturalH);
    }
    const larguraEscalada = naturalW * escala;
    const margemEsquerda = Math.max(0, (larguraDisponivel - larguraEscalada) / 2);
    el.style.transformOrigin = 'top left';
    el.style.transform = `scale(${escala})`;
    el.style.marginLeft = `${Math.round(margemEsquerda)}px`;
    wrap.style.height = `${Math.round(naturalH * escala)}px`;
  }
  window.addEventListener('resize', () => {
    rxAplicarEscalaTela('rxPitchScaleWrap', 'rxPitchAtivo', false);
    rxAplicarEscalaTela('rxPitchRodadaScaleWrap', 'rxPitchRodada', true);
  });

  /** Modal de card ampliado (clique em qualquer posto do confronto individual) -- monta o card COMPLETO (rxCardUnificado) sob demanda a partir do registro, já que o campinho em si só desenha o resumo. */
  function rxAbrirModalCard(postoEl) {
    const modalId = postoEl.getAttribute('data-rx-modal-id');
    const dados = __rxModalRegistro[modalId];
    if (!dados) return;
    const cardHtmlCompleto = rxCardUnificado(dados.jogador, dados.fotosIds, dados.destaque, dados.cede, dados.janelaLabel);
    let modal = document.getElementById('rxCardModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rxCardModal';
      modal.className = 'rx-card-modal';
      modal.innerHTML = `
        <div class="rx-card-modal-backdrop"></div>
        <div class="rx-card-modal-inner">
          <button type="button" class="rx-card-modal-close" aria-label="Fechar">✕</button>
          <div class="rx-card-modal-content"></div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.rx-card-modal-backdrop').addEventListener('click', rxFecharModalCard);
      modal.querySelector('.rx-card-modal-close').addEventListener('click', rxFecharModalCard);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') rxFecharModalCard(); });
    }
    modal.querySelector('.rx-card-modal-content').innerHTML = cardHtmlCompleto;
    modal.classList.add('rx-card-modal-aberto');
  }
  function rxFecharModalCard() {
    const modal = document.getElementById('rxCardModal');
    if (modal) modal.classList.remove('rx-card-modal-aberto');
  }

  // -----------------------------------------------------------------------
  // Controles + orquestração da view.
  // -----------------------------------------------------------------------
  // Um campinho por vez, largura total -- pedido explícito do Renato depois
  // de ver que lado a lado não deixava a formação real (3 no ataque) caber
  // numa linha só: "a prioridade é o visual premium... esse modelo lado a
  // lado é inaceitável". Guarda os dois resultados já calculados (dado já
  // carregado, cálculo é síncrono e barato) e só troca qual é exibido.
  let __rxUltimoResultado = null; // { A: {...}, B: {...} }
  let __rxLadoAtivo = 'A';

  function rxMostrarLado(lado) {
    if (!__rxUltimoResultado) return;
    __rxLadoAtivo = lado;
    const { teamA, teamB, mandoA, mandoB, rA, rB, fotosIds } = __rxUltimoResultado;
    document.querySelectorAll('.rx-toggle-lado button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lado === lado);
    });
    if (lado === 'A') rxRenderCampinho('rxPitchAtivo', teamA, teamB, rA, fotosIds, mandoA);
    else rxRenderCampinho('rxPitchAtivo', teamB, teamA, rB, fotosIds, mandoB);
  }

  async function rxRefresh() {
    const teamA = document.getElementById('rxTeamASelect').value;
    const teamB = document.getElementById('rxTeamBSelect').value;
    const ultimosN = Math.max(1, Number(document.getElementById('rxWindowCountInput').value) || 5);
    // Filtro de mando simplificado (2026-08-20, pedido do Renato): só 2
    // opções -- mando ATUAL (o real do próximo confronto de A, automático)
    // ou TODOS OS JOGOS (ignora mando). O dropdown de 3 opções antigo
    // ("não filtrar"/casa/fora manuais) deixava escolher combinações sem
    // sentido (ex.: forçar "fora" quando o real é casa).
    const respeitarMando = document.getElementById('rxRespeitarMandoInput').checked;
    const proximoConfronto = respeitarMando ? await rxGetProximoConfronto() : null;
    const mandoA = respeitarMando ? (proximoConfronto[teamA]?.mando || null) : null;
    const emptyEl = document.getElementById('rxEmptyState');
    const pitchAtivo = document.getElementById('rxPitchAtivo');
    const toggleBar = document.getElementById('rxToggleLado');
    const downloadRow = document.getElementById('rxDownloadRow');

    if (!teamA || !teamB || teamA === teamB) {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = teamA === teamB ? 'Escolha dois times diferentes.' : 'Escolha os dois times acima pra ver o Raio X.';
      }
      if (pitchAtivo) pitchAtivo.style.display = 'none';
      if (toggleBar) toggleBar.style.display = 'none';
      if (downloadRow) downloadRow.style.display = 'none';
      __rxUltimoResultado = null;
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const [matchesA, matchesB, provaveis, fotosIds, posicoesGranulares] = await Promise.all([
      rxGetRaioXData(teamA), rxGetRaioXData(teamB), rxGetProvaveis(), rxGetFotosIds(), rxGetPosicoesGranulares(),
    ]);

    const mandoB = mandoA === 'casa' ? 'fora' : mandoA === 'fora' ? 'casa' : null;
    const rA = rxMontarConfronto(matchesA, matchesB, { mandoA, ultimosN, teamAProvaveis: provaveis.teams[teamA], posicoesGranulares });
    const rB = rxMontarConfronto(matchesB, matchesA, { mandoA: mandoB, ultimosN, teamAProvaveis: provaveis.teams[teamB], posicoesGranulares });
    __rxUltimoResultado = { teamA, teamB, mandoA, mandoB, rA, rB, fotosIds };

    if (toggleBar) {
      toggleBar.style.display = '';
      toggleBar.innerHTML = `
        <button type="button" data-lado="A"><img src="${rxEscudoUrl(teamA)}" alt=""> ${rxTeamName(teamA)}</button>
        <button type="button" data-lado="B"><img src="${rxEscudoUrl(teamB)}" alt=""> ${rxTeamName(teamB)}</button>
      `;
      toggleBar.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => rxMostrarLado(btn.dataset.lado));
      });
    }
    if (pitchAtivo) pitchAtivo.style.display = '';
    if (downloadRow) downloadRow.style.display = '';
    rxMostrarLado(__rxLadoAtivo);
  }

  // O site (Mapa de Gols) exporta via SVG->canvas manual porque o campinho
  // ali é desenhado em SVG. O Raio X é HTML/CSS puro (fotos, cards, texto
  // real), então usamos html2canvas pra "fotografar" o DOM em alta escala.
  // scale:3 garante um PNG genuinamente grande em pixels -- o problema que o
  // Renato reportou ("ilegível mesmo com zoom máximo") era o preview do chat
  // reduzindo a imagem que eu mandava por SendUserFile, não o tamanho da
  // fonte; com o download direto ele pega o arquivo real, sem essa perda.
  async function rxBaixarImagemDe(elId, filename, btnId) {
    const btn = document.getElementById(btnId);
    const pitchEl = document.getElementById(elId);
    if (!pitchEl || !window.html2canvas) return;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Gerando imagem...';
    // O campinho de confronto individual é exibido na tela ENCOLHIDO (ver
    // rxAplicarEscalaTela) pra caber numa janela normal -- mas o download
    // sempre precisa da resolução cheia, então desliga o transform antes de
    // capturar e religa depois (a exportação em si nunca deve ficar
    // pequena, só a visualização na tela).
    const escalaOriginal = pitchEl.style.transform;
    if (escalaOriginal) pitchEl.style.transform = 'none';
    try {
      // O elemento em si já é gigante em px reais (campinho construído em
      // milhares de px de largura), então scale alto aqui estoura o limite
      // de área de canvas do navegador e o toDataURL falha silenciosamente,
      // gerando um PNG de 0 bytes (achado real testando com scale:3).
      // scale:1 já produz um arquivo enorme e nítido porque a fonte já é
      // grande.
      const canvas = await window.html2canvas(pitchEl, { scale: 1, backgroundColor: null, useCORS: true });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Falha ao gerar a imagem: ' + (err && err.message ? err.message : 'desconhecida'));
    } finally {
      if (escalaOriginal) pitchEl.style.transform = escalaOriginal;
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  function rxBaixarImagem() {
    if (!__rxUltimoResultado) {
      alert('Nada pra baixar ainda -- escolha os dois times primeiro.');
      return;
    }
    const { teamA, teamB } = __rxUltimoResultado;
    const timeAtivo = __rxLadoAtivo === 'A' ? teamA : teamB;
    const rivalAtivo = __rxLadoAtivo === 'A' ? teamB : teamA;
    rxBaixarImagemDe('rxPitchAtivo', `raio-x-${timeAtivo}-vs-${rivalAtivo}.png`, 'rxDownloadBtn');
  }

  function rxBuildRaioXView() {
    const root = document.getElementById('viewRaioX');
    if (!root) return;
    root.innerHTML = `
      <div class="rx-subnav">
        <button type="button" data-sub="confronto" class="active">Confronto</button>
        <button type="button" data-sub="rodada">Campinho geral da rodada</button>
      </div>
      <div id="rxSubConfronto">
        <div class="rx-controls-bar">
          <label class="rx-control-item">Time A
            <select id="rxTeamASelect"></select>
          </label>
          <label class="rx-control-item">Time B
            <select id="rxTeamBSelect"></select>
          </label>
          <label class="rx-control-item">Últimos jogos
            <input id="rxWindowCountInput" type="number" min="1" max="38" value="5" />
          </label>
          <label class="rx-control-item" style="flex-direction:row;align-items:center;gap:8px">
            <input id="rxRespeitarMandoInput" type="checkbox" checked style="width:16px;height:16px" />
            Mando atual (desmarque p/ todos os jogos)
          </label>
        </div>
        <div class="rx-credito">Escalação provável: provaveisdocartola.com.br</div>
        <div id="rxEmptyState" class="rx-empty">Escolha os dois times acima pra ver o Raio X.</div>
        <div id="rxToggleLado" class="rx-toggle-lado" style="display:none"></div>
        <div id="rxDownloadRow" class="rx-download-row" style="display:none">
          <button id="rxDownloadBtn" type="button" class="rx-download-btn">⤓ Baixar imagem</button>
        </div>
        <div id="rxPitchScaleWrap" class="rx-pitch-scale-wrap">
          <div id="rxPitchAtivo" class="rx-pitch" style="display:none"></div>
        </div>
      </div>
      <div id="rxSubRodada" style="display:none"></div>
    `;
    document.querySelectorAll('.rx-subnav button').forEach((btn) => {
      btn.addEventListener('click', () => rxTrocarSub(btn.dataset.sub));
    });
    document.getElementById('rxDownloadBtn').addEventListener('click', rxBaixarImagem);
    const a = document.getElementById('rxTeamASelect');
    const b = document.getElementById('rxTeamBSelect');
    TEAMS.forEach(([key, name]) => {
      a.appendChild(new Option(name, key));
      b.appendChild(new Option(name, key));
    });
    a.value = 'santos';
    b.value = 'mirassol';

    ['rxTeamASelect', 'rxTeamBSelect', 'rxWindowCountInput', 'rxRespeitarMandoInput'].forEach((id) => {
      document.getElementById(id).addEventListener('change', rxRefresh);
    });
    rxRefresh();
  }

  // -----------------------------------------------------------------------
  // Campinho GERAL DA RODADA — pódio (1º/2º/3º) por posição, cruzando todos
  // os confrontos reais da rodada de uma vez. Critério e modelo visual
  // aprovados pelo Renato (2026-08-19): "Modelo A é disparado o melhor" —
  // um campinho só com a mesma silhueta tática, cada posto com uma pilha de
  // até 3 mini-cards em vez do card premium cheio do confronto individual
  // (aqui são vários jogadores de times diferentes disputando o mesmo
  // posto, não um só).
  // -----------------------------------------------------------------------
  const RX_TIER_LABEL = { 1: 'Cruzamento forte', 2: 'Produção própria', 3: 'Fragilidade do rival' };
  const RX_TIER_MEDALHA = ['🥇', '🥈', '🥉'];

  function rxPodioCard(c, posicao, fotosIds) {
    const cedeGol = (c.cede && c.cede.gol) || 0;
    const cedeAssist = (c.cede && c.cede.assistencia) || 0;
    return `
      <div class="rx-podio-item rx-podio-tier-${c.tier}">
        <div class="rx-podio-medalha">${RX_TIER_MEDALHA[posicao - 1] || posicao + 'º'}</div>
        <div class="rx-podio-foto">${rxFoto(c.jogadorId, c.nome, fotosIds)}</div>
        <div class="rx-podio-info">
          <div class="rx-podio-nome">
            <img class="rx-podio-escudo-mini" src="${rxEscudoUrl(c.timeKey)}" alt="" />
            ${c.nome || '—'}${c.duvida ? ' <span class="rx-duvida-tag-mini">dúvida</span>' : ''}
          </div>
          <div class="rx-podio-vs"><img class="rx-podio-escudo-mini" src="${rxEscudoUrl(c.rivalKey)}" alt="" /> vs ${rxTeamName(c.rivalKey)}</div>
          <div class="rx-podio-tier-label">${RX_TIER_LABEL[c.tier]}</div>
        </div>
        <div class="rx-podio-numeros">
          <div class="rx-podio-num-grupo rx-podio-good"><span>${c.gol || 0}G ${c.assistencia || 0}A</span><span class="rx-podio-num-lbl">produz</span></div>
          <div class="rx-podio-num-grupo rx-podio-bad"><span>${cedeGol}G ${cedeAssist}A</span><span class="rx-podio-num-lbl">rival cede</span></div>
        </div>
      </div>`;
  }

  function rxRenderPostoRodada(balde, candidatos, fotosIds) {
    const coords = RX_R_COORDS[balde];
    const left = RX_R_MARGIN_X + (coords.x / 100) * RX_R_PITCH_W;
    const top = RX_R_MARGIN_Y + (coords.y / 100) * RX_R_PITCH_H;
    const itens = candidatos.slice(0, 3).map((c, i) => rxPodioCard(c, i + 1, fotosIds)).join('');
    return `<div class="rx-posto-rodada" style="left:${left}px;top:${top}px;transform:translate(-50%,-50%)">
      <div class="rx-posto-label">${LABEL_BALDE[balde] || balde}</div>
      <div class="rx-podio-stack">${itens || '<div class="rx-podio-vazio">Sem candidato elegível no recorte.</div>'}</div>
    </div>`;
  }

  let __rxRodadaSubInited = false;
  async function rxRenderRodada(ultimosN, respeitarMando) {
    const root = document.getElementById('rxSubRodada');
    if (!root) return;
    root.innerHTML = '<div class="rx-empty">Calculando a rodada inteira (todos os confrontos reais de uma vez)...</div>';
    const [porBalde, fotosIds] = await Promise.all([rxGetRodada(ultimosN, respeitarMando), rxGetFotosIds()]);
    const postosHtml = RX_R_ORDEM_BALDES.map((balde) => rxRenderPostoRodada(balde, porBalde.get(balde) || [], fotosIds)).join('');
    const janelaLabel = respeitarMando
      ? 'usando o mando real de cada confronto (casa/fora conforme a tabela)'
      : 'últimos jogos gerais de cada time, sem separar casa/fora';
    root.innerHTML = `
      <div class="rx-controls-bar">
        <label class="rx-control-item">Últimos jogos
          <input id="rxRodadaWindowInput" type="number" min="1" max="38" value="${ultimosN}" />
        </label>
        <label class="rx-control-item" style="flex-direction:row;align-items:center;gap:8px">
          <input id="rxRodadaMandoInput" type="checkbox" ${respeitarMando ? 'checked' : ''} style="width:16px;height:16px" />
          Respeitar mando real de cada confronto
        </label>
      </div>
      <div class="rx-credito">Top 3 por posição: 1º cruzamento forte (produção própria + fragilidade do rival), 2º só produção, 3º só fragilidade do rival -- ${janelaLabel}. Escalação provável: provaveisdocartola.com.br</div>
      <div id="rxDownloadRowRodada" class="rx-download-row">
        <button id="rxDownloadBtnRodada" type="button" class="rx-download-btn">⤓ Baixar imagem</button>
      </div>
      <div id="rxPitchRodadaScaleWrap" class="rx-pitch-scale-wrap">
        <div id="rxPitchRodada" class="rx-pitch">
          <div class="rx-pitch-head"><span class="rx-team-name">Campinho geral da rodada</span></div>
          <div class="rx-pitch-sub">melhores oportunidades ofensivas da rodada, por posição</div>
          <div class="rx-pitch-canvas" style="width:${RX_R_CANVAS_W}px;height:${RX_R_CANVAS_H}px">
            <div class="rx-pitch-gramado" style="left:${RX_R_MARGIN_X}px;top:${RX_R_MARGIN_Y}px;width:${RX_R_PITCH_W}px;height:${RX_R_PITCH_H}px">${rxPitchMarkingsSvg()}</div>
            ${postosHtml}
          </div>
        </div>
      </div>
    `;
    rxAplicarEscalaTela('rxPitchRodadaScaleWrap', 'rxPitchRodada', true);
    document.getElementById('rxRodadaWindowInput').addEventListener('change', (e) => {
      const n = Math.max(1, Number(e.target.value) || 5);
      rxRenderRodada(n, respeitarMando);
    });
    document.getElementById('rxRodadaMandoInput').addEventListener('change', (e) => {
      rxRenderRodada(ultimosN, e.target.checked);
    });
    document.getElementById('rxDownloadBtnRodada').addEventListener('click', () => {
      rxBaixarImagemDe('rxPitchRodada', 'raio-x-campinho-geral-rodada.png', 'rxDownloadBtnRodada');
    });
  }

  function rxTrocarSub(sub) {
    document.querySelectorAll('.rx-subnav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.sub === sub));
    document.getElementById('rxSubConfronto').style.display = sub === 'confronto' ? '' : 'none';
    document.getElementById('rxSubRodada').style.display = sub === 'rodada' ? '' : 'none';
    if (sub === 'rodada' && !__rxRodadaSubInited) {
      __rxRodadaSubInited = true;
      rxRenderRodada(5, true);
    }
  }

  window.rxBuildRaioXView = rxBuildRaioXView;
})();
