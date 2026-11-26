import test from "node:test";
import assert from "node:assert/strict";
import { jogosValidos, confrontosPorTime } from "./rodada-cartola.mjs";

const resposta = {
  clubes: { 1: { abreviacao: "FLA" }, 2: { abreviacao: "VAS" }, 3: { abreviacao: "CHA" }, 4: { abreviacao: "PAL" } },
  partidas: [
    { clube_casa_id: 3, clube_visitante_id: 4, partida_data: "2026-11-24 18:00:00", valida: false },
    { clube_casa_id: 1, clube_visitante_id: 2, partida_data: "2026-11-28 21:00:00", valida: true },
  ],
};

test("ignora jogo que não vale para a rodada do Cartola", () => {
  assert.deepEqual(jogosValidos(resposta), [{ mandante: "flamengo", visitante: "vasco", data: "2026-11-28T21:00:00" }]);
});

test("monta o confronto dos dois lados e deixa de fora quem não joga", () => {
  const porTime = confrontosPorTime(37, jogosValidos(resposta));
  assert.deepEqual(porTime.flamengo, { mando: "casa", adversario: "vasco", data: "2026-11-28T21:00:00", rodada: 37 });
  assert.equal(porTime.vasco.mando, "fora");
  assert.equal(porTime.chapecoense, undefined);
});

test("falha alto se aparecer clube desconhecido", () => {
  const ruim = { clubes: {}, partidas: [{ clube_casa_id: 9, clube_visitante_id: 8, valida: true }] };
  assert.throws(() => jogosValidos(ruim), /não reconhecido/);
});
