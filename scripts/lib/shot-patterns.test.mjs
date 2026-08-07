import test from "node:test";
import assert from "node:assert/strict";
import {
  pesoDoJogo, finalizacoesPonderadas, amostraEfetiva, intervaloWilson,
  ladoDoCampo, extrairValor, detectarPadroesInternos, compararComLiga, posicaoDominante,
} from "./shot-patterns.mjs";

function shot(over = {}) {
  return {
    origem: "PASSE", posicao: "atacante-area", assistentePosicao: "meia",
    perna: "PERNA_DIREITA", dentroDaArea: true, contraAtaque: false,
    origemZona: { x: 70, y: 34 }, gol: false, ...over,
  };
}

// --- pesos e janela ---

test("pesoDoJogo aplica 3/2/1 nas faixas certas", () => {
  assert.equal(pesoDoJogo(0), 3);
  assert.equal(pesoDoJogo(4), 3);
  assert.equal(pesoDoJogo(5), 2);
  assert.equal(pesoDoJogo(9), 2);
  assert.equal(pesoDoJogo(10), 1);
  assert.equal(pesoDoJogo(20), 1);
});

test("finalizacoesPonderadas ordena por data real e pesa por recência", () => {
  const matches = {
    a: { date: "2026-01-10", shots_for: [shot({ origem: "ANTIGO" })] },
    b: { date: "2026-05-01", shots_for: [shot({ origem: "RECENTE" })] },
  };
  const { shots, jogosUsados } = finalizacoesPonderadas(matches, { lado: "shots_for" });
  assert.equal(jogosUsados, 2);
  assert.equal(shots[0].origem, "RECENTE");
  assert.equal(shots[0]._peso, 3);
  assert.equal(shots[1]._peso, 3); // ambos entre os 5 mais recentes
});

test("finalizacoesPonderadas dá peso menor ao 11o jogo em diante", () => {
  const matches = {};
  for (let i = 0; i < 12; i++) {
    // datas decrescentes: i=0 é o mais antigo
    matches[i] = { date: `2026-01-${String(i + 1).padStart(2, "0")}`, shots_for: [shot()] };
  }
  const { shots } = finalizacoesPonderadas(matches, { lado: "shots_for" });
  assert.equal(shots[0]._peso, 3);   // mais recente
  assert.equal(shots[6]._peso, 2);
  assert.equal(shots[11]._peso, 1);  // mais antigo
});

// --- amostra efetiva ---

test("amostraEfetiva com pesos iguais devolve o proprio n", () => {
  assert.equal(amostraEfetiva([1, 1, 1, 1]), 4);
  assert.equal(amostraEfetiva([2, 2, 2, 2]), 4);
});

test("amostraEfetiva encolhe quando os pesos sao desiguais", () => {
  const n = amostraEfetiva([3, 3, 1, 1, 1, 1]);
  assert.ok(n < 6, `deveria ser menor que 6 (bruto), veio ${n}`);
  assert.ok(n > 4, `mas nao pequeno demais, veio ${n}`);
});

// --- Wilson ---

test("intervaloWilson nunca devolve piso negativo (que a normal devolveria)", () => {
  const { lo } = intervaloWilson(0.02, 30);
  assert.ok(lo >= 0, `piso deveria ser >= 0, veio ${lo}`);
});

test("intervaloWilson estreita conforme a amostra cresce", () => {
  const pequeno = intervaloWilson(0.3, 20);
  const grande = intervaloWilson(0.3, 400);
  assert.ok((grande.hi - grande.lo) < (pequeno.hi - pequeno.lo));
});

// --- lado do campo ---

test("ladoDoCampo: Y baixo = esquerda, Y alto = direita (validado com dado real)", () => {
  assert.equal(ladoDoCampo({ x: 80, y: 10 }), "esquerda");
  assert.equal(ladoDoCampo({ x: 80, y: 34 }), "centro");
  assert.equal(ladoDoCampo({ x: 80, y: 60 }), "direita");
  assert.equal(ladoDoCampo(null), null);
});

test("dimensao origem+lado ignora jogada pelo centro (nao e um 'lado')", () => {
  assert.equal(extrairValor(shot({ origem: "CRUZAMENTO", origemZona: { x: 80, y: 34 } }), "origem+lado"), null);
  assert.equal(extrairValor(shot({ origem: "CRUZAMENTO", origemZona: { x: 80, y: 60 } }), "origem+lado"), "CRUZAMENTO|direita");
});

