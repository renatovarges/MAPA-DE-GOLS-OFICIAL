const TIMES = new Map([
  ["flamengo", "flamengo"], ["botafogo", "botafogo"], ["corinthians", "corinthians"],
  ["bahia", "bahia"], ["fluminense", "fluminense"], ["vasco", "vasco"],
  ["palmeiras", "palmeiras"], ["sao paulo", "sao-paulo"], ["santos", "santos"],
  ["red bull bragantino", "red-bull-bragantino"], ["atletico mg", "atletico-mg"],
  ["cruzeiro", "cruzeiro"], ["gremio", "gremio"], ["internacional", "internacional"],
  ["vitoria", "vitoria"], ["athletico pr", "athletico-pr"], ["coritiba", "coritiba"],
  ["chapecoense", "chapecoense"], ["remo", "remo"], ["mirassol", "mirassol"],
]);

function semAcento(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugFootstats(nome) { return TIMES.get(semAcento(nome)) || null; }

export function proximaRodadaCompleta(partidas, rodadaDados, { jogosEsperados = 10 } = {}) {
  const grupos = new Map();
  for (const partida of partidas || []) {
    const rodada = Number(partida?.round);
    if (!(rodada > Number(rodadaDados)) || partida?.finished || !partida?.notstarted || !partida?.date) continue;
    const mandante = slugFootstats(partida.teamhome), visitante = slugFootstats(partida.teamaway);
    if (!mandante || !visitante) continue;
    if (!grupos.has(rodada)) grupos.set(rodada, []);
    grupos.get(rodada).push({ id: partida.id, rodada, data: partida.date, mandante, visitante });
  }
  for (const [rodada, jogos] of [...grupos].sort((a, b) => a[0] - b[0])) {
    const times = new Set(jogos.flatMap((j) => [j.mandante, j.visitante]));
    if (jogos.length === jogosEsperados && times.size === jogosEsperados * 2) {
      return { rodada, jogos: jogos.sort((a, b) => a.data.localeCompare(b.data)) };
    }
  }
  return null;
}
