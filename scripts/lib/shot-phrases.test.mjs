import test from "node:test";
import assert from "node:assert/strict";
import { gerarFrase, gerarFrases } from "./shot-phrases.mjs";

test("frase de origem, shots_against, acima -> menciona 'sofre' e a jogada", () => {
  const achado = { dimensao: "origem", categoria: "ESCANTEIO", direcao: "acima", taxaTime: 0.3, taxaLiga: 0.1, z: 4 };
  const frase = gerarFrase(achado, { time: "Vasco", lado: "shots_against" });
  assert.match(frase, /Vasco/);
  assert.match(frase, /sofre/);
  assert.match(frase, /escanteio/);
});

test("frase de origem, shots_for, acima -> menciona 'cria'", () => {
  const achado = { dimensao: "origem", categoria: "CRUZAMENTO", direcao: "acima", taxaTime: 0.4, taxaLiga: 0.15, z: 3.2 };
  const frase = gerarFrase(achado, { time: "Palmeiras", lado: "shots_for" });
  assert.match(frase, /cria/);
  assert.match(frase, /cruzamento/);
});

test("categoria sem template (origem inexistente) retorna null, não quebra", () => {
  const achado = { dimensao: "origem", categoria: "ALGO_NOVO_DA_API", direcao: "acima", taxaTime: 0.5, taxaLiga: 0.1, z: 5 };
  assert.equal(gerarFrase(achado, { time: "Vasco", lado: "shots_for" }), null);
});

test("dimensao area categoria fora-da-area sempre null (evita duplicar o espelho de dentro-da-area)", () => {
  const achado = { dimensao: "area", categoria: "fora-da-area", direcao: "acima", taxaTime: 0.5, taxaLiga: 0.1, z: 3 };
  assert.equal(gerarFrase(achado, { time: "Vasco", lado: "shots_for" }), null);
});

test("gerarFrases filtra nulls e ordena por |z| desc", () => {
  const achados = [
    { dimensao: "origem", categoria: "PASSE", direcao: "acima", taxaTime: 0.5, taxaLiga: 0.3, z: 2.6 },
    { dimensao: "origem", categoria: "ESCANTEIO", direcao: "acima", taxaTime: 0.4, taxaLiga: 0.1, z: 4.1 },
    { dimensao: "area", categoria: "fora-da-area", direcao: "acima", taxaTime: 0.5, taxaLiga: 0.1, z: 9 }, // deve ser filtrado
  ];
  const resultado = gerarFrases(achados, { time: "Vasco", lado: "shots_for" });
  assert.equal(resultado.length, 2);
  assert.equal(resultado[0].achado.categoria, "ESCANTEIO");
});
