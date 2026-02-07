// Renderização com marcadores circulares (P/A/C) e linhas tracejadas

const svg = document.getElementById('overlay');
const defensiveLayer = document.getElementById('defensiveLayer');
const offensiveLayer = document.getElementById('offensiveLayer');
// Overlay de grade numerada
const gridImg = document.getElementById('gridImg');
// Overlay de zonas táticas
const zonesOverlay = document.getElementById('zonesOverlay');

// Contexto do segundo campo
const svg2 = document.getElementById('overlay2');
const defensiveLayer2 = document.getElementById('defensiveLayer2');
const offensiveLayer2 = document.getElementById('offensiveLayer2');
// Overlay de grade numerada (segundo campo)
const gridImg2 = document.getElementById('gridImg2');
// Overlay de zonas táticas (segundo campo)
const zonesOverlay2 = document.getElementById('zonesOverlay2');
// Campinhos extras (abaixo dos campos principal/visitante)
const svgLx = document.getElementById('overlayLx');
const defensiveLayerLx = document.getElementById('defensiveLayerLx');
const offensiveLayerLx = document.getElementById('offensiveLayerLx');
const svgRx = document.getElementById('overlayRx');
const defensiveLayerRx = document.getElementById('defensiveLayerRx');
const offensiveLayerRx = document.getElementById('offensiveLayerRx');

// Dimensões do canvas (viewBox) e do campo desenhado
const WIDTH = 1000;
const HEIGHT = 800; // aumentado de 660 para 900 para criar espaço para o rodapé
// Área útil do campo (retângulo interno das linhas):
const PITCH = {
  unitsX: 100,   // largura lógica
  unitsY: 68,    // altura lógica
  maxX: 96,      // linha de gol em x=96
  maxY: 68,
  left: 60,      // offset do retângulo interno no SVG
  top: 30,
  widthPx: 880,  // 60 → 940 (880px)
  heightPx: 540, // 30 → 570 (540px)
};

const CREST_MAP = {
  atletico_mg: 'atlético mg.png',
  athletico_pr: 'athletico-pr.png',
  bahia: 'bahia.png',
  botafogo: 'botafogo.png',
  ceara: 'ceará.png',
  chapecoense: 'chapecoense.png',
  corinthians: 'corinthians.png',
  coritiba: 'coritiba.png',
  cruzeiro: 'cruzeiro.png',
  flamengo: 'flamengo.png',
  fluminense: 'fluminense.png',
  fortaleza: 'fortaleza.png',
  gremio: 'gremio.png',
  internacional: 'internacional.png',
  juventude: 'juventude.png',
  mirassol: 'mirassol.png',
  palmeiras: 'palmeiras.png',
  bragantino: 'red bull bragantino.png',
  red_bull_bragantino: 'red bull bragantino.png',
  remo: 'remo.png',
  santos: 'santos.png',
  sport: 'sport.png',
  sao_paulo: 'são paulo.png',
  vasco: 'vasco.png',
  vitoria: 'vitória.png',
};

// Nomes amigáveis para exibição nos rótulos
const DISPLAY_NAME_MAP = {
  atletico_mg: 'Atlético-MG',
  athletico_pr: 'Athletico-PR',
  bahia: 'Bahia',
  botafogo: 'Botafogo',
  ceara: 'Ceará',
  corinthians: 'Corinthians',
  cruzeiro: 'Cruzeiro',
  flamengo: 'Flamengo',
  fluminense: 'Fluminense',
  fortaleza: 'Fortaleza',
  gremio: 'Grêmio',
  internacional: 'Internacional',
  juventude: 'Juventude',
  mirassol: 'Mirassol',
  palmeiras: 'Palmeiras',
  bragantino: 'Red Bull Bragantino',
  red_bull_bragantino: 'Red Bull Bragantino',
  santos: 'Santos',
  sport: 'Sport',
  sao_paulo: 'São Paulo',
  vasco: 'Vasco',
  vitoria: 'Vitória',
};

function formatTeamName(teamKey) {
  const k = String(teamKey || '').toLowerCase();
  if (DISPLAY_NAME_MAP[k]) return DISPLAY_NAME_MAP[k];
  // fallback: substitui underscores por espaços e capitaliza palavras
  return k
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
    .join(' ');
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  children.forEach((c) => e.appendChild(c));
  return e;
}

function clampX(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(PITCH.maxX, n));
}
function clampY(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(PITCH.maxY, n));
}

function toXY({ x, y }) {
  const cx = clampX(x);
  const cy = clampY(y);
  const X = PITCH.left + (cx / PITCH.maxX) * PITCH.widthPx;
  const Y = PITCH.top + (cy / PITCH.maxY) * PITCH.heightPx;
  return { X, Y };
}

// Converte coordenadas do SVG (viewBox 1000x600) para unidades do campo (0..96 x 0..68)
function fromXY({ X, Y }) {
  const nx = ((Number(X) - PITCH.left) / PITCH.widthPx) * PITCH.maxX;
  const ny = ((Number(Y) - PITCH.top) / PITCH.heightPx) * PITCH.maxY;
  return { x: clampX(nx), y: clampY(ny) };
}

// Marcador de assistência igual ao Editor: círculo branco com borda azul-escuro
function drawAssistMarker({ x, y }) {
  const { X, Y } = toXY({ x, y });
  const g = el('g', { transform: `translate(${X},${Y})`, filter: 'url(#ds)' });
  const circle = el('circle', {
    r: 10,
    cx: 0,
    cy: 0,
    fill: '#ffffff',
    stroke: '#0f172a',
    'stroke-width': 2,
  });
  g.appendChild(circle);
  return g;
}

// Marcador de finalização: emoji ⚽ padrão do sistema (sem dourado)
// Marcador de finalização: emoji ⚽ ou círculo colorido
function drawShotEmoji({ x, y }, { isPenalty, isOwnGoal } = {}) {
  const { X, Y } = toXY({ x, y });
  // Grupo com filtro de sombra drop-shadow (#ds)
  const g = el('g', { transform: `translate(${X},${Y})`, filter: 'url(#ds)' });

  // Texto base (Bola)
  const txt = el('text', {
    x: 0,
    y: 0,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-size': 22,
  }, []);
  txt.textContent = '⚽';

  // Aplicar filtros de cor se necessário (tinting)
  if (isOwnGoal) {
    // Vermelho mais sutil: menos saturação e ajuste de matiz
    txt.style.filter = 'sepia(1) saturate(20) hue-rotate(315deg) brightness(0.9)';
  } else if (isPenalty) {
    // Verde claro: sepia + hue-rotate + saturation + brightness
    // Ajustado para um verde mais vivo/claro
    txt.style.filter = 'sepia(1) saturate(50) hue-rotate(80deg) brightness(1.3)';
  }

  g.appendChild(txt);
  return g;
}

function drawDashedLine(from, to) {
  const { X: x1, Y: y1 } = toXY(from);
  const { X: x2, Y: y2 } = toXY(to);
  return el('line', {
    x1,
    y1,
    x2,
    y2,
    stroke: '#f7d36a',
    'stroke-width': 2,
    'stroke-dasharray': '4 3',
    'stroke-linecap': 'round',
    opacity: 0.95,
  });
}

// Removido uso de timestamps (não desejado)
function drawTinyLabel(point, text, { dy = -16, fill = '#e7f8f1' } = {}) {
  if (!point || !text) return el('g');
  const { X, Y } = toXY(point);
  return el('text', {
    x: X,
    y: Y + dy,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 11,
    'font-weight': 600,
    fill,
    opacity: 0.9,
  }, [document.createTextNode(String(text))]);
}

function maybeFlip(point, flipX) {
  if (!point) return null;
  const raw = { x: flipX ? (PITCH.maxX - point.x) : point.x, y: point.y };
  return { x: clampX(raw.x), y: clampY(raw.y) };
}

const GRID = { cols: 12, rows: 7 };
const CELL = { w: PITCH.maxX / GRID.cols, h: PITCH.maxY / GRID.rows };
function clampGridRow(r) { return Math.max(0, Math.min(GRID.rows - 1, Number(r) || 0)); }
function clampGridCol(c) { return Math.max(0, Math.min(GRID.cols - 1, Number(c) || 0)); }
function fromQuadrant(row, col) {
  const r = clampGridRow(row);
  const c = clampGridCol(col);
  const x = (c + 0.5) * CELL.w;
  const y = (r + 0.5) * CELL.h;
  return { x: clampX(x), y: clampY(y) };
}
function parseQString(q) {
  if (typeof q !== 'string') return null;
  const m = q.match(/r\s*(\d+)\s*c\s*(\d+)/i);
  if (m) return { row: Number(m[1]), col: Number(m[2]) };
  const m2 = q.match(/(\d+)\s*[x:\-]\s*(\d+)/i);
  if (m2) return { row: Number(m2[1]), col: Number(m2[2]) };
  return null;
}
function fromCellIndex(index) {
  if (index == null) return null;
  const n = Number(index);
  if (!Number.isFinite(n)) return null;
  const total = GRID.rows * GRID.cols;
  const clamped = Math.max(1, Math.min(total, Math.round(n)));
  const zero = clamped - 1;
  const row = Math.floor(zero / GRID.cols);
  const col = zero % GRID.cols;
  return fromQuadrant(row, col);
}
function normalizePoint(p) {
  if (!p) return null;
  if (typeof p.x === 'number' && typeof p.y === 'number') {
    return { x: clampX(p.x), y: clampY(p.y) };
  }
  if (typeof p.row === 'number' && typeof p.col === 'number') {
    return fromQuadrant(p.row, p.col);
  }
  if (typeof p.q === 'string') {
    const rc = parseQString(p.q);
    if (rc) return fromQuadrant(rc.row, rc.col);
  }
  if (typeof p.cell !== 'undefined') {
    const pt = fromCellIndex(p.cell);
    if (pt) return pt;
  }
  return null;
}

function cellKeyForPoint(point) {
  // Usa coordenadas lógicas já normalizadas (após flip)
  const col = Math.floor(point.x / CELL.w);
  const row = Math.floor(point.y / CELL.h);
  return `${row}:${col}`;
}

function renderEvents(layer, events, { flipX = false } = {}) {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  const linesG = el('g', { class: 'lines-layer' });
  const nodesG = el('g', { class: 'nodes-layer' });
  layer.appendChild(linesG);
  layer.appendChild(nodesG);

  const items = events.map((ev) => {
    const shotPt = normalizePoint(ev.shot);
    const passPt = ev.pass ? normalizePoint(ev.pass) : null;
    const shot = maybeFlip(shotPt, flipX);
    const pass = passPt ? maybeFlip(passPt, flipX) : null;
    return { ev, shot, pass };
  }).filter(i => i.shot);

  items.forEach(({ ev, shot, pass }, idx) => {
    if (pass) {
      linesG.appendChild(drawDashedLine(pass, shot));
      const a = drawAssistMarker(pass);
      a.setAttribute('data-event-index', String(idx));
      nodesG.appendChild(a);
    }
    const s = drawShotEmoji(shot, { isPenalty: ev.isPenalty, isOwnGoal: ev.isOwnGoal });
    s.setAttribute('data-event-index', String(idx));
    nodesG.appendChild(s);
  });
}

function setCrest(teamKey, fallbackName) {
  const file = CREST_MAP[teamKey];
  const img = svg?.querySelector('#crestImg');
  const text = svg?.querySelector('#crestText');
  const group = svg?.querySelector('#crestWatermark');
  if (file && img) {
    img.setAttribute('href', `escudos  série A 2025/${file}`);
    if (group) group.style.display = 'block';
    if (text) text.style.display = 'none';
  } else if (text) {
    const display = (fallbackName && String(fallbackName).trim())
      ? String(fallbackName).toUpperCase()
      : String(formatTeamName(teamKey)).toUpperCase();
    text.textContent = display;
    if (group) group.style.display = 'block';
    text.style.display = 'block';
  }
}

function setCrest2(teamKey, fallbackName) {
  const file = CREST_MAP[teamKey];
  const img = svg2?.querySelector('#crestImg2');
  const group = svg2?.querySelector('#crestWatermark2');
  if (file && img) {
    img.setAttribute('href', `escudos  série A 2025/${file}`);
    if (group) group.style.display = 'block';
  }
}
function setCrestLx(teamKey, fallbackName) {
  const file = CREST_MAP[teamKey];
  const img = svgLx?.querySelector('#crestImgLx');
  const group = svgLx?.querySelector('#crestWatermarkLx');
  if (file && img) {
    img.setAttribute('href', `escudos  série A 2025/${file}`);
    if (group) group.style.display = 'block';
  } else if (group) {
    group.style.display = 'none';
  }
}
function setCrestRx(teamKey, fallbackName) {
  const file = CREST_MAP[teamKey];
  const img = svgRx?.querySelector('#crestImgRx');
  const group = svgRx?.querySelector('#crestWatermarkRx');
  if (file && img) {
    img.setAttribute('href', `escudos  série A 2025/${file}`);
    if (group) group.style.display = 'block';
  } else if (group) {
    group.style.display = 'none';
  }
}

let currentTeamLeft = null;
let currentTeamRight = null;
let currentTeamLeftExtra = null;
let currentTeamRightExtra = null;

function resolveDataFileKey(teamKey) {
  // Padroniza chave do arquivo JSON para casos com nome especial
  // Suporta variações com underscore usadas pelos escudos vs. hifens usados nos arquivos
  const map = {
    'bragantino': 'red-bull-bragantino',
    'red_bull_bragantino': 'red-bull-bragantino',
    'atletico_mg': 'atletico-mg',
    'athletico_pr': 'athletico-pr',
    'sao_paulo': 'sao-paulo'
  };
  if (map[teamKey]) return map[teamKey];
  return teamKey;
}