test("dimensao parteDoCorpo separa cabeca de pe e ignora ausente", () => {
  assert.equal(extrairValor(shot({ perna: "CABECA" }), "parteDoCorpo"), "cabeca");
  assert.equal(extrairValor(shot({ perna: "PERNA_ESQUERDA" }), "parteDoCorpo"), "pe");
  assert.equal(extrairValor(shot({ perna: null }), "parteDoCorpo"), null);
});

// --- deteccao interna ---

function repetir(n, over) {
  return Array.from({ length: n }, () => ({ ...shot(over), _peso: 1 }));
}

test("detectarPadroesInternos acha um padrao interno forte SEM olhar pra liga", () => {
  const shots = [...repetir(40, { origem: "CRUZAMENTO" }), ...repetir(60, { origem: "PASSE" })];
  const achados = detectarPadroesInternos({ shots, jogosUsados: 10, dimensao: "origem" });
  const cruz = achados.find((a) => a.categoria === "CRUZAMENTO");
  assert.ok(cruz, "40% do total deveria virar padrao");
  assert.ok(cruz.pisoIC > 0.12);
  assert.equal(cruz.ocorrencias, 40);
  assert.equal(cruz.porJogo, 4);
});

test("detectarPadroesInternos descarta categoria pequena mesmo com amostra grande", () => {
  const shots = [...repetir(12, { origem: "FALTA" }), ...repetir(188, { origem: "PASSE" })];
  const achados = detectarPadroesInternos({ shots, jogosUsados: 15, dimensao: "origem" });
  assert.equal(achados.find((a) => a.categoria === "FALTA"), undefined, "6% do total nao e padrao");
  assert.ok(achados.find((a) => a.categoria === "PASSE"));
});

test("detectarPadroesInternos exige contagem bruta minima (trava anti-peso-inflado)", () => {
  // 6 ocorrencias, todas em jogos recentes (peso 3) -> share alto por peso,
  // mas contagem bruta baixa demais pra afirmar padrao
  const shots = [
    ...Array.from({ length: 6 }, () => ({ ...shot({ origem: "ESCANTEIO" }), _peso: 3 })),
    ...Array.from({ length: 30 }, () => ({ ...shot({ origem: "PASSE" }), _peso: 1 })),
  ];
  const achados = detectarPadroesInternos({ shots, jogosUsados: 10, dimensao: "origem" });
  assert.equal(achados.find((a) => a.categoria === "ESCANTEIO"), undefined);
});

test("detectarPadroesInternos usa amostra EFETIVA: mesmo N bruto e mesmo share, mas pesos desiguais alargam o IC", () => {
  // os dois casos tem 200 finalizacoes e CRUZAMENTO em 50% — a unica
  // diferenca e a desigualdade dos pesos, que derruba a amostra efetiva
  // (200 -> 160) e por isso TEM que alargar o intervalo. Se o codigo usasse
  // a contagem bruta em vez da efetiva, os dois intervalos sairiam iguais.
  const comPesoUniforme = [
    ...Array.from({ length: 100 }, () => ({ ...shot({ origem: "CRUZAMENTO" }), _peso: 1 })),
    ...Array.from({ length: 100 }, () => ({ ...shot({ origem: "PASSE" }), _peso: 1 })),
  ];
  const comPesoDesigual = [
    ...Array.from({ length: 50 }, () => ({ ...shot({ origem: "CRUZAMENTO" }), _peso: 3 })),
    ...Array.from({ length: 50 }, () => ({ ...shot({ origem: "CRUZAMENTO" }), _peso: 1 })),
    ...Array.from({ length: 50 }, () => ({ ...shot({ origem: "PASSE" }), _peso: 3 })),
    ...Array.from({ length: 50 }, () => ({ ...shot({ origem: "PASSE" }), _peso: 1 })),
  ];
  const pegaCruz = (lista) => detectarPadroesInternos({ shots: lista, jogosUsados: 20, dimensao: "origem" })
    .find((x) => x.categoria === "CRUZAMENTO");

  const uniforme = pegaCruz(comPesoUniforme);
  const desigual = pegaCruz(comPesoDesigual);

  assert.equal(uniforme.ocorrencias, desigual.ocorrencias, "mesmo N bruto");
  assert.ok(Math.abs(uniforme.share - desigual.share) < 1e-9, "mesmo share");
  assert.ok(desigual.nEfetivo < uniforme.nEfetivo, `amostra efetiva deveria cair (${desigual.nEfetivo} vs ${uniforme.nEfetivo})`);
  assert.ok(
    (desigual.tetoIC - desigual.pisoIC) > (uniforme.tetoIC - uniforme.pisoIC),
    "pesos desiguais deveriam alargar o intervalo",
  );
});

