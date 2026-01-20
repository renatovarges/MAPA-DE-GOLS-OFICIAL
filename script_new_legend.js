// Nova função drawPositionSummaryLegend com layout em blocos grandes e fundo claro
// Baseado no modelo fornecido pelo usuário (Athletico-PR)

function drawPositionSummaryLegend(overlayEl, concededEvents, createdEvents, groupId = 'positionSummary') {
  if (!overlayEl) return;
  const existing = overlayEl.querySelector(`#${groupId}`);
  if (existing) existing.remove();

  const positions = ['Zagueiro', 'Lateral E', 'Lateral D', 'Meia', 'Atacante'];
  
  // Contadores separados para CEDIDOS e CONQUISTADOS
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
  const totalCedidos = Object.values(cedidosAssist).reduce((a,b)=>a+b,0) + Object.values(cedidosGols).reduce((a,b)=>a+b,0);
  const totalConquistados = Object.values(conquistadosAssist).reduce((a,b)=>a+b,0) + Object.values(conquistadosGols).reduce((a,b)=>a+b,0);
  if (totalCedidos === 0 && totalConquistados === 0) return;

  const g = el('g', { id: groupId, filter: 'url(#ds)' });
  
  // NOVO LAYOUT: Blocos grandes com fundo claro
  const panelH = 180;
  const panelY = HEIGHT - (panelH + 30);
  const centerX = WIDTH / 2;
  
  const abbr = { Meia: 'MEI', Atacante: 'ATA', 'Lateral D': 'LD', 'Lateral E': 'LE', Zagueiro: 'ZAG' };
  
  // Dimensões dos blocos
  const blockW = 220;  // largura de cada bloco (ASSISTÊNCIAS ou GOLS)
  const blockH = 100;  // altura do bloco
  const blockGap = 20; // espaço entre blocos
  const chipW = 38;    // largura de cada chip de posição
  const chipH = 60;    // altura de cada chip
  const chipGap = 4;   // espaço entre chips
  
  // Função para desenhar um bloco (ASSISTÊNCIAS ou GOLS)
  function drawBlock(title, counts, startX, startY) {
    // Fundo branco do bloco
    const bg = el('rect', {
      x: startX,
      y: startY,
      width: blockW,
      height: blockH,
      rx: 12,
      ry: 12,
      fill: 'rgba(255,255,255,0.95)',
      stroke: '#0b1f16',
      'stroke-width': 2
    });
    g.appendChild(bg);
    
    // Título do bloco
    const titleEl = el('text', {
      x: startX + blockW/2,
      y: startY + 22,
      'text-anchor': 'middle',
      'font-family': 'Inter, Arial, sans-serif',
      'font-size': 14,
      'font-weight': 900,
      fill: '#0b1f16'
    });
    titleEl.textContent = title;
    g.appendChild(titleEl);
    
    // Chips de posições (ZAG, LE, LD, MEI, ATA)
    const chipsTotal = positions.length * chipW + (positions.length - 1) * chipGap;
    const chipsStartX = startX + (blockW - chipsTotal) / 2;
    const chipsY = startY + 36;
    
    positions.forEach((p, i) => {
      const cx = chipsStartX + i * (chipW + chipGap);
      
      // Chip individual
      const chip = el('rect', {
        x: cx,
        y: chipsY,
        width: chipW,
        height: chipH,
        rx: 8,
        ry: 8,
        fill: '#0b1f16',
        stroke: '#f7d36a',
        'stroke-width': 2
      });
      g.appendChild(chip);
      
      // Abreviação da posição (parte superior)
      const labelPos = el('text', {
        x: cx + chipW/2,
        y: chipsY + 18,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 11,
        'font-weight': 700,
        fill: '#e7f8f1'
      });
      labelPos.textContent = abbr[p];
      g.appendChild(labelPos);
      
      // Número (parte inferior - GRANDE)
      const labelCount = el('text', {
        x: cx + chipW/2,
        y: chipsY + 44,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 24,
        'font-weight': 900,
        fill: '#f7d36a'
      });
      labelCount.textContent = counts[p] || 0;
      g.appendChild(labelCount);
    });
  }
  
  // Título principal CEDIDOS
  const titleCedidos = el('text', {
    x: centerX / 2,
    y: panelY + 18,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleCedidos.textContent = 'CEDIDOS';
  g.appendChild(titleCedidos);
  
  // CEDIDOS - Bloco ASSISTÊNCIAS
  const cedidosAssistX = (centerX / 2) - blockW - blockGap/2;
  drawBlock('ASSISTÊNCIAS', cedidosAssist, cedidosAssistX, panelY + 28);
  
  // CEDIDOS - Bloco GOLS
  const cedidosGolsX = (centerX / 2) + blockGap/2;
  drawBlock('GOLS', cedidosGols, cedidosGolsX, panelY + 28);
  
  // Linha divisória vertical central
  const divider = el('line', {
    x1: centerX,
    y1: panelY,
    x2: centerX,
    y2: panelY + panelH,
    stroke: '#e7f8f1',
    'stroke-opacity': 0.6,
    'stroke-width': 3
  });
  g.appendChild(divider);
  
  // Título principal CONQUISTADOS
  const titleConquistados = el('text', {
    x: centerX + centerX / 2,
    y: panelY + 18,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 20,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleConquistados.textContent = 'CONQUISTADOS';
  g.appendChild(titleConquistados);
  
  // CONQUISTADOS - Bloco ASSISTÊNCIAS
  const conquistadosAssistX = centerX + (centerX / 2) - blockW - blockGap/2;
  drawBlock('ASSISTÊNCIAS', conquistadosAssist, conquistadosAssistX, panelY + 28);
  
  // CONQUISTADOS - Bloco GOLS
  const conquistadosGolsX = centerX + (centerX / 2) + blockGap/2;
  drawBlock('GOLS', conquistadosGols, conquistadosGolsX, panelY + 28);

  overlayEl.appendChild(g);
}