async function getTeamAggregatedData(teamKey, { homeFilter = null } = {}) {
  const fileKey = resolveDataFileKey(teamKey);
  const url = `data/${fileKey}.json?t=${Date.now()}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha no fetch');
    const teamData = await res.json();
    const name = teamData.name || formatTeamName(teamKey);
    const settings = window.__aggregationSettings || { count: 3, mode: 'seguidas' };

    // Conversor para formato padrão disponível em todo o escopo da função
    const toStandard = (ev) => {
      if (ev && typeof ev === 'object') {
        // Normalizar chaves snake_case para camelCase se necessário
        if (ev.shot || ev.pass) {
          return {
            ...ev,
            isOwnGoal: ev.isOwnGoal || ev.own_goal,
            isPenalty: ev.isPenalty || ev.is_penalty
          };
        }
        const hasShotCell = typeof ev.shot_cell !== 'undefined';
        const hasPassCell = typeof ev.pass_cell !== 'undefined';
        if (hasShotCell || hasPassCell) {
          return {
            shot: hasShotCell ? { cell: ev.shot_cell } : null,
            pass: hasPassCell ? { cell: ev.pass_cell } : null,
            result: ev.result || 'goal',
            isHeader: !!ev.isHeader,
            timestamp: ev.timestamp || ''
          };
        }
      }
      return ev;
    };
    // Normalizar estrutura de rounds e garantir que cada item tenha roundNumber
    let roundsArr = [];
    if (Array.isArray(teamData.rounds)) {
      roundsArr = teamData.rounds.map((r) => {
        if (r && typeof r === 'object' && typeof r.roundNumber === 'number') return r;
        // Arrays não preservam chave da rodada; manter como está
        return r;
      });
    } else if (teamData.rounds && typeof teamData.rounds === 'object') {
      // Converter dict { '30': { ... } } para array e injetar roundNumber a partir da chave
      roundsArr = Object.entries(teamData.rounds).map(([key, val]) => {
        const rn = Number(key);
        if (val && typeof val === 'object' && typeof val.roundNumber !== 'number') {
          return { ...val, roundNumber: isNaN(rn) ? undefined : rn };
        }
        return val;
      });
    } else {
      roundsArr = [];
    }
    let created = [];
    let conceded = [];
    if (roundsArr.length > 0) {
      // Ordenar por Data (Crescente: mais antigo -> mais recente) e depois por Rodada
      // Para pegar os "últimos X jogos", usamos slice do final, então queremos os mais recentes no fim do array.
      // Ordenar por Data (Crescente) defensivo
      console.log('Ordenando jogos por DATA (Cronológico)...');
      let sorted = roundsArr.slice().sort((a, b) => {
        // Prioridade TOTAL para a a Data do jogo (YYYY-MM-DD).
        // Quem tem data vem antes ou depois baseado no tempo.
        // Quem NÃO tem data, assumimos que é muito antigo ou indefinido (vem antes de quem tem data).
        const dA = a.date ? String(a.date).trim() : '';
        const dB = b.date ? String(b.date).trim() : '';

        if (dA && dB) {
          // Comparação de strings ISO (YYYY-MM-DD) funciona corretamente para ordem cronológica
          if (dA < dB) return -1; // A é mais antigo
          if (dA > dB) return 1;  // A é mais recente
          // Se datas iguais, desempata pela rodada
        } else if (dA && !dB) {
          return 1; // A tem data (recente), B não (antigo) -> A vem depois
        } else if (!dA && dB) {
          return -1; // A não tem data (antigo), B tem (recente) -> A vem antes
        }

        // Fallback: Desempate por número da rodada se as datas forem idênticas ou ambas ausentes
        return (a.roundNumber || 0) - (b.roundNumber || 0);
      });
      console.log('Ordenacao concluida', sorted.length);

      if (homeFilter != null) {
        const wantHome = Boolean(homeFilter);
        sorted = sorted.filter(r => Boolean(r.home) === wantHome);
      }
      const selected = sorted.slice(Math.max(0, sorted.length - (settings.count || 3)));

      const fmtName = (k) => formatTeamName(String(k || '').replace(/-/g, '_'));
      const toStdWithMatch = (ev, round) => {
        // Converter para formato padrão
        const base = toStandard(ev);
        // Construir metadados de confronto quando possível
        const oppKey = round && round.opponent ? String(round.opponent) : null;
        const isHomeRound = round ? Boolean(round.home) : null;
        const homeTeamKey = isHomeRound ? teamKey : oppKey;
        const awayTeamKey = isHomeRound ? oppKey : teamKey;
        const match = oppKey ? {
          homeTeamKey,
          awayTeamKey,
          homeName: fmtName(homeTeamKey),
          awayName: fmtName(awayTeamKey),
          isHome: isHomeRound
        } : null;
        return { ...base, match };
      };

      selected.forEach(r => {
        if (Array.isArray(r.created_goals)) created = created.concat(r.created_goals.map(ev => toStdWithMatch(ev, r)));
        if (Array.isArray(r.conceded_goals)) conceded = conceded.concat(r.conceded_goals.map(ev => toStdWithMatch(ev, r)));
      });
    } else {
      // Fallback para formato antigo
      created = teamData.created || [];
      conceded = teamData.conceded || [];
    }
    // Conversão adicional (se ainda houver eventos em formato antigo)
    created = created.map(toStandard);
    conceded = conceded.map(toStandard);
    return { name, created, conceded };
  } catch (err) {
    console.warn(`Não foi possível carregar JSON externo (${teamKey}). Usando exemplo embutido.`, err);
    // Fallback zerado: quando não há arquivo JSON, não renderizar eventos
    return {
      name: formatTeamName(teamKey),
      conceded: [],
      created: []
    };
  }
}

async function loadTeamData(teamKey = 'cruzeiro', { showCrest = true } = {}) {
  currentTeamLeft = teamKey;
  try { window.currentTeamLeft = teamKey; } catch (e) { }
  const mode = (window.__aggregationSettings && window.__aggregationSettings.mode) ? String(window.__aggregationSettings.mode) : 'seguidas';
  const homeFilter = (mode === 'mando') ? true : null; // 'mando' -> apenas mandante; caso contrário -> todas
  const data = await getTeamAggregatedData(teamKey, { homeFilter });
  if (showCrest) setCrest(teamKey, data.name);
  renderEvents(defensiveLayer, data.conceded || [], { flipX: false });
  renderEvents(offensiveLayer, data.created || [], { flipX: false });
  const homeLbl = document.getElementById('homeTeamName');
  if (homeLbl) homeLbl.textContent = ` — ${(data.name || formatTeamName(teamKey)).toUpperCase()}`;

  // Adicionar interatividade e desenhar legenda compacta por posição no overlay (incluída no PNG)
  const allEvents = [...(data.conceded || []), ...(data.created || [])];
  addClickInteractivity(defensiveLayer, data.conceded || []);
  addClickInteractivity(offensiveLayer, data.created || []);
  const overlayEl = document.getElementById('overlay');
  // Título superior escondido no DOM, visível apenas na exportação
  drawCxTitle(overlayEl, 'cxTitleLeft');
  drawPositionSummaryLegend(overlayEl, data.conceded || [], data.created || [], 'positionSummaryLeft');
}

async function loadTeamData2(teamKey = 'fortaleza', { showCrest = true } = {}) {
  currentTeamRight = teamKey;
  try { window.currentTeamRight = teamKey; } catch (e) { }
  const mode = (window.__aggregationSettings && window.__aggregationSettings.mode) ? String(window.__aggregationSettings.mode) : 'seguidas';
  const homeFilter = (mode === 'mando') ? false : null; // 'mando' -> apenas visitante; caso contrário -> todas
  const data = await getTeamAggregatedData(teamKey, { homeFilter });
  if (showCrest) setCrest2(teamKey, data.name);
  renderEvents(defensiveLayer2, data.conceded || [], { flipX: false });
  renderEvents(offensiveLayer2, data.created || [], { flipX: false });
  const awayLbl = document.getElementById('awayTeamName');
  if (awayLbl) awayLbl.textContent = ` — ${(data.name || formatTeamName(teamKey)).toUpperCase()}`;

  // Adicionar interatividade e desenhar legenda compacta por posição no overlay (incluída no PNG)
  const allEvents = [...(data.conceded || []), ...(data.created || [])];
  addClickInteractivity(defensiveLayer2, data.conceded || []);
  addClickInteractivity(offensiveLayer2, data.created || []);
  const overlayEl2 = document.getElementById('overlay2');
  // Título superior escondido no DOM, visível apenas na exportação
  drawCxTitle(overlayEl2, 'cxTitleRight');
  drawPositionSummaryLegend(overlayEl2, data.conceded || [], data.created || [], 'positionSummaryRight');
}
async function loadTeamDataLeftExtra(teamKey = 'cruzeiro') {
  currentTeamLeftExtra = teamKey;
  try { window.currentTeamLeftExtra = teamKey; } catch (e) { }
  const mode = (window.__aggregationSettings && window.__aggregationSettings.mode) ? String(window.__aggregationSettings.mode) : 'seguidas';
  const homeFilter = (mode === 'mando') ? true : null;
  const data = await getTeamAggregatedData(teamKey, { homeFilter });
  setCrestLx(teamKey, data.name);
  if (defensiveLayerLx && offensiveLayerLx) {
    renderEvents(defensiveLayerLx, data.conceded || [], { flipX: false });
    renderEvents(offensiveLayerLx, data.created || [], { flipX: false });
  }
  const lbl = document.getElementById('homeTeamNameLx');
  if (lbl) lbl.textContent = ` — ${(data.name || formatTeamName(teamKey)).toUpperCase()}`;
}
async function loadTeamDataRightExtra(teamKey = 'fortaleza') {
  currentTeamRightExtra = teamKey;
  try { window.currentTeamRightExtra = teamKey; } catch (e) { }
  const mode = (window.__aggregationSettings && window.__aggregationSettings.mode) ? String(window.__aggregationSettings.mode) : 'seguidas';
  const homeFilter = (mode === 'mando') ? false : null;
  const data = await getTeamAggregatedData(teamKey, { homeFilter });
  setCrestRx(teamKey, data.name);
  if (defensiveLayerRx && offensiveLayerRx) {
    renderEvents(defensiveLayerRx, data.conceded || [], { flipX: false });
    renderEvents(offensiveLayerRx, data.created || [], { flipX: false });
  }
  const lbl = document.getElementById('awayTeamNameRx');
  if (lbl) lbl.textContent = ` — ${(data.name || formatTeamName(teamKey)).toUpperCase()}`;
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeTeamKey(k) {
  if (k === 'red_bull_bragantino') return 'bragantino';
  return k;
}

// Atualização: garantir que o dragstart dos escudos inclua o tipo 'text/team'
function initTeamInteractions() {
  const CRESTS_INV = Object.fromEntries(Object.entries(CREST_MAP).map(([k, v]) => [String(v).toLowerCase(), k]));
  const teamBadges = document.querySelectorAll('.team-badge');
  teamBadges.forEach(img => {
    // Derivar chave do time pelo src (arquivo) ou alt
    const src = img.getAttribute('src') || '';
    const file = src.split(/[/\\]/).pop()?.toLowerCase() || '';
    let key = CRESTS_INV[file];
    if (!key) {
      const alt = (img.getAttribute('alt') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const slug = alt.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      // alguns ajustes manuais
      const mapAlt = {
        'atletico_mg': 'atletico_mg',
        'athletico_pr': 'athletico_pr',
        'sao_paulo': 'sao_paulo',
        'red_bull_bragantino': 'red_bull_bragantino'
      };
      key = mapAlt[slug] || slug;
    }
    img.setAttribute('data-team-key', key);
    img.setAttribute('draggable', 'true');
    img.addEventListener('dragstart', (ev) => {
      try { ev.dataTransfer.setData('text/team', key); } catch (e) { }
      try { ev.dataTransfer.setData('text/plain', key); } catch (e) { }
    });
    // Clique como fallback: carrega no campo da esquerda
    img.addEventListener('click', () => {
      loadTeamData(key);
    });
  });
  // Drop nos overlays dos campos
  if (svg) {
    svg.addEventListener('dragover', (e) => { e.preventDefault(); });
    svg.addEventListener('drop', (e) => {
      e.preventDefault();
      const key = (e.dataTransfer.getData('text/team') || e.dataTransfer.getData('text/plain') || '').trim();
      if (key) loadTeamData(key);
    });
  }
  if (svg2) {
    svg2.addEventListener('dragover', (e) => { e.preventDefault(); });
    svg2.addEventListener('drop', (e) => {
      e.preventDefault();
      const key = (e.dataTransfer.getData('text/team') || e.dataTransfer.getData('text/plain') || '').trim();
      if (key) loadTeamData2(key);
    });
  }
  if (svgLx) {
    svgLx.addEventListener('dragover', (e) => { e.preventDefault(); });
    svgLx.addEventListener('drop', (e) => {
      e.preventDefault();
      const key = (e.dataTransfer.getData('text/team') || e.dataTransfer.getData('text/plain') || '').trim();
      if (key) loadTeamDataLeftExtra(key);
    });
  }
  if (svgRx) {
    svgRx.addEventListener('dragover', (e) => { e.preventDefault(); });
    svgRx.addEventListener('drop', (e) => {
      e.preventDefault();
      const key = (e.dataTransfer.getData('text/team') || e.dataTransfer.getData('text/plain') || '').trim();
      if (key) loadTeamDataRightExtra(key);
    });
  }
}

function initGridToggle() {
  const cb = document.getElementById('toggleGrid');
  if (!cb) return;
  const apply = () => {
    const show = cb.checked;
    if (gridImg) gridImg.style.display = show ? 'block' : 'none';
    if (gridImg2) gridImg2.style.display = show ? 'block' : 'none';
  };
  cb.addEventListener('change', apply);
  apply();
}

// Editor: desenha/limpa a camada de overlay para começar um novo lance
function drawEditorGrid() {
  const overlay = document.getElementById('editorOverlay');
  if (!overlay) return;
  // Limpa quaisquer elementos antigos (círculos, textos, linhas)
  const nodes = Array.from(overlay.querySelectorAll('text,circle,line,rect'));
  nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
  // Opcional: borda sutil para referência visual
  const ns = 'http://www.w3.org/2000/svg';
  const r = document.createElementNS(ns, 'rect');
  r.setAttribute('x', '0');
  r.setAttribute('y', '0');
  r.setAttribute('width', '1000');
  r.setAttribute('height', '600');
  r.setAttribute('fill', 'none');
  r.setAttribute('stroke', 'rgba(255,255,255,0.15)');
  r.setAttribute('stroke-width', '1');
  overlay.appendChild(r);
}

function drawZones(layer) {
  if (!layer) return;
  while (layer.firstChild) layer.removeChild(layer.firstChild);

  // Desenhar fundo verde escuro para todas as células
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const cellIndex = r * GRID.cols + c + 1;
      const x = toXY({ x: c * CELL.w, y: r * CELL.h }).X;
      const y = toXY({ x: c * CELL.w, y: r * CELL.h }).Y;
      const width = toXY({ x: CELL.w, y: 0 }).X - toXY({ x: 0, y: 0 }).X;
      const height = toXY({ x: 0, y: CELL.h }).Y - toXY({ x: 0, y: 0 }).Y;

      // Cores especiais para células destacadas
      let fillColor = '#2d5016'; // Verde escuro padrão
      if (cellIndex === 1) fillColor = '#ff8c00'; // Laranja - Escanteio defensivo direita
      else if (cellIndex === 73) fillColor = '#ffd700'; // Amarelo - Escanteio defensivo esquerda
      else if (cellIndex === 38) fillColor = '#ff4500'; // Laranja/vermelho - Pênalti defensivo
      else if (cellIndex === 12) fillColor = '#00bfff'; // Ciano - Escanteio ofensivo esquerda
      else if (cellIndex === 84) fillColor = '#90ee90'; // Verde claro - Escanteio ofensivo direita
      else if (cellIndex === 47) fillColor = '#da70d6'; // Roxo/magenta - Pênalti ofensivo

      const cellRect = el('rect', {
        x: x,
        y: y,
        width: width,
        height: height,
        fill: fillColor,
        stroke: '#000000',
        'stroke-width': 1,
      });
      layer.appendChild(cellRect);

      // Número da célula
      const cellNumber = el('text', {
        x: x + width / 2,
        y: y + height / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': Math.min(width, height) * 0.3,
        'font-weight': 700,
        fill: '#000000',
      });
      cellNumber.textContent = cellIndex.toString();
      layer.appendChild(cellNumber);
    }
  }

  // Contornos das áreas (linhas brancas mais grossas)

  // Grande área defensiva (linha entre colunas 2-3)
  const gaDefX = toXY({ x: 2 * CELL.w, y: 0 }).X;
  const gaDefLine = el('line', {
    x1: gaDefX,
    y1: toXY({ x: 0, y: 1 * CELL.h }).Y, // Linha 2
    x2: gaDefX,
    y2: toXY({ x: 0, y: 6 * CELL.h }).Y, // Linha 6
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(gaDefLine);

  // Contorno horizontal superior da grande área defensiva
  const gaDefTop = el('line', {
    x1: toXY({ x: 0, y: 1 * CELL.h }).X,
    y1: toXY({ x: 0, y: 1 * CELL.h }).Y,
    x2: gaDefX,
    y2: toXY({ x: 0, y: 1 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(gaDefTop);

  // Contorno horizontal inferior da grande área defensiva
  const gaDefBottom = el('line', {
    x1: toXY({ x: 0, y: 6 * CELL.h }).X,
    y1: toXY({ x: 0, y: 6 * CELL.h }).Y,
    x2: gaDefX,
    y2: toXY({ x: 0, y: 6 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(gaDefBottom);

  // Pequena área defensiva (células 25, 37, 49)
  const paDefX = toXY({ x: 1 * CELL.w, y: 0 }).X;
  const paDefLine = el('line', {
    x1: paDefX,
    y1: toXY({ x: 0, y: 2 * CELL.h }).Y, // Linha 3
    x2: paDefX,
    y2: toXY({ x: 0, y: 5 * CELL.h }).Y, // Linha 5
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(paDefLine);

  // Contornos horizontais da pequena área defensiva
  const paDefTop = el('line', {
    x1: toXY({ x: 0, y: 2 * CELL.h }).X,
    y1: toXY({ x: 0, y: 2 * CELL.h }).Y,
    x2: paDefX,
    y2: toXY({ x: 0, y: 2 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(paDefTop);

  const paDefBottom = el('line', {
    x1: toXY({ x: 0, y: 5 * CELL.h }).X,
    y1: toXY({ x: 0, y: 5 * CELL.h }).Y,
    x2: paDefX,
    y2: toXY({ x: 0, y: 5 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(paDefBottom);

  // Grande área ofensiva (linha entre colunas 10-11)
  const gaOfX = toXY({ x: 10 * CELL.w, y: 0 }).X;
  const gaOfLine = el('line', {
    x1: gaOfX,
    y1: toXY({ x: 0, y: 1 * CELL.h }).Y, // Linha 2
    x2: gaOfX,
    y2: toXY({ x: 0, y: 6 * CELL.h }).Y, // Linha 6
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(gaOfLine);

  // Contornos horizontais da grande área ofensiva
  const gaOfTop = el('line', {
    x1: gaOfX,
    y1: toXY({ x: 0, y: 1 * CELL.h }).Y,
    x2: toXY({ x: 12 * CELL.w, y: 0 }).X,
    y2: toXY({ x: 0, y: 1 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(gaOfTop);

  const gaOfBottom = el('line', {
    x1: gaOfX,
    y1: toXY({ x: 0, y: 6 * CELL.h }).Y,
    x2: toXY({ x: 12 * CELL.w, y: 0 }).X,
    y2: toXY({ x: 0, y: 6 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(gaOfBottom);

  // Pequena área ofensiva (células 36, 48, 60)
  const paOfX = toXY({ x: 11 * CELL.w, y: 0 }).X;
  const paOfLine = el('line', {
    x1: paOfX,
    y1: toXY({ x: 0, y: 2 * CELL.h }).Y, // Linha 3
    x2: paOfX,
    y2: toXY({ x: 0, y: 5 * CELL.h }).Y, // Linha 5
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(paOfLine);

  // Contornos horizontais da pequena área ofensiva
  const paOfTop = el('line', {
    x1: paOfX,
    y1: toXY({ x: 0, y: 2 * CELL.h }).Y,
    x2: toXY({ x: 12 * CELL.w, y: 0 }).X,
    y2: toXY({ x: 0, y: 2 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(paOfTop);

  const paOfBottom = el('line', {
    x1: paOfX,
    y1: toXY({ x: 0, y: 5 * CELL.h }).Y,
    x2: toXY({ x: 12 * CELL.w, y: 0 }).X,
    y2: toXY({ x: 0, y: 5 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 3,
  });
  layer.appendChild(paOfBottom);

  // Círculo branco no centro (entre células 42-43)
  const centerX = toXY({ x: 6 * CELL.w, y: 3.5 * CELL.h }).X; // Entre colunas 6-7
  const centerY = toXY({ x: 0, y: 3.5 * CELL.h }).Y; // Meio da linha 4
  const centerCircle = el('circle', {
    cx: centerX,
    cy: centerY,
    r: Math.min(CELL.w, CELL.h) * 0.15,
    fill: '#ffffff',
  });
  layer.appendChild(centerCircle);

  // Textos laterais verticais
  const leftText = el('text', {
    x: toXY({ x: -0.5, y: 3.5 * CELL.h }).X,
    y: toXY({ x: 0, y: 3.5 * CELL.h }).Y,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 12,
    'font-weight': 700,
    fill: '#ffffff',
    transform: `rotate(-90 ${toXY({ x: -0.5, y: 3.5 * CELL.h }).X} ${toXY({ x: 0, y: 3.5 * CELL.h }).Y})`,
  });
  leftText.textContent = 'LINHA DE FUNDO DEFENSIVA';
  layer.appendChild(leftText);

  const rightText = el('text', {
    x: toXY({ x: 12.5 * CELL.w, y: 3.5 * CELL.h }).X,
    y: toXY({ x: 0, y: 3.5 * CELL.h }).Y,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 12,
    'font-weight': 700,
    fill: '#ffffff',
    transform: `rotate(90 ${toXY({ x: 12.5 * CELL.w, y: 3.5 * CELL.h }).X} ${toXY({ x: 0, y: 3.5 * CELL.h }).Y})`,
  });
  rightText.textContent = 'LINHA DE FUNDO OFENSIVA';
  layer.appendChild(rightText);

  // Setas DEFESA e ATAQUE no topo
  const defenseArrow = el('g');
  const defenseArrowLine = el('line', {
    x1: toXY({ x: 1 * CELL.w, y: -0.5 * CELL.h }).X,
    y1: toXY({ x: 0, y: -0.5 * CELL.h }).Y,
    x2: toXY({ x: 5 * CELL.w, y: -0.5 * CELL.h }).X,
    y2: toXY({ x: 0, y: -0.5 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 2,
    'marker-end': 'url(#arrowLeft)',
  });
  const defenseText = el('text', {
    x: toXY({ x: 3 * CELL.w, y: -0.7 * CELL.h }).X,
    y: toXY({ x: 0, y: -0.7 * CELL.h }).Y,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 14,
    'font-weight': 700,
    fill: '#ffffff',
  });
  defenseText.textContent = 'DEFESA';
  defenseArrow.appendChild(defenseArrowLine);
  defenseArrow.appendChild(defenseText);
  layer.appendChild(defenseArrow);

  const attackArrow = el('g');
  const attackArrowLine = el('line', {
    x1: toXY({ x: 7 * CELL.w, y: -0.5 * CELL.h }).X,
    y1: toXY({ x: 0, y: -0.5 * CELL.h }).Y,
    x2: toXY({ x: 11 * CELL.w, y: -0.5 * CELL.h }).X,
    y2: toXY({ x: 0, y: -0.5 * CELL.h }).Y,
    stroke: '#ffffff',
    'stroke-width': 2,
    'marker-end': 'url(#arrowRight)',
  });
  const attackText = el('text', {
    x: toXY({ x: 9 * CELL.w, y: -0.7 * CELL.h }).X,
    y: toXY({ x: 0, y: -0.7 * CELL.h }).Y,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 14,
    'font-weight': 700,
    fill: '#ffffff',
  });
  attackText.textContent = 'ATAQUE';
  attackArrow.appendChild(attackArrowLine);
  attackArrow.appendChild(attackText);
  layer.appendChild(attackArrow);
}

function drawPitch() {
  const svg = document.getElementById('pitch-svg');
  if (!svg) return;

  // Adicionar definições de marcadores de seta
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = el('defs');
    svg.appendChild(defs);
  }

  // Marcador de seta para a esquerda
  const arrowLeft = el('marker', {
    id: 'arrowLeft',
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 3,
    orient: 'auto',
    markerUnits: 'strokeWidth',
  });
  const arrowLeftPath = el('path', {
    d: 'M0,0 L0,6 L9,3 z',
    fill: '#ffffff',
  });
  arrowLeft.appendChild(arrowLeftPath);
  defs.appendChild(arrowLeft);

  // Marcador de seta para a direita
  const arrowRight = el('marker', {
    id: 'arrowRight',
    markerWidth: 10,
    markerHeight: 10,
    refX: 9,
    refY: 3,
    orient: 'auto',
    markerUnits: 'strokeWidth',
  });
  const arrowRightPath = el('path', {
    d: 'M0,3 L9,0 L9,6 z',
    fill: '#ffffff',
  });
  arrowRight.appendChild(arrowRightPath);
  defs.appendChild(arrowRight);

  drawGrid(layers.grid);
  drawZones(layers.zones);
  drawGoals(layers.goals);

  // Adicionar legenda na parte inferior
  drawLegend(layers.zones);
}

function drawLegend(layer) {
  if (!layer) return;

  // Posição da legenda (abaixo do campo)
  const legendY = toXY({ x: 0, y: 8 * CELL.h }).Y;
  const legendStartX = toXY({ x: 0, y: 0 }).X;
  const legendWidth = toXY({ x: 12 * CELL.w, y: 0 }).X - toXY({ x: 0, y: 0 }).X;

  // Título da legenda
  const legendTitle = el('text', {
    x: legendStartX + legendWidth / 2,
    y: legendY + 20,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 700,
    fill: '#ffffff',
  });
  legendTitle.textContent = 'LEGENDA';
  layer.appendChild(legendTitle);

  // Itens da legenda
  const legendItems = [
    { color: '#ff8c00', text: '1 - ESCANTEIO DEFENSIVO PELA DIREITA' },
    { color: '#ffd700', text: '73 - ESCANTEIO DEFENSIVO PELA ESQUERDA' },
    { color: '#ff4500', text: '38 - MARCA DO PÊNALTI DEFENSIVO' },
    { color: '#00bfff', text: '12 - ESCANTEIO OFENSIVO PELA ESQUERDA' },
    { color: '#90ee90', text: '84 - ESCANTEIO OFENSIVO PELA DIREITA' },
    { color: '#da70d6', text: '47 - MARCA DO PÊNALTI OFENSIVO' },
  ];

  const itemsPerRow = 2;
  const itemWidth = legendWidth / itemsPerRow;
  const itemHeight = 25;

  legendItems.forEach((item, index) => {
    const row = Math.floor(index / itemsPerRow);
    const col = index % itemsPerRow;
    const x = legendStartX + col * itemWidth + 20;
    const y = legendY + 50 + row * itemHeight;

    // Quadrado colorido
    const colorSquare = el('rect', {
      x: x,
      y: y - 8,
      width: 16,
      height: 16,
      fill: item.color,
      stroke: '#ffffff',
      'stroke-width': 1,
    });
    layer.appendChild(colorSquare);

    // Texto da legenda
    const legendText = el('text', {
      x: x + 25,
      y: y,
      'text-anchor': 'start',
      'dominant-baseline': 'middle',
      'font-family': 'Inter, Arial, sans-serif',
      'font-size': 15,
      'font-weight': 600,
      fill: '#ffffff',
    });
    legendText.textContent = item.text;
    layer.appendChild(legendText);
  });
}

function initZonesToggle() {
  const cb = document.getElementById('toggleZones');
  if (!cb) return;
  const apply = () => {
    const show = cb.checked;
    const display = show ? 'block' : 'none';
    if (zonesOverlay) zonesOverlay.style.display = display;
    if (zonesOverlay2) zonesOverlay2.style.display = display;
  };
  cb.addEventListener('change', apply);
  apply();
}

// Inicializações
// Campos limpos: não carregar times automaticamente
initTeamInteractions();
initAggregationControls();
initEditor();
initExtraFieldsToggle();

// Pré-preenchimento para testes: carregar dois times com dados existentes
function autoPopulateForTesting() {
  // Escolhas baseadas nos arquivos presentes em /data
  const home = 'cruzeiro';
  const away = 'palmeiras';
  // Suprimir escudos apenas na carga inicial da página
  loadTeamData(home, { showCrest: false });
  loadTeamData2(away, { showCrest: false });
}

// autoPopulateForTesting(); // Desabilitado: página inicial deve ficar limpa

// Exportação dos campinhos em PNG (alta definição) e botões de download
function svgToDataUrl(svgEl, { showTitles = true, exportPaddingTop = 0, hideLayers = false, titleYOffset = 0, hidePositionSummary = false } = {}) {
  if (!svgEl) return '';
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(WIDTH));
  clone.setAttribute('height', String(HEIGHT + (exportPaddingTop || 0)));

  // Mostrar/ocultar títulos e ajustar Y opcionalmente
  const titles = clone.querySelectorAll('#cxTitleLeft, #cxTitleRight');
  titles.forEach(g => {
    g.style.display = showTitles ? 'block' : 'none';
    if (showTitles && titleYOffset) {
      const textEl = g.querySelector('text');
      if (textEl) {
        const y = Number(textEl.getAttribute('y')) || 26;
        textEl.setAttribute('y', String(y + titleYOffset));
      }
    }
  });

  // Opcional: esconder camadas de eventos e marcas d'água
  if (hideLayers) {
    const selectors = [
      '#defensiveLayer', '#offensiveLayer',
      '#defensiveLayer2', '#offensiveLayer2',
      '#defensiveLayerLx', '#offensiveLayerLx',
      '#defensiveLayerRx', '#offensiveLayerRx',
      '#crestWatermark', '#crestWatermark2', '#crestWatermarkLx', '#crestWatermarkRx'
    ];
    selectors.forEach(sel => {
      const el = clone.querySelector(sel);
      if (el) el.style.display = 'none';
    });
  }

  // Opcional: esconder a legenda/resumo inferior para evitar duplicação
  if (hidePositionSummary) {
    const summaries = clone.querySelectorAll('#positionSummary, #positionSummaryLeft, #positionSummaryRight');
    summaries.forEach(s => { s.style.display = 'none'; });
  }

  const s = new XMLSerializer().serializeToString(clone);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    // Ajuda com CORS em alguns navegadores; mesmo origem deve bastar
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function exportFieldAsPng(pitchEl, overlayEl, scale = 6) {
  if (!pitchEl || !overlayEl) throw new Error('SVGs do campo não encontrados');
  const canvas = document.createElement('canvas');
  const EXPORT_TOP_PADDING = 56; // espaço extra acima do campo para o título
  canvas.width = WIDTH * scale;
  canvas.height = (HEIGHT + EXPORT_TOP_PADDING) * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // URLs para exportação com padding superior
  const pitchUrl = svgToDataUrl(pitchEl, { exportPaddingTop: EXPORT_TOP_PADDING, showTitles: false });
  const overlayNoTitleUrl = svgToDataUrl(overlayEl, { exportPaddingTop: EXPORT_TOP_PADDING, showTitles: false });
  const overlayTitleOnlyUrl = svgToDataUrl(overlayEl, { exportPaddingTop: EXPORT_TOP_PADDING, showTitles: true, hideLayers: true, hidePositionSummary: true, titleYOffset: -24 });

  // Desenhar gramado e eventos deslocados para baixo (criando margem superior)
  const pitchImg = await loadImage(pitchUrl);
  ctx.drawImage(pitchImg, 0, EXPORT_TOP_PADDING, WIDTH, HEIGHT);

  const overlayImg = await loadImage(overlayNoTitleUrl);
  ctx.drawImage(overlayImg, 0, EXPORT_TOP_PADDING, WIDTH, HEIGHT);

  // Desenhar apenas os títulos no topo, sem deslocamento
  const overlayTitleImg = await loadImage(overlayTitleOnlyUrl);
  ctx.drawImage(overlayTitleImg, 0, 0, WIDTH, HEIGHT + EXPORT_TOP_PADDING);

  // Desenhar manualmente o escudo (imagem raster) para garantir presença na exportação
  try {
    const crestEl = overlayEl.querySelector('#crestImg') || overlayEl.querySelector('#crestImg2');
    const groupEl = overlayEl.querySelector('#crestWatermark') || overlayEl.querySelector('#crestWatermark2');
    if (crestEl && groupEl && groupEl.style.display !== 'none') {
      const href = crestEl.getAttribute('href') || crestEl.getAttribute('xlink:href');
      const x = Number(crestEl.getAttribute('x')) || 0;
      const y = (Number(crestEl.getAttribute('y')) || 0) + EXPORT_TOP_PADDING;
      const w = Number(crestEl.getAttribute('width')) || 200;
      const h = Number(crestEl.getAttribute('height')) || 200;
      if (href) {
        const absUrl = new URL(href, window.location.href).toString();
        const crestImg = await loadImage(absUrl);
        const alpha = parseFloat(groupEl.getAttribute('opacity') || '1');
        ctx.save();
        ctx.globalAlpha = Number.isFinite(alpha) ? alpha : 1;
        ctx.drawImage(crestImg, x, y, w, h);
        ctx.restore();
      }
    }
  } catch (e) {
    // Se falhar, seguimos com o restante sem interromper o download
  }

  return canvas.toDataURL('image/png');
}

function initDownloadButtons() {
  const btn1 = document.getElementById('downloadField1');
  const btn2 = document.getElementById('downloadField2');
  const btn1x = document.getElementById('downloadField1x');
  const btn2x = document.getElementById('downloadField2x');
  if (btn1) {
    btn1.addEventListener('click', async () => {
      try {
        const pitchEl = document.getElementById('pitch');
        const overlayEl = document.getElementById('overlay');
        const dataUrl = await exportFieldAsPng(pitchEl, overlayEl, 6);
        const a = document.createElement('a');
        const base = slugify(currentTeamLeft || 'campo1');
        a.href = dataUrl;
        a.download = `${base}-mapa.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        alert('Falha ao exportar o campo 1: ' + (err && err.message ? err.message : 'desconhecida'));
      }
    });
  }
  if (btn2) {
    btn2.addEventListener('click', async () => {
      try {
        const pitchEl = document.getElementById('pitch2');
        const overlayEl = document.getElementById('overlay2');
        const dataUrl = await exportFieldAsPng(pitchEl, overlayEl, 6);
        const a = document.createElement('a');
        const base = slugify(currentTeamRight || 'campo2');
        a.href = dataUrl;
        a.download = `${base}-mapa.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        alert('Falha ao exportar o campo 2: ' + (err && err.message ? err.message : 'desconhecida'));
      }
    });
  }
  if (btn1x) {
    btn1x.addEventListener('click', async () => {
      try {
        const pitchEl = document.getElementById('pitchLx');
        const overlayEl = document.getElementById('overlayLx');
        const dataUrl = await exportFieldAsPng(pitchEl, overlayEl, 6);
        const a = document.createElement('a');
        const base = slugify(currentTeamLeftExtra || 'campo1-extra');
        a.href = dataUrl;
        a.download = `${base}-mapa.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        alert('Falha ao exportar o campo extra (mandante): ' + (err && err.message ? err.message : 'desconhecida'));
      }
    });
  }
  if (btn2x) {
    btn2x.addEventListener('click', async () => {
      try {
        const pitchEl = document.getElementById('pitchRx');
        const overlayEl = document.getElementById('overlayRx');
        const dataUrl = await exportFieldAsPng(pitchEl, overlayEl, 6);
        const a = document.createElement('a');
        const base = slugify(currentTeamRightExtra || 'campo2-extra');
        a.href = dataUrl;
        a.download = `${base}-mapa.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        alert('Falha ao exportar o campo extra (visitante): ' + (err && err.message ? err.message : 'desconhecida'));
      }
    });
  }
}

// Inicializa os botões de download após o restante
initDownloadButtons();
function initExtraFieldsToggle() {
  const btnL = document.getElementById('addExtraLeftBtn');
  const btnR = document.getElementById('addExtraRightBtn');
  const canvasLx = document.getElementById('canvasLx');
  const canvasRx = document.getElementById('canvasRx');
  const captionLx = document.getElementById('captionLx');
  const captionRx = document.getElementById('captionRx');
  const hideL = document.getElementById('hideExtraLeftBtn');
  const hideR = document.getElementById('hideExtraRightBtn');
  if (btnL && canvasLx) {
    btnL.addEventListener('click', () => {
      canvasLx.style.display = 'block';
      btnL.style.display = 'none';
      if (captionLx) captionLx.style.display = 'block';
    });
  }
  if (btnR && canvasRx) {
    btnR.addEventListener('click', () => {
      canvasRx.style.display = 'block';
      btnR.style.display = 'none';
      if (captionRx) captionRx.style.display = 'block';
    });
  }
  if (hideL) {
    hideL.addEventListener('click', () => {
      if (canvasLx) canvasLx.style.display = 'none';
      if (captionLx) captionLx.style.display = 'none';
      if (btnL) btnL.style.display = 'inline-block';
    });
  }
  if (hideR) {
    hideR.addEventListener('click', () => {
      if (canvasRx) canvasRx.style.display = 'none';
      if (captionRx) captionRx.style.display = 'none';
      if (btnR) btnR.style.display = 'inline-block';
    });
  }
}

function initAggregationControls() {
  window.__aggregationSettings = { count: 3, mode: 'seguidas' };
  const rc = document.getElementById('roundCountSelect');
  const sm = document.getElementById('selectionMode');
  if (rc) {
    rc.addEventListener('change', (e) => {
      const v = Number(e.target.value) || 3;
      window.__aggregationSettings.count = v;
      if (window.currentTeamLeft) loadTeamData(window.currentTeamLeft);
      if (window.currentTeamRight) loadTeamData2(window.currentTeamRight);
      if (window.currentTeamLeftExtra) loadTeamDataLeftExtra(window.currentTeamLeftExtra);
      if (window.currentTeamRightExtra) loadTeamDataRightExtra(window.currentTeamRightExtra);
    });
  }
  if (sm) {
    sm.addEventListener('change', (e) => {
      const v = String(e.target.value || 'seguidas');
      window.__aggregationSettings.mode = v;
      if (window.currentTeamLeft) loadTeamData(window.currentTeamLeft);
      if (window.currentTeamRight) loadTeamData2(window.currentTeamRight);
      if (window.currentTeamLeftExtra) loadTeamDataLeftExtra(window.currentTeamLeftExtra);
      if (window.currentTeamRightExtra) loadTeamDataRightExtra(window.currentTeamRightExtra);
    });
  }
}

function initEditor() {
  const modal = document.getElementById('editorModal');
  const openBtn = document.getElementById('openEditorBtn');
  const closeBtn = document.getElementById('closeEditorBtn');
  const overlay = document.getElementById('editorOverlay');
  const pitch = document.getElementById('editorPitch');

  const homeSelect = document.getElementById('editorHomeSelect');
  const awaySelect = document.getElementById('editorAwaySelect');

  const roundInput = document.getElementById('editorRound');
  const opponentInput = document.getElementById('editorOpponent');
  const toolSelect = document.getElementById('editorTool');

  const traceCheck = document.getElementById('editorTrace');
  const saveRoundBtn = document.getElementById('editorSaveRoundBtn');
  const exportBtn = document.getElementById('editorExportBtn');
  const listEl = document.getElementById('editorEventsList');
  const addTestGoalsBtn = document.getElementById('editorAddTestGoalsBtn');

  if (!modal || !overlay) return;

  const TEAMS = [
    { key: 'atletico-mg', name: 'Atlético MG' },
    { key: 'athletico-pr', name: 'Athletico-PR' },
    { key: 'bahia', name: 'Bahia' },
    { key: 'botafogo', name: 'Botafogo' },
    { key: 'chapecoense', name: 'Chapecoense' },
    { key: 'corinthians', name: 'Corinthians' },
    { key: 'coritiba', name: 'Coritiba' },
    { key: 'cruzeiro', name: 'Cruzeiro' },
    { key: 'flamengo', name: 'Flamengo' },
    { key: 'fluminense', name: 'Fluminense' },
    { key: 'gremio', name: 'Grêmio' },
    { key: 'internacional', name: 'Internacional' },
    { key: 'mirassol', name: 'Mirassol' },
    { key: 'palmeiras', name: 'Palmeiras' },
    { key: 'red-bull-bragantino', name: 'Red Bull Bragantino' },
    { key: 'remo', name: 'Remo' },
    { key: 'santos', name: 'Santos' },
    { key: 'sao-paulo', name: 'São Paulo' },
    { key: 'vasco', name: 'Vasco' },
    { key: 'vitoria', name: 'Vitória' }
  ];

  function populateTeamSelect(select) {
    if (!select) return;
    select.innerHTML = '';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = 'Selecione…';
    select.appendChild(optEmpty);
    TEAMS.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.key;
      opt.textContent = String(t.name || '').toUpperCase();
      select.appendChild(opt);
    });
  }

  populateTeamSelect(homeSelect);
  populateTeamSelect(awaySelect);

  const state = {
    homeTeamKey: null,
    awayTeamKey: null,
    roundEvents: [],
    roundsHome: {},
    roundsAway: {}
  };

  function showModal(show) {
    modal.style.display = show ? 'block' : 'none';
    if (show) {
      drawEditorGrid();
      // Carregar dados automaticamente ao abrir o Editor se houver time e rodada selecionados
      const teamKey = homeSelect && homeSelect.value ? homeSelect.value : (awaySelect && awaySelect.value ? awaySelect.value : null);
      const roundNo = Number(roundInput.value) || 1;
      if (teamKey && roundNo) {
        setTimeout(() => loadRoundDataIntoEditor(teamKey, roundNo), 100);
      }
    }
  }
  window.__showEditorModal = showModal;
  if (openBtn) openBtn.addEventListener('click', () => showModal(true));
  if (closeBtn) closeBtn.addEventListener('click', () => showModal(false));

  homeSelect && homeSelect.addEventListener('change', () => {
    const val = homeSelect.value || null;
    state.homeTeamKey = val || null;
  });
  awaySelect && awaySelect.addEventListener('change', () => {
    const val = awaySelect.value || null;
    state.awayTeamKey = val || null;
  });

  const ns = 'http://www.w3.org/2000/svg';
  function addMarker(pt, kind) {
    let el;
    if (kind === 'assist') {
      el = document.createElementNS(ns, 'circle');
      el.setAttribute('cx', pt.x);
      el.setAttribute('cy', pt.y);
      el.setAttribute('r', '10');
      el.setAttribute('fill', '#ffffff');
      el.setAttribute('stroke', '#0f172a');
      el.setAttribute('stroke-width', '2');
    } else {
      // Marcador de finalização (Gol, Gol Contra ou Pênalti)
      el = document.createElementNS(ns, 'text');
      el.setAttribute('x', pt.x);
      el.setAttribute('y', pt.y);
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('dominant-baseline', 'middle');
      el.setAttribute('font-size', '22');
      el.setAttribute('font-weight', 'bold');
      el.textContent = '⚽';

      if (kind === 'own') {
        // Vermelho Sutil
        el.style.filter = 'sepia(1) saturate(20) hue-rotate(315deg) brightness(0.9)';
      } else if (kind === 'penalty') {
        // Verde claro
        el.style.filter = 'sepia(1) saturate(50) hue-rotate(80deg) brightness(1.3)';
      }
    }
    el.style.cursor = 'pointer';
    overlay.appendChild(el);
    return el;
  }
  function drawTrace(a, g) {
    if (!a || !g) return null;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', g.x);
    line.setAttribute('y2', g.y);
    line.setAttribute('stroke', '#f7d36a');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '4 3');
    overlay.appendChild(line);
    return line;
  }

  // Painel elegante com estatísticas de gols por posição (Editor)
  function drawEditorPositionStatsPanel() {
    const panelId = 'positionStatsPanel';
    const existing = overlay.querySelector(`#${panelId}`);
    if (existing) existing.remove();

    // Contar finalizações (gols) por posição do autor do chute
    const counts = { Goleiro: 0, 'Lateral D': 0, 'Lateral E': 0, Zagueiro: 0, Meia: 0, Atacante: 0 };
    for (const ev of state.roundEvents) {
      if (ev && ev.shotPt && ev.shotPlayer && ev.shotPlayer.position) {
        const p = ev.shotPlayer.position;
        if (p === 'Lateral') {
          const key = ev.shotPlayer.side === 'LD' ? 'Lateral D' : (ev.shotPlayer.side === 'LE' ? 'Lateral E' : null);
          if (key) counts[key] += 1;
        } else if (counts.hasOwnProperty(p)) {
          counts[p] += 1;
        }
      }
    }

    // Se não houver dados, não desenhar painel
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', panelId);
    g.setAttribute('filter', 'url(#ds)');

    const x = 1020, y = 24, w = 240, h = 160;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '10');
    rect.setAttribute('ry', '10');
    rect.setAttribute('fill', '#0f172a');
    rect.setAttribute('fill-opacity', '0.85');
    rect.setAttribute('stroke', '#e7f8f1');
    rect.setAttribute('stroke-opacity', '0.85');
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    const header = document.createElementNS(ns, 'text');
    header.setAttribute('x', String(x + 16));
    header.setAttribute('y', String(y + 28));
    header.setAttribute('fill', '#f7d36a');
    header.setAttribute('font-weight', '700');
    header.setAttribute('font-size', '16');
    header.textContent = 'Gols por Posição';
    g.appendChild(header);

    const lines = [
      { label: 'Goleiro', val: counts.Goleiro },
      { label: 'Lateral Direita', val: counts['Lateral D'] },
      { label: 'Lateral Esquerda', val: counts['Lateral E'] },
      { label: 'Zagueiro', val: counts.Zagueiro },
      { label: 'Meia', val: counts.Meia },
      { label: 'Atacante', val: counts.Atacante },
    ];
    let dy = y + 54;
    for (const { label, val } of lines) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String(x + 16));
      t.setAttribute('y', String(dy));
      t.setAttribute('fill', '#e7f8f1');
      t.setAttribute('font-size', '14');
      t.textContent = `${label}: ${val}`;
      g.appendChild(t);
      dy += 22;
    }

    const totalText = document.createElementNS(ns, 'text');
    totalText.setAttribute('x', String(x + 16));
    totalText.setAttribute('y', String(y + h - 14));
    totalText.setAttribute('fill', '#e7f8f1');
    totalText.setAttribute('font-weight', '700');
    totalText.setAttribute('font-size', '14');
    totalText.textContent = `Total: ${total}`;
    g.appendChild(totalText);

    overlay.appendChild(g);
  }

  function updateList() {
    // Limpar lista
    listEl.innerHTML = '';

    state.roundEvents.forEach((ev, i) => {
      const pc = ev.assistPt ? cellIndexFromPoint(ev.assistPt.x, ev.assistPt.y) : '-';
      const sc = ev.shotPt ? cellIndexFromPoint(ev.shotPt.x, ev.shotPt.y) : '-';
      const pcMirror = pc !== '-' ? mirrorCellIndex(pc) : '-';
      const scMirror = sc !== '-' ? mirrorCellIndex(sc) : '-';

      const assistText = pc === '-' ? '-' : `${pc} ↔ ${pcMirror}`;
      const shotText = sc === '-' ? '-' : `${sc} ↔ ${scMirror}`;

      // Adicionar informações dos jogadores (inclui LD/LE para laterais)
      const fmtPos = (p, s) => {
        if (!p) return '';
        if (p === 'Lateral') return s ? `Lateral ${s}` : 'Lateral';
        return p;
      };
      const assistPlayer = ev.assistPlayer ? ` [${ev.assistPlayer.name} - ${fmtPos(ev.assistPlayer.position, ev.assistPlayer.side)}]` : '';
      const shotPlayer = ev.shotPlayer ? ` [${ev.shotPlayer.name} - ${fmtPos(ev.shotPlayer.position, ev.shotPlayer.side)}]` : '';
      const ownTag = ev.isOwnGoal ? ` (GC: ${ev.ownGoalSide === 'visitante' ? 'Visitante' : 'Mandante'})` : '';

      const eventText = `#${i + 1} Assist: ${assistText}${assistPlayer} | Final: ${shotText}${shotPlayer}${ownTag}`;

      // Criar elemento do evento com botão de deletar
      const eventDiv = document.createElement('div');
      eventDiv.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin:4px 8px 4px 0;padding:4px 8px;background:#1a6b4f;border-radius:4px';

      const eventSpan = document.createElement('span');
      eventSpan.textContent = eventText;
      eventSpan.style.cssText = 'color:#e7f8f1;font-size:13px';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✖';
      deleteBtn.title = 'Deletar este evento';
      deleteBtn.style.cssText = 'background:#dc2626;color:#fff;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;font-size:12px;font-weight:bold';
      deleteBtn.addEventListener('click', () => deleteEvent(i));

      eventDiv.appendChild(eventSpan);
      eventDiv.appendChild(deleteBtn);
      listEl.appendChild(eventDiv);
    });

    // Atualizar painel de estatísticas por posição no overlay do editor
    // (Removido a pedido do usuário)
    // drawEditorPositionStatsPanel();
  }

  // Função para deletar um evento específico
  function deleteEvent(index) {
    if (index < 0 || index >= state.roundEvents.length) return;

    const ev = state.roundEvents[index];

    // Remover elementos visuais do overlay
    if (ev.assistEl) {
      try { overlay.removeChild(ev.assistEl); } catch { }
    }
    if (ev.shotEl) {
      try { overlay.removeChild(ev.shotEl); } catch { }
    }
    if (ev.traceEl) {
      try { overlay.removeChild(ev.traceEl); } catch { }
    }

    // Remover evento do array
    state.roundEvents.splice(index, 1);

    // Atualizar lista
    updateList();
  }

  // Estado para seleção de jogadores
  let pendingPlayerSelection = null;

  overlay.addEventListener('click', (evt) => {
    const p = overlay.createSVGPoint();
    p.x = evt.clientX;
    p.y = evt.clientY;
    const m = overlay.getScreenCTM();
    const sp = m ? p.matrixTransform(m.inverse()) : { x: (evt.offsetX) * (1000 / overlay.clientWidth), y: (evt.offsetY) * (600 / overlay.clientHeight) };
    const pt = { x: sp.x, y: sp.y };

    const tool = toolSelect ? toolSelect.value : 'assist';
    let current = state.roundEvents[state.roundEvents.length - 1];
    // Regra: se o último evento já tem uma finalização sem assistência,
    // começar um novo evento para não acoplar automaticamente.
    // MAS: Se for pênalti ou gol contra, sempre criar novo, pois não tem assistência.
    const isSoloEvent = (tool === 'own' || tool === 'penalty');

    const shouldStartNew = (
      !current ||
      (current.assistPt && current.shotPt) ||
      (current.shotPt && !current.assistPt) || // último é "gol sem assistência" -> iniciar novo
      isSoloEvent // Se a ferramenta atual é solo, força novo evento
    );

    if (shouldStartNew) {
      current = { assistPt: null, shotPt: null, assistEl: null, shotEl: null, traceEl: null, assistPlayer: null, shotPlayer: null, isOwnGoal: false, ownGoalSide: null, isPenalty: false };
      state.roundEvents.push(current);
    }

    const el = addMarker(pt, tool);
    if (tool === 'assist') {
      current.assistPt = pt;
      current.assistEl = el;
    } else {
      current.shotPt = pt;
      current.shotEl = el;
      if (tool === 'own') {
        // Marcar como gol contra
        current.isOwnGoal = true;
        current.isPenalty = false;

        // Nova Lógica: Inferir quem fez o gol contra baseado no lado do clique.
        // Se clicou na direita (ataque do Mandante) -> Gol a favor do Mandante -> Quem fez contra foi o Visitante.
        // Se clicou na esquerda (ataque do Visitante) -> Gol a favor do Visitante -> Quem fez contra foi o Mandante.
        const sideKind = classifyByShot(pt); // 'created' (direita) ou 'conceded' (esquerda)
        current.ownGoalSide = (sideKind === 'created') ? 'visitante' : 'mandante';
      } else if (tool === 'penalty') {
        // Marcar como pênalti
        current.isPenalty = true;
        current.isOwnGoal = false;
        current.ownGoalSide = null;
      } else {
        // Gol normal
        current.isOwnGoal = false;
        current.isPenalty = false;
      }
    }

    // Traçado automático quando ambos existirem
    if (traceCheck && traceCheck.checked && current.assistPt && current.shotPt) {
      const lineEl = drawTrace(current.assistPt, current.shotPt);
      current.traceEl = lineEl;
    }

    // Permitir apagar clicando no próprio marcador
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      try { overlay.removeChild(el); } catch { }
      if (tool === 'assist') {
        current.assistPt = null;
        current.assistEl = null;
        current.assistPlayer = null;
      } else {
        current.shotPt = null;
        current.shotEl = null;
        current.shotPlayer = null;
        if (tool === 'own') {
          current.isOwnGoal = false;
          current.ownGoalSide = null;
        }
      }
      if (current.traceEl) {
        try { overlay.removeChild(current.traceEl); } catch { }
        current.traceEl = null;
      }
      // Se o evento ficou vazio, remove do array
      if (!current.assistPt && !current.shotPt) {
        state.roundEvents.pop();
      }
      updateList();
    });

    // Abrir painel de seleção de jogadores (incluindo gol contra)
    openPlayerSelectionPanel(current, tool);

    updateList();
  });



  // Botão para adicionar eventos de teste rapidamente
  if (addTestGoalsBtn) {
    addTestGoalsBtn.addEventListener('click', () => {
      // Criar jogadores fictícios com diferentes posições
      const fictitiousPlayers = [
        { name: 'Zagueiro Teste', position: 'Zagueiro', side: null },
        { name: 'Lateral E Teste', position: 'Lateral', side: 'LE' },
        { name: 'Lateral D Teste', position: 'Lateral', side: 'LD' },
        { name: 'Meia Teste', position: 'Meia', side: null },
        { name: 'Atacante Teste', position: 'Atacante', side: null }
      ];

      // Evento 1: Gol de Atacante com assistência de Meia (lado direito - ofensivo)
      const ev1 = {
        assistPt: { x: 700, y: 250 },
        shotPt: { x: 839.17, y: 300 },
        assistEl: null,
        shotEl: null,
        traceEl: null,
        assistPlayer: fictitiousPlayers[3], // Meia
        shotPlayer: fictitiousPlayers[4], // Atacante
        isOwnGoal: false,
        ownGoalSide: null
      };
      ev1.assistEl = drawAssistMarker(ev1.assistPt);
      ev1.shotEl = drawShotEmoji(ev1.shotPt);
      if (traceCheck && traceCheck.checked) {
        ev1.traceEl = drawTrace(ev1.assistPt, ev1.shotPt);
      }
      state.roundEvents.push(ev1);

      // Evento 2: Gol contra do mandante (lado esquerdo)
      const ev2 = {
        assistPt: null,
        shotPt: { x: 160.83, y: 300 },
        assistEl: null,
        shotEl: null,
        traceEl: null,
        assistPlayer: null,
        shotPlayer: null,
        isOwnGoal: true,
        ownGoalSide: 'mandante'
      };
      ev2.shotEl = drawShotEmoji(ev2.shotPt);
      state.roundEvents.push(ev2);

      // Evento 3: Gol de Lateral D com assistência de Zagueiro (lado direito - ofensivo)
      const ev3 = {
        assistPt: { x: 650, y: 450 },
        shotPt: { x: 800, y: 400 },
        assistEl: null,
        shotEl: null,
        traceEl: null,
        assistPlayer: fictitiousPlayers[0], // Zagueiro
        shotPlayer: fictitiousPlayers[2], // Lateral D
        isOwnGoal: false,
        ownGoalSide: null
      };
      ev3.assistEl = drawAssistMarker(ev3.assistPt);
      ev3.shotEl = drawShotEmoji(ev3.shotPt);
      if (traceCheck && traceCheck.checked) {
        ev3.traceEl = drawTrace(ev3.assistPt, ev3.shotPt);
      }
      state.roundEvents.push(ev3);

      // Evento 4: Gol de Meia sem assistência (lado direito - ofensivo)
      const ev4 = {
        assistPt: null,
        shotPt: { x: 750, y: 200 },
        assistEl: null,
        shotEl: null,
        traceEl: null,
        assistPlayer: null,
        shotPlayer: fictitiousPlayers[3], // Meia
        isOwnGoal: false,
        ownGoalSide: null
      };
      ev4.shotEl = drawShotEmoji(ev4.shotPt);
      state.roundEvents.push(ev4);

      updateList();
    });
  }

  // ===== PAINEL DE SELEÇÃO DE JOGADORES =====

  const playerPanel = document.getElementById('playerSelectionPanel');
  const playerEventType = document.getElementById('playerEventType');
  const playerTeamSelect = document.getElementById('playerTeamSelect');
  const playerPositionFilter = document.getElementById('playerPositionFilter');
  const playerSelect = document.getElementById('playerSelect');
  const selectedPlayerInfo = document.getElementById('selectedPlayerInfo');
  const playerFullName = document.getElementById('playerFullName');
  const playerPosition = document.getElementById('playerPosition');
  const playerTeam = document.getElementById('playerTeam');
  const playerSideRow = document.getElementById('playerSideRow');
  const playerSideSelect = document.getElementById('playerSideSelect');
  const confirmPlayerBtn = document.getElementById('confirmPlayerBtn');
  const cancelPlayerBtn = document.getElementById('cancelPlayerBtn');

  // Populat team select no painel de jogadores
  function populatePlayerTeamSelect() {
    if (!playerTeamSelect) return;
    playerTeamSelect.innerHTML = '<option value="">Selecione o time...</option>';
    TEAMS.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.key;
      opt.textContent = String(t.name || '').toUpperCase();
      playerTeamSelect.appendChild(opt);
    });
  }

  function openPlayerSelectionPanel(eventObj, eventType) {
    if (!playerPanel) return;

    pendingPlayerSelection = { eventObj, eventType };

    // Verificar se é gol contra
    const isOwnGoal = eventObj.isOwnGoal || false;

    // Configurar tipo do evento
    if (playerEventType) {
      if (isOwnGoal) {
        playerEventType.textContent = 'GOL CONTRA';
      } else {
        playerEventType.textContent = eventType === 'assist' ? 'ASSISTÊNCIA' : 'GOL';
      }
    }

    // Mostrar/esconder campos apropriados
    const ownGoalNameRow = document.getElementById('ownGoalPlayerNameRow');
    const playerTeamRow = playerTeamSelect?.parentElement;
    const playerPosRow = playerPositionFilter?.parentElement;
    const playerSelectRow = playerSelect?.parentElement;
    const playerSideRowEl = document.getElementById('playerSideRow');

    // Sempre mostrar seleção de jogador (mesmo para gol contra)
    // Gol contra agora permite selecionar jogador completo, mas lógica de sugestão de time é invertida
    if (ownGoalNameRow) ownGoalNameRow.style.display = 'none'; // Ocultar campo de texto simples
    if (playerTeamRow) playerTeamRow.style.display = 'block';
    if (playerPosRow) playerPosRow.style.display = 'block';
    if (playerSelectRow) playerSelectRow.style.display = 'block';

    // Sugerir time baseado no lado do campo clicado
    const point = (eventType === 'assist') ? eventObj.assistPt : eventObj.shotPt;
    let suggestedTeam = null;

    if (point && state.homeTeamKey && state.awayTeamKey) {
      const kind = classifyByShot(point); // 'created' (ataque do mandante) ou 'conceded' (ataque do visitante)

      if (isOwnGoal) {
        // Lógica Invertida para Gol Contra:
        // Se o gol é do Mandante ('created'), quem fez contra foi o Visitante.
        // Se o gol é do Visitante ('conceded'), quem fez contra foi o Mandante.
        suggestedTeam = (kind === 'created') ? state.awayTeamKey : state.homeTeamKey;
      } else {
        // Lógica Normal:
        // Se o gol é do Mandante, quem fez foi o Mandante.
        suggestedTeam = (kind === 'created') ? state.homeTeamKey : state.awayTeamKey;
      }
    } else {
      // Fallback
      suggestedTeam = state.homeTeamKey || '';
    }

    if (playerTeamSelect) {
      playerTeamSelect.value = suggestedTeam || '';
      updatePlayersByTeam();
    }

    // Mostrar painel
    playerPanel.style.display = 'block';
  }

  function closePlayerSelectionPanel() {
    if (!playerPanel) return;
    playerPanel.style.display = 'none';
    pendingPlayerSelection = null;
    resetPlayerSelection();
  }

  function resetPlayerSelection() {
    if (playerTeamSelect) playerTeamSelect.value = '';
    if (playerPositionFilter) playerPositionFilter.value = '';
    if (playerSelect) playerSelect.value = '';
    if (selectedPlayerInfo) selectedPlayerInfo.style.display = 'none';
    if (confirmPlayerBtn) confirmPlayerBtn.disabled = true;
  }

  function updatePlayersByTeam() {
    if (!playerSelect || !playerTeamSelect) return;

    const teamKey = playerTeamSelect.value;
    const positionFilter = playerPositionFilter ? playerPositionFilter.value : '';

    playerSelect.innerHTML = '<option value="">Selecione o jogador...</option>';

    if (!teamKey) return;

    const teamPlayers = getPlayersByTeam(teamKey);
    const filteredPlayers = positionFilter
      ? teamPlayers.filter(p => p.position === positionFilter)
      : teamPlayers;

    filteredPlayers.forEach(player => {
      const opt = document.createElement('option');
      opt.value = player.id;
      opt.textContent = `${player.apelido} (${player.position})`;
      opt.dataset.playerData = JSON.stringify(player);
      playerSelect.appendChild(opt);
    });

    // Mostrar seletor de lado apenas quando filtrado por Lateral
    if (playerSideRow) {
      playerSideRow.style.display = (positionFilter === 'Lateral') ? 'block' : 'none';
      if (positionFilter !== 'Lateral' && playerSideSelect) playerSideSelect.value = '';
    }
  }

  function updateSelectedPlayerInfo() {
    if (!playerSelect || !selectedPlayerInfo) return;

    const selectedOption = playerSelect.options[playerSelect.selectedIndex];
    if (!selectedOption || !selectedOption.dataset.playerData) {
      selectedPlayerInfo.style.display = 'none';
      if (confirmPlayerBtn) confirmPlayerBtn.disabled = true;
      return;
    }

    const player = JSON.parse(selectedOption.dataset.playerData);

    if (playerFullName) playerFullName.textContent = player.nome_completo;
    if (playerPosition) playerPosition.textContent = player.position;
    if (playerTeam) playerTeam.textContent = DISPLAY_NAME_MAP[player.teamKey] || player.teamKey;

    // Se o jogador for Lateral, obrigar seleção de lado
    if (playerSideRow) {
      const isLateral = player.position === 'Lateral';
      playerSideRow.style.display = isLateral ? 'block' : 'none';
      if (!isLateral && playerSideSelect) playerSideSelect.value = '';
    }

    selectedPlayerInfo.style.display = 'block';
    if (confirmPlayerBtn) {
      const requiresSide = (player.position === 'Lateral');
      const hasSide = playerSideSelect ? (playerSideSelect.value || '').length > 0 : true;
      confirmPlayerBtn.disabled = requiresSide && !hasSide ? true : false;
    }
  }

  function confirmPlayerSelection() {
    if (!pendingPlayerSelection) return;

    const { eventObj, eventType } = pendingPlayerSelection;

    // Verificar se é gol contra (agora usa seleção completa de jogador também)
    // if (eventObj.isOwnGoal) ... (Lógica removida, agora unificada)

    // Lógica unificada para gol normal e gol contra
    if (!playerSelect) return;
    const selectedOption = playerSelect.options[playerSelect.selectedIndex];
    if (!selectedOption || !selectedOption.dataset.playerData) return;

    const player = JSON.parse(selectedOption.dataset.playerData);
    const sideVal = playerSideSelect ? (playerSideSelect.value || '') : '';

    const newPlayerData = {
      id: player.id,
      name: player.apelido,
      fullName: player.nome_completo,
      position: player.position,
      side: player.position === 'Lateral' ? (sideVal || null) : null,
      team: player.teamKey
    };

    if (eventObj.isOwnGoal) {
      // Para gol contra, salvamos em shotPlayer também, mas mantemos a flag isOwnGoal true
      // O nome 'ownGoalPlayerName' legacy pode ser removido ou mantido para retrocompatibilidade
      eventObj.ownGoalPlayerName = player.nome_completo; // Opcional
      eventObj.shotPlayer = newPlayerData;
    } else {
      if (eventType === 'assist') {
        eventObj.assistPlayer = newPlayerData;
      } else {
        eventObj.shotPlayer = newPlayerData;
      }
    }

    closePlayerSelectionPanel();
    updateList();
  }

  // Validação: impedir salvar se houver lateral sem lado (LD/LE)
  function findMissingLateralSides() {
    const missing = [];
    state.roundEvents.forEach((ev, idx) => {
      const needsSide = (p) => p && p.position === 'Lateral' && (!p.side || p.side.trim() === '');
      if (needsSide(ev.assistPlayer) || needsSide(ev.shotPlayer)) {
        missing.push(`#${idx + 1}`);
      }
    });
    return missing;
  }

  // Event listeners para o painel de jogadores
  populatePlayerTeamSelect();

  if (playerTeamSelect) {
    playerTeamSelect.addEventListener('change', updatePlayersByTeam);
  }

  if (playerPositionFilter) {
    playerPositionFilter.addEventListener('change', updatePlayersByTeam);
  }

  if (playerSelect) {
    playerSelect.addEventListener('change', updateSelectedPlayerInfo);
  }
  if (playerSideSelect) {
    playerSideSelect.addEventListener('change', () => {
      // Revalidar se podemos confirmar quando o lado é selecionado
      updateSelectedPlayerInfo();
    });
  }

  if (confirmPlayerBtn) {
    confirmPlayerBtn.addEventListener('click', confirmPlayerSelection);
  }

  if (cancelPlayerBtn) {
    cancelPlayerBtn.addEventListener('click', closePlayerSelectionPanel);
  }

  // Botões de desfazer e limpar
  const undoBtn = document.getElementById('editorUndoBtn');
  const clearBtn = document.getElementById('editorClearBtn');
  undoBtn && undoBtn.addEventListener('click', () => {
    const current = state.roundEvents[state.roundEvents.length - 1];
    if (!current) return;
    if (current.shotEl) {
      try { overlay.removeChild(current.shotEl); } catch { }
      current.shotEl = null;
      current.shotPt = null;
      if (current.traceEl) { try { overlay.removeChild(current.traceEl); } catch { }; current.traceEl = null; }
    } else if (current.assistEl) {
      try { overlay.removeChild(current.assistEl); } catch { }
      current.assistEl = null;
      current.assistPt = null;
    } else {
      state.roundEvents.pop();
    }
    updateList();
  });
  clearBtn && clearBtn.addEventListener('click', () => {
    const nodes = Array.from(overlay.querySelectorAll('text,circle,line'));
    nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
    state.roundEvents = [];
    updateList();
  });

  // Botão para limpar TODOS os gols de TODOS os times
  const clearAllBtn = document.getElementById('editorClearAllBtn');
  clearAllBtn && clearAllBtn.addEventListener('click', async () => {
    const confirmed = confirm('ATENÇÃO: Isso vai APAGAR TODOS OS GOLS de TODOS OS TIMES!\n\nTem certeza que deseja continuar?');
    if (!confirmed) return;

    try {
      const res = await fetch('/api/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Sucesso! ${data.cleared} arquivos foram limpos.`);
        // Limpar o campo do editor também
        const nodes = Array.from(overlay.querySelectorAll('text,circle,line'));
        nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
        state.roundEvents = [];
        updateList();
      } else {
        alert('Erro ao limpar os gols: ' + (data.error || 'desconhecido'));
      }
    } catch (err) {
      alert('Falha na requisição: ' + (err && err.message ? err.message : 'desconhecida'));
    }
  });

  function cellIndexFromPoint(x, y) {
    // x,y recebidos no Editor estão em coordenadas SVG (0..1000/0..600).
    // Converter para unidades lógicas do campo antes de calcular o quadrante.
    const pitchPt = fromXY({ X: x, Y: y });
    const col = clampGridCol(Math.floor(pitchPt.x / CELL.w));
    const row = clampGridRow(Math.floor(pitchPt.y / CELL.h));
    return row * GRID.cols + col + 1;
  }

  function mirrorCellIndex(index) {
    const total = GRID.rows * GRID.cols;
    const n = Math.max(1, Math.min(total, Math.round(Number(index) || 1)));
    // Pares específicos fornecidos (ataque → defesa) e inversos
    const specificPairs = {
      12: 73,
      47: 38,
      // 84↔1 não é correlação desejada (180°); manter apenas horizontal
      61: 24,
      49: 36,
      37: 48,
      25: 60,
      13: 72,
      2: 83,
      3: 81
    };
    const customMap = { ...specificPairs };
    Object.entries(specificPairs).forEach(([a, b]) => { customMap[b] = Number(a); });
    if (customMap[n]) return customMap[n];
    // Fallback: espelho horizontal (inverte a coluna, mantém a linha)
    const zero = n - 1;
    const row = Math.floor(zero / GRID.cols);
    const col = zero % GRID.cols;
    const mRow = row;
    const mCol = GRID.cols - 1 - col;
    return mRow * GRID.cols + mCol + 1;
  }

  function classifyByShot(pt) {
    const midX = PITCH.maxX / 2;
    if (!pt) return 'conceded';
    const pitchPt = fromXY({ X: pt.x, Y: pt.y });
    return pitchPt.x >= midX ? 'created' : 'conceded';
  }

  function computeRoundPayload() {
    const roundNo = parseInt(roundInput ? (roundInput.value || '1') : '1', 10);
    const oppName = opponentInput ? (opponentInput.value || '') : '';
    const homeKey = state.homeTeamKey;
    const awayKey = state.awayTeamKey;

    const createdHome = [];
    const concededHome = [];
    const createdAway = [];
    const concededAway = [];

    // Regra simples: defesa do outro time = rotação 180° do ataque
    const rotate180 = (pt) => ({ x: PITCH.maxX - pt.x, y: PITCH.maxY - pt.y });

    for (const ev of state.roundEvents) {
      if (!ev || !ev.shotPt) continue;
      const isOwn = !!ev.isOwnGoal;
      const kind = isOwn ? null : classifyByShot(ev.shotPt); // created = ataque do mandante; conceded = ataque do visitante

      // Converter pontos do Editor para unidades do campo
      const passPitch = ev.assistPt ? fromXY({ X: ev.assistPt.x, Y: ev.assistPt.y }) : null;
      const shotPitch = fromXY({ X: ev.shotPt.x, Y: ev.shotPt.y });
      const homeEvent = {
        pass: passPitch ? { x: passPitch.x, y: passPitch.y } : null,
        shot: { x: shotPitch.x, y: shotPitch.y },
        // Incluir dados dos jogadores se disponíveis (não aplicável a gol contra)
        assistPlayer: isOwn ? null : (ev.assistPlayer || null),
        shotPlayer: (ev.shotPlayer || null),
        own_goal: isOwn || undefined,
        is_penalty: ev.isPenalty || undefined
      };
      const rotated = {
        pass: homeEvent.pass ? rotate180(homeEvent.pass) : null,
        shot: rotate180(homeEvent.shot),
        // Manter os mesmos dados (nulo em gol contra / originais caso não seja)
        assistPlayer: isOwn ? null : (ev.assistPlayer || null),
        shotPlayer: (ev.shotPlayer || null),
        own_goal: isOwn || undefined,
        is_penalty: ev.isPenalty || undefined
      };

      if (isOwn) {
        // Gol contra deve contar como:
        // 1. "Conceded" para quem fez o gol contra (ownGoalSide)
        // 2. "Created" para o time adversário (beneficiário)

        if (ev.ownGoalSide === 'mandante') {
          // Mandante fez gol contra.
          // Conta como gol sofrido pelo Mandante:
          if (homeKey) concededHome.push(homeEvent);
          // Conta como gol a favor do Visitante (rotação 180° pois é para o outro lado):
          if (awayKey) createdAway.push(rotated);
        }

        if (ev.ownGoalSide === 'visitante') {
          // Visitante fez gol contra.
          // Conta como gol sofrido pelo Visitante (rotação 180°):
          if (awayKey) concededAway.push(rotated);
          // Conta como gol a favor do Mandante:
          if (homeKey) createdHome.push(homeEvent);
        }
      } else {
        if (homeKey) {
          if (kind === 'created') {
            // Ataque do mandante: salva como está
            createdHome.push(homeEvent);
          } else {
            // Ataque do visitante: defesa do mandante é o evento original
            concededHome.push(homeEvent);
          }
        }
        if (awayKey) {
          if (kind === 'created') {
            // Ataque do mandante -> defesa do visitante = rotação 180°
            concededAway.push(rotated);
          } else {
            // Ataque do visitante -> criado do visitante = rotação 180°
            createdAway.push(rotated);
          }
        }
      }
    }

    const dateVal = document.getElementById('editorDate')?.value || '';

    return {
      roundNumber: roundNo,
      homeTeamKey: homeKey,
      awayTeamKey: awayKey,
      home: homeKey ? {
        roundNumber: roundNo,
        date: dateVal,
        opponent: awayKey || oppName,
        home: true,
        created_goals: createdHome,
        conceded_goals: concededHome
      } : null,
      away: awayKey ? {
        roundNumber: roundNo,
        date: dateVal,
        opponent: homeKey || oppName,
        home: false,
        created_goals: createdAway,
        conceded_goals: concededAway
      } : null
    };
  }

  saveRoundBtn && saveRoundBtn.addEventListener('click', async () => {
    // Validação de Data (Simplificada)
    const dInput = document.getElementById('editorDate');
    if (dInput) {
      if (!dInput.value) {
        alert('⚠️ ATENÇÃO: Data do Jogo é obrigatória!\nPor favor, preencha a data antes de salvar.');
        return;
      }
    }

    const missing = findMissingLateralSides();
    if (missing.length > 0) {
      alert(`Selecione LD/LE para laterais antes de salvar. Eventos pendentes: ${missing.join(', ')}`);
      return;
    }
    const payload = computeRoundPayload();
    const rn = payload.roundNumber;
    // Alerta informativo: se apenas um dos times foi selecionado, o arquivo do adversário não será criado.
    // O campo "Adversário" serve apenas como rótulo textual para o oponente.
    const onlyOneSideSelected = (!!payload.home) !== (!!payload.away);
    if (onlyOneSideSelected) {
      alert('Você selecionou apenas um dos times. Para que os dados apareçam também no campinho do adversário, selecione Mandante e Visitante nas listas. O campo "Adversário" não cria o arquivo do outro time.');
      // Prossegue com o salvamento para o time selecionado.
    }
    if (!payload.home && !payload.away) {
      alert('Selecione Mandante e/ou Visitante nas listas suspensas.');
      return;
    }

    // Persistir no servidor
    try {
      const res = await fetch('/api/save-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Falha ao salvar no banco.');
    } catch (err) {
      alert('Erro ao salvar no banco: ' + (err && err.message ? err.message : 'desconhecido'));
      return;
    }

    // Atualizar memória local para exportação
    if (payload.home) state.roundsHome[rn] = payload.home;
    if (payload.away) state.roundsAway[rn] = payload.away;

    alert('Rodada salva com sucesso.');
    Array.from(overlay.querySelectorAll('text, circle, line')).forEach(n => n.remove());
    state.roundEvents = [];
    updateList();
    drawEditorGrid();
  });

  exportBtn && exportBtn.addEventListener('click', () => {
    function downloadJSON(obj, fname) {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', fname);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    const roundNo = parseInt(roundInput ? (roundInput.value || '1') : '1', 10);
    if (state.homeTeamKey) {
      const homeObj = state.roundsHome[roundNo] || { created_goals: [], conceded_goals: [], home: true, opponent: state.awayTeamKey || '' };
      downloadJSON(homeObj, `${state.homeTeamKey}_R${roundNo}.json`);
    }
    if (state.awayTeamKey) {
      const awayObj = state.roundsAway[roundNo] || { created_goals: [], conceded_goals: [], home: false, opponent: state.homeTeamKey || '' };
      downloadJSON(awayObj, `${state.awayTeamKey}_R${roundNo}.json`);
    }
  });

  // Função para converter cell index para coordenadas SVG do editor
  function cellIndexToPoint(cellIndex) {
    const adjustedIndex = cellIndex - 1;
    const row = Math.floor(adjustedIndex / GRID.cols);
    const col = adjustedIndex % GRID.cols;
    const logicalX = (col + 0.5) * CELL.w;
    const logicalY = (row + 0.5) * CELL.h;
    const X = PITCH.left + (logicalX / PITCH.maxX) * PITCH.widthPx;
    const Y = PITCH.top + (logicalY / PITCH.maxY) * PITCH.heightPx;
    return { x: X, y: Y };
  }

  // Função para carregar dados de uma rodada específica
  // Função auxiliar para converter coordenadas lógicas (%) de volta para coordenadas SVG do editor
  function logicalToEditorSVG(logicalX, logicalY) {
    const X = PITCH.left + (logicalX / 100) * PITCH.widthPx;
    const Y = PITCH.top + (logicalY / 100) * PITCH.heightPx;
    return { x: X, y: Y };
  }

  async function loadRoundDataIntoEditor(teamKey, roundNumber, clearField = true) {
    if (!teamKey || !roundNumber) return;
    if (clearField) {
      const nodes = Array.from(overlay.querySelectorAll('text,circle,line'));
      nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
      state.roundEvents = [];
    }
    const fileKey = resolveDataFileKey(teamKey);
    const url = `data/${fileKey}.json?t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { return; }
      const teamData = await res.json();
      let roundData = null;
      if (teamData.rounds && typeof teamData.rounds === 'object') {
        roundData = teamData.rounds[String(roundNumber)];
      } else if (Array.isArray(teamData.rounds)) {
        roundData = teamData.rounds.find(r => r.roundNumber === roundNumber);
      }
      if (!roundData) { return; }

      // Carregar data no input (se existir)
      if (roundData.date) {
        const dateInput = document.getElementById('editorDate');
        if (dateInput) dateInput.value = roundData.date;
      }

      const events = roundData.created_goals || [];

      // Verificar se é o time visitante para rotacionar os gols de volta (jogar na esquerda)
      // O banco salva sempre como 'created' (ataque na direita). Se for visitante, tem que inverter.
      // Comparar teamKey com o valor do select de visitante
      const awaySelectVal = document.getElementById('editorAwaySelect')?.value;
      const isAway = (teamKey === awaySelectVal);

      // Função de rotação (inverso do rotate180 na hora de salvar)
      // Se salvou: x = PITCH.maxY - x ... Aqui usamos a lógica do Editor SVG (0..1000, 0..600)
      // Mas os dados vêm em % (0..100).
      const rotateLogical = (lPt) => ({ x: 100 - lPt.x, y: 100 - lPt.y });

      events.forEach(ev => {
        // Os dados salvos têm pass.x/y e shot.x/y em coordenadas lógicas (%)
        const hasPass = ev.pass && typeof ev.pass.x === 'number' && typeof ev.pass.y === 'number';
        const hasShot = ev.shot && typeof ev.shot.x === 'number' && typeof ev.shot.y === 'number';
        if (!hasPass && !hasShot) return;

        // Clone para não alterar o original
        let passPtLogic = hasPass ? { ...ev.pass } : null;
        let shotPtLogic = hasShot ? { ...ev.shot } : null;

        if (isAway) {
          if (passPtLogic) passPtLogic = rotateLogical(passPtLogic);
          if (shotPtLogic) shotPtLogic = rotateLogical(shotPtLogic);
        }

        const newEvent = {
          assistPt: null, shotPt: null, assistEl: null, shotEl: null, traceEl: null,
          assistPlayer: ev.assistPlayer || null, shotPlayer: ev.shotPlayer || null,
          isOwnGoal: ev.own_goal || false, ownGoalSide: ev.ownGoalSide || null,
          isPenalty: ev.is_penalty || false
        };

        if (passPtLogic) {
          const pt = logicalToEditorSVG(passPtLogic.x, passPtLogic.y);
          newEvent.assistPt = pt;
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', pt.x); circle.setAttribute('cy', pt.y); circle.setAttribute('r', '10');
          circle.setAttribute('fill', '#3b82f6'); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2');
          overlay.appendChild(circle); newEvent.assistEl = circle;
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', pt.x); text.setAttribute('y', pt.y); text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle'); text.setAttribute('fill', '#fff');
          text.setAttribute('font-size', '12'); text.setAttribute('font-weight', 'bold'); text.textContent = 'A';
          overlay.appendChild(text);
        }
        if (shotPtLogic) {
          const pt = logicalToEditorSVG(shotPtLogic.x, shotPtLogic.y);
          newEvent.shotPt = pt;

          let kind = 'shot';
          if (newEvent.isOwnGoal) kind = 'own';
          else if (newEvent.isPenalty) kind = 'penalty';

          const circle = addMarker(pt, kind);
          newEvent.shotEl = circle;
        }

        if (newEvent.assistPt && state.trace) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', newEvent.assistPt.x); line.setAttribute('y1', newEvent.assistPt.y);
          // O ponto final do traçado deve ser shotPt (pt)
          // Mas 'pt' é local ao if(shotPtLogic), então precisamos recalcular ou garantir escopo
          // No entanto, logicamente só desenhamos traço se houver passe E chute.
          if (newEvent.shotPt) {
            const endPt = newEvent.shotPt;
            line.setAttribute('x2', endPt.x); line.setAttribute('y2', endPt.y);
            line.setAttribute('stroke', '#f7d36a'); line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-dasharray', '4 3'); overlay.appendChild(line); newEvent.traceEl = line;
          }
        }

        state.roundEvents.push(newEvent);
      });
    } catch (err) { console.error('Erro ao carregar rodada:', err); }
  }

  // Função auxiliar para carregar dados de ambos os times
  async function loadBothTeamsData() {
    const homeKey = homeSelect && homeSelect.value ? homeSelect.value : null;
    const awayKey = awaySelect && awaySelect.value ? awaySelect.value : null;
    const roundNo = Number(roundInput.value) || 1;

    // Limpar campo antes de carregar
    const nodes = Array.from(overlay.querySelectorAll('text,circle,line'));
    nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
    state.roundEvents = [];

    // Carregar dados do mandante
    if (homeKey) {
      await loadRoundDataIntoEditor(homeKey, roundNo, false); // false = não limpar campo
    }

    // Carregar dados do visitante
    if (awayKey) {
      await loadRoundDataIntoEditor(awayKey, roundNo, false); // false = não limpar campo
    }

    updateList();
  }

  // Listeners para carregar automaticamente quando mudar time ou rodada
  if (homeSelect) {
    homeSelect.addEventListener('change', () => {
      loadBothTeamsData();
    });
  }
  if (awaySelect) {
    awaySelect.addEventListener('change', () => {
      loadBothTeamsData();
    });
  }
  if (roundInput) {
    roundInput.addEventListener('change', () => {
      loadBothTeamsData();
    });
  }
}

// (Removido) Função de simulação de rodadas

// ===== SISTEMA DE JOGADORES =====

// Mapeamento de posições do CSV para categorias simplificadas
const POSITION_MAP = {
  'Goleiro': 'Goleiro',
  'Lateral': 'Lateral',
  'Zagueiro': 'Zagueiro',
  'Meia': 'Meia',
  'Atacante': 'Atacante'
};

// Cache para dados dos jogadores
let playersData = null;

// Função para carregar dados do CSV de jogadores
async function loadPlayersData() {
  if (playersData) return playersData; // Cache

  try {
    const response = await fetch('cartola_jogadores_time_posicao_preco (1).csv');
    const csvText = await response.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');

    const players = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',');
      if (values.length < headers.length) continue;

      const player = {
        id: values[0],
        apelido: values[1],
        nome_completo: values[2],
        slug: values[3],
        clube: values[4],
        clube_id: values[5],
        posicao: values[6],
        posicao_id: values[7]
      };

      // Mapear clube para chave do time
      const teamKey = mapClubToTeamKey(player.clube);
      if (teamKey) {
        player.teamKey = teamKey;
        player.position = POSITION_MAP[player.posicao] || player.posicao;
        players.push(player);
      }
    }

    playersData = players;
    console.log(`Carregados ${players.length} jogadores`);
    return players;
  } catch (error) {
    console.error('Erro ao carregar dados dos jogadores:', error);
    return [];
  }
}

// Mapear códigos de clube do CSV para chaves de time
function mapClubToTeamKey(clubCode) {
  const clubMap = {
    'CAM': 'atletico-mg',
    'CAP': 'athletico-pr',
    'BAH': 'bahia',
    'BOT': 'botafogo',
    'CEA': 'ceara',
    'CHA': 'chapecoense',
    'COR': 'corinthians',
    'CFC': 'coritiba',
    'CRU': 'cruzeiro',
    'FLA': 'flamengo',
    'FLU': 'fluminense',
    'FOR': 'fortaleza',
    'GRE': 'gremio',
    'INT': 'internacional',
    'JUV': 'juventude',
    'MIR': 'mirassol',
    'RBB': 'red-bull-bragantino',
    'REM': 'remo',
    'SAN': 'santos',
    'SPT': 'sport',
    'SAO': 'sao-paulo',
    'VAS': 'vasco',
    'VIT': 'vitoria',
    'PAL': 'palmeiras'
  };
  return clubMap[clubCode] || null;
}

// Função para obter jogadores de um time específico
function getPlayersByTeam(teamKey) {
  if (!playersData) return [];
  return playersData.filter(player => player.teamKey === teamKey);
}

// Carregar dados dos jogadores na inicialização
loadPlayersData();

// Funções para legendas de jogadores e interatividade
function populatePlayersLegend(legendId, events) {
  const legendEl = document.getElementById(legendId);
  const contentEl = document.getElementById(legendId + 'Content');

  if (!legendEl || !contentEl) return;

  // Coletar todos os jogadores únicos dos eventos
  const players = new Set();
  const sideLabel = (pos, side) => {
    if (pos !== 'Lateral') return pos;
    if (side === 'LD') return 'Lateral Direita';
    if (side === 'LE') return 'Lateral Esquerda';
    return 'Lateral';
  };
  events.forEach(ev => {
    if (ev.assistPlayer && ev.assistPlayer.name) {
      const s = ev.assistPlayer.side;
      const ptxt = sideLabel(ev.assistPlayer.position, s);
      players.add(`${ev.assistPlayer.name} — ${ptxt} (Assistência)`);
    }
    if (ev.shotPlayer && ev.shotPlayer.name) {
      const s = ev.shotPlayer.side;
      const ptxt = sideLabel(ev.shotPlayer.position, s);
      players.add(`${ev.shotPlayer.name} — ${ptxt} (Finalização)`);
    }
  });

  if (players.size === 0) {
    legendEl.style.display = 'none';
    return;
  }

  // Popular conteúdo da legenda
  contentEl.innerHTML = '';
  Array.from(players).sort().forEach(playerInfo => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:4px 8px;background:rgba(247,211,106,0.1);border-radius:4px;font-size:12px';
    div.textContent = playerInfo;
    contentEl.appendChild(div);
  });

  legendEl.style.display = 'block';
}

function addClickInteractivity(layer, events) {
  const nodesLayer = layer.querySelector('.nodes-layer');
  if (!nodesLayer) return;
  const markers = nodesLayer.querySelectorAll('g[data-event-index]');
  markers.forEach((marker) => {
    const idx = Number(marker.getAttribute('data-event-index'));
    const event = events[idx];
    if (!event) return;
    const hasPlayerData = (event.assistPlayer && event.assistPlayer.name) || (event.shotPlayer && event.shotPlayer.name);
    if (!hasPlayerData) return;
    marker.style.cursor = 'pointer';
    // Para evitar múltiplos listeners em re-render, clonar simples
    const clone = marker.cloneNode(true);
    marker.parentNode.replaceChild(clone, marker);
    clone.addEventListener('click', (e) => {
      e.stopPropagation();
      showPlayerTooltip(e, event);
    });
  });
}

function showPlayerTooltip(event, eventData) {
  // Remover tooltip existente
  const existingTooltip = document.getElementById('playerTooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }

  // Verificar se há dados de jogador
  const hasPlayerData = (eventData.assistPlayer && eventData.assistPlayer.name) ||
    (eventData.shotPlayer && eventData.shotPlayer.name);

  if (!hasPlayerData) {
    return;
  }

  // Criar tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'playerTooltip';
  tooltip.style.cssText = `
    position: absolute;
    background: rgba(11,31,22,0.98);
    color: #e7f8f1;
    padding: 10px 12px;
    border-radius: 8px;
    border: 2px solid #f7d36a;
    font-size: 13px;
    z-index: 99999;
    max-width: 280px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
    pointer-events: none;
    backdrop-filter: blur(4px);
    font-family: inherit;
  `;

  // Abreviações e rótulos simples
  const POS_ABBR = { 'Goleiro': 'GOL', 'Zagueiro': 'ZAG', 'Meia': 'MEI', 'Atacante': 'ATA' };
  const abbr = (p, side) => {
    if (p === 'Lateral') return side === 'LD' ? 'LAT D' : (side === 'LE' ? 'LAT E' : 'LAT');
    return POS_ABBR[p] || p;
  };
  let content = '';
  // Cabeçalho com confronto (escudos + nomes) quando disponível
  const crestSrcFor = (teamKey) => {
    const key = String(teamKey || '').toLowerCase().replace(/-/g, '_');
    const norm = normalizeTeamKey(key);
    const file = CREST_MAP[norm];
    return file ? `escudos  série A 2025/${file}` : null;
  };
  const renderTeamHeaderItem = (name, key) => {
    const src = crestSrcFor(key);
    const imgHtml = src ? `<img src="${src}" alt="" style="width:18px;height:18px;border-radius:50%;background:#fff;padding:2px;box-shadow:0 1px 2px rgba(0,0,0,.2)">` : '';
    return `<div style="display:flex;align-items:center;gap:6px">${imgHtml}<span style="font-weight:700">${name}</span></div>`;
  };
  if (eventData.match && (eventData.match.homeName || eventData.match.awayName)) {
    const m = eventData.match;
    const headHtml = `<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">${renderTeamHeaderItem(m.homeName, m.homeTeamKey)}<span style="opacity:.6">vs</span>${renderTeamHeaderItem(m.awayName, m.awayTeamKey)}</div>`;
    content += headHtml;
  }

  if (eventData.assistPlayer && eventData.assistPlayer.name) {
    const side = eventData.assistPlayer.side;
    content += `<div style="margin-bottom:6px;display:flex;align-items:center"><span style="font-weight:700;color:#9bd0ff;margin-right:8px">ASS:</span><span>${eventData.assistPlayer.name} (${abbr(eventData.assistPlayer.position, side)})</span></div>`;
  }

  if (eventData.shotPlayer && eventData.shotPlayer.name) {
    const side = eventData.shotPlayer.side;
    const label = eventData.isOwnGoal ? 'GOL CONTRA:' : 'GOL:';
    const color = eventData.isOwnGoal ? '#ef4444' : '#ffd24d';
    content += `<div style="margin-bottom:2px;display:flex;align-items:center"><span style="font-weight:700;color:${color};margin-right:8px">${label}</span><span>${eventData.shotPlayer.name} (${abbr(eventData.shotPlayer.position, side)})</span></div>`;
  }

  if (eventData.isOwnGoal) {
    // Manter o aviso extra se desejar, ou removê-lo já que o título mudou.
    // O usuário pediu para "não aparecer que foi gol normal", a mudança acima resolve.
    // Mas vou manter o aviso extra para reforçar, ou removê-lo se ficar redundante.
    // Vou remover o aviso extra redundante na próxima etapa se necessário, mas por ora atualização do label é o principal.
  }



  tooltip.innerHTML = content;

  // Ancorar ao marcador e acompanhar zoom/resize
  const markerEl = event.currentTarget;
  const overlayEl = markerEl?.ownerSVGElement || markerEl?.closest('svg');
  const containerEl = overlayEl?.parentElement || document.body;

  function positionTooltip() {
    const markerRect = markerEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const centerX = markerRect.left - containerRect.left + (markerRect.width / 2);
    const centerY = markerRect.top - containerRect.top + (markerRect.height / 2);

    // Posição inicial
    let tooltipX = centerX + 12;
    let tooltipY = centerY - 10;

    // Obter dimensões do tooltip (precisa estar no DOM primeiro)
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
    tooltip.style.visibility = 'hidden';

    // Aguardar um frame para o tooltip ser renderizado
    requestAnimationFrame(() => {
      const tooltipRect = tooltip.getBoundingClientRect();
      const containerBounds = containerEl.getBoundingClientRect();

      // Ajustar horizontalmente se sair da tela
      if (tooltipRect.right > containerBounds.right) {
        tooltipX = centerX - tooltipRect.width - 12; // Posicionar à esquerda
      }
      if (tooltipX < 0) {
        tooltipX = 8; // Margem mínima da esquerda
      }

      // Ajustar verticalmente se sair da tela
      if (tooltipRect.bottom > containerBounds.bottom) {
        tooltipY = centerY - tooltipRect.height - 12; // Posicionar acima
      }
      if (tooltipY < 0) {
        tooltipY = 8; // Margem mínima do topo
      }

      // Aplicar posição final
      tooltip.style.left = tooltipX + 'px';
      tooltip.style.top = tooltipY + 'px';
      tooltip.style.visibility = 'visible';
    });
  }

  // Inserir no mesmo container que o overlay
  containerEl.appendChild(tooltip);
  positionTooltip();

  // Remover tooltip ao clicar fora
  function cleanup() {
    try { tooltip.remove(); } catch { }
    window.removeEventListener('resize', positionTooltip);
    document.removeEventListener('scroll', positionTooltip, true);
    document.removeEventListener('click', onDocClick);
  }

  function onDocClick() { cleanup(); }
  // Reposicionar em zoom/resize/scroll
  window.addEventListener('resize', positionTooltip);
  document.addEventListener('scroll', positionTooltip, true);
  setTimeout(() => { document.addEventListener('click', onDocClick); }, 100);
}

