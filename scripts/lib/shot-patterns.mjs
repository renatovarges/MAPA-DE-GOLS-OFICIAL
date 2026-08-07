/**
 * Detecção de padrão recorrente de como um time cria/cede finalização —
 * núcleo estatístico puro (sem I/O), pensado pra rodar sobre
 * `data/finalizacoes/{time}.json` (ver harvest_footstats_shots.mjs).
 *
 * IDEIA CENTRAL (pedida pelo Renato, 2026-08): não é "quantas finalizações"
 * — é ONDE/COMO elas nascem (setor do campo, tipo de jogada, posição de
 * quem finaliza/assiste) comparado com a MÉDIA DA LIGA no mesmo recorte de
 * jogos. Só vira "padrão" o que passa um teste de significância — regra do
 * próprio Renato: "se o time não tiver nada mensurável, esquece, deixa
 * quieto". Ver `detectarPadroes` pros critérios exatos.
 *
 * Teste usado: proporção de duas amostras (z-test), time vs. RESTO DA LIGA
 * (liga menos o próprio time — "leave-one-out", pra não comparar o time
 * com uma média que já inclui ele mesmo). Com poucos jogos (5-6) cada
 * categoria tem poucas dezenas de finalizações no máximo, entấo dois
 * cuidados extras, além do z-score:
 *   1. Exige uma contagem mínima do time NAQUELA categoria (`minAmostraTime`)
 *      — a aproximação normal do z-test não é confiável com n muito baixo,
 *      mesmo que o z "passe" o corte.
 *   2. `zCritico` default é 2.5 (bem mais estrito que o 1.96 do "95%"
 *      clássico) porque estamos testando MUITAS categorias ao mesmo tempo
 *      (origem × posição × zona, criado e cedido) — sem esse aperto, o
 *      "achado significativo" apareceria só por acaso com frequência.
 */

/** filtra os últimos N jogos (por data real, não por round da FootStats — mesma Regra de Ouro do projeto irmão) e devolve a lista plana de finalizações de um lado (shots_for | shots_against). */
export function ultimasFinalizacoes(matchesObj, { lado, ultimasN = 6 } = {}) {
  const partidas = Object.values(matchesObj || {})
    .filter((m) => m && m.date && Array.isArray(m[lado]))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, ultimasN);
  const shots = [];
  for (const p of partidas) {
    for (const s of p[lado]) shots.push(s);
  }
  return { shots, jogosUsados: partidas.length };
}

/** conta ocorrências de uma categoria dentro de uma dimensão (origem, posicao, dentroDaArea, contraAtaque, gol). */
export function contarPorCategoria(shots, dimensao) {
  const contagem = new Map();
  for (const s of shots) {
    const valor = extrairValor(s, dimensao);
    if (valor == null) continue;
    contagem.set(valor, (contagem.get(valor) || 0) + 1);
  }
  return contagem;
}

function extrairValor(shot, dimensao) {
  switch (dimensao) {
    case "origem": return shot.origem || null;
    case "posicao": return shot.posicao || null;
    case "assistentePosicao": return shot.assistentePosicao || null;
    case "area": return shot.dentroDaArea ? "dentro-da-area" : "fora-da-area";
    case "contraAtaque": return shot.contraAtaque ? "contra-ataque" : "jogada-organizada";
    default: throw new Error(`dimensão desconhecida: ${dimensao}`);
  }
}

/** z-test de duas proporções independentes. Retorna null se alguma amostra for pequena demais pra normal aproximar bem (n<5 em qualquer lado). */
export function zTestDuasProporcoes(xTime, nTime, xResto, nResto) {
  if (nTime < 5 || nResto < 5) return null;
  const p1 = xTime / nTime;
  const p2 = xResto / nResto;
  const pooled = (xTime + xResto) / (nTime + nResto);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nTime + 1 / nResto));
  if (se === 0) return null;
  return { z: (p1 - p2) / se, p1, p2 };
}

/**
 * Compara o time contra o RESTO da liga (mesmo recorte de jogos, mesma
 * dimensão) e devolve só os achados que passam os dois critérios de
 * confiança. `porTimeMap`: Map<timeSlug, {shots, jogosUsados}> já filtrado
 * pelas últimas N partidas de CADA time (ver ultimasFinalizacoes).
 */
export function detectarPadroes({
  timeSlug,
  porTimeMap,
  dimensao,
  minAmostraTime = 8,
  zCritico = 2.5,
}) {
  const doTime = porTimeMap.get(timeSlug);
  if (!doTime || !doTime.shots.length) return [];

  const shotsResto = [];
  for (const [slug, dados] of porTimeMap) {
    if (slug === timeSlug) continue;
    shotsResto.push(...dados.shots);
  }

  const contagemTime = contarPorCategoria(doTime.shots, dimensao);
  const contagemResto = contarPorCategoria(shotsResto, dimensao);
  const nTime = doTime.shots.length;
  const nResto = shotsResto.length;

  const achados = [];
  for (const [categoria, xTime] of contagemTime) {
    if (xTime < minAmostraTime) continue;
    const xResto = contagemResto.get(categoria) || 0;
    const teste = zTestDuasProporcoes(xTime, nTime, xResto, nResto);
    if (!teste || Math.abs(teste.z) < zCritico) continue;
    achados.push({
      dimensao, categoria,
      time: timeSlug,
      taxaTime: teste.p1,
      taxaLiga: teste.p2,
      z: teste.z,
      direcao: teste.z > 0 ? "acima" : "abaixo",
      amostraTime: xTime,
      amostraTotalTime: nTime,
    });
  }
  return achados.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}