// --- liga como anotacao ---

test("compararComLiga marca 'acima' so quando os intervalos nem se encostam", () => {
  const shots = repetir(50, { origem: "ESCANTEIO" }).concat(repetir(50, { origem: "PASSE" }));
  const achado = detectarPadroesInternos({ shots, jogosUsados: 10, dimensao: "origem" })
    .find((a) => a.categoria === "ESCANTEIO");
  const ligaBaixa = repetir(20, { origem: "ESCANTEIO" }).concat(repetir(380, { origem: "PASSE" }));
  assert.equal(compararComLiga({ achado, shotsLiga: ligaBaixa }).destaque, "acima");
  const ligaIgual = repetir(200, { origem: "ESCANTEIO" }).concat(repetir(200, { origem: "PASSE" }));
  assert.equal(compararComLiga({ achado, shotsLiga: ligaIgual }).destaque, null);
});

test("padrao interno sobrevive mesmo quando o time e IGUAL a liga (o ponto do redesenho)", () => {
  const shots = repetir(50, { origem: "CRUZAMENTO" }).concat(repetir(50, { origem: "PASSE" }));
  const achado = detectarPadroesInternos({ shots, jogosUsados: 10, dimensao: "origem" })
    .find((a) => a.categoria === "CRUZAMENTO");
  assert.ok(achado, "deve continuar sendo padrao do time");
  const ligaIgual = repetir(200, { origem: "CRUZAMENTO" }).concat(repetir(200, { origem: "PASSE" }));
  assert.equal(compararComLiga({ achado, shotsLiga: ligaIgual }).destaque, null, "sem destaque vs liga, mas o padrao permanece");
});

// --- quem se beneficia (posicaoDominante) ---

test("posicaoDominante acha a posicao clara quando ela domina o subconjunto", () => {
  const shots = [
    ...Array.from({ length: 8 }, () => shot({ posicao: "ponta-direita" })),
    ...Array.from({ length: 2 }, () => shot({ posicao: "meia" })),
  ];
  const r = posicaoDominante(shots);
  assert.equal(r.posicao, "ponta-direita");
  assert.equal(r.ocorrencias, 8);
});

test("posicaoDominante nao aponta nada quando a fatia esta espalhada (nao inventa)", () => {
  const shots = [
    ...Array.from({ length: 4 }, () => shot({ posicao: "ponta-direita" })),
    ...Array.from({ length: 4 }, () => shot({ posicao: "meia" })),
    ...Array.from({ length: 4 }, () => shot({ posicao: "volante" })),
  ];
  assert.equal(posicaoDominante(shots), null);
});

test("posicaoDominante exige contagem minima mesmo com fatia grande (amostra pequena demais)", () => {
  const shots = [
    ...Array.from({ length: 3 }, () => shot({ posicao: "ponta-direita" })),
    shot({ posicao: "meia" }),
  ];
  assert.equal(posicaoDominante(shots), null);
});

test("detectarPadroesInternos anexa posicaoDominante pras dimensoes que nao sao posicao/assistentePosicao", () => {
  const shots = [
    ...Array.from({ length: 30 }, () => shot({ origem: "CRUZAMENTO", posicao: "ponta-direita" })),
    ...Array.from({ length: 70 }, () => shot({ origem: "PASSE" })),
  ];
  const achado = detectarPadroesInternos({ shots, jogosUsados: 15, dimensao: "origem" })
    .find((a) => a.categoria === "CRUZAMENTO");
  assert.ok(achado.posicaoDominante, "cruzamento deveria vir com uma posicao dominante");
  assert.equal(achado.posicaoDominante.posicao, "ponta-direita");
});

test("detectarPadroesInternos NAO anexa posicaoDominante quando a dimensao ja e posicao (seria redundante)", () => {
  const shots = Array.from({ length: 30 }, () => shot({ posicao: "ponta-direita" }));
  const achado = detectarPadroesInternos({ shots, jogosUsados: 15, dimensao: "posicao" })
    .find((a) => a.categoria === "ponta-direita");
  assert.equal(achado.posicaoDominante, undefined);
});
