/**
 * Rodada aberta no Cartola, só com os jogos que VALEM (`valida: true`).
 * Jogo adiado/antecipado sai da rodada, então ela pode ter menos de 10 jogos.
 * API pública, sem login.
 */
import { fetchJsonWithRetry } from "./http.mjs";

const CARTOLA_API = "https://api.cartola.globo.com";
const HEADERS = { "User-Agent": "Mozilla/5.0" };

export const SIGLA_PARA_TIME = {
  BAH: "bahia", BOT: "botafogo", CAM: "atletico-mg", CAP: "athletico-pr", CFC: "coritiba",
  CHA: "chapecoense", COR: "corinthians", CRU: "cruzeiro", FLA: "flamengo", FLU: "fluminense",
  GRE: "gremio", INT: "internacional", MIR: "mirassol", PAL: "palmeiras", RBB: "red-bull-bragantino",
  REM: "remo", SAN: "santos", SAO: "sao-paulo", VAS: "vasco", VIT: "vitoria",
};

/** Resposta de /partidas/{rodada} -> [{mandante, visitante, data}] só dos jogos válidos. */
export function jogosValidos(resposta) {
  const slug = (id) => {
    const sigla = resposta?.clubes?.[id]?.abreviacao;
    const time = SIGLA_PARA_TIME[sigla];
    if (!time) throw new Error(`clube do Cartola não reconhecido: ${sigla ?? id}`);
    return time;
  };
  return (resposta?.partidas || [])
    .filter((p) => p.valida)
    .map((p) => ({
      mandante: slug(p.clube_casa_id),
      visitante: slug(p.clube_visitante_id),
      data: String(p.partida_data || "").replace(" ", "T"),
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Formato do data/proximo-confronto.json: {time: {mando, adversario, data, rodada}}. */
export function confrontosPorTime(rodada, jogos) {
  const porTime = {};
  for (const { mandante, visitante, data } of jogos) {
    porTime[mandante] = { mando: "casa", adversario: visitante, data, rodada };
    porTime[visitante] = { mando: "fora", adversario: mandante, data, rodada };
  }
  return porTime;
}

export async function rodadaAbertaDoCartola() {
  const status = await fetchJsonWithRetry(`${CARTOLA_API}/mercado/status`, { headers: HEADERS });
  const rodada = Number(status?.rodada_atual);
  if (!(rodada > 0)) throw new Error("Cartola não informou a rodada atual");
  const resposta = await fetchJsonWithRetry(`${CARTOLA_API}/partidas/${rodada}`, { headers: HEADERS });
  return { rodada, jogos: jogosValidos(resposta) };
}
