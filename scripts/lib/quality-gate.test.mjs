import test from "node:test";
import assert from "node:assert/strict";
import { avaliarQualidade, exigirQualidade } from "./quality-gate.mjs";

const item = (chave = "posicao|meia|") => ({
  frase: "No Vasco, o meia registra cerca de 3 finalizacoes por jogo.",
  chave,
  confianca: "padrao-consolidado",
});
const resumo = { conclusoes: [
  { tipo: "posicao-ofensiva", frase: "resumo", times: ["vasco", "bahia"] },
  { tipo: "alvo-defensivo", frase: "resumo", times: ["vasco", "bahia"] },
] };

test("quality gate aprova contrato completo", () => {
  const entrada = {
    timesEsperados: ["vasco"],
    ofensivosPorTime: new Map([["vasco", [item()]]]),
    defensivosPorTime: new Map([["vasco", [item("area|fora-da-area|meia")]]]),
    resumoRodada: resumo,
  };
  const r = exigirQualidade(entrada);
  assert.equal(r.ok, true);
  assert.equal(r.metricas.totalFrases, 2);
});

test("quality gate bloqueia cobertura e linguagem perigosas", () => {
  const r = avaliarQualidade({
    timesEsperados: ["vasco", "bahia"],
    ofensivosPorTime: new Map([["vasco", [{ ...item(), frase: "O Vasco marca gols." }]]]),
    defensivosPorTime: new Map([["vasco", [item()]]]),
    resumoRodada: { conclusoes: [] },
  });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((x) => x.includes("bahia")));
  assert.ok(r.erros.some((x) => x.includes("gol")));
  assert.ok(r.erros.some((x) => x.includes("resumo")));
});

test("quality gate bloqueia mudanca em massa com memoria suficiente", () => {
  const times = ["a", "b"];
  const atuais = new Map(times.map((time) => [time, [item("posicao|volante|")]]));
  const anteriores = new Map(times.map((time) => [time, {
    evidenciasAtaca: [{ chave: "posicao|meia|" }],
    evidenciasSofre: [{ chave: "posicao|meia|" }],
  }]));
  const r = avaliarQualidade({
    timesEsperados: times,
    ofensivosPorTime: atuais,
    defensivosPorTime: atuais,
    anterioresPorTime: anteriores,
    resumoRodada: resumo,
    maxTaxaMudanca: 0.5,
  });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((x) => x.includes("mudanca em massa")));
});
