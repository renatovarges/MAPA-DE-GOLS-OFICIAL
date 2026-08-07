import test from "node:test";
import assert from "node:assert/strict";
import { ultimasFinalizacoes, contarPorCategoria, zTestDuasProporcoes, detectarPadroes } from "./shot-patterns.mjs";

function shot(origem, extra = {}) {
  return { origem, posicao: "atacante-area", dentroDaArea: true, contraAtaque: false, gol: false, ...extra };
}

test("ultimasFinalizacoes pega só as N mais recentes, ordenado por data real", () => {
  const matches = {
    1: { date: "2026-01-10", shots_for: [shot("PASSE")] },
    2: { date: "2026-03-01", shots_for: [shot("ESCANTEIO")] },
    3: { date: "2026-02-15", shots_for: [shot("CRUZAMENTO")] },
  };
  const { shots, jogosUsados } = ultimasFinalizacoes(matches, { lado: "shots_for", ultimasN: 2 });
  assert.equal(jogosUsados, 2);
  assert.deepEqual(shots.map((s) => s.origem), ["ESCANTEIO", "CRUZAMENTO"]);
});

test("contarPorCategoria ignora shots sem valor na dimensão", () => {
  const shots = [shot("PASSE"), shot(null), shot("PASSE")];
  const c = contarPorCategoria(shots, "origem");
  assert.equal(c.get("PASSE"), 2);
  assert.equal(c.has(null), false);
});

test("zTestDuasProporcoes retorna null com amostra pequena demais", () => {
  assert.equal(zTestDuasProporcoes(3, 4, 10, 100), null);
  assert.equal(zTestDuasProporcoes(3, 40, 2, 3), null);
});

test("zTestDuasProporcoes detecta diferença clara entre duas taxas", () => {
  // 30/40 = 75% vs 40/200 = 20% — diferença grande, amostras razoáveis
  const r = zTestDuasProporcoes(30, 40, 40, 200);
  assert.ok(Math.abs(r.z) > 5, `z deveria ser bem alto, veio ${r.z}`);
});

function construirLiga({ timeAlvo, taxaAlvo, nAlvo, taxaLiga, nLigaPorTime, outrosTimes }) {
  const porTimeMap = new Map();
  const gols = (n, taxa) => {
    const shots = [];
    for (let i = 0; i < n; i++) {
      shots.push(i < Math.round(n * taxa) ? shot("ESCANTEIO") : shot("PASSE"));
    }
    return shots;
  };
  porTimeMap.set(timeAlvo, { shots: gols(nAlvo, taxaAlvo), jogosUsados: 6 });
  for (const t of outrosTimes) {
    porTimeMap.set(t, { shots: gols(nLigaPorTime, taxaLiga), jogosUsados: 6 });
  }
  return porTimeMap;
}

test("detectarPadroes acha um padrão real (time muito acima da liga, amostra suficiente)", () => {
  const porTimeMap = construirLiga({
    timeAlvo: "vasco", taxaAlvo: 0.5, nAlvo: 60, // 30 escanteios em 60 chutes
    taxaLiga: 0.1, nLigaPorTime: 60, outrosTimes: ["flamengo", "palmeiras", "santos", "gremio"],
  });
  const achados = detectarPadroes({ timeSlug: "vasco", porTimeMap, dimensao: "origem" });
  const escanteio = achados.find((a) => a.categoria === "ESCANTEIO");
  assert.ok(escanteio, "deveria detectar o padrão de escanteio");
  assert.equal(escanteio.direcao, "acima");
  assert.ok(escanteio.z > 2.5);
});

test("detectarPadroes NÃO acha nada quando o time é igual à liga (mesma taxa)", () => {
  const porTimeMap = construirLiga({
    timeAlvo: "vasco", taxaAlvo: 0.15, nAlvo: 60,
    taxaLiga: 0.15, nLigaPorTime: 60, outrosTimes: ["flamengo", "palmeiras", "santos", "gremio"],
  });
  const achados = detectarPadroes({ timeSlug: "vasco", porTimeMap, dimensao: "origem" });
  assert.deepEqual(achados, []);
});

test("detectarPadroes ignora diferença grande se a amostra do time for pequena demais (regra do minAmostraTime)", () => {
  // 4 escanteios em 6 chutes = 67% vs liga 10% -- proporcionalmente enorme,
  // mas amostra pequena; minAmostraTime (default 8) deve bloquear.
  const porTimeMap = construirLiga({
    timeAlvo: "vasco", taxaAlvo: 0.67, nAlvo: 6,
    taxaLiga: 0.1, nLigaPorTime: 60, outrosTimes: ["flamengo", "palmeiras", "santos", "gremio"],
  });
  const achados = detectarPadroes({ timeSlug: "vasco", porTimeMap, dimensao: "origem" });
  assert.deepEqual(achados, [], "amostra de 4 ocorrências não deveria bastar pra afirmar um padrão");
});

test("detectarPadroes com zCritico mais permissivo pega diferenças moderadas", () => {
  const porTimeMap = construirLiga({
    timeAlvo: "vasco", taxaAlvo: 0.2, nAlvo: 60,
    taxaLiga: 0.1, nLigaPorTime: 60, outrosTimes: ["flamengo", "palmeiras", "santos", "gremio"],
  });
  const estrito = detectarPadroes({ timeSlug: "vasco", porTimeMap, dimensao: "origem", zCritico: 2.5 });
  const permissivo = detectarPadroes({ timeSlug: "vasco", porTimeMap, dimensao: "origem", zCritico: 1.2 });
  assert.ok(permissivo.length >= estrito.length);
});
