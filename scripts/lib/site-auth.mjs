// Pré-carregado via NODE_OPTIONS="--import <este arquivo>" nos workflows.
// Acrescenta o cabeçalho X-Robot-Key em toda requisição feita ao site ao vivo
// (SITE_URL), que agora exige login. Não toca em requisições a outros sites.
const chave = process.env.ROBOT_KEY;
const site = (process.env.SITE_URL || "https://mapa-de-gols-oficial.onrender.com").replace(/\/+$/, "");

if (chave) {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(site)) {
      const headers = new Headers(init.headers || (typeof input === "object" && input.headers) || undefined);
      headers.set("X-Robot-Key", chave);
      init = { ...init, headers };
    }
    return fetchOriginal(input, init);
  };
}
