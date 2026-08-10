import test from "node:test";
import assert from "node:assert/strict";
import { proximaRodadaCompleta, slugFootstats } from "./next-round.mjs";

test("normaliza nomes da FootStats para as chaves do projeto", () => {
  assert.equal(slugFootstats("São Paulo"), "sao-paulo");
  assert.equal(slugFootstats("Atlético-MG"), "atletico-mg");
  assert.equal(slugFootstats("Athletico-PR"), "athletico-pr");
});

test("seleciona somente a primeira rodada futura completa", () => {
  const times = ["Flamengo", "Botafogo", "Corinthians", "Bahia", "Fluminense", "Vasco", "Palmeiras", "São Paulo", "Santos", "Red Bull Bragantino", "Atlético-MG", "Cruzeiro", "Grêmio", "Internacional", "Vitória", "Athletico-PR", "Coritiba", "Chapecoense", "Remo", "Mirassol"];
  const partidas = [];
  for (let i = 0; i < 10; i++) partidas.push({ id: i, round: 23, date: "2026-08-16T16:00:00", teamhome: times[i * 2], teamaway: times[i * 2 + 1], notstarted: true, finished: false });
  partidas.push({ id: 99, round: 22, date: "2026-08-10T00:00:00", teamhome: "Flamengo", teamaway: "Vasco", notstarted: true, finished: false });
  assert.equal(proximaRodadaCompleta(partidas, 22).rodada, 23);
});

test("não libera rodada incompleta", () => {
  assert.equal(proximaRodadaCompleta([{ round: 23, date: "2026-08-16T16:00:00", teamhome: "Flamengo", teamaway: "Vasco", notstarted: true, finished: false }], 22), null);
});
