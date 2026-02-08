
import sys

def surgical_repair(filename):
    print(f"Surgical repair for {filename}...")
    try:
        with open(filename, 'rb') as f:
            data = f.read()
            
        print(f"File size: {len(data)}")
        
        # Find the end of the valid original code
        # "setTimeout(updateAllLegends, 500);"
        end_marker = b"setTimeout(updateAllLegends, 500);"
        
        idx = data.find(end_marker)
        if idx == -1:
            print("CRITICAL: End marker not found!")
            # Fallback: maybe just "updateAllLegends"
            idx = data.find(b"updateAllLegends")
            if idx == -1:
                print("CRITICAL: Alternative marker not found!")
                return
        
        # Calculate cut point.
        # We want to include the marker.
        cut_point = idx + len(end_marker)
        
        print(f"Cutting at {cut_point}")
        
        valid_part = data[:cut_point]
        
        # New content to append
        # This is the formatting of the function we wanted to add
        new_code = """
// Nova função dedicada para desenhar a legenda de marcadores no SVG (sem depender de estatísticas)
function drawMarkerLegendNew(overlayEl, groupId = 'svgMarkerLegend') {
  if (!overlayEl) return;
  const existing = overlayEl.querySelector(`#${groupId}`);
  if (existing) existing.remove();

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.id = groupId;

  // Posicionada abaixo do quadro de estatísticas (y=740)
  const legendY = 800;
  // Alterado para 780 para centralizar no novo espaço (740 a 850)
  const rectY = 780;
  const rectH = 50;
  const WIDTH = 1000;

  // Fundo para garantir contraste e visibilidade
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute('x', '20');
  bg.setAttribute('y', String(rectY));
  bg.setAttribute('width', String(WIDTH - 40));
  bg.setAttribute('height', String(rectH));
  bg.setAttribute('rx', '8');
  bg.setAttribute('ry', '8');
  bg.setAttribute('fill', 'rgba(11,31,22,0.9)');
  bg.setAttribute('stroke', '#7eccb2');
  bg.setAttribute('stroke-width', '1');
  g.appendChild(bg);

  const legendItems = [
    { type: 'circle', color: '#ffffff', label: 'Assistência' },
    { type: 'circle', color: '#fef08a', label: 'Ass. Bola Parada' },
    { type: 'emoji', filter: '', label: 'Gol Normal' },
    { type: 'emoji', filter: 'sepia(1) saturate(50) hue-rotate(45deg) brightness(1.2)', label: 'Gol de Cabeça' },
    { type: 'emoji', filter: 'sepia(1) saturate(50) hue-rotate(80deg) brightness(1.3)', label: 'Pênalti' },
    { type: 'emoji', filter: 'sepia(1) saturate(20) hue-rotate(315deg) brightness(0.9)', label: 'Gol Contra' }
  ];

  const itemWidth = 160; 
  const totalLegendWidth = legendItems.length * itemWidth;
  let currentX = (WIDTH - totalLegendWidth) / 2 + (itemWidth / 2);

  const textY = rectY + (rectH / 2) + 5; 

  legendItems.forEach(item => {
    if (item.type === 'circle') {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      icon.setAttribute('cx', String(currentX - 50));
      icon.setAttribute('cy', String(textY - 4));
      icon.setAttribute('r', '6');
      icon.setAttribute('fill', item.color);
      icon.setAttribute('stroke', '#0b1f16');
      icon.setAttribute('stroke-width', '2');
      g.appendChild(icon);
    } else {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "text");
      icon.setAttribute('x', String(currentX - 50));
      icon.setAttribute('y', String(textY));
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', '16');
      icon.setAttribute('fill', '#ffffff');
      if (item.filter) icon.setAttribute('style', `filter:${item.filter}`);
      icon.textContent = '⚽';
      g.appendChild(icon);
    }

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute('x', String(currentX - 35));
    text.setAttribute('y', String(textY - 1));
    text.setAttribute('text-anchor', 'start');
    text.setAttribute('font-family', 'Inter, Arial, sans-serif');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-weight', '600');
    text.setAttribute('fill', '#e7f8f1');
    text.textContent = item.label;
    g.appendChild(text);

    currentX += itemWidth;
  });

  overlayEl.appendChild(g);
}
"""
        # Note: I replaced el(...) helpers with document.createElementNS just to be safe if 'el' is not in scope or different,
        # but 'el' helper IS defined in script.js usually.
        # However, to avoid any risk, I'll stick to standard DOM or rely on 'el' if I know it exists.
        # 'el' helper IS in the file (I saw it in the tail).
        # Let's revert to 'el' usage to match style, assuming 'el' is defined globally above.
        # But 'document.createElementNS' is safer if 'el' definition is corrupted.
        # Actually, the tail dump showed 'el' being used.
        # I'll stick to the code I wrote in script_append.js but use standard DOM to be 100% sure.
        
        # Combine
        final_data = valid_part + b"\n" + new_code.encode('utf-8')
        
        with open(filename, 'wb') as f:
            f.write(final_data)
            
        print("Surgical repair successful.")
        
    except Exception as e:
        print(f"Error: {e}")

surgical_repair('script.js')
