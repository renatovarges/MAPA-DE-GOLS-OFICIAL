import test from "node:test";
import assert from "node:assert/strict";
import { gerarFrase, gerarFrases } from "./shot-phrases.mjs";

const base = { share: 0.3, pisoIC: 0.22, tetoIC: 0.4, ocorrencias: 30, porJogo: 2, jogosUsados: 15 };
const achado = (over) => ({ ...base, ...over });
const posDom = (posicao, over = {}) => ({ posicao, share: 0.5, ocorrencias: 10, ...over });

test("frase de fragilidade descreve o time por identidade, sem comparar com ninguem", () => {
  const f = gerarFrase(achado({ dimensao: "origem", categoria: "CRUZAMENTO" }), { time: "Vasco", lado: "shots_against" });
  assert.match(f, /Vasco sofre/);
  assert.match(f, /cruzamento/);
  assert.doesNotMatch(f, /liga|Brasileirão|média|maioria/i);
});

test("PASSE nunca vira frase, em nenhuma dimensao que o envolva", () => {
  assert.equal(gerarFrase(achado({ dimensao: "origem", categoria: "PASSE" }), { time: "Vasco", lado: "shots_for" }), null);
  assert.equal(gerarFrase(achado({ dimensao: "origem+lado", categoria: "PASSE|esquerda" }), { time: "Vasco", lado: "shots_for" }), null);
  assert.equal(gerarFrase(achado({ dimensao: "origem+corpo", categoria: "PASSE|cabeca" }), { time: "Vasco", lado: "shots_for" }), null);
});

test("quando ha posicao dominante, a frase termina apontando o jogador (cria)", () => {
  const f = gerarFrase(
    achado({ dimensao: "origem", categoria: "ESCANTEIO", posicaoDominante: posDom("atacante-area") }),
    { time: "Vasco", lado: "shots_for" },
  );
  assert.match(f, /atacante de área/);
  assert.match(f, /Quem mais aparece/);
});

test("quando ha posicao dominante, a frase de fragilidade avisa pra vigiar o adversario", () => {
  const f = gerarFrase(
    achado({ dimensao: "origem", categoria: "ESCANTEIO", posicaoDominante: posDom("ponta-direita") }),
    { time: "Vasco", lado: "shots_against" },
  );
  assert.match(f, /ponta-direita adversário/);
  assert.match(f, /Fique de olho/);
});

test("sem posicao dominante suficiente, a frase sai sem cláusula extra (nao inventa)", () => {
  const f = gerarFrase(achado({ dimensao: "origem", categoria: "ESCANTEIO", posicaoDominante: null }), { time: "Vasco", lado: "shots_for" });
  assert.doesNotMatch(f, /Quem mais aparece|Fique de olho/);
});

test("dimensao posicao ja NOMEIA a posicao no corpo da frase (nao usa clausula extra)", () => {
  const f = gerarFrase(achado({ dimensao: "posicao", categoria: "meia" }), { time: "Vasco", lado: "shots_for" });
  assert.match(f, /o meia é quem mais finaliza/);
});

test("dimensao area: fora da área gera frase natural igual ao exemplo do Renato", () => {
  const f = gerarFrase(achado({ dimensao: "area", categoria: "fora-da-area", porJogo: 8 }), { time: "Vasco", lado: "shots_for" });
  assert.equal(f, "O Vasco é um time que finaliza muito de fora da área — cerca de 8 por jogo.");
});

test("dimensao ladoDaJogada gera frase de identidade, sem 'mais que a maioria'", () => {
  const f = gerarFrase(achado({ dimensao: "ladoDaJogada", categoria: "esquerda", porJogo: 5 }), { time: "Vasco", lado: "shots_for" });
  assert.equal(f, "O Vasco é um time que constrói muito pelo lado esquerdo — cerca de 5 por jogo.");
});

test("categoria que e 'o default do futebol' (share > 75%) nao vira frase", () => {
  assert.equal(gerarFrase(achado({ dimensao: "contraAtaque", categoria: "jogada-organizada", share: 0.93 }), { time: "Vasco", lado: "shots_against" }), null);
  assert.equal(gerarFrase(achado({ dimensao: "parteDoCorpo", categoria: "pe", share: 0.84 }), { time: "Vasco", lado: "shots_against" }), null);
});

test("as duas metades de um par binario sao elegiveis (nenhuma e fixa)", () => {
  assert.ok(gerarFrase(achado({ dimensao: "area", categoria: "fora-da-area" }), { time: "Vasco", lado: "shots_for" }));
  assert.ok(gerarFrase(achado({ dimensao: "area", categoria: "dentro-da-area" }), { time: "Vasco", lado: "shots_for" }));
});

test("num par binario, vence a metade em que o time e ponta de CIMA da liga", () => {
  const achados = [
    achado({ dimensao: "area", categoria: "dentro-da-area", share: 0.52, pisoIC: 0.47, distintividade: { valor: 0.75, direcao: "baixo", percentil: 0.125 } }),
    achado({ dimensao: "area", categoria: "fora-da-area", share: 0.48, pisoIC: 0.42, distintividade: { valor: 0.75, direcao: "alto", percentil: 0.875 } }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_for" });
  assert.equal(r.length, 1);
  assert.equal(r[0].achado.categoria, "fora-da-area");
  assert.match(r[0].frase, /fora da área/);
});

test("categoria desconhecida da API nao quebra, so nao vira frase", () => {
  assert.equal(gerarFrase(achado({ dimensao: "origem", categoria: "FUNDAMENTO_NOVO" }), { time: "Vasco", lado: "shots_for" }), null);
});

test("gerarFrases limita a 1 por dimensao pra nao repetir o mesmo fato", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", pisoIC: 0.3 }),
    achado({ dimensao: "origem", categoria: "ESCANTEIO", pisoIC: 0.28 }),
    achado({ dimensao: "parteDoCorpo", categoria: "cabeca", pisoIC: 0.2 }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against" });
  assert.equal(r.length, 2, "duas dimensoes distintas, uma frase cada");
});

test("gerarFrases respeita o teto de frases e ordena por distintividade", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", distintividade: { valor: 0.2, direcao: "alto", percentil: 0.6 } }),
    achado({ dimensao: "parteDoCorpo", categoria: "cabeca", distintividade: { valor: 0.9, direcao: "alto", percentil: 0.95 } }),
    achado({ dimensao: "contraAtaque", categoria: "contra-ataque", distintividade: { valor: 0.5, direcao: "alto", percentil: 0.8 } }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against", max: 2 });
  assert.equal(r.length, 2);
  assert.equal(r[0].achado.dimensao, "parteDoCorpo");
  assert.equal(r[1].achado.dimensao, "contraAtaque");
});
