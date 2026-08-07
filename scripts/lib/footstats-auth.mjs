import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

/**
 * Login da FootStats via navegador headless — copiado do projeto "Linha —
 * Análise do Brasileirão" (mesma conta FootStats). O site usa SSO via
 * Keycloak; o grant "password" direto está desabilitado pro client público,
 * então o login via browser real (deixando o Keycloak conduzir o fluxo
 * OAuth) é a via robusta — só lê o Bearer no localStorage no final.
 *
 * Precisa de FOOTSTATS_EMAIL / FOOTSTATS_PASSWORD num .env.local nesta
 * pasta (mesmas credenciais usadas no outro projeto).
 *
 * TIMEOUT GENEROSO DE PROPÓSITO (2026-08): medido ao vivo, a página de
 * login às vezes leva até ~55s pra ficar de fato pronta (o site da
 * FootStats é lento, não é uma falha de rede daqui) — o padrão do
 * Playwright (30s) já falhou por causa disso. Como isso agora roda sozinho
 * (GitHub Actions, sem ninguém pra simplesmente tentar de novo), a margem
 * tem que ser folgada.
 */
const TIMEOUT_MS = 90000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const TOKEN_CACHE_PATH = path.join(ROOT, ".footstats-token.json");

async function loginViaBrowser(email, password) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("https://old.footstats.com.br/", { waitUntil: "networkidle", timeout: TIMEOUT_MS });

    await page.waitForSelector('input[type="password"]', { timeout: TIMEOUT_MS });
    await page.fill('input[type="text"], input[name="username"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('input[type="submit"], button[type="submit"]');

    await page.waitForURL(/old\.footstats\.com\.br/, { timeout: TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS });

    const token = await page.evaluate(() => localStorage.getItem("Bearer"));
    if (!token) {
      throw new Error("login concluído mas nenhum token 'Bearer' encontrado no localStorage");
    }
    return token;
  } finally {
    await browser.close();
  }
}

function readCachedToken() {
  if (!fs.existsSync(TOKEN_CACHE_PATH)) return null;
  try {
    const { token, expiresAt } = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf8"));
    if (token && expiresAt && Date.now() < expiresAt) return token;
  } catch {
    // cache corrompido/formato antigo — ignora e faz login de novo
  }
  return null;
}

function writeCachedToken(token, ttlMs = 6 * 60 * 60 * 1000) {
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ token, expiresAt: Date.now() + ttlMs }));
}

export async function getFootstatsToken({ email, password, forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readCachedToken();
    if (cached) return cached;
  }
  const em = email ?? process.env.FOOTSTATS_EMAIL;
  const pw = password ?? process.env.FOOTSTATS_PASSWORD;
  if (!em || !pw) {
    throw new Error("FOOTSTATS_EMAIL/FOOTSTATS_PASSWORD não configurados (.env.local)");
  }
  const token = await loginViaBrowser(em, pw);
  writeCachedToken(token);
  return token;
}

export { TOKEN_CACHE_PATH };