// Legenda compacta de participações em gols por posição separando CEDIDOS e CONQUISTADOS (incluída no PNG)
// Nova função drawPositionSummaryLegend com layout em blocos grandes e fundo claro
// Baseado no modelo fornecido pelo usuário (Athletico-PR)

// Nova versão DEFINITIVA do rodapé - Layout baseado na imagem de referência do usuário
function drawPositionSummaryLegend(overlayEl, concededEvents, createdEvents, groupId = 'positionSummary') {
  if (!overlayEl) return;
  const existing = overlayEl.querySelector(`#${groupId}`);
  if (existing) existing.remove();

  const WIDTH = 1000;
  const positions = ['Zagueiro', 'Lateral E', 'Lateral D', 'Meia', 'Atacante'];
  const abbr = { Meia: 'MEI', Atacante: 'ATA', 'Lateral D': 'LD', 'Lateral E': 'LE', Zagueiro: 'ZAG' };

  // Contadores separados
  const cedidosAssist = { Meia: 0, Atacante: 0, 'Lateral D': 0, 'Lateral E': 0, Zagueiro: 0 };
  const cedidosGols = { Meia: 0, Atacante: 0, 'Lateral D': 0, 'Lateral E': 0, Zagueiro: 0 };
  const conquistadosAssist = { Meia: 0, Atacante: 0, 'Lateral D': 0, 'Lateral E': 0, Zagueiro: 0 };
  const conquistadosGols = { Meia: 0, Atacante: 0, 'Lateral D': 0, 'Lateral E': 0, Zagueiro: 0 };

  // Processar eventos CEDIDOS
  for (const ev of (concededEvents || [])) {
    if (ev && ev.assistPlayer) {
      const p = ev.assistPlayer.position;
      if (p === 'Lateral') {
        const side = ev.assistPlayer.side;
        const key = side === 'LD' ? 'Lateral D' : (side === 'LE' ? 'Lateral E' : null);
        if (key) cedidosAssist[key] += 1;
      } else if (positions.includes(p)) {
        cedidosAssist[p] += 1;
      }
    }
    if (ev && ev.shotPlayer) {
      const p = ev.shotPlayer.position;
      if (p === 'Lateral') {
        const side = ev.shotPlayer.side;
        const key = side === 'LD' ? 'Lateral D' : (side === 'LE' ? 'Lateral E' : null);
        if (key) cedidosGols[key] += 1;
      } else if (positions.includes(p)) {
        cedidosGols[p] += 1;
      }
    }
  }

  // Processar eventos CONQUISTADOS
  for (const ev of (createdEvents || [])) {
    if (ev && ev.assistPlayer) {
      const p = ev.assistPlayer.position;
      if (p === 'Lateral') {
        const side = ev.assistPlayer.side;
        const key = side === 'LD' ? 'Lateral D' : (side === 'LE' ? 'Lateral E' : null);
        if (key) conquistadosAssist[key] += 1;
      } else if (positions.includes(p)) {
        conquistadosAssist[p] += 1;
      }
    }
    if (ev && ev.shotPlayer) {
      const p = ev.shotPlayer.position;
      if (p === 'Lateral') {
        const side = ev.shotPlayer.side;
        const key = side === 'LD' ? 'Lateral D' : (side === 'LE' ? 'Lateral E' : null);
        if (key) conquistadosGols[key] += 1;
      } else if (positions.includes(p)) {
        conquistadosGols[p] += 1;
      }
    }
  }

  // Verificar se há dados
  const totalCedidos = Object.values(cedidosAssist).reduce((a, b) => a + b, 0) + Object.values(cedidosGols).reduce((a, b) => a + b, 0);
  const totalConquistados = Object.values(conquistadosAssist).reduce((a, b) => a + b, 0) + Object.values(conquistadosGols).reduce((a, b) => a + b, 0);
  if (totalCedidos === 0 && totalConquistados === 0) return;

  const g = el('g', { id: groupId, filter: 'url(#ds)' });

  // LAYOUT BASEADO NA IMAGEM DE REFERÊNCIA
  const startY = 590; // Início do rodapé (logo abaixo do campo que termina em 570)
  const titleY = startY + 20; // Títulos CEDIDOS e CONQUISTADOS
  const boxStartY = titleY + 30; // Início das caixas brancas
  const boxW = 220; // Largura de cada caixa branca (ASSISTÊNCIAS ou GOLS)
  const boxH = 100; // Altura da caixa branca
  const boxGap = 15; // Espaço entre caixas
  const chipW = 38; // Largura de cada caixinha de posição
  const chipH = 60; // Altura de cada caixinha de posição
  const chipGap = 3; // Espaço entre caixinhas

  // Função para desenhar uma seção (ASSISTÊNCIAS ou GOLS)
  function drawSection(title, counts, x, y) {
    // Fundo branco com borda arredondada
    const bg = el('rect', {
      x, y,
      width: boxW,
      height: boxH,
      rx: 12,
      ry: 12,
      fill: 'rgba(255,255,255,0.98)',
      stroke: 'none'
    });
    g.appendChild(bg);

    // Título da seção (ASSISTÊNCIAS ou GOLS)
    const titleEl = el('text', {
      x: x + boxW / 2,
      y: y + 22,
      'text-anchor': 'middle',
      'font-family': 'Inter, Arial, sans-serif',
      'font-size': 14,
      'font-weight': 900,
      fill: '#0b1f16'
    });
    titleEl.textContent = title;
    g.appendChild(titleEl);

    // Caixinhas de posição (chips horizontais)
    const totalChipsW = positions.length * chipW + (positions.length - 1) * chipGap;
    const chipsStartX = x + (boxW - totalChipsW) / 2;
    const chipsY = y + 32;

    positions.forEach((p, i) => {
      const cx = chipsStartX + i * (chipW + chipGap);

      // Caixinha verde escura
      const chip = el('rect', {
        x: cx, y: chipsY,
        width: chipW,
        height: chipH,
        rx: 5,
        ry: 5,
        fill: '#0b2f25'
      });
      g.appendChild(chip);

      // Abreviação da posição (ZAG, LE, LD, MEI, ATA)
      const labelPos = el('text', {
        x: cx + chipW / 2,
        y: chipsY + 18,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 10,
        'font-weight': 700,
        fill: '#ffffff'
      });
      labelPos.textContent = abbr[p];
      g.appendChild(labelPos);

      // Número (contador)
      const labelCount = el('text', {
        x: cx + chipW / 2,
        y: chipsY + 45,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 22,
        'font-weight': 900,
        fill: '#f7d36a'
      });
      labelCount.textContent = counts[p] || 0;
      g.appendChild(labelCount);
    });
  }

  // Calcular posições horizontais
  const centerX = WIDTH / 2;
  const halfSectionWidth = boxW + boxGap / 2; // Metade da largura de uma seção (2 caixas + gap)

  // LADO ESQUERDO - CEDIDOS
  const cedidosX = centerX / 2; // Centro do lado esquerdo

  // Título CEDIDOS
  const titleCedidos = el('text', {
    x: cedidosX,
    y: titleY,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleCedidos.textContent = 'CEDIDOS';
  g.appendChild(titleCedidos);

  // CEDIDOS - ASSISTÊNCIAS (esquerda)
  const cedidosAssistX = cedidosX - halfSectionWidth;
  drawSection('ASSISTÊNCIAS', cedidosAssist, cedidosAssistX, boxStartY);

  // CEDIDOS - GOLS (direita)
  const cedidosGolsX = cedidosX + boxGap / 2;
  drawSection('GOLS', cedidosGols, cedidosGolsX, boxStartY);

  // Linha divisória vertical no centro
  const divider = el('line', {
    x1: centerX,
    y1: titleY - 10,
    x2: centerX,
    y2: boxStartY + boxH,
    stroke: '#e7f8f1',
    'stroke-opacity': 0.4,
    'stroke-width': 2
  });
  g.appendChild(divider);

  // LADO DIREITO - CONQUISTADOS
  const conquistadosX = centerX + centerX / 2; // Centro do lado direito

  // Título CONQUISTADOS
  const titleConquistados = el('text', {
    x: conquistadosX,
    y: titleY,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleConquistados.textContent = 'CONQUISTADOS';
  g.appendChild(titleConquistados);

  // CONQUISTADOS - ASSISTÊNCIAS (esquerda)
  const conquistadosAssistX = conquistadosX - halfSectionWidth;
  drawSection('ASSISTÊNCIAS', conquistadosAssist, conquistadosAssistX, boxStartY);

  // CONQUISTADOS - GOLS (direita)
  const conquistadosGolsX = conquistadosX + boxGap / 2;
  drawSection('GOLS', conquistadosGols, conquistadosGolsX, boxStartY);

  overlayEl.appendChild(g);
}

// Título superior dentro do SVG para ser incluído no PNG
function drawCxTitle(overlayEl, groupId = 'cxTitleLeft') {
  if (!overlayEl) return;
  const existing = overlayEl.querySelector(`#${groupId}`);
  if (existing) overlayEl.removeChild(existing);
  const g = el('g', { id: groupId, filter: 'url(#ds)', style: 'display:none' });
  const title = el('text', {
    x: WIDTH / 2,
    y: 46,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 24,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  title.textContent = 'CEDIDAS X CONQUISTADAS';
  g.appendChild(title);
  overlayEl.appendChild(g);
}