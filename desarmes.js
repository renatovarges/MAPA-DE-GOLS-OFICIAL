/*
 * Mapa de Desarmes e Perda de Posse + Líderes — arquivo isolado (IIFE),
 * carregado por cima do script.js do Mapa de Gols sem tocar nele. Todo
 * identificador aqui é prefixado com "dsm"/"Dsm" pra nunca colidir com o
 * que já existe (ex: já existe um `function el(...)` no script.js
 * principal, com assinatura diferente da nossa).
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
  function dsmTeamName(key) {
    const found = TEAMS.find(([k]) => k === key);
    return found ? found[1] : key;
  }

  function dsmEl(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  }

  // ---------------------------------------------------------------------
  // Dado compartilhado (times, jogadores, perfis) — carregado uma vez.
  // ---------------------------------------------------------------------
  let __dsmPlayersByIdCache = null;
  async function dsmGetPlayersById() {
    if (__dsmPlayersByIdCache) return __dsmPlayersByIdCache;
    try {
      const res = await fetch('/api/jogadores');
      const data = await res.json();
      __dsmPlayersByIdCache = new Map((data.jogadores || []).map(p => [String(p.id), p]));
    } catch (err) {
      console.warn('[desarmes] Não foi possível carregar jogadores.', err);
      __dsmPlayersByIdCache = new Map();
    }
    return __dsmPlayersByIdCache;
  }

  let __dsmPerfisByIdCache = null;
  async function dsmGetPerfisById() {
    if (__dsmPerfisByIdCache) return __dsmPerfisByIdCache;
    try {
      const res = await fetch(`data/perfis-jogadores.json?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      __dsmPerfisByIdCache = new Map((data || []).map(p => [String(p.jogadorId), p]));
    } catch (err) {
      console.warn('[desarmes] Não foi possível carregar perfis de jogadores.', err);
      __dsmPerfisByIdCache = new Map();
    }
    return __dsmPerfisByIdCache;
  }

  let __dsmProximoConfrontoCache = null;
  /** mando do próximo confronto de cada time — {teamKey: {mando:'casa'|'fora', adversario, data, rodada}}. */
  async function dsmGetProximoConfronto() {
    if (__dsmProximoConfrontoCache) return __dsmProximoConfrontoCache;
    try {
      const res = await fetch(`data/proximo-confronto.json?t=${Date.now()}`, { cache: 'no-store' });
      __dsmProximoConfrontoCache = await res.json();
    } catch (err) {
      console.warn('[desarmes] Não foi possível carregar próximo confronto.', err);
      __dsmProximoConfrontoCache = {};
    }
    return __dsmProximoConfrontoCache;
  }

  const __dsmTeamMatchesCache = new Map();
  /** todas as partidas (com data) de um time, ordenadas — cache simples, sem expiração (recarrega a cada load da página). */
  async function dsmGetTeamMatches(teamKey) {
    if (__dsmTeamMatchesCache.has(teamKey)) return __dsmTeamMatchesCache.get(teamKey);
    const promise = (async () => {
      try {
        const res = await fetch(`data/desarmes/${teamKey}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        const teamData = await res.json();
        const matches = Object.values(teamData.matches || {});
        matches.sort((a, b) => {
          const dA = a.date ? String(a.date).trim() : '';
          const dB = b.date ? String(b.date).trim() : '';
          if (dA && dB) return dA < dB ? -1 : (dA > dB ? 1 : 0);
          if (dA && !dB) return 1;
          if (!dA && dB) return -1;
          return 0;
        });
        return matches;
      } catch (err) {
        console.warn(`[desarmes] Não foi possível carregar desarmes (${teamKey}).`, err);
        return [];
      }
    })();
    __dsmTeamMatchesCache.set(teamKey, promise);
    return promise;
  }

  async function dsmGetTeamDesarmesData(teamKey, { homeFilter = null, count = 5 } = {}) {
    let matches = await dsmGetTeamMatches(teamKey);
    if (homeFilter != null) {
      const wantHome = Boolean(homeFilter);
      matches = matches.filter(m => Boolean(m.home) === wantHome);
    }
    const selected = matches.slice(Math.max(0, matches.length - count));
    let recoveries = [];
    let losses = [];
    selected.forEach(m => {
      if (Array.isArray(m.recuperacoes)) recoveries = recoveries.concat(m.recuperacoes);
      if (Array.isArray(m.perdas)) losses = losses.concat(m.perdas);
    });
    return { recoveries, losses, gamesUsed: selected.length };
  }

  function dsmFormatPosicaoLabel(p) {
    if (!p) return '';
    return String(p).split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ');
  }

  // ---------------------------------------------------------------------
  // Aba Desarmes — campinho de confronto (chalkboard + cruzamento).
  // ---------------------------------------------------------------------

  function dsmBuildRosterFromEvents(events, playersMap) {
    const byId = new Map();
    events.forEach(ev => {
      const key = ev.jogadorId;
      if (!byId.has(key)) {
        const p = playersMap.get(String(key));
        byId.set(key, {
          jogadorId: key,
          nome: p ? (p.apelido || p.nome_completo || `Jogador #${key}`) : `Jogador #${key}`,
          posicao: dsmFormatPosicaoLabel(ev.posicao),
          count: 0,
        });
      }
      byId.get(key).count++;
    });
    return Array.from(byId.values()).sort((a, b) => b.count - a.count);
  }

  /** Espelha o quadrante em 180° (defesa<->ataque E esquerda<->direita) — ver handoff 2026-08-12. */
  function dsmMirrorQuadrante(q) {
    if (!Number.isInteger(q) || q < 1 || q > 36) return q;
    return 37 - q;
  }

  function dsmQuadranteToXY(q) {
    const cellW = 96 / 6, cellH = 68 / 6;
    if (!Number.isInteger(q) || q < 1 || q > 36) return { x: 48, y: 34 };
    const col = Math.ceil(q / 6);
    const row = ((q - 1) % 6) + 1;
    const x = (col - 1) * cellW + cellW * 0.15 + Math.random() * cellW * 0.7;
    const y = (row - 1) * cellH + cellH * 0.15 + Math.random() * cellH * 0.7;
    return { x, y };
  }

  function dsmZonaOf(q) {
    if (!Number.isInteger(q) || q < 1 || q > 36) return null;
    const col = Math.ceil(q / 6);
    const row = ((q - 1) % 6) + 1;
    const zonaCol = Math.ceil(col / 2);
    const zonaRow = Math.ceil(row / 3);
    return (zonaCol - 1) * 2 + zonaRow;
  }
  function dsmZonaBBox(z) {
    const zonaCol = Math.floor((z - 1) / 2) + 1;
    const zonaRow = ((z - 1) % 2) + 1;
    const w = 96 / 3, h = 68 / 2;
    return { x: (zonaCol - 1) * w, y: (zonaRow - 1) * h, w, h };
  }

  const DSM_MIN_EVENTOS_ZONA = 3;
  function dsmCandidatosCruzamento(recEvents, lossEvents, perfisMap) {
    const candidatos = [];
    for (let z = 1; z <= 6; z++) {
      const porJogadorRec = new Map();
      recEvents.forEach(ev => {
        if (dsmZonaOf(ev.quadrante) !== z) return;
        porJogadorRec.set(ev.jogadorId, (porJogadorRec.get(ev.jogadorId) || 0) + 1);
      });
      let topRec = null;
      porJogadorRec.forEach((count, jogadorId) => { if (!topRec || count > topRec.count) topRec = { jogadorId, count }; });

      const porJogadorLoss = new Map();
      lossEvents.forEach(ev => {
        if (dsmZonaOf(dsmMirrorQuadrante(ev.quadrante)) !== z) return;
        porJogadorLoss.set(ev.jogadorId, (porJogadorLoss.get(ev.jogadorId) || 0) + 1);
      });
      let topLoss = null;
      porJogadorLoss.forEach((count, jogadorId) => { if (!topLoss || count > topLoss.count) topLoss = { jogadorId, count }; });

      if (!topRec || topRec.count < DSM_MIN_EVENTOS_ZONA || !topLoss || topLoss.count < DSM_MIN_EVENTOS_ZONA) continue;

      const perfRec = perfisMap.get(String(topRec.jogadorId));
      const perfLoss = perfisMap.get(String(topLoss.jogadorId));
      const notavelRec = Boolean(perfRec && perfRec.notavelDesarmador);
      const notavelLoss = Boolean(perfLoss && perfLoss.notavelPerdedor);
      if (!notavelRec && !notavelLoss) continue;

      candidatos.push({
        zona: z,
        recuperadorId: topRec.jogadorId, recCount: topRec.count, notavelRec,
        perdedorId: topLoss.jogadorId, perdCount: topLoss.count, notavelLoss,
      });
    }
    return candidatos;
  }

  function dsmDrawPitchMarkings(svg) {
    svg.appendChild(dsmEl('rect', { x: 0, y: 0, width: 96, height: 68, fill: 'none', stroke: '#ffffff', 'stroke-opacity': .45, 'stroke-width': .4 }));
    svg.appendChild(dsmEl('line', { x1: 48, y1: 0, x2: 48, y2: 68, stroke: '#ffffff', 'stroke-opacity': .4, 'stroke-width': .35 }));
    svg.appendChild(dsmEl('circle', { cx: 48, cy: 34, r: 8, fill: 'none', stroke: '#ffffff', 'stroke-opacity': .4, 'stroke-width': .35 }));
    [0, 96].forEach((side) => {
      svg.appendChild(dsmEl('rect', { x: side === 0 ? 0 : 96 - 15, y: 14, width: 15, height: 40, fill: 'none', stroke: '#ffffff', 'stroke-opacity': .4, 'stroke-width': .35 }));
      svg.appendChild(dsmEl('rect', { x: side === 0 ? 0 : 96 - 5, y: 25, width: 5, height: 18, fill: 'none', stroke: '#ffffff', 'stroke-opacity': .4, 'stroke-width': .35 }));
      svg.appendChild(dsmEl('rect', { x: side === 0 ? -2 : 96, y: 31, width: 2, height: 6, fill: 'none', stroke: '#ffffff', 'stroke-opacity': .55, 'stroke-width': .35 }));
    });
  }

  function dsmShowTooltip(evt, html, kind) {
    evt.stopPropagation();
    const tip = document.getElementById('dsmTooltip');
    if (!tip) return;
    tip.className = kind;
    tip.innerHTML = html;
    tip.style.display = 'block';
    const pad = 14;
    tip.style.left = (evt.clientX + pad) + 'px';
    tip.style.top = (evt.clientY + pad) + 'px';
    requestAnimationFrame(() => {
      const r = tip.getBoundingClientRect();
      if (r.right > window.innerWidth) tip.style.left = Math.max(4, evt.clientX - r.width - pad) + 'px';
      if (r.bottom > window.innerHeight) tip.style.top = Math.max(4, evt.clientY - r.height - pad) + 'px';
    });
  }
  document.addEventListener('click', () => {
    const tip = document.getElementById('dsmTooltip');
    if (tip) tip.style.display = 'none';
  });

  function dsmStarPoints(cx, cy, outerR, innerR) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  function dsmRenderConfronto(containerId, teamRecName, teamLossName, recEvents, lossEvents, playersMap, perfisMap, gamesUsedRec, gamesUsedLoss) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.display = '';

    const rosterRec = dsmBuildRosterFromEvents(recEvents, playersMap);
    const rosterLoss = dsmBuildRosterFromEvents(lossEvents, playersMap);
    const recById = new Map(rosterRec.map(p => [p.jogadorId, p]));
    const lossById = new Map(rosterLoss.map(p => [p.jogadorId, p]));

    function nomeDe(jogadorId) {
      const p = playersMap.get(String(jogadorId));
      return p ? (p.apelido || p.nome_completo || `Jogador #${jogadorId}`) : `Jogador #${jogadorId}`;
    }
    function abreviarNome(nomeCompleto) {
      const partes = String(nomeCompleto).trim().split(/\s+/);
      if (partes.length <= 1) return partes[0].toUpperCase();
      return `${partes[0][0]}. ${partes[partes.length - 1]}`.toUpperCase();
    }
    function fitTextToWidth(textEl, maxWidth, { min = 1.3, max = 2.5, step = 0.1 } = {}) {
      let size = max;
      textEl.setAttribute('font-size', size);
      while (size > min && textEl.getBBox().width > maxWidth) {
        size = Math.round((size - step) * 10) / 10;
        textEl.setAttribute('font-size', size);
      }
      return size;
    }

    container.innerHTML = `
      <div class="dsm-confronto-head-row2">
        <button type="button" class="dsm-cruzamento-toggle" id="${containerId}-cruzamento-btn">Ver cruzamentos</button>
      </div>
      <div class="dsm-orient"><span>defesa</span><span class="dsm-arrow">→</span><span>ataque (${teamRecName})</span></div>
      <div class="dsm-board">
        <div class="dsm-plist-wrap">
          <div class="dsm-plist-title dsm-title-rec">Desarmes ${teamRecName}</div>
          <div class="dsm-plist" id="${containerId}-rec"></div>
        </div>
        <div class="dsm-pitch-wrap"><svg id="${containerId}-svg" viewBox="-3 -3 102 74" xmlns="http://www.w3.org/2000/svg"></svg></div>
        <div class="dsm-plist-wrap">
          <div class="dsm-plist-title dsm-title-loss">Perda de posse ${teamLossName}</div>
          <div class="dsm-plist" id="${containerId}-loss"></div>
        </div>
      </div>
    `;

    if (!recEvents.length && !lossEvents.length) {
      const board = container.querySelector('.dsm-board');
      if (board) board.insertAdjacentHTML('afterend', '<div class="dsm-empty" style="margin-top:8px">Sem dado suficiente ainda pra esse recorte (mude "Últimos jogos"/"Mando" ou aguarde mais partidas serem coletadas).</div>');
    }

    const svg = document.getElementById(`${containerId}-svg`);
    const defs = dsmEl('defs', {});
    const filtro = dsmEl('filter', { id: `${containerId}-glow`, x: '-60%', y: '-60%', width: '220%', height: '220%' });
    filtro.appendChild(dsmEl('feGaussianBlur', { stdDeviation: 1.6, result: 'blur' }));
    defs.appendChild(filtro);
    svg.appendChild(defs);
    dsmDrawPitchMarkings(svg);
    const recLayer = dsmEl('g', {});
    const lossLayer = dsmEl('g', {});
    const zonaLayer = dsmEl('g', { style: 'display:none' });
    svg.appendChild(recLayer);
    svg.appendChild(lossLayer);
    svg.appendChild(zonaLayer);

    recEvents.forEach(ev => { if (!ev.__xy) ev.__xy = dsmQuadranteToXY(ev.quadrante); });
    lossEvents.forEach(ev => { if (!ev.__xy) ev.__xy = dsmQuadranteToXY(dsmMirrorQuadrante(ev.quadrante)); });

    const visRec = new Set(rosterRec.map(p => p.jogadorId));
    const visLoss = new Set(rosterLoss.map(p => p.jogadorId));

    function renderDots() {
      recLayer.innerHTML = '';
      recEvents.forEach(ev => {
        if (!visRec.has(ev.jogadorId)) return;
        const dot = dsmEl('circle', { class: 'dsm-dot', cx: ev.__xy.x, cy: ev.__xy.y, r: 1.05, fill: 'var(--gold)', 'fill-opacity': .88, stroke: '#4a3a00', 'stroke-width': .15 });
        dot.addEventListener('click', (e) => {
          const p = recById.get(ev.jogadorId);
          const fundamentoLbl = ev.fundamento === 'interceptacao' ? 'Interceptação' : 'Desarme';
          dsmShowTooltip(e, `<b>${fundamentoLbl}</b>${teamRecName} — ${p ? p.nome : ('#' + ev.jogadorId)}${p && p.posicao ? ' · ' + p.posicao : ''}`, 'gold');
        });
        recLayer.appendChild(dot);
      });
      lossLayer.innerHTML = '';
      lossEvents.forEach(ev => {
        if (!visLoss.has(ev.jogadorId)) return;
        const dot = dsmEl('circle', { class: 'dsm-dot', cx: ev.__xy.x, cy: ev.__xy.y, r: 1.05, fill: 'var(--dsm-blue)', 'fill-opacity': .88, stroke: '#00294a', 'stroke-width': .15 });
        dot.addEventListener('click', (e) => {
          const p = lossById.get(ev.jogadorId);
          dsmShowTooltip(e, `<b>Perda de posse</b>${teamLossName} — ${p ? p.nome : ('#' + ev.jogadorId)}${p && p.posicao ? ' · ' + p.posicao : ''}`, 'blue');
        });
        lossLayer.appendChild(dot);
      });
    }

    function renderList(elId, roster, visSet, color, redraw) {
      const box = document.getElementById(elId);
      if (!box) return;
      box.innerHTML = `<div class="dsm-plist-head"><span>Jogadores</span><button data-act="toggleall">selecionar/limpar</button></div><ul></ul>`;
      const ul = box.querySelector('ul');
      roster.forEach(p => {
        const li = document.createElement('li');
        li.className = visSet.has(p.jogadorId) ? '' : 'off';
        li.innerHTML = `<span class="dsm-bullet" style="background:${color}"></span><span class="dsm-pname" title="${p.nome}${p.posicao ? ' · ' + p.posicao : ''}">${p.nome}</span><span class="dsm-pcount">${p.count}</span>`;
        li.addEventListener('click', () => {
          if (visSet.has(p.jogadorId)) visSet.delete(p.jogadorId); else visSet.add(p.jogadorId);
          li.className = visSet.has(p.jogadorId) ? '' : 'off';
          redraw();
        });
        ul.appendChild(li);
      });
      box.querySelector('[data-act="toggleall"]').addEventListener('click', () => {
        const allOn = roster.every(p => visSet.has(p.jogadorId));
        roster.forEach(p => { if (allOn) visSet.delete(p.jogadorId); else visSet.add(p.jogadorId); });
        renderList(elId, roster, visSet, color, redraw);
        redraw();
      });
    }

    renderList(`${containerId}-rec`, rosterRec, visRec, 'var(--gold)', renderDots);
    renderList(`${containerId}-loss`, rosterLoss, visLoss, 'var(--dsm-blue)', renderDots);
    renderDots();

    const candidatos = dsmCandidatosCruzamento(recEvents, lossEvents, perfisMap);

    function renderZonas() {
      zonaLayer.innerHTML = '';
      if (!candidatos.length) {
        const t = dsmEl('text', { x: 48, y: 34, fill: '#eafff2', 'font-size': 3.4, 'text-anchor': 'middle', 'fill-opacity': .85 });
        t.textContent = 'Nenhum cruzamento com jogador de destaque nesse recorte.';
        zonaLayer.appendChild(t);
        return;
      }
      candidatos.forEach(c => {
        const bbox = dsmZonaBBox(c.zona);
        const pad = 1.2;
        const g = dsmEl('g', { class: 'dsm-zona-highlight' });

        g.appendChild(dsmEl('rect', {
          x: bbox.x + pad, y: bbox.y + pad, width: bbox.w - pad * 2, height: bbox.h - pad * 2, rx: 3,
          fill: 'rgba(255,210,77,.16)', filter: `url(#${containerId}-glow)`,
        }));
        g.appendChild(dsmEl('rect', {
          x: bbox.x + pad, y: bbox.y + pad, width: bbox.w - pad * 2, height: bbox.h - pad * 2, rx: 3,
          fill: 'none', stroke: '#ffe082', 'stroke-width': .35, 'stroke-opacity': .85,
        }));
        const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h * 0.3;
        g.appendChild(dsmEl('circle', { class: 'dsm-zona-badge-pulse', cx, cy, r: 4.6, fill: '#ffe082', 'fill-opacity': .18 }));
        g.appendChild(dsmEl('circle', { cx, cy, r: 3.0, fill: '#3a2e00', stroke: '#ffe082', 'stroke-width': .25 }));
        g.appendChild(dsmEl('polygon', { points: dsmStarPoints(cx, cy, 2.2, 0.95), fill: '#FFD24D', stroke: '#B8860B', 'stroke-width': .18 }));

        const linha1 = abreviarNome(nomeDe(c.recuperadorId));
        const linha2 = `× ${abreviarNome(nomeDe(c.perdedorId))}`;
        const maxWidth = bbox.w - pad * 2 - 2;

        const t1 = dsmEl('text', { x: cx, y: cy + 6.4, fill: '#fff8e6', 'font-weight': 800, 'text-anchor': 'middle', 'letter-spacing': '.01em' });
        t1.textContent = linha1;
        g.appendChild(t1);
        const t2 = dsmEl('text', { x: cx, y: cy + 6.4, fill: '#fff8e6', 'font-weight': 800, 'text-anchor': 'middle', 'letter-spacing': '.01em' });
        t2.textContent = linha2;
        g.appendChild(t2);

        const fontSize = Math.min(fitTextToWidth(t1, maxWidth), fitTextToWidth(t2, maxWidth));
        t1.setAttribute('font-size', fontSize);
        t2.setAttribute('font-size', fontSize);
        const lineGap = fontSize * 1.3;
        t1.setAttribute('y', cy + 6.4);
        t2.setAttribute('y', cy + 6.4 + lineGap);

        g.addEventListener('click', (e) => {
          const nomeRec = nomeDe(c.recuperadorId);
          const nomeLoss = nomeDe(c.perdedorId);
          const taxaRec = (c.recCount / (gamesUsedRec || 1)).toFixed(1);
          const taxaLoss = (c.perdCount / (gamesUsedLoss || 1)).toFixed(1);
          dsmShowTooltip(e, `<b>Cruzamento</b>${nomeRec} faz ${taxaRec} desarmes/interceptações por jogo nessa região (últimos ${gamesUsedRec} jogo${gamesUsedRec === 1 ? '' : 's'} do ${teamRecName}).<br>Tende a cruzar com ${nomeLoss}, que perde a bola ${taxaLoss} vezes por jogo aqui (últimos ${gamesUsedLoss} jogo${gamesUsedLoss === 1 ? '' : 's'} do ${teamLossName}).`, 'gold');
        });
        zonaLayer.appendChild(g);
      });
    }

    let zonasRenderizadas = false;
    const btn = document.getElementById(`${containerId}-cruzamento-btn`);
    let modoCruzamento = false;
    btn.addEventListener('click', () => {
      modoCruzamento = !modoCruzamento;
      btn.classList.toggle('active', modoCruzamento);
      btn.textContent = modoCruzamento ? 'Ver bolinhas' : 'Ver cruzamentos';
      recLayer.style.display = modoCruzamento ? 'none' : '';
      lossLayer.style.display = modoCruzamento ? 'none' : '';
      zonaLayer.style.display = modoCruzamento ? '' : 'none';
      if (modoCruzamento && !zonasRenderizadas) {
        renderZonas();
        zonasRenderizadas = true;
      }
    });
  }

  let __dsmRefreshInFlight = null;
  async function dsmRefreshSection() {
    const emptyEl = document.getElementById('dsmEmptyState');
    const confA = document.getElementById('dsmConfrontoA');
    const confB = document.getElementById('dsmConfrontoB');

    const teamA = document.getElementById('dsmTeamASelect').value;
    const teamB = document.getElementById('dsmTeamBSelect').value;
    const count = Math.max(1, Number(document.getElementById('dsmWindowCountInput').value) || 5);
    const mando = document.getElementById('dsmMandoSelect').value;

    if (!teamA || !teamB || teamA === teamB) {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = teamA === teamB ? 'Escolha dois times diferentes.' : 'Escolha os dois times acima pra ver o mapa.';
      }
      if (confA) confA.style.display = 'none';
      if (confB) confB.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const runId = Symbol('refresh');
    __dsmRefreshInFlight = runId;

    const homeFilterA = (mando === 'mando') ? true : null;
    const homeFilterB = (mando === 'mando') ? false : null;

    const [dataA, dataB, playersMap, perfisMap] = await Promise.all([
      dsmGetTeamDesarmesData(teamA, { homeFilter: homeFilterA, count }),
      dsmGetTeamDesarmesData(teamB, { homeFilter: homeFilterB, count }),
      dsmGetPlayersById(),
      dsmGetPerfisById(),
    ]);

    if (__dsmRefreshInFlight !== runId) return;

    const nameA = dsmTeamName(teamA);
    const nameB = dsmTeamName(teamB);

    dsmRenderConfronto('dsmConfrontoA', nameA, nameB, dataA.recoveries, dataB.losses, playersMap, perfisMap, dataA.gamesUsed, dataB.gamesUsed);
    dsmRenderConfronto('dsmConfrontoB', nameB, nameA, dataB.recoveries, dataA.losses, playersMap, perfisMap, dataB.gamesUsed, dataA.gamesUsed);
  }

  function dsmBuildDesarmesView() {
    const root = document.getElementById('viewDesarmes');
    if (!root) return;
    root.innerHTML = `
      <div class="dsm-controls-bar">
        <label class="dsm-control-item">Time A
          <select id="dsmTeamASelect"></select>
        </label>
        <label class="dsm-control-item">Time B
          <select id="dsmTeamBSelect"></select>
        </label>
        <label class="dsm-control-item">Últimos jogos
          <input id="dsmWindowCountInput" type="number" min="1" max="38" value="5" />
        </label>
        <label class="dsm-control-item">Mando
          <select id="dsmMandoSelect">
            <option value="geral" selected>Todos os jogos</option>
            <option value="mando">Mesmo mando do confronto (A em casa / B fora)</option>
          </select>
        </label>
      </div>
      <div id="dsmEmptyState" class="dsm-empty">Escolha os dois times acima pra ver o mapa.</div>
      <div id="dsmConfrontoA" class="dsm-confronto" style="display:none"></div>
      <div id="dsmConfrontoB" class="dsm-confronto" style="display:none"></div>
      <div id="dsmTooltip"></div>
    `;
    const a = document.getElementById('dsmTeamASelect');
    const b = document.getElementById('dsmTeamBSelect');
    TEAMS.forEach(([key, name]) => {
      a.appendChild(new Option(name, key));
      b.appendChild(new Option(name, key));
    });
    a.value = 'palmeiras';
    b.value = 'flamengo';

    ['dsmTeamASelect', 'dsmTeamBSelect', 'dsmWindowCountInput', 'dsmMandoSelect'].forEach(id => {
      document.getElementById(id).addEventListener('change', dsmRefreshSection);
    });
    dsmRefreshSection();
  }

  // ---------------------------------------------------------------------
  // Aba Líderes — ranking geral de desarme/interceptação e perda de posse,
  // filtrando por time (ou todos) e por janela de últimos N jogos.
  // ---------------------------------------------------------------------

  /**
   * `mando`: 'geral' | 'casa' | 'fora' | 'rodada-atual'. "rodada-atual" usa
   * o mando do PRÓXIMO confronto de cada time (dado próprio, ver
   * build_proximo_confronto.mjs) — cada time entra com seu próprio
   * casa/fora, não é um valor único pra todos (times diferentes podem ter
   * o próximo jogo em mandos diferentes).
   */
  async function dsmResolverHomeFilter(teamKey, mando, proximoConfronto) {
    if (mando === 'casa') return true;
    if (mando === 'fora') return false;
    if (mando === 'rodada-atual') {
      const info = proximoConfronto[teamKey];
      if (!info) return null; // sem próximo jogo conhecido pra esse time — cai pra "geral" nesse time específico
      return info.mando === 'casa';
    }
    return null; // geral
  }

  async function dsmComputeLideres({ teamKeys, count, mando }) {
    const teamsToScan = (teamKeys && teamKeys.length) ? teamKeys : TEAMS.map(([k]) => k);
    const [proximoConfronto, playersMap] = await Promise.all([
      mando === 'rodada-atual' ? dsmGetProximoConfronto() : Promise.resolve({}),
      dsmGetPlayersById(),
    ]);
    const perTeamData = await Promise.all(
      teamsToScan.map(async (k) => {
        const homeFilter = await dsmResolverHomeFilter(k, mando, proximoConfronto);
        return { teamKey: k, data: await dsmGetTeamDesarmesData(k, { count, homeFilter }) };
      })
    );

    const porJogadorRec = new Map(); // jogadorId -> { count, posicao, teamKey, gamesUsed }
    const porJogadorLoss = new Map();

    for (const { teamKey: tk, data } of perTeamData) {
      if (!data.gamesUsed) continue;
      for (const ev of data.recoveries) {
        const k = ev.jogadorId;
        if (!porJogadorRec.has(k)) porJogadorRec.set(k, { count: 0, posicao: ev.posicao, teamKey: tk, gamesUsed: data.gamesUsed });
        porJogadorRec.get(k).count++;
      }
      for (const ev of data.losses) {
        const k = ev.jogadorId;
        if (!porJogadorLoss.has(k)) porJogadorLoss.set(k, { count: 0, posicao: ev.posicao, teamKey: tk, gamesUsed: data.gamesUsed });
        porJogadorLoss.get(k).count++;
      }
    }

    function nomeDe(jogadorId) {
      const p = playersMap.get(String(jogadorId));
      return p ? (p.apelido || p.nome_completo || `Jogador #${jogadorId}`) : `Jogador #${jogadorId}`;
    }

    function toRankedList(mapa) {
      return Array.from(mapa.entries())
        .map(([jogadorId, v]) => ({
          jogadorId, nome: nomeDe(jogadorId), posicao: dsmFormatPosicaoLabel(v.posicao),
          teamName: dsmTeamName(v.teamKey), count: v.count, gamesUsed: v.gamesUsed,
          taxa: v.count / v.gamesUsed,
        }))
        .sort((a, b) => b.taxa - a.taxa)
        .slice(0, 20);
    }

    return { desarmadores: toRankedList(porJogadorRec), perdedores: toRankedList(porJogadorLoss) };
  }

  function dsmRenderLideresList(elId, lista) {
    const ul = document.getElementById(elId);
    if (!ul) return;
    if (!lista.length) {
      ul.innerHTML = '<li style="border:none;color:var(--dsm-ink-dim)">Sem dado suficiente pra esse recorte.</li>';
      return;
    }
    ul.innerHTML = lista.map(j => `
      <li>
        <span class="dsm-l-name" title="${j.nome}${j.posicao ? ' · ' + j.posicao : ''} · ${j.teamName}">${j.nome}</span>
        <span class="dsm-l-meta">${j.posicao || ''}${j.posicao ? ' · ' : ''}${j.teamName}</span>
        <span class="dsm-l-rate">${j.taxa.toFixed(1)}/j</span>
      </li>
    `).join('');
  }

  let __dsmLideresRefreshInFlight = null;
  async function dsmRefreshLideres() {
    const checks = Array.from(document.querySelectorAll('#dsmLideresTeamChecks input[type=checkbox]:checked'));
    const teamKeys = checks.map(c => c.value);
    const count = Math.max(1, Number(document.getElementById('dsmLideresWindowInput').value) || 5);
    const mando = document.getElementById('dsmLideresMandoSelect').value;

    const runId = Symbol('lideres-refresh');
    __dsmLideresRefreshInFlight = runId;

    if (!teamKeys.length) {
      dsmRenderLideresList('dsmLideresDesarmeList', []);
      dsmRenderLideresList('dsmLideresPerdaList', []);
      return;
    }

    const { desarmadores, perdedores } = await dsmComputeLideres({ teamKeys, count, mando });
    if (__dsmLideresRefreshInFlight !== runId) return;

    dsmRenderLideresList('dsmLideresDesarmeList', desarmadores);
    dsmRenderLideresList('dsmLideresPerdaList', perdedores);
  }

  function dsmBuildLideresView() {
    const root = document.getElementById('viewLideres');
    if (!root) return;
    root.innerHTML = `
      <div class="dsm-controls-bar">
        <div class="dsm-control-item" style="min-width:280px">
          Times
          <div class="dsm-checkbox-panel" id="dsmLideresTeamChecks">
            <div class="dsm-checkbox-panel-head">
              <button type="button" data-act="all">todos</button>
              <button type="button" data-act="none">nenhum</button>
            </div>
          </div>
        </div>
        <label class="dsm-control-item">Mando
          <select id="dsmLideresMandoSelect">
            <option value="geral" selected>Geral</option>
            <option value="casa">Casa</option>
            <option value="fora">Fora</option>
            <option value="rodada-atual">Rodada atual (próximo jogo)</option>
          </select>
        </label>
        <label class="dsm-control-item">Últimos jogos
          <input id="dsmLideresWindowInput" type="number" min="1" max="38" value="5" />
        </label>
      </div>
      <div class="dsm-lideres-cols">
        <div class="dsm-lideres-col dsm-col-rec">
          <h3>Líderes em desarmes/interceptações</h3>
          <ul class="dsm-lideres-list" id="dsmLideresDesarmeList"></ul>
        </div>
        <div class="dsm-lideres-col dsm-col-loss">
          <h3>Líderes em perda de posse</h3>
          <ul class="dsm-lideres-list" id="dsmLideresPerdaList"></ul>
        </div>
      </div>
    `;

    const panel = document.getElementById('dsmLideresTeamChecks');
    TEAMS.forEach(([key, name]) => {
      const label = document.createElement('label');
      label.className = 'dsm-checkbox-item';
      label.innerHTML = `<input type="checkbox" value="${key}" checked /> ${name}`;
      panel.appendChild(label);
    });
    panel.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) dsmRefreshLideres(); });
    panel.querySelector('[data-act="all"]').addEventListener('click', () => {
      panel.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = true; });
      dsmRefreshLideres();
    });
    panel.querySelector('[data-act="none"]').addEventListener('click', () => {
      panel.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; });
      dsmRefreshLideres();
    });

    ['dsmLideresMandoSelect', 'dsmLideresWindowInput'].forEach(id => {
      document.getElementById(id).addEventListener('change', dsmRefreshLideres);
    });
    dsmRefreshLideres();
  }

  // ---------------------------------------------------------------------
  // Aba Finalizações — mesma estrutura visual do Desarmes (chalkboard +
  // lista de jogadores), mas usando data/finalizacoes/{time}.json: TODA
  // finalização da temporada (não só gol), "criadas" x "sofridas". A zona
  // aqui já vem em coordenada real (x,y) calibrada pelo harvester de gols,
  // não quadrante — e "sofridas" já vem espelhada (rotate180) de fábrica
  // pelo próprio harvester, então não precisa mirror nenhum aqui (diferente
  // do Desarmes, que precisa mirrorQuadrante no cliente).
  // ---------------------------------------------------------------------

  const DSM_CATEGORIAS_CHUTE = [
    ['gol', 'Virou gol'], ['fora', 'Pra fora'], ['trave', 'Na trave'],
    ['bloqueada', 'Bloqueada'], ['defendida', 'Defendida'],
  ];

  /**
   * "Virou gol" (categoria "gol") já significa especificamente o chute que
   * resultou em gol — confirmado com dado real (todo chute com imgShots=
   * ball2.png tinha goal:true, 22/22 numa amostra de 219). Não é "chute a
   * gol" no sentido amplo (que incluiria "defendida" também, já que ambos
   * foram no alvo) — por isso o rótulo evita a palavra ambígua "Gol"
   * sozinha (pedido do Renato, 2026-08-14).
   */

  /** posição granular -> balde genérico da escalação, pro filtro de posição do Mapa de Finalizações. */
  const DSM_POSICAO_PARA_BALDE = {
    zagueiro: 'ZAG', volante: 'VOL', meia: 'MEI',
    'lateral-esquerdo': 'LAT-ESQ', 'lateral-direito': 'LAT-DIR',
    'atacante-area': 'ATA', 'ponta-esquerda': 'ATA', 'ponta-direita': 'ATA',
  };
  const DSM_BALDES_POSICAO = [
    ['ATA', 'Atacante'], ['MEI', 'Meia'], ['VOL', 'Volante'],
    ['ZAG', 'Zagueiro'], ['LAT-ESQ', 'Lateral esq.'], ['LAT-DIR', 'Lateral dir.'],
  ];

  /**
   * `resultado` é campo novo (2026-08-13) — chutes coletados ANTES dessa
   * mudança não têm esse campo, e o harvester só reprocessa por matchId
   * (não reprocessaria os já salvos automaticamente). Sem isso, todo chute
   * antigo desaparece dos filtros de categoria (ev.resultado undefined
   * nunca bate em categorias.has(...)). Replica o mesmo fallback que o
   * harvester já usa quando o ícone da FootStats vem irreconhecível.
   */
  function dsmResultadoOuFallback(ev) {
    if (ev.resultado) return ev.resultado;
    if (ev.gol) return 'gol';
    if (ev.bloqueada) return 'bloqueada';
    return 'fora';
  }

  const __dsmShotsTeamMatchesCache = new Map();
  async function dsmGetTeamShotsMatches(teamKey) {
    if (__dsmShotsTeamMatchesCache.has(teamKey)) return __dsmShotsTeamMatchesCache.get(teamKey);
    const promise = (async () => {
      try {
        const res = await fetch(`data/finalizacoes/${teamKey}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('falha no fetch');
        const teamData = await res.json();
        const matches = Object.values(teamData.matches || {});
        matches.sort((a, b) => {
          const dA = a.date ? String(a.date).trim() : '';
          const dB = b.date ? String(b.date).trim() : '';
          if (dA && dB) return dA < dB ? -1 : (dA > dB ? 1 : 0);
          if (dA && !dB) return 1;
          if (!dA && dB) return -1;
          return 0;
        });
        return matches;
      } catch (err) {
        console.warn(`[finalizacoes] Não foi possível carregar finalizações (${teamKey}).`, err);
        return [];
      }
    })();
    __dsmShotsTeamMatchesCache.set(teamKey, promise);
    return promise;
  }

  async function dsmGetTeamShotsData(teamKey, { homeFilter = null, count = 5, categorias = null, posicoes = null } = {}) {
    let matches = await dsmGetTeamShotsMatches(teamKey);
    if (homeFilter != null) {
      const wantHome = Boolean(homeFilter);
      matches = matches.filter(m => Boolean(m.home) === wantHome);
    }
    const selected = matches.slice(Math.max(0, matches.length - count));
    let created = [];
    let conceded = [];
    selected.forEach(m => {
      if (Array.isArray(m.shots_for)) created = created.concat(m.shots_for);
      if (Array.isArray(m.shots_against)) conceded = conceded.concat(m.shots_against);
    });
    if (categorias) {
      created = created.filter(ev => categorias.has(dsmResultadoOuFallback(ev)));
      conceded = conceded.filter(ev => categorias.has(dsmResultadoOuFallback(ev)));
    }
    if (posicoes) {
      created = created.filter(ev => posicoes.has(DSM_POSICAO_PARA_BALDE[ev.posicao]));
      conceded = conceded.filter(ev => posicoes.has(DSM_POSICAO_PARA_BALDE[ev.posicao]));
    }
    return { created, conceded, gamesUsed: selected.length };
  }

  function dsmRenderConfrontoFinalizacoes(containerId, teamCreatedName, teamConcededName, createdEvents, concededEvents, playersMap, gamesUsedCreated, gamesUsedConceded) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.display = '';

    const rosterCreated = dsmBuildRosterFromEvents(createdEvents, playersMap);
    const rosterConceded = dsmBuildRosterFromEvents(concededEvents, playersMap);
    const createdById = new Map(rosterCreated.map(p => [p.jogadorId, p]));
    const concededById = new Map(rosterConceded.map(p => [p.jogadorId, p]));

    container.innerHTML = `
      <div class="dsm-orient"><span>defesa</span><span class="dsm-arrow">→</span><span>ataque (${teamCreatedName})</span></div>
      <div class="dsm-board">
        <div class="dsm-plist-wrap">
          <div class="dsm-plist-title dsm-title-rec">Finalizações ${teamCreatedName}</div>
          <div class="dsm-plist" id="${containerId}-created"></div>
        </div>
        <div class="dsm-pitch-wrap"><svg id="${containerId}-svg" viewBox="-3 -3 102 74" xmlns="http://www.w3.org/2000/svg"></svg></div>
        <div class="dsm-plist-wrap">
          <div class="dsm-plist-title dsm-title-loss">Cedidas ${teamConcededName}</div>
          <div class="dsm-plist" id="${containerId}-conceded"></div>
        </div>
      </div>
    `;

    if (!createdEvents.length && !concededEvents.length) {
      const board = container.querySelector('.dsm-board');
      if (board) board.insertAdjacentHTML('afterend', '<div class="dsm-empty" style="margin-top:8px">Sem dado suficiente ainda pra esse recorte (mude o filtro, as categorias ou aguarde mais partidas serem coletadas).</div>');
    }

    const svg = document.getElementById(`${containerId}-svg`);
    dsmDrawPitchMarkings(svg);
    const createdLayer = dsmEl('g', {});
    const concededLayer = dsmEl('g', {});
    svg.appendChild(createdLayer);
    svg.appendChild(concededLayer);

    // zona já vem em coordenada real (0..96 x 0..68) calibrada pelo
    // harvester — sem jitter (posição já é precisa, não quadrante).
    const visCreated = new Set(rosterCreated.map(p => p.jogadorId));
    const visConceded = new Set(rosterConceded.map(p => p.jogadorId));

    function renderDots() {
      createdLayer.innerHTML = '';
      createdEvents.forEach(ev => {
        if (!visCreated.has(ev.jogadorId) || !ev.zona) return;
        const dot = dsmEl('circle', { class: 'dsm-dot', cx: ev.zona.x, cy: ev.zona.y, r: 1.05, fill: 'var(--gold)', 'fill-opacity': .88, stroke: '#4a3a00', 'stroke-width': .15 });
        dot.addEventListener('click', (e) => {
          const p = createdById.get(ev.jogadorId);
          const catLbl = (DSM_CATEGORIAS_CHUTE.find(([k]) => k === dsmResultadoOuFallback(ev)) || [null, ev.resultado])[1];
          dsmShowTooltip(e, `<b>${catLbl}</b>${teamCreatedName} — ${p ? p.nome : ('#' + ev.jogadorId)}${p && p.posicao ? ' · ' + p.posicao : ''}`, 'gold');
        });
        createdLayer.appendChild(dot);
      });
      concededLayer.innerHTML = '';
      concededEvents.forEach(ev => {
        if (!visConceded.has(ev.jogadorId) || !ev.zona) return;
        const dot = dsmEl('circle', { class: 'dsm-dot', cx: ev.zona.x, cy: ev.zona.y, r: 1.05, fill: 'var(--dsm-blue)', 'fill-opacity': .88, stroke: '#00294a', 'stroke-width': .15 });
        dot.addEventListener('click', (e) => {
          const p = concededById.get(ev.jogadorId);
          const catLbl = (DSM_CATEGORIAS_CHUTE.find(([k]) => k === dsmResultadoOuFallback(ev)) || [null, ev.resultado])[1];
          dsmShowTooltip(e, `<b>${catLbl} (sofrida)</b>${teamConcededName} — ${p ? p.nome : ('#' + ev.jogadorId)}${p && p.posicao ? ' · ' + p.posicao : ''}`, 'blue');
        });
        concededLayer.appendChild(dot);
      });
    }

    function renderList(elId, roster, visSet, color, redraw) {
      const box = document.getElementById(elId);
      if (!box) return;
      box.innerHTML = `<div class="dsm-plist-head"><span>Jogadores</span><button data-act="toggleall">selecionar/limpar</button></div><ul></ul>`;
      const ul = box.querySelector('ul');
      roster.forEach(p => {
        const li = document.createElement('li');
        li.className = visSet.has(p.jogadorId) ? '' : 'off';
        li.innerHTML = `<span class="dsm-bullet" style="background:${color}"></span><span class="dsm-pname" title="${p.nome}${p.posicao ? ' · ' + p.posicao : ''}">${p.nome}</span><span class="dsm-pcount">${p.count}</span>`;
        li.addEventListener('click', () => {
          if (visSet.has(p.jogadorId)) visSet.delete(p.jogadorId); else visSet.add(p.jogadorId);
          li.className = visSet.has(p.jogadorId) ? '' : 'off';
          redraw();
        });
        ul.appendChild(li);
      });
      box.querySelector('[data-act="toggleall"]').addEventListener('click', () => {
        const allOn = roster.every(p => visSet.has(p.jogadorId));
        roster.forEach(p => { if (allOn) visSet.delete(p.jogadorId); else visSet.add(p.jogadorId); });
        renderList(elId, roster, visSet, color, redraw);
        redraw();
      });
    }

    renderList(`${containerId}-created`, rosterCreated, visCreated, 'var(--gold)', renderDots);
    renderList(`${containerId}-conceded`, rosterConceded, visConceded, 'var(--dsm-blue)', renderDots);
    renderDots();
  }

  let __dsmFinalizacoesRefreshInFlight = null;
  async function dsmRefreshFinalizacoes() {
    const emptyEl = document.getElementById('dsmFznEmptyState');
    const confA = document.getElementById('dsmFznConfrontoA');
    const confB = document.getElementById('dsmFznConfrontoB');

    const teamA = document.getElementById('dsmFznTeamASelect').value;
    const teamB = document.getElementById('dsmFznTeamBSelect').value;
    const count = Math.max(1, Number(document.getElementById('dsmFznWindowCountInput').value) || 5);
    const mando = document.getElementById('dsmFznMandoSelect').value;
    const categorias = new Set(
      Array.from(document.querySelectorAll('#dsmFznCategorias input[type=checkbox]:checked')).map(c => c.value)
    );
    const posicoes = new Set(
      Array.from(document.querySelectorAll('#dsmFznPosicoes input[type=checkbox]:checked')).map(c => c.value)
    );

    if (!teamA || !teamB || teamA === teamB) {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = teamA === teamB ? 'Escolha dois times diferentes.' : 'Escolha os dois times acima pra ver o mapa.';
      }
      if (confA) confA.style.display = 'none';
      if (confB) confB.style.display = 'none';
      return;
    }
    if (!categorias.size || !posicoes.size) {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = !categorias.size ? 'Marque pelo menos uma categoria de finalização.' : 'Marque pelo menos uma posição.';
      }
      if (confA) confA.style.display = 'none';
      if (confB) confB.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const runId = Symbol('fzn-refresh');
    __dsmFinalizacoesRefreshInFlight = runId;

    const homeFilterA = (mando === 'mando') ? true : null;
    const homeFilterB = (mando === 'mando') ? false : null;

    const [dataA, dataB, playersMap] = await Promise.all([
      dsmGetTeamShotsData(teamA, { homeFilter: homeFilterA, count, categorias, posicoes }),
      dsmGetTeamShotsData(teamB, { homeFilter: homeFilterB, count, categorias, posicoes }),
      dsmGetPlayersById(),
    ]);

    if (__dsmFinalizacoesRefreshInFlight !== runId) return;

    const nameA = dsmTeamName(teamA);
    const nameB = dsmTeamName(teamB);

    dsmRenderConfrontoFinalizacoes('dsmFznConfrontoA', nameA, nameB, dataA.created, dataB.conceded, playersMap, dataA.gamesUsed, dataB.gamesUsed);
    dsmRenderConfrontoFinalizacoes('dsmFznConfrontoB', nameB, nameA, dataB.created, dataA.conceded, playersMap, dataB.gamesUsed, dataA.gamesUsed);
  }

  function dsmBuildFinalizacoesView() {
    const root = document.getElementById('viewFinalizacoes');
    if (!root) return;
    root.innerHTML = `
      <div class="dsm-controls-bar">
        <label class="dsm-control-item">Time A
          <select id="dsmFznTeamASelect"></select>
        </label>
        <label class="dsm-control-item">Time B
          <select id="dsmFznTeamBSelect"></select>
        </label>
        <label class="dsm-control-item">Últimos jogos
          <input id="dsmFznWindowCountInput" type="number" min="1" max="38" value="5" />
        </label>
        <label class="dsm-control-item">Mando
          <select id="dsmFznMandoSelect">
            <option value="geral" selected>Todos os jogos</option>
            <option value="mando">Mesmo mando do confronto (A em casa / B fora)</option>
          </select>
        </label>
        <div class="dsm-control-item" style="min-width:260px">
          Categoria da finalização
          <div class="dsm-checkbox-panel" id="dsmFznCategorias"></div>
        </div>
        <div class="dsm-control-item" style="min-width:260px">
          Posição
          <div class="dsm-checkbox-panel" id="dsmFznPosicoes"></div>
        </div>
      </div>
      <div id="dsmFznEmptyState" class="dsm-empty">Escolha os dois times acima pra ver o mapa.</div>
      <div id="dsmFznConfrontoA" class="dsm-confronto" style="display:none"></div>
      <div id="dsmFznConfrontoB" class="dsm-confronto" style="display:none"></div>
    `;
    const a = document.getElementById('dsmFznTeamASelect');
    const b = document.getElementById('dsmFznTeamBSelect');
    TEAMS.forEach(([key, name]) => {
      a.appendChild(new Option(name, key));
      b.appendChild(new Option(name, key));
    });
    a.value = 'palmeiras';
    b.value = 'flamengo';

    const catPanel = document.getElementById('dsmFznCategorias');
    DSM_CATEGORIAS_CHUTE.forEach(([key, label]) => {
      const lab = document.createElement('label');
      lab.className = 'dsm-checkbox-item';
      lab.innerHTML = `<input type="checkbox" value="${key}" checked /> ${label}`;
      catPanel.appendChild(lab);
    });
    catPanel.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) dsmRefreshFinalizacoes(); });

    const posPanel = document.getElementById('dsmFznPosicoes');
    DSM_BALDES_POSICAO.forEach(([key, label]) => {
      const lab = document.createElement('label');
      lab.className = 'dsm-checkbox-item';
      lab.innerHTML = `<input type="checkbox" value="${key}" checked /> ${label}`;
      posPanel.appendChild(lab);
    });
    posPanel.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) dsmRefreshFinalizacoes(); });

    ['dsmFznTeamASelect', 'dsmFznTeamBSelect', 'dsmFznWindowCountInput', 'dsmFznMandoSelect'].forEach(id => {
      document.getElementById(id).addEventListener('change', dsmRefreshFinalizacoes);
    });
    dsmRefreshFinalizacoes();
  }

  // ---------------------------------------------------------------------
  // Troca de aba — não mexe na estrutura interna do Mapa de Gols, só
  // esconde/mostra os containers de topo (inclusive os que já existiam
  // fora de #app: updateStatus/roundSummary são específicos do Gols).
  // ---------------------------------------------------------------------
  let __dsmInited = false;
  let __dsmLideresInited = false;
  let __dsmFinalizacoesInited = false;
  let __dsmRaioXInited = false;

  function dsmSwitchView(view) {
    const viewGols = document.getElementById('viewGols');
    const viewDesarmes = document.getElementById('viewDesarmes');
    const viewLideres = document.getElementById('viewLideres');
    const viewFinalizacoes = document.getElementById('viewFinalizacoes');
    const viewRaioX = document.getElementById('viewRaioX');
    const updateStatus = document.getElementById('updateStatus');
    const roundSummary = document.getElementById('roundSummary');

    if (viewGols) viewGols.style.display = view === 'gols' ? '' : 'none';
    if (viewDesarmes) viewDesarmes.style.display = view === 'desarmes' ? '' : 'none';
    if (viewLideres) viewLideres.style.display = view === 'lideres' ? '' : 'none';
    if (viewFinalizacoes) viewFinalizacoes.style.display = view === 'finalizacoes' ? '' : 'none';
    if (viewRaioX) viewRaioX.style.display = view === 'raiox' ? '' : 'none';
    if (updateStatus) updateStatus.style.display = view === 'gols' ? '' : 'none';
    if (roundSummary) roundSummary.style.display = view === 'gols' ? '' : 'none';

    document.querySelectorAll('.site-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'desarmes' && !__dsmInited) { dsmBuildDesarmesView(); __dsmInited = true; }
    if (view === 'lideres' && !__dsmLideresInited) { dsmBuildLideresView(); __dsmLideresInited = true; }
    if (view === 'finalizacoes' && !__dsmFinalizacoesInited) { dsmBuildFinalizacoesView(); __dsmFinalizacoesInited = true; }
    if (view === 'raiox' && !__dsmRaioXInited && window.rxBuildRaioXView) { window.rxBuildRaioXView(); __dsmRaioXInited = true; }

    window.scrollTo(0, 0);
  }

  function dsmInitTabs() {
    const nav = document.getElementById('siteTabs');
    if (!nav) return;
    nav.querySelectorAll('.site-tab').forEach(btn => {
      btn.addEventListener('click', () => dsmSwitchView(btn.dataset.view));
    });
  }

  // O login do site controla `#app` (display:none até a senha certa) — as
  // abas ficam dentro de #app, então só precisam do listener nos botões;
  // não precisa esperar nenhum evento de login específico.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dsmInitTabs);
  } else {
    dsmInitTabs();
  }
})();
