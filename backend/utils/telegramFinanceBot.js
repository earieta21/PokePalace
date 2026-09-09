/* Bot de Telegram para Finanzas — sin SDK, solo fetch nativo de Node 18+,
   mismo estilo que notify.js y whatsappAgent.js. Un bot dedicado, separado
   del que ya se usa para publicar en Instagram (ver TELEGRAM_FINANCE_BOT_TOKEN
   en el .env de Render). */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export function financeBotConfigured() {
  return Boolean(process.env.TELEGRAM_FINANCE_BOT_TOKEN && process.env.ANTHROPIC_API_KEY);
}

function apiUrl(method) {
  return `${TELEGRAM_API_BASE}/bot${process.env.TELEGRAM_FINANCE_BOT_TOKEN}/${method}`;
}

export async function sendTelegramMessage(chatId, text) {
  try {
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4096) }),
    });
    if (!res.ok) console.error("sendTelegramMessage failed:", res.status, await res.text());
  } catch (err) {
    console.error("sendTelegramMessage error:", err.message);
  }
}

/* Descarga el archivo más grande de una foto (o un documento de imagen) y
   regresa sus bytes -- Telegram solo da un file_id, hay que resolverlo a un
   file_path con getFile antes de poder bajarlo. */
export async function downloadTelegramFile(fileId) {
  const infoRes = await fetch(apiUrl("getFile") + `?file_id=${encodeURIComponent(fileId)}`);
  if (!infoRes.ok) throw new Error(`getFile falló: ${infoRes.status}`);
  const info = await infoRes.json();
  const filePath = info?.result?.file_path;
  if (!filePath) throw new Error("Telegram no regresó file_path");

  const fileRes = await fetch(
    `${TELEGRAM_API_BASE}/file/bot${process.env.TELEGRAM_FINANCE_BOT_TOKEN}/${filePath}`
  );
  if (!fileRes.ok) throw new Error(`Descarga de archivo falló: ${fileRes.status}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

/* Registra la URL del webhook en Telegram — se corre una sola vez al
   configurar el bot (o cuando cambie la URL de Render). `secretToken` se
   manda de vuelta en cada webhook como header X-Telegram-Bot-Api-Secret-Token,
   así el controller puede verificar que la llamada de verdad viene de
   Telegram y no de cualquiera que adivine la URL. */
export async function setTelegramWebhook(url, secretToken) {
  const res = await fetch(apiUrl("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secretToken, drop_pending_updates: true }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(`setWebhook falló: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
