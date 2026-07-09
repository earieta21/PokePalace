/* Notificaciones por email (Brevo) y SMS (Twilio) usando sus APIs HTTP.
   Sin dependencias npm — solo fetch nativo de Node 18+.
   Si las variables de entorno no están configuradas, cada función es un no-op
   silencioso: la app funciona igual sin cuentas de Brevo/Twilio. */

const SITE_URL = process.env.SITE_URL || "https://pokepalace.netlify.app";

/* ── Email via Brevo (https://www.brevo.com — plan gratis: 300 emails/día) ──
   Env vars: BREVO_API_KEY, EMAIL_FROM (remitente verificado en Brevo) */
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const from   = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) return;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Poke Palace", email: from },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) console.error("sendEmail failed:", res.status, await res.text());
  } catch (err) {
    console.error("sendEmail error:", err.message);
  }
}

/* Normaliza teléfono mexicano a formato E.164 (+52XXXXXXXXXX) */
function normalizeMxPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+52${digits}`;
  if (digits.startsWith("52") && digits.length === 12) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

/* ── WhatsApp via Meta Cloud API (gratis: 1,000 conversaciones/mes) ──
   Env vars: WHATSAPP_TOKEN (token permanente), WHATSAPP_PHONE_ID (ID del número)
   Los mensajes iniciados por el negocio requieren una plantilla aprobada por Meta.
   `params` llena las variables {{1}}, {{2}}… del cuerpo de la plantilla. */
export async function sendWhatsApp(phone, templateName, params = []) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId || !phone) return false;

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeMxPhone(phone),
        type: "template",
        template: {
          name: templateName,
          language: { code: "es_MX" },
          components: params.length
            ? [{
                type: "body",
                parameters: params.map((text) => ({ type: "text", text: String(text) })),
              }]
            : [],
        },
      }),
    });
    if (!res.ok) {
      console.error("sendWhatsApp failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendWhatsApp error:", err.message);
    return false;
  }
}

/* ── SMS via Twilio (https://www.twilio.com — de pago, ~$1 MXN por SMS a MX) ──
   Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (número Twilio) */
export async function sendSMS(phone, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM;
  if (!sid || !token || !from || !phone) return;

  const to = normalizeMxPhone(phone);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
    if (!res.ok) console.error("sendSMS failed:", res.status, await res.text());
  } catch (err) {
    console.error("sendSMS error:", err.message);
  }
}

/* ── Plantilla del email de confirmación de pedido ── */
export function orderConfirmationEmail(order) {
  const num = String(order._id).slice(-5).toUpperCase();
  const trackUrl = `${SITE_URL}/seguimiento/${order._id}`;
  const fulfillment = order.fulfillment === "dine_in" ? "Comer en el restaurante" : "Recoger en tienda";

  return {
    subject: `Poke Palace — Pedido #${num} confirmado 🥢`,
    html: `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;background:#F9EDE7;border-radius:16px;overflow:hidden">
  <div style="background:#4A7A5A;padding:28px 24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">Poke Palace</h1>
    <p style="color:#d9ead9;margin:6px 0 0;font-size:13px">¡Recibimos tu pedido!</p>
  </div>
  <div style="padding:24px;background:#fff">
    <p style="font-size:15px;color:#222;margin:0 0 4px">Hola <strong>${order.customer || "cliente"}</strong>,</p>
    <p style="font-size:14px;color:#555;margin:0 0 18px">Tu pedido <strong>#${num}</strong> está confirmado y la cocina ya lo tiene.</p>
    <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#888">Entrega</td><td style="text-align:right">${fulfillment}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Tamaño</td><td style="text-align:right">${order.bowlSize === "large" ? "Bowl grande" : "Bowl normal"}</td></tr>
      ${order.total != null ? `<tr><td style="padding:6px 0;color:#888">Total</td><td style="text-align:right;font-weight:700">$${order.total} MXN</td></tr>` : ""}
    </table>
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${trackUrl}" style="background:#4A7A5A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;display:inline-block">
        Seguir mi pedido
      </a>
    </div>
    <p style="font-size:12px;color:#999;text-align:center;margin:16px 0 0">
      Blvd. Gustavo Díaz Ordaz, Plaza La Estación, Local 24, Tijuana · Lun a Dom 11:00–21:00
    </p>
  </div>
</div>`,
  };
}
