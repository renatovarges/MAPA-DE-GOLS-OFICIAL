import test from "node:test";
import assert from "node:assert/strict";
import { gerarFraseInsight } from "./matchup-phrases.mjs";
import { TIPOS_INSIGHT } from "./matchup-insights.mjs";

function perfil(taxa, ocorrencias = 6) {
  return { j3: { taxa }, j5: { taxa }, j10: { taxa, jogosComEvento: ocorrencias, jogos: 10 } };
}

function item(tipo, scout = "finalizacoes") {
  return { tipo, scout, chave: "posicao:meia", atacante: "Bahia", defensor: "Chapecoense", baseline: 0.8, perfilAtaque: perfil(1.7, 7), perfilDefesa: perfil(1.9, 8) };
}

test("convergência explica os dois lados e termina com aplicação", () => {
  const frase = gerarFraseInsight(item(TIPOS_INSIGHT.CONVERGENCIA));
  assert.match(frase.texto, /Bahia produz/);
  assert.match(frase.texto, /Chapecoense cede/);
  assert.match(frase.texto, /Na prática/);
});

test("gols não são descritos como finalizações", () => {
  const frase = gerarFraseInsight(item(TIPOS_INSIGHT.CONVERGENCIA, "gols"));
  assert.match(frase.texto, /gols de meias/);
  assert.doesNotMatch(frase.texto, /finalizações/);
});

test("força própria declara que não depende da confirmação do adversário", () => {
  const frase = gerarFraseInsight(item(TIPOS_INSIGHT.FORCA_PROPRIA));
  assert.match(frase.texto, /não apresenta uma fragilidade igualmente forte/);
  assert.match(frase.texto, /recorrência do próprio Bahia/);
});

test("fragilidade própria não atribui ao atacante um padrão inexistente", () => {
  const frase = gerarFraseInsight(item(TIPOS_INSIGHT.FRAGILIDADE_PROPRIA));
  assert.match(frase.texto, /não é um padrão ofensivo dominante do Bahia/);
  assert.match(frase.texto, /vulnerabilidade defensiva/);
});
