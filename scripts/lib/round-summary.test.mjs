import test from "node:test";
import assert from "node:assert/strict";
import { gerarResumoRodada } from "./round-summary.mjs";

const item = (dimensao, categoria, frase, over = {}) => ({
  frase,
  achado: {
    dimensao, categoria, porJogo: 3, share: 0.3,
    distintividade: { valor: 0.8, direcao: "alto" },
    ...over,
  },
});

test("sem achados devolve resumo vazio e contrato estavel", () => {
  const r = gerarResumoRodada({ ofensivosPorTime: new Map(), defensivosPorTime: new Map(), rodada: 21, geradoEm: "2026-08-08T00:00:00.000Z" });
  assert.deepEqual(r, { versao: 2, rodada: 21, janelaAte: null, geradoEm: "2026-08-08T00:00:00.000Z", conclusoes: [] });
});

test("agrega posicao recorrente e preserva a evidencia mais forte", () => {
  const ofensivos = new Map([
    ["vasco", [item("posicao", "meia", "No Vasco, o meia registra cerca de 4 finalizações por jogo.", { porJogo: 4 })]],
    ["santos", [item("posicao", "meia", "No Santos, o meia registra cerca de 6 finalizações por jogo.", { porJogo: 6 })]],
    ["bahia", [item("posicao", "volante", "No Bahia, o volante registra cerca de 3 finalizações por jogo.")]],
  ]);
  const r = gerarResumoRodada({ ofensivosPorTime: ofensivos, defensivosPorTime: new Map() });
  assert.match(r.conclusoes[0].frase, /Meias.*Vasco e Santos/);
  assert.match(r.conclusoes[0].frase, /Santos.*6 finalizações/);
});

test("extremo baixo nunca entra na conclusao geral", () => {
  const ofensivos = new Map([["vasco", [item("area", "fora-da-area", "frase baixa", { distintividade: { valor: 0.9, direcao: "baixo" } })]]]);
  const r = gerarResumoRodada({ ofensivosPorTime: ofensivos, defensivosPorTime: new Map() });
  assert.equal(r.conclusoes.length, 0);
});

test("sintese usa finalizacoes e nao inventa assistencia de gol", () => {
  const defensivos = new Map([
    ["vasco", [item("posicao", "meia", "O Vasco cede cerca de 3 finalizações por jogo ao meia adversário.")]],
    ["bahia", [item("posicao", "meia", "O Bahia cede cerca de 4 finalizações por jogo ao meia adversário.")]],
  ]);
  const r = gerarResumoRodada({ ofensivosPorTime: new Map(), defensivosPorTime: defensivos });
  const texto = r.conclusoes.map((x) => x.frase).join(" ");
  assert.match(texto, /finalizações/);
  assert.doesNotMatch(texto, /assistência/i);
});

test("caso mediano fica no mapa do time, mas nao vira conclusao geral", () => {
  const ofensivos = new Map([["vasco", [item("area", "dentro-da-area", "frase mediana", { distintividade: { valor: 0.2, direcao: "meio" } })]]]);
  const r = gerarResumoRodada({ ofensivosPorTime: ofensivos, defensivosPorTime: new Map() });
  assert.equal(r.conclusoes.length, 0);
});
test("destaque defensivo usa quem menos cede finalizacoes", () => {
  const metricas = new Map([
    ["palmeiras", { finalizacoesCedidasPorJogo: 8.2, jogosUsados: 8 }],
    ["flamengo", { finalizacoesCedidasPorJogo: 9.1, jogosUsados: 8 }],
    ["vasco", { finalizacoesCedidasPorJogo: 11.4, jogosUsados: 8 }],
  ]);
  const r = gerarResumoRodada({ ofensivosPorTime: new Map(), defensivosPorTime: new Map(), metricasDefensivasPorTime: metricas });
  const destaque = r.conclusoes.find((x) => x.tipo === "destaque-defensivo");
  assert.match(destaque.frase, /Palmeiras.*8,2 finalizações por jogo/);
  assert.match(destaque.frase, /defesas que menos permitem chutes/);
});
