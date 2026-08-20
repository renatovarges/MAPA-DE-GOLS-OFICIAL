/**
 * Parsing puro do HTML de https://provaveisdocartola.com.br/ — sem fetch,
 * sem fs, só string -> dado. O que faz rede/IO fica em harvest_pdc.mjs, que
 * é fino de propósito, pra este arquivo dar pra testar com HTML de mentira.
 *
 * VOLTOU AO PROJETO em 25/ago/2026, pedido do Renato: a escalação DERIVADA
 * aqui (build-lineups.mjs) tinha ficado frágil demais — fotos e prováveis
 * errados o bastante pra virar problema visível. Decisão dele: o
 * DELINEAMENTO da escalação (quem joga, em que posto, inclusive as dúvidas)
 * volta a vir do provaveisdocartola.com.br, com crédito visível na tela
 * desta vez (antes o nome do site NUNCA podia aparecer). O que NÃO volta é
 * a FOTO deles — usamos nosso próprio banco (ver player-photo.tsx) — nem a
 * raspagem ao vivo por visita: isto aqui só roda pelo robô periódico (ver
 * .github/workflows/harvest-pdc.yml), a mesma decisão que motivou a
 * substituição em primeiro lugar (cada visita à página de um jogo era uma
 * requisição rastreável ao servidor deles).
 *
 * data-id no HTML deles É o atletaId oficial do Cartola (confirmado batendo
 * contra src/data/cartola/mercado.json pra vários atletas) — cruza direto,
 * sem casar por nome.
 */

/** data-team deles ("flamengo_v2", "atleticomg_v2"...) -> nosso slug (teams.json). */
export const TEAM_SLUG_MAP = {
  flamengo: "flamengo",
  coritiba: "coritiba",
  fluminense: "fluminense",
  gremio: "gremio",
  corinthians: "corinthians",
  bahia: "bahia",
  chapecoense: "chapecoense",
  santos: "santos",
  "sao-paulo": "sao-paulo",
  saopaulo: "sao-paulo",
  mirassol: "mirassol",
  vasco: "vasco",
  botafogo: "botafogo",
  cruzeiro: "cruzeiro",
  "atletico-mg": "atletico-mg",
  atleticomg: "atletico-mg",
  "athletico-pr": "athletico-pr",
  athleticopr: "athletico-pr",
  palmeiras: "palmeiras",
  internacional: "internacional",
  "red-bull-bragantino": "red-bull-bragantino",
  bragantino: "red-bull-bragantino",
  vitoria: "vitoria",
  remo: "remo",
};

/** "flamengo_v2" -> "flamengo" -> nosso slug, via TEAM_SLUG_MAP. Sem mapa, usa o próprio nome normalizado. */
export function normalizeSlug(raw) {
  const base = raw.replace(/_v\d+$/, "").toLowerCase();
  return TEAM_SLUG_MAP[base] ?? base;
}

/**
 * Extrai os <figure class="player..."> de dentro do HTML de UM pitch.
 *
 * NÃO exige `data-slug`/`data-sit` — achado real (25/ago/2026): o HTML que o
 * SERVIDOR manda (o que um `fetch()` simples pega) é um esqueleto SSR que,
 * pra vários clubes, vem com MENOS jogadores do que o time real (visto:
 * Chapecoense com 9 em vez de 11). O JavaScript deles hidrata a página
 * depois e COMPLETA a escalação — mas o `<figure>` hidratado tem atributos
 * diferentes (`data-jogador-linked` em vez de `data-slug`/`data-sit`, classe
 * "doubt" em inglês em vez de "duvida"). Por isso a dúvida vem da CLASSE
 * ("duvida" OU "doubt", cobrindo os dois formatos), não de um atributo —
 * funciona pro HTML de antes E de depois da hidratação. Quem chama isto
 * (harvest_pdc.mjs) precisa esperar a hidratação terminar antes de capturar
 * o HTML, senão volta a pegar o esqueleto incompleto.
 */
