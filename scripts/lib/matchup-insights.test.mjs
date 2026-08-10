import test from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_INSIGHT, eventosDoChute, avaliarForca,
  gerarCandidatosConfronto, selecionarDestaques, contagensPartida,
} from "./matchup-insights.mjs";

const chute = (over = {}) => ({
  posicao: "meia", dentroDaArea: false, perna: "PERNA_DIREITA",
  origem: "CRUZAMENTO", origemZona: { y: 10 }, contraAtaque: false, gol: false, ...over,
});
const partida = (shots_for, shots_against = shots_for) => ({ shots_for, shots_against });

test("extrai posição, área, origem e lado sem confundir gol", () => {
  const eventos = eventosDoChute(chute());
  assert.ok(eventos.includes("posicao:meia"));
  assert.ok(eventos.includes("area:fora"));
  assert.ok(eventos.includes("origem:cruzamento"));
  assert.ok(eventos.includes("cruzamento:esquerda"));
});

test("força exige recorrência e confirmação em mais de uma janela", () => {
  const forte = {
    j3: { taxa: 2, total: 6, jogosComEvento: 3, jogos: 3 },
    j5: { taxa: 1.8, total: 9, jogosComEvento: 5, jogos: 5 },
    j10: { taxa: 1.5, total: 15, jogosComEvento: 8, jogos: 10 },
  };
  assert.ok(avaliarForca(forte, 1, "finalizacoes"));
  assert.equal(avaliarForca({ ...forte, j10: { ...forte.j10, jogosComEvento: 1 } }, 1, "finalizacoes"), null);
});

test("convergência nasce somente quando ataque e defesa confirmam o mesmo caminho", () => {
  const forca = Array.from({ length: 10 }, () => partida([chute(), chute()]));
  const defesa = Array.from({ length: 10 }, () => partida([], [chute(), chute()]));
  const candidatos = gerarCandidatosConfronto({
    atacante: "a", defensor: "b", historicoAtacante: forca, historicoDefensor: defesa,
    scout: "finalizacoes", chaves: ["posicao:meia"],
    baselines: new Map([["finalizacoes|posicao:meia", 1]]),
  });
  assert.equal(candidatos[0].tipo, TIPOS_INSIGHT.CONVERGENCIA);
});

test("seleção preserva vagas para padrões próprios", () => {
  const candidatos = [];
  for (let i = 0; i < 8; i++) candidatos.push({ tipo: TIPOS_INSIGHT.CONVERGENCIA, score: 20 - i, atacante: "c" + i, defensor: "d", scout: "finalizacoes", chave: "k" + i });
  candidatos.push({ tipo: TIPOS_INSIGHT.FORCA_PROPRIA, score: 5, atacante: "forca", defensor: "d", scout: "gols", chave: "p" });
  candidatos.push({ tipo: TIPOS_INSIGHT.FRAGILIDADE_PROPRIA, score: 6, atacante: "ataque", defensor: "fragil", scout: "gols", chave: "q" });
  const selecionados = selecionarDestaques(candidatos);
  assert.equal(selecionados.filter((x) => x.tipo === TIPOS_INSIGHT.CONVERGENCIA).length, 3);
  assert.ok(selecionados.some((x) => x.tipo === TIPOS_INSIGHT.FORCA_PROPRIA));
  assert.ok(selecionados.some((x) => x.tipo === TIPOS_INSIGHT.FRAGILIDADE_PROPRIA));
});
test("fragilidade própria só ocupa o painel quando é excepcional", () => {
  const fraca = { tipo: TIPOS_INSIGHT.FRAGILIDADE_PROPRIA, score: 4.9, atacante: "a", defensor: "b", scout: "finalizacoes", chave: "x" };
  assert.equal(selecionarDestaques([fraca]).length, 0);
});

test("não repete o mesmo caminho nos dois lados do confronto", () => {
  const perfil = { j3: {}, j5: {}, j10: {} };
  const base = { tipo: TIPOS_INSIGHT.CONVERGENCIA, scout: "finalizacoes", chave: "area:dentro", score: 10, perfilAtaque: perfil, perfilDefesa: perfil };
  const itens = selecionarDestaques([
    { ...base, atacante: "bahia", defensor: "vasco" },
    { ...base, atacante: "vasco", defensor: "bahia", score: 9 },
  ]);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].atacante, "bahia");
});

test("participação em gols soma quem marcou e quem deu assistência no gol", () => {
  const partida = { shots_for: [
    { gol: true, posicao: "meia", assistentePosicao: "lateral-direito" },
    { gol: false, posicao: "meia", assistentePosicao: "lateral-direito" },
    { gol: true, posicao: "meia", assistentePosicao: "meia" },
  ] };
  const contagens = contagensPartida(partida, "shots_for", "participacoes");
  assert.equal(contagens.get("posicao:meia"), 3);
  assert.equal(contagens.get("posicao:lateral-direito"), 1);
});

test("não repete gols e participações idênticos para a mesma posição e confronto", () => {
  const base = { tipo: TIPOS_INSIGHT.CONVERGENCIA, atacante: "remo", defensor: "internacional", chave: "posicao:ponta-esquerda" };
  const itens = selecionarDestaques([
    { ...base, scout: "gols", score: 9 },
    { ...base, scout: "participacoes", score: 8 },
  ]);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].scout, "gols");
});
