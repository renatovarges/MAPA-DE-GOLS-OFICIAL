function chavePartida(time, partida) {
  if (partida?.matchId !== undefined && partida?.matchId !== null) return String(partida.matchId);
  const clubes = [time, partida?.opponent].filter(Boolean).sort();
  return [partida?.date || "", ...clubes].join("|");
}

export function calcularStatusAtualizacao({
  dadosPorTime = new Map(),
  rodada = null,
  geradoEm = null,
  janelaAte = null,
  timesEsperados = 20,
  jogosEsperados = 10,
  frasesAtualizadas = false,
  leituraEstrategicaAtualizada = false,
} = {}) {
  const jogos = new Set();
  const times = new Set();
  for (const [time, dados] of dadosPorTime) {
    for (const partida of Object.values(dados?.matches || {})) {
      if (Number(partida?.roundNumber) !== Number(rodada)) continue;
      jogos.add(chavePartida(time, partida));
      times.add(time);
    }
  }
  const jogosProcessados = jogos.size;
  const timesAtualizados = times.size;
  const rodadaCompleta = jogosProcessados >= jogosEsperados && timesAtualizados >= timesEsperados;
  const pronto = rodadaCompleta && frasesAtualizadas && leituraEstrategicaAtualizada;
  return {
    estado: pronto ? "pronto" : "parcial",
    rodada,
    jogosProcessados,
    jogosEsperados,
    timesAtualizados,
    timesEsperados,
    frasesAtualizadas,
    leituraEstrategicaAtualizada,
    atualizadoEm: geradoEm,
    ultimaPartidaEm: janelaAte,
  };
}
