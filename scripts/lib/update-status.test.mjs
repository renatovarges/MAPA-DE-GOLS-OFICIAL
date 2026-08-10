import test from "node:test";
import assert from "node:assert/strict";
import { calcularStatusAtualizacao } from "./update-status.mjs";

function dadosDaRodada(quantidade, rodada = 22) {
  const mapa = new Map();
  for (let i = 0; i < quantidade * 2; i++) {
    const time = "time-" + i;
    const jogo = Math.floor(i / 2);
    mapa.set(time, { matches: { ["jogo-" + jogo]: {
      matchId: 1000 + jogo,
      roundNumber: rodada,
      date: "2026-08-09",
      opponent: "time-" + (i % 2 ? i - 1 : i + 1),
    } } });
  }
  return mapa;
}

test("marca pronto somente com rodada completa e leituras recalculadas", () => {
  const status = calcularStatusAtualizacao({
    dadosPorTime: dadosDaRodada(10), rodada: 22, timesEsperados: 20,
    frasesAtualizadas: true, leituraEstrategicaAtualizada: true,
  });
  assert.equal(status.estado, "pronto");
  assert.equal(status.jogosProcessados, 10);
  assert.equal(status.timesAtualizados, 20);
});

test("rodada em andamento aparece como parcial", () => {
  const status = calcularStatusAtualizacao({
    dadosPorTime: dadosDaRodada(4, 23), rodada: 23, timesEsperados: 20,
    frasesAtualizadas: true, leituraEstrategicaAtualizada: true,
  });
  assert.equal(status.estado, "parcial");
  assert.equal(status.jogosProcessados, 4);
  assert.equal(status.timesAtualizados, 8);
});
