import test from "node:test";
import assert from "node:assert/strict";
import { gerarFrase, gerarFrases } from "./shot-phrases.mjs";

const base = { share: 0.3, pisoIC: 0.22, tetoIC: 0.4, ocorrencias: 30, porJogo: 2, jogosUsados: 15 };
const achado = (over) => ({ ...base, ...over });
const posDom = (posicao, over = {}) => ({ posicao, share: 0.5, ocorrencias: 10, ...over });

test("frase de fragilidade descreve o time por identidade, sem comparar com ninguem", () => {
  const f = gerarFrase(achado({ dimensao: "origem", categoria: "CRUZAMENTO", posicaoDominante: posDom("ponta-direita") }), { time: "Vasco", lado: "shots_against" });
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

test("REGRA (Renato, 4a rodada): posição é obrigatória — sem ela, o achado inteiro é descartado (nao sai frase incompleta)", () => {
  const f = gerarFrase(achado({ dimensao: "origem", categoria: "ESCANTEIO", posicaoDominante: null }), { time: "Vasco", lado: "shots_for" });
  assert.equal(f, null, "sem posição clara, a frase nem deveria existir — melhor descartar que sair incompleta");
});

test("dimensao posicao ja NOMEIA a posicao no corpo da frase (nao usa clausula extra)", () => {
  const f = gerarFrase(achado({ dimensao: "posicao", categoria: "meia" }), { time: "Vasco", lado: "shots_for" });
  assert.match(f, /o meia é quem mais finaliza/);
});

test("dimensao area: fora da área gera frase natural igual ao exemplo do Renato, com o substantivo explicito e a posição", () => {
  const f = gerarFrase(
    achado({ dimensao: "area", categoria: "fora-da-area", porJogo: 8, posicaoDominante: posDom("meia") }),
    { time: "Vasco", lado: "shots_for" },
  );
  assert.equal(f, "O Vasco cria muitas finalizações de fora da área — cerca de 8 por jogo. Quem mais aparece nessas jogadas é o meia.");
});

test("dimensao ladoDaJogada gera frase de identidade, sem 'mais que a maioria', com o substantivo explicito e a posição", () => {
  const f = gerarFrase(
    achado({ dimensao: "ladoDaJogada", categoria: "esquerda", porJogo: 5, posicaoDominante: posDom("lateral-esquerdo") }),
    { time: "Vasco", lado: "shots_for" },
  );
  assert.equal(f, "O Vasco cria muitas finalizações em jogadas construídas pelo lado esquerdo — cerca de 5 por jogo. Quem mais aparece nessas jogadas é o lateral-esquerdo.");
});

test("dimensoes que precisam de posicao (nao posicao/assistentePosicao) descartam o achado sem ela", () => {
  for (const dimensao of ["origem", "area", "contraAtaque", "parteDoCorpo", "ladoDaJogada", "origem+lado", "origem+corpo", "lado+corpo"]) {
    const categoriaValida = {
      origem: "CRUZAMENTO", area: "dentro-da-area", contraAtaque: "contra-ataque", parteDoCorpo: "cabeca",
      ladoDaJogada: "esquerda", "origem+lado": "CRUZAMENTO|esquerda", "origem+corpo": "CRUZAMENTO|cabeca", "lado+corpo": "esquerda|cabeca",
    }[dimensao];
    const f = gerarFrase(achado({ dimensao, categoria: categoriaValida, posicaoDominante: null }), { time: "Vasco", lado: "shots_for" });
    assert.equal(f, null, `dimensao ${dimensao} deveria exigir posição`);
  }
});

test("REGRA (Renato, 3a rodada): toda frase nomeia o que esta sendo contado — nunca so a posicao, sem dizer 'o que'", () => {
  const f = gerarFrase(achado({ dimensao: "posicao", categoria: "meia" }), { time: "Palmeiras", lado: "shots_against" });
  assert.match(f, /finalizaç/i, "tem que dizer 'finalizações', nao so 'sofre do meia adversário'");
  assert.equal(f, "O Palmeiras sofre muitas finalizações do meia adversário — cerca de 2 por jogo.");
});

test("assistentePosicao tambem nomeia 'assistências' explicitamente, nos dois lados", () => {
  const cria = gerarFrase(achado({ dimensao: "assistentePosicao", categoria: "volante" }), { time: "Vasco", lado: "shots_for" });
  const sofre = gerarFrase(achado({ dimensao: "assistentePosicao", categoria: "volante" }), { time: "Vasco", lado: "shots_against" });
  assert.match(cria, /assistência/i);
  assert.match(sofre, /assistência/i);
});

test("finalização de cabeça nunca é chamada de 'gol' (a base conta chute, nao gol)", () => {
  const f = gerarFrase(achado({ dimensao: "parteDoCorpo", categoria: "cabeca", posicaoDominante: posDom("atacante-area") }), { time: "Cruzeiro", lado: "shots_against" });
  assert.doesNotMatch(f, /\bgol\b/i);
  assert.match(f, /finalizaç/i);
});

test("categoria que e 'o default do futebol' (share > 75%) nao vira frase", () => {
  assert.equal(gerarFrase(achado({ dimensao: "contraAtaque", categoria: "jogada-organizada", share: 0.93, posicaoDominante: posDom("meia") }), { time: "Vasco", lado: "shots_against" }), null);
  assert.equal(gerarFrase(achado({ dimensao: "parteDoCorpo", categoria: "pe", share: 0.84, posicaoDominante: posDom("meia") }), { time: "Vasco", lado: "shots_against" }), null);
});

test("as duas metades de um par binario sao elegiveis (nenhuma e fixa)", () => {
  assert.ok(gerarFrase(achado({ dimensao: "area", categoria: "fora-da-area", posicaoDominante: posDom("meia") }), { time: "Vasco", lado: "shots_for" }));
  assert.ok(gerarFrase(achado({ dimensao: "area", categoria: "dentro-da-area", posicaoDominante: posDom("atacante-area") }), { time: "Vasco", lado: "shots_for" }));
});

test("num par binario, vence a metade em que o time e ponta de CIMA da liga", () => {
  const achados = [
    achado({ dimensao: "area", categoria: "dentro-da-area", share: 0.52, pisoIC: 0.47, posicaoDominante: posDom("atacante-area"), distintividade: { valor: 0.75, direcao: "baixo", percentil: 0.125 } }),
    achado({ dimensao: "area", categoria: "fora-da-area", share: 0.48, pisoIC: 0.42, posicaoDominante: posDom("meia"), distintividade: { valor: 0.75, direcao: "alto", percentil: 0.875 } }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_for" });
  assert.equal(r.length, 1);
  assert.equal(r[0].achado.categoria, "fora-da-area");
  assert.match(r[0].frase, /fora da área/);
});

test("categoria desconhecida da API nao quebra, so nao vira frase", () => {
  assert.equal(gerarFrase(achado({ dimensao: "origem", categoria: "FUNDAMENTO_NOVO", posicaoDominante: posDom("meia") }), { time: "Vasco", lado: "shots_for" }), null);
});

test("gerarFrases limita a 1 por dimensao pra nao repetir o mesmo fato", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", pisoIC: 0.3, posicaoDominante: posDom("ponta-direita") }),
    achado({ dimensao: "origem", categoria: "ESCANTEIO", pisoIC: 0.28, posicaoDominante: posDom("atacante-area") }),
    achado({ dimensao: "parteDoCorpo", categoria: "cabeca", pisoIC: 0.2, posicaoDominante: posDom("atacante-area") }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against" });
  assert.equal(r.length, 2, "duas dimensoes distintas, uma frase cada");
});

test("gerarFrases respeita o teto de frases e ordena por distintividade", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", posicaoDominante: posDom("ponta-direita"), distintividade: { valor: 0.2, direcao: "alto", percentil: 0.6 } }),
    achado({ dimensao: "parteDoCorpo", categoria: "cabeca", posicaoDominante: posDom("atacante-area"), distintividade: { valor: 0.9, direcao: "alto", percentil: 0.95 } }),
    achado({ dimensao: "contraAtaque", categoria: "contra-ataque", posicaoDominante: posDom("meia"), distintividade: { valor: 0.5, direcao: "alto", percentil: 0.8 } }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against", max: 2 });
  assert.equal(r.length, 2);
  assert.equal(r[0].achado.dimensao, "parteDoCorpo");
  assert.equal(r[1].achado.dimensao, "contraAtaque");
});

test("gerarFrases: quando um achado (nao-posicao) nao tem posicaoDominante, ele e pulado (a proxima vaga vai pra outro achado)", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", posicaoDominante: null, distintividade: { valor: 0.9, direcao: "alto", percentil: 0.95 } }), // seria o melhor, mas sem posicao
    achado({ dimensao: "contraAtaque", categoria: "contra-ataque", posicaoDominante: posDom("meia"), distintividade: { valor: 0.1, direcao: "alto", percentil: 0.55 } }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against" });
  assert.equal(r.length, 1);
  assert.equal(r[0].achado.dimensao, "contraAtaque");
});
