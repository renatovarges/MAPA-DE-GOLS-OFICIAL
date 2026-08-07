import test from "node:test";
import assert from "node:assert/strict";
import { gerarFrase, gerarFrases } from "./shot-phrases.mjs";

const base = { share: 0.3, pisoIC: 0.22, tetoIC: 0.4, ocorrencias: 30, porJogo: 2, jogosUsados: 15 };
const achado = (over) => ({ ...base, ...over });

test("frase de fragilidade descreve o time, sem comparar com ninguem", () => {
  const f = gerarFrase(achado({ dimensao: "origem", categoria: "CRUZAMENTO" }), { time: "Vasco", lado: "shots_against" });
  assert.match(f, /Vasco sofre/);
  assert.match(f, /cruzamento/);
  assert.doesNotMatch(f, /liga|Brasileirão|média/i, "sem comparacao quando nao ha anotacao");
});

test("o exemplo do Renato: cruzamento pela direita vira frase especifica", () => {
  const f = gerarFrase(achado({ dimensao: "origem+lado", categoria: "CRUZAMENTO|direita" }), { time: "Vasco", lado: "shots_against" });
  assert.match(f, /cruzamento pela direita/);
});

test("o outro exemplo: finalizacao de cabeca", () => {
  const f = gerarFrase(achado({ dimensao: "parteDoCorpo", categoria: "cabeca" }), { time: "Vasco", lado: "shots_against" });
  assert.match(f, /cabeça/);
});

test("categoria que e 'o default do futebol' (share > 75%) nao vira frase", () => {
  // 93% de jogada trabalhada ou 84% de finalizacao com o pe e verdade em
  // todo time — nao informa nada. Caso real visto no dado do Vasco.
  assert.equal(gerarFrase(achado({ dimensao: "contraAtaque", categoria: "jogada-organizada", share: 0.93 }), { time: "Vasco", lado: "shots_against" }), null);
  assert.equal(gerarFrase(achado({ dimensao: "parteDoCorpo", categoria: "pe", share: 0.84 }), { time: "Vasco", lado: "shots_against" }), null);
  // ja uma fatia grande mas nao dominante continua valendo
  assert.ok(gerarFrase(achado({ dimensao: "origem", categoria: "PASSE", share: 0.57 }), { time: "Vasco", lado: "shots_for" }));
});

test("as duas metades de um par binario sao elegiveis (nenhuma e fixa)", () => {
  assert.ok(gerarFrase(achado({ dimensao: "area", categoria: "fora-da-area" }), { time: "Vasco", lado: "shots_for" }));
  assert.ok(gerarFrase(achado({ dimensao: "area", categoria: "dentro-da-area" }), { time: "Vasco", lado: "shots_for" }));
});

test("num par binario, vence a metade em que o time e ponta de CIMA da liga", () => {
  // caso real: o Vasco finaliza 52% de dentro da area, o que parece muito,
  // mas ele e o 18o de 20 nisso — a frase verdadeira e sobre finalizar de
  // FORA. As duas metades empatam em distintividade por construcao, entao
  // quem decide e a direcao.
  const achados = [
    achado({ dimensao: "area", categoria: "dentro-da-area", share: 0.52, pisoIC: 0.47, distintividade: { valor: 0.75, direcao: "baixo", percentil: 0.125 } }),
    achado({ dimensao: "area", categoria: "fora-da-area", share: 0.48, pisoIC: 0.42, distintividade: { valor: 0.75, direcao: "alto", percentil: 0.875 } }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_for" });
  assert.equal(r.length, 1, "uma frase so por dimensao");
  assert.equal(r[0].achado.categoria, "fora-da-area");
  assert.match(r[0].frase, /fora da área/);
});

test("o qualificador reflete a posicao na liga, nao o tamanho da fatia", () => {
  const extremo = gerarFrase(achado({ dimensao: "origem", categoria: "ESCANTEIO", distintividade: { valor: 0.9, direcao: "alto", percentil: 0.95 } }), { time: "Vasco", lado: "shots_against" });
  assert.match(extremo, /muito mais que a maioria/);

  const acima = gerarFrase(achado({ dimensao: "origem", categoria: "ESCANTEIO", distintividade: { valor: 0.6, direcao: "alto", percentil: 0.8 } }), { time: "Vasco", lado: "shots_against" });
  assert.match(acima, /mais que a maioria/);
  assert.doesNotMatch(acima, /muito mais/);

  const comum = gerarFrase(achado({ dimensao: "origem", categoria: "ESCANTEIO", distintividade: { valor: 0.1, direcao: "meio", percentil: 0.55 } }), { time: "Vasco", lado: "shots_against" });
  assert.match(comum, /com frequência/);
  assert.doesNotMatch(comum, /maioria/);
});

test("frequencia por jogo aparece em linguagem concreta, sem decimal", () => {
  const muito = gerarFrase(achado({ dimensao: "origem", categoria: "PASSE", porJogo: 3.4 }), { time: "Vasco", lado: "shots_for" });
  assert.match(muito, /cerca de 3 por jogo/);
  const pouco = gerarFrase(achado({ dimensao: "origem", categoria: "PASSE", porJogo: 0.5 }), { time: "Vasco", lado: "shots_for" });
  assert.match(pouco, /1 a cada 2 jogos/);
  assert.doesNotMatch(muito, /3\.4|3,4/, "nao expoe o decimal cru");
});

test("categoria desconhecida da API nao quebra, so nao vira frase", () => {
  assert.equal(gerarFrase(achado({ dimensao: "origem", categoria: "FUNDAMENTO_NOVO" }), { time: "Vasco", lado: "shots_for" }), null);
});

test("gerarFrases limita a 1 por dimensao pra nao repetir o mesmo fato", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", pisoIC: 0.3 }),
    achado({ dimensao: "origem", categoria: "PASSE", pisoIC: 0.28 }),
    achado({ dimensao: "parteDoCorpo", categoria: "cabeca", pisoIC: 0.2 }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against" });
  assert.equal(r.length, 2, "duas dimensoes distintas, uma frase cada");
  assert.equal(r[0].achado.categoria, "CRUZAMENTO", "mantem a de maior piso dentro da dimensao");
});

test("gerarFrases respeita o teto de frases e ordena pelo piso do IC", () => {
  const achados = [
    achado({ dimensao: "origem", categoria: "CRUZAMENTO", pisoIC: 0.2 }),
    achado({ dimensao: "parteDoCorpo", categoria: "cabeca", pisoIC: 0.35 }),
    achado({ dimensao: "contraAtaque", categoria: "contra-ataque", pisoIC: 0.28 }),
  ];
  const r = gerarFrases(achados, { time: "Vasco", lado: "shots_against", max: 2 });
  assert.equal(r.length, 2);
  assert.equal(r[0].achado.dimensao, "parteDoCorpo");
  assert.equal(r[1].achado.dimensao, "contraAtaque");
});
