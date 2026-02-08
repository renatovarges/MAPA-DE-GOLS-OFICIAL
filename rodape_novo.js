// Nova versão DEFINITIVA do rodapé - Layout horizontal simples
function drawPositionSummaryLegend(overlayEl, concededEvents, createdEvents, groupId = 'positionSummary') {
  if (!overlayEl) return;
  const existing = overlayEl.querySelector(`#${groupId}`);
  if (existing) existing.remove();

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
  const totalCedidos = Object.values(cedidosAssist).reduce((a,b)=>a+b,0) + Object.values(cedidosGols).reduce((a,b)=>a+b,0);
  const totalConquistados = Object.values(conquistadosAssist).reduce((a,b)=>a+b,0) + Object.values(conquistadosGols).reduce((a,b)=>a+b,0);
  if (totalCedidos === 0 && totalConquistados === 0) return;

  const g = el('g', { id: groupId, filter: 'url(#ds)' });
  
  // LAYOUT HORIZONTAL SIMPLES
  const startY = 680;
  const sectionW = 220; // largura de cada seção (ASSISTÊNCIAS ou GOLS)
  const sectionH = 120; // altura da seção
  const chipW = 38;
  const chipH = 55;
  const chipGap = 4;
  const sectionGap = 16; // espaço entre seções
  
  // Função para desenhar uma seção (ASSISTÊNCIAS ou GOLS)
  function drawSection(title, counts, x, y) {
    // Fundo branco
    const bg = el('rect', {
      x, y,
      width: sectionW,
      height: sectionH,
      rx: 10,
      ry: 10,
      fill: 'rgba(255,255,255,0.95)',
      stroke: '#0b1f16',
      'stroke-width': 2
    });
    g.appendChild(bg);
    
    // Título
    const titleEl = el('text', {
      x: x + sectionW/2,
      y: y + 20,
      'text-anchor': 'middle',
      'font-family': 'Inter, Arial, sans-serif',
      'font-size': 13,
      'font-weight': 900,
      fill: '#0b1f16'
    });
    titleEl.textContent = title;
    g.appendChild(titleEl);
    
    // Chips horizontais
    const totalChipsW = positions.length * chipW + (positions.length - 1) * chipGap;
    const chipsStartX = x + (sectionW - totalChipsW) / 2;
    const chipsY = y + 32;
    
    positions.forEach((p, i) => {
      const cx = chipsStartX + i * (chipW + chipGap);
      
      // Chip
      const chip = el('rect', {
        x: cx, y: chipsY,
        width: chipW,
        height: chipH,
        rx: 6,
        ry: 6,
        fill: '#0b2f25',
        stroke: '#f7d36a',
        'stroke-width': 2
      });
      g.appendChild(chip);
      
      // Abreviação
      const labelPos = el('text', {
        x: cx + chipW/2,
        y: chipsY + 16,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 10,
        'font-weight': 700,
        fill: '#e7f8f1'
      });
      labelPos.textContent = abbr[p];
      g.appendChild(labelPos);
      
      // Número
      const labelCount = el('text', {
        x: cx + chipW/2,
        y: chipsY + 38,
        'text-anchor': 'middle',
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': 18,
        'font-weight': 900,
        fill: '#f7d36a'
      });
      labelCount.textContent = counts[p] || 0;
      g.appendChild(labelCount);
    });
  }
  
  // Título CEDIDOS
  const titleCedidos = el('text', {
    x: sectionW + sectionGap/2,
    y: startY - 10,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 18,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleCedidos.textContent = 'CEDIDOS';
  g.appendChild(titleCedidos);
  
  // CEDIDOS - ASSISTÊNCIAS
  drawSection('ASSISTÊNCIAS', cedidosAssist, 20, startY);
  
  // CEDIDOS - GOLS
  drawSection('GOLS', cedidosGols, 20 + sectionW + sectionGap, startY);
  
  // Linha divisória vertical
  const dividerX = 500;
  const divider = el('line', {
    x1: dividerX,
    y1: startY - 20,
    x2: dividerX,
    y2: startY + sectionH,
    stroke: '#e7f8f1',
    'stroke-opacity': 0.5,
    'stroke-width': 3
  });
  g.appendChild(divider);
  
  // Título CONQUISTADOS
  const titleConquistados = el('text', {
    x: dividerX + sectionW + sectionGap/2,
    y: startY - 10,
    'text-anchor': 'middle',
    'font-family': 'Inter, Arial, sans-serif',
    'font-size': 18,
    'font-weight': 900,
    fill: '#e7f8f1'
  });
  titleConquistados.textContent = 'CONQUISTADOS';
  g.appendChild(titleConquistados);
  
  // CONQUISTADOS - ASSISTÊNCIAS
  drawSection('ASSISTÊNCIAS', conquistadosAssist, dividerX + 20, startY);
  
  // CONQUISTADOS - GOLS
  drawSection('GOLS', conquistadosGols, dividerX + 20 + sectionW + sectionGap, startY);

  overlayEl.appendChild(g);
}
