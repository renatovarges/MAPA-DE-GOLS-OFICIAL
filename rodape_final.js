// LAYOUT DO RODAPÉ COM CÁLCULOS MATEMÁTICOS PRECISOS
// Campo termina em y=570
// HEIGHT total: 800
// Espaço disponível: 230px

function drawPositionSummaryLegend(data, overlayEl, groupId) {
  if (!data || !overlayEl) return;
  
  const positions = ['ZAG', 'LE', 'LD', 'MEI', 'ATA'];
  const abbr = { ZAG: 'ZAG', LE: 'LE', LD: 'LD', MEI: 'MEI', ATA: 'ATA' };
  
  // Contagem de gols e assistências
  let cedidosAssist = { ZAG: 0, LE: 0, LD: 0, MEI: 0, ATA: 0 };
  let cedidosGols = { ZAG: 0, LE: 0, LD: 0, MEI: 0, ATA: 0 };
  let conquistadosAssist = { ZAG: 0, LE: 0, LD: 0, MEI: 0, ATA: 0 };
  let conquistadosGols = { ZAG: 0, LE: 0, LD: 0, MEI: 0, ATA: 0 };
  
  // Processar dados cedidos
  if (data.conceded && data.conceded.length > 0) {
    data.conceded.forEach(ev => {
      const pos = ev.scorerPosition;
      if (pos && cedidosGols[pos] !== undefined) cedidosGols[pos]++;
      const aPos = ev.assistPosition;
      if (aPos && cedidosAssist[aPos] !== undefined) cedidosAssist[aPos]++;
    });
  }
  
  // Processar dados conquistados
  if (data.created && data.created.length > 0) {
    data.created.forEach(ev => {
      const pos = ev.scorerPosition;
      if (pos && conquistadosGols[pos] !== undefined) conquistadosGols[pos]++;
      const aPos = ev.assistPosition;
      if (aPos && conquistadosAssist[aPos] !== undefined) conquistadosAssist[aPos]++;
    });
  }
  
  const totalCedidos = Object.values(cedidosAssist).reduce((a, b) => a + b, 0) + Object.values(cedidosGols).reduce((a, b) => a + b, 0);
  const totalConquistados = Object.values(conquistadosAssist).reduce((a, b) => a + b, 0) + Object.values(conquistadosGols).reduce((a, b) => a + b, 0);
  
  if (totalCedidos === 0 && totalConquistados === 0) return;
  
  const el = (tag, attrs) => {
    const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) elem.setAttribute(k, attrs[k]);
    return elem;
  };
  
  const g = el('g', { id: groupId, filter: 'url(#ds)' });
  
  // CÁLCULOS MATEMÁTICOS PRECISOS
  const fieldEndY = 570;
  const startY = fieldEndY + 20; // 20px de margem superior
  const titleHeight = 25; // altura dos títulos CEDIDOS/CONQUISTADOS
  const blockHeight = 120; // altura dos blocos brancos
  const chipWidth = 40;
  const chipHeight = 60;
  const chipGap = 4;
  const totalChipsWidth = (chipWidth * 5) + (chipGap * 4); // 200 + 16 = 216px
  const blockWidth = totalChipsWidth + 20; // 236px (10px margem de cada lado)
  const blockGap = 20; // espaço entre blocos ASSIST e GOLS
  
  // Função para desenhar uma seção (ASSISTÊNCIAS ou GOLS)
  function drawSection(x, y, title, counts) {
    // Bloco branco de fundo
    const rect = el('rect', {
      x, y,
      width: blockWidth,
      height: blockHeight,
      rx: 12, ry: 12,
      fill: '#f7fff9',
      stroke: 'none'
    });
    g.appendChild(rect);
    
    // Título (ASSISTÊNCIAS ou GOLS)
    const titleEl = el('text', {
      x: x + blockWidth/2,
      y: y + 22,
      'text-anchor': 'middle',
      'font-family': 'Inter, Arial, sans-serif',
      'font-size': 15,
      'font-weight': 900,
      fill: '#0b1f16'
    });
    titleEl.textContent = title;
    g.appendChild(titleEl);
    
    // Caixinhas horizontais
    const chipsStartX = x + 10; // 10px de margem esquerda
    const chipsY = y + 35; // 10px margem superior + 22px título + 3px espaço
    
    positions.forEach((p, i) => {
      const cx = chipsStartX + i * (chipWidth + chipGap);
      
      // Caixinha verde
      const chip = el('rect', {
        x: cx,
        y: chipsY,
        width: chipWidth,
        height: chipHeight,
        rx: 6, ry: 6,
        fill: '#0b2f25',
        stroke: 'none'
      });
      g.appendChild(chip);
      
      // Label da posição (ZAG, LE, etc.)
      const labelPos = el('text', {
        x: cx + chipWidth/2,
        y: chipsY + 16,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 11,
        'font-weight': 700,
        fill: '#e7f8f1'
      });
      labelPos.textContent = abbr[p];
      g.appendChild(labelPos);
      
      // Número
      const labelCount = el('text', {
        x: cx + chipWidth/2,
        y: chipsY + 42,
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
  
  // Calcular posições centralizadas
  const centerX = WIDTH / 2;
  const totalWidth = (blockWidth * 4) + (blockGap * 3); // 4 blocos + 3 gaps
  const leftStart = centerX - totalWidth / 2;
  
  // CEDIDOS
  const cedidosX = centerX / 2;
  const titleCedidos = el('text', {
    x: cedidosX,
    y: startY + 15,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleCedidos.textContent = 'CEDIDOS';
  g.appendChild(titleCedidos);
  
  const cedidosAssistX = leftStart;
  const cedidosGolsX = cedidosAssistX + blockWidth + blockGap;
  
  drawSection(cedidosAssistX, startY + titleHeight, 'ASSISTÊNCIAS', cedidosAssist);
  drawSection(cedidosGolsX, startY + titleHeight, 'GOLS', cedidosGols);
  
  // Linha divisória vertical
  const dividerX = centerX;
  const dividerY1 = startY + titleHeight;
  const dividerY2 = startY + titleHeight + blockHeight;
  const divider = el('line', {
    x1: dividerX, y1: dividerY1,
    x2: dividerX, y2: dividerY2,
    stroke: '#e7f8f1',
    'stroke-width': 2,
    opacity: 0.5
  });
  g.appendChild(divider);
  
  // CONQUISTADOS
  const conquistadosX = centerX + centerX / 2;
  const titleConquistados = el('text', {
    x: conquistadosX,
    y: startY + 15,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleConquistados.textContent = 'CONQUISTADOS';
  g.appendChild(titleConquistados);
  
  const conquistadosAssistX = centerX + blockGap/2;
  const conquistadosGolsX = conquistadosAssistX + blockWidth + blockGap;
  
  drawSection(conquistadosAssistX, startY + titleHeight, 'ASSISTÊNCIAS', conquistadosAssist);
  drawSection(conquistadosGolsX, startY + titleHeight, 'GOLS', conquistadosGols);
  
  overlayEl.appendChild(g);
}
