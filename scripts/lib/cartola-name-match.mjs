/**
 * Casamento de nome -> atleta_id do Cartola, extraído do harvester de
 * desarmes (onde foi validado contra dado real: 95.7% de acerto numa
 * partida cheia) pra ser reaproveitado por qualquer harvester que precise
 * ligar um nome de jogador (FootStats/escalação, SofaScore, PDC) ao
 * atleta_id oficial do Cartola.
 */
export function semAcento(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** carrega o elenco atual do Cartola uma vez (não por partida) pra casar nome->atleta_id. */
export async function carregarCartolaAtletas() {
  const res = await fetch("https://api.cartola.globo.com/atletas/mercado");
  const data = await res.json();
  const atletas = data.atletas || [];
  const porNome = new Map();
  const porNomeMultiplo = new Map();
  const porUltimoNome = new Map();
  for (const a of atletas) {
    for (const campo of [a.apelido, a.nome]) {
      if (!campo) continue;
      const norm = semAcento(campo);
      if (!porNome.has(norm)) porNome.set(norm, a);
      if (!porNomeMultiplo.has(norm)) porNomeMultiplo.set(norm, []);
      porNomeMultiplo.get(norm).push(a);
      const palavras = norm.split(/\s+/).filter(Boolean);
      const ultima = palavras[palavras.length - 1];
      if (!ultima) continue;
      if (!porUltimoNome.has(ultima)) porUltimoNome.set(ultima, []);
      porUltimoNome.get(ultima).push(a);
    }
  }
  return { porNome, porNomeMultiplo, porUltimoNome };
}

/**
 * nomeJogador (fonte externa qualquer) -> atleta_id (Cartola). Exato pega a
 * maioria, substring/último-nome pegam o resto (apelido curto tipo "Alonso"
 * pra "Júnior Alonso") — 95.7% de acerto testado numa partida real cheia.
 *
 * ACHADO REAL (2026-08-19): nome exato pode ser AMBÍGUO entre times (ex.:
 * "Gabriel" existe em vários clubes) — o `porNome` guarda só o primeiro
 * cadastrado, então sem checar clube o casamento podia devolver o Gabriel
 * ERRADO. `porNomeMultiplo` guarda TODOS os homônimos; quando o clube
 * esperado é informado, prioriza quem é desse clube antes de aceitar o
 * primeiro da lista.
 */
export function encontrarAtletaPorNome(cartola, nomeJogador, clubeIdEsperado) {
  const norm = semAcento(nomeJogador);
  if (!norm) return null;
  const homonimos = cartola.porNomeMultiplo?.get(norm);
  if (homonimos?.length) {
    if (clubeIdEsperado) {
      const doClube = homonimos.find((a) => a.clube_id === clubeIdEsperado);
      if (doClube) return doClube;
    } else if (homonimos.length === 1) {
      return homonimos[0];
    }
  }
  const exato = cartola.porNome.get(norm);
  if (exato && !clubeIdEsperado) return exato;
  for (const [chave, atleta] of cartola.porNome) {
    if (chave.length < 4) continue;
    if (norm.includes(chave) || chave.includes(norm)) {
      if (!clubeIdEsperado || atleta.clube_id === clubeIdEsperado) return atleta;
    }
  }
  const palavras = norm.split(/\s+/).filter(Boolean);
  const ultima = palavras[palavras.length - 1];
  const candidatos = cartola.porUltimoNome.get(ultima) || [];
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length > 1 && clubeIdEsperado) {
    const doTime = candidatos.filter((a) => a.clube_id === clubeIdEsperado);
    if (doTime.length === 1) return doTime[0];
  }
  return null;
}
