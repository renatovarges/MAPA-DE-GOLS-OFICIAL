/**
 * fetchJsonWithRetry — retry/backoff genérico pra chamadas HTTP.
 * 3 tentativas, 429 com backoff maior, erro genérico com backoff menor,
 * relança depois da última tentativa. Copiado do harvester da FootStats do
 * projeto "Linha — Análise do Brasileirão" (mesma origem de dados).
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJsonWithRetry(
  url,
  { headers, retries = 3, backoffMs = 1000, fetchImpl = fetch, method = "GET", body } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers, method, body });
      if (res.status === 429) {
        await sleep(attempt * backoffMs * 2);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt === retries) throw e;
      await sleep(attempt * backoffMs);
    }
  }
  throw lastError;
}
