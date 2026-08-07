/**
 * Alertas de falha do pipeline — e-mail (Resend) + WhatsApp (CallMeBot).
 * Os dois são "melhor esforço" entre si (um falhar não impede o outro), mas
 * NENHUM dos dois é o canal "necessário" — esse é o status.json (lib/status.mjs),
 * que sempre existe independente de e-mail/WhatsApp estarem configurados.
 *
 * Se as chaves não existirem no ambiente ainda, cada função loga e retorna
 * sem lançar erro — o pipeline nunca quebra por falta de alerta configurado.
 */

export async function sendEmailAlert({ subject, body }, { fetchImpl = fetch } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !to) {
    console.log("[alertas] e-mail não configurado (RESEND_API_KEY/ALERT_EMAIL_TO ausentes) — pulando");
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // "onboarding@resend.dev" é o domínio de teste do próprio Resend —
        // funciona sem verificar domínio próprio, mandando pra qualquer
        // destinatário. Trocar por ALERT_EMAIL_FROM quando houver domínio
        // verificado (ex: alertas@linha-analise.com.br).
        from: process.env.ALERT_EMAIL_FROM || "onboarding@resend.dev",
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      console.error(`[alertas] falha ao enviar e-mail: HTTP ${res.status}`);
      return { sent: false, reason: `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[alertas] erro ao enviar e-mail: ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

export async function sendWhatsAppAlert({ message }, { fetchImpl = fetch } = {}) {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  const phone = process.env.CALLMEBOT_PHONE;
  if (!apiKey || !phone) {
    console.log("[alertas] WhatsApp não configurado (CALLMEBOT_API_KEY/CALLMEBOT_PHONE ausentes) — pulando");
    return { sent: false, reason: "not_configured" };
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      console.error(`[alertas] falha ao enviar WhatsApp: HTTP ${res.status}`);
      return { sent: false, reason: `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[alertas] erro ao enviar WhatsApp: ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

/**
 * dispatchAlert — chama e-mail e WhatsApp em paralelo, cada um isolado (um
 * falhar não afeta o outro). Usado quando o harvester falha (login,
 * listagem de partidas, etc. — ver harvest_footstats_goals.mjs).
 */
export async function dispatchAlert({ title, details }, opts = {}) {
  const subject = `[Mapa de Finalizações] ${title}`;
  const [email, whatsapp] = await Promise.all([
    sendEmailAlert({ subject, body: details }, opts),
    sendWhatsAppAlert({ message: `${subject}\n${details}` }, opts),
  ]);
  return { email, whatsapp };
}