export function parsePlayers(pitchHtml) {
  const players = [];
  const re =
    /<figure[^>]*class="([^"]*)"[^>]*data-id="(\d+)"[^>]*data-slot="([^"]+)"[^>]*style="([^"]+)"[\s\S]*?<figcaption[^>]*>([^<]*)<\/figcaption>/g;
  let m;
  while ((m = re.exec(pitchHtml)) !== null) {
    const [, classAttr, id, slot, style, nome] = m;
    const xMatch = style.match(/left:\s*([\d.]+)%/);
    const yMatch = style.match(/top:\s*([\d.]+)%/);
    players.push({
      id: Number(id),
      slot,
      nome: nome.trim(),
      sit: /duvida|doubt/.test(classAttr) ? "duvida" : "provavel",
      isCoach: /\bcoach\b/.test(classAttr),
      x: xMatch ? Number(xMatch[1]) : null,
      y: yMatch ? Number(yMatch[1]) : null,
    });
  }
  return players;
}

/** Extrai lesionados/suspensos/dúvidas/outros de dentro do HTML de UM status-card. */
export function parseDesfalques(statusHtml) {
  const grupos = {};
  const reGroup = /data-role="([a-zçãõáéíóú]+)"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = reGroup.exec(statusHtml)) !== null) {
    const role = m[1].normalize("NFD").replace(/[̀-ͯ]/g, "");
    const inner = m[2];
    const tags = [...inner.matchAll(/<span[^>]*class="tag[^"]*"[^>]*>([^<]+)<\/span>/g)].map((x) => x[1].trim());
    grupos[role] = tags;
  }
  return {
    lesionados: grupos.lesionados ?? [],
    suspensos: grupos.suspensos ?? [],
    duvidas: grupos.duvidas ?? [],
    outros: grupos.outros ?? [],
  };
}

/**
 * "4-3-3" etc a partir da lista de slots titulares (sem técnico) — conta
 * quem é defesa (ZAG/LAT), meio (VOL/MEI) e ataque (ATA). Não usa nenhuma
 * das 5 formações fixas de build-lineups.mjs: a escalação agora é a que a
 * fonte desenhou, pode ter um formato que não está na nossa lista.
 */
export function formacaoDeSlots(slots) {
  const def = slots.filter((s) => s.startsWith("ZAG") || s.startsWith("LAT")).length;
  const mei = slots.filter((s) => s.startsWith("VOL") || s.startsWith("MEI")).length;
  const ata = slots.filter((s) => s.startsWith("ATA")).length;
  return `${def}-${mei}-${ata}`;
}

/** Orquestra os dois parsers acima pro HTML da página inteira. */
export function parsePdcHtml(html) {
  const teams = {};

  const pitchRe = /<div class="pitch"\s+data-team="([^"]+)"/g;
  let m;
  while ((m = pitchRe.exec(html)) !== null) {
    const rawTeam = m[1];
    const start = m.index;
    const endMarker = `<div class="status-card" data-team="${rawTeam}"`;
    const endIdx = html.indexOf(endMarker, start);
    const pitchHtml = endIdx > 0 ? html.slice(start, endIdx) : html.slice(start, start + 20000);
    const slug = normalizeSlug(rawTeam);
    teams[slug] = {
      players: parsePlayers(pitchHtml),
      desfalques: { lesionados: [], suspensos: [], duvidas: [], outros: [] },
    };
  }

  const statusRe = /<div class="status-card"\s+data-team="([^"]+)"/g;
  while ((m = statusRe.exec(html)) !== null) {
    const rawTeam = m[1];
    const start = m.index;
    const candidatos = [
      html.indexOf('<div class="lineup-card"', start + 1),
      html.indexOf('<div class="pitch"', start + 1),
      html.indexOf('<div class="status-card"', start + 1),
    ].filter((i) => i > 0);
    const stop = candidatos.length ? Math.min(...candidatos) : start + 20000;
    const slug = normalizeSlug(rawTeam);
    if (teams[slug]) teams[slug].desfalques = parseDesfalques(html.slice(start, stop));
  }

  const rodMatch = html.match(/rodada\s+(\d+)/i);
  return { rodadaInfo: rodMatch ? Number(rodMatch[1]) : null, teams };
}
