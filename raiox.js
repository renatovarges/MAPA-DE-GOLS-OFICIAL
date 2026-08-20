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
   * Âncora fixa (x/y) usada só quando a posição de origem conflita com o
   * slot tático do PDC daquele jogo -- sem isso, o card ficaria na posição
   * REAL da formação (ex.: ala direita), mas com o rótulo da posição de
   * origem (ex.: "Ponta Esquerda"), uma contradição visual clara. ZAG fica
   * de fora de propósito: dois zagueiros com a MESMA âncora colidiriam, e
   * esse conflito é raro pra zagueiro/lateral (a posição de origem quase
   * nunca diverge do slot tático pra defensor).
   */
  const RX_ANCORA_CANONICA = {
    'PONTA-ESQ': { x: 18, y: 20 }, 'CENTROAVANTE': { x: 50, y: 10 }, 'PONTA-DIR': { x: 82, y: 20 },
    'MEI': { x: 50, y: 42 },
  };

  /**
   * `p.x`/`p.y` são a posição REAL do jogador no campinho dos prováveis
   * (percentual, já na mesma orientação em pé que usamos aqui: defesa perto
   * de y~70-90, ataque perto de y~10-25) -- guardado desde sempre em
   * data/provaveis.json, só não estava sendo usado. É a fonte de verdade
   * pra "jogador no lugar certo do campo" (pedido explícito do Renato,
   * 2026-08-19, depois de rejeitar o layout em linhas/colunas). SÓ não é
   * confiável quando a posição de origem diverge do slot tático daquele
   * jogo (`ancora` força uma posição fixa nesse caso -- ver
   * RX_ANCORA_CANONICA).
   */
  function rxJogadorComConquista(p, conquistaPorJogador, balde, ancora) {
    const conquista = conquistaPorJogador.get(String(p.id));
    const x = ancora ? ancora.x : p.x;
    const y = ancora ? ancora.y : p.y;
    const base = { jogadorId: String(p.id), balde, duvida: p.sit === 'duvida', x, y };
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

    const postosAtaque = [], postosDefesa = [], candidatosMeio = [];
    for (const p of (teamAProvaveis && teamAProvaveis.players) || []) {
      if (p.isCoach) continue;
      const labelCanonico = posicoesGranulares && posicoesGranulares[String(p.id)];
      const infoSlot = rxInfoDoSlot(p.slot);
      const infoCanonico = labelCanonico && rxInfoDaPosicaoCanonica(labelCanonico);
      // posição de origem tem prioridade; slot do PDC (tático, daquele jogo
      // específico) só entra como fallback pra quem não está no acervo.
      const info = infoCanonico || infoSlot;
      if (!info) continue;
      // conflito real (origem != slot tático daquele jogo, ex.: Vitinho
      // ponta-esquerda de origem, escalado como MEI-R nessa rodada) -- não
      // dá pra confiar no x/y do PDC aqui, ele reflete o slot tático, não a
      // posição de origem que estamos usando pro rótulo/balde.
      const conflito = infoCanonico && (!infoSlot || infoSlot.balde !== infoCanonico.balde);
      const ancora = conflito ? RX_ANCORA_CANONICA[info.balde] : null;
      const jogador = rxJogadorComConquista(p, conquistaA, info.balde, ancora);
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

    return {
      partidasUsadasA: partidasA.length, partidasUsadasB: partidasB.length,
      postosAtaque: anexarCede(postosAtaque), postosMeio: anexarCede(postosMeio), postosDefesa: anexarCede(postosDefesa),
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
        const res = await fetch(`data/posicoes-granulares.json?t=${Date.now()}`, { cache: 'no-store' });
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
        const res = await fetch(`data/fotos-jogadores.json?t=${Date.now()}`, { cache: 'no-store' });
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
      const eventosHtml = cede.eventos.map((ev) => `
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
        <div class="rx-cede-granular">${eventosHtml}</div>`;
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
  const RX_PITCH_W = 4200;
  const RX_PITCH_H = Math.round(RX_PITCH_W * (105 / 68));
  const RX_CARD_W = 480;
  const RX_MARGIN_X = RX_CARD_W / 2 + 70;
  const RX_MARGIN_Y = 260;
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
  function rxRenderPosto(posto, fotosIds, janelaLabel) {
    const jog = posto.jogador;
    const destaque = (jog.gol || 0) >= RX_DESTAQUE_GOL_MINIMO;
    const cardHtml = rxCardUnificado(jog, fotosIds, destaque, posto.cede, janelaLabel);
    const xPct = typeof jog.x === 'number' ? jog.x : 50;
    const yPct = typeof jog.y === 'number' ? jog.y : 50;
    const left = RX_MARGIN_X + (xPct / 100) * RX_PITCH_W;
    const top = RX_MARGIN_Y + (yPct / 100) * RX_PITCH_H;
    // card único, centralizado de verdade na posição real (translate -50%
    // nos dois eixos) -- sem caixa lateral pra desalinhar o conjunto.
    return `<div class="rx-posto" style="left:${left}px;top:${top}px;transform:translate(-50%,-50%)">
      <div class="rx-posto-label">${LABEL_BALDE[posto.balde] || posto.balde}</div>
      ${cardHtml}
    </div>`;
  }

  function rxRenderCampinho(containerId, teamKey, rivalKey, resultado, fotosIds, mandoA) {
    const container = document.getElementById(containerId);
    if (!container) return;
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
      return;
    }
    html += `<div class="rx-pitch-canvas" style="width:${RX_CANVAS_W}px;height:${RX_CANVAS_H}px">`;
    html += `<div class="rx-pitch-gramado" style="left:${RX_MARGIN_X}px;top:${RX_MARGIN_Y}px;width:${RX_PITCH_W}px;height:${RX_PITCH_H}px">${rxPitchMarkingsSvg()}</div>`;
    todosPostos.forEach((posto) => {
      html += rxRenderPosto(posto, fotosIds, janelaLabel);
    });
    html += '</div>';
    container.innerHTML = html;
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
    const mandoA = document.getElementById('rxMandoSelect').value || null;
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
          <label class="rx-control-item">Mando de A no confronto
            <select id="rxMandoSelect">
              <option value="" selected>Não filtrar</option>
              <option value="casa">A joga em casa</option>
              <option value="fora">A joga fora</option>
            </select>
          </label>
        </div>
        <div class="rx-credito">Escalação provável: provaveisdocartola.com.br</div>
        <div id="rxEmptyState" class="rx-empty">Escolha os dois times acima pra ver o Raio X.</div>
        <div id="rxToggleLado" class="rx-toggle-lado" style="display:none"></div>
        <div id="rxDownloadRow" class="rx-download-row" style="display:none">
          <button id="rxDownloadBtn" type="button" class="rx-download-btn">⤓ Baixar imagem</button>
        </div>
        <div id="rxPitchAtivo" class="rx-pitch" style="display:none"></div>
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

    ['rxTeamBSelect', 'rxWindowCountInput', 'rxMandoSelect'].forEach((id) => {
      document.getElementById(id).addEventListener('change', rxRefresh);
    });
    // Time A troca também pré-seleciona o mando REAL dele na próxima rodada
    // (não mais "não filtrar" por padrão, misturando casa/fora -- achado
    // real, 2026-08-19). Usuário ainda pode trocar manualmente depois.
    a.addEventListener('change', rxAplicarMandoPadrao);
    rxAplicarMandoPadrao();
  }

  async function rxAplicarMandoPadrao() {
    const teamA = document.getElementById('rxTeamASelect').value;
    const proximoConfronto = await rxGetProximoConfronto();
    const mandoReal = proximoConfronto[teamA]?.mando;
    if (mandoReal === 'casa' || mandoReal === 'fora') {
      document.getElementById('rxMandoSelect').value = mandoReal;
    }
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
      <div id="rxPitchRodada" class="rx-pitch">
        <div class="rx-pitch-head"><span class="rx-team-name">Campinho geral da rodada</span></div>
        <div class="rx-pitch-sub">melhores oportunidades ofensivas da rodada, por posição</div>
        <div class="rx-pitch-canvas" style="width:${RX_R_CANVAS_W}px;height:${RX_R_CANVAS_H}px">
          <div class="rx-pitch-gramado" style="left:${RX_R_MARGIN_X}px;top:${RX_R_MARGIN_Y}px;width:${RX_R_PITCH_W}px;height:${RX_R_PITCH_H}px">${rxPitchMarkingsSvg()}</div>
          ${postosHtml}
        </div>
      </div>
    `;
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
