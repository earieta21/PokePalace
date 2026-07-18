/* Pagos en línea via Clip Checkout (https://developer.clip.mx).
   Sin dependencias npm — solo fetch nativo de Node 18+.
   Si CLIP_API_KEY/CLIP_API_SECRET no están configuradas, cada función es un
   no-op silencioso: el pedido se guarda igual, solo sin link de pago. */

const CLIP_API_BASE = "https://api.payclip.com";
const SITE_URL = process.env.SITE_URL || "https://pokepalace.netlify.app";

function authHeader() {
  const key = process.env.CLIP_API_KEY;
  const secret = process.env.CLIP_API_SECRET;
  if (!key || !secret) return null;
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

/* Crea un link de pago para un pedido. Devuelve { paymentRequestId, url } o
   null si Clip no está configurado o la petición falla. */
export async function createPaymentLink({ orderId, amount, description }) {
  const auth = authHeader();
  if (!auth) return null;

  try {
    const res = await fetch(`${CLIP_API_BASE}/v2/checkout`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        currency: "MXN",
        purchase_description: description.slice(0, 250),
        redirection_url: {
          success: `${SITE_URL}/seguimiento/${orderId}`,
          error: `${SITE_URL}/seguimiento/${orderId}`,
          default: `${SITE_URL}/seguimiento/${orderId}`,
        },
        metadata: { external_reference: String(orderId) },
        webhook_url: `${process.env.API_URL || ""}/api/orders/clip-webhook`,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.payment_request_url) {
      console.error("Clip createPaymentLink failed:", res.status, data);
      return null;
    }

    return { paymentRequestId: data.payment_request_id, url: data.payment_request_url };
  } catch (err) {
    console.error("Clip createPaymentLink error:", err.message);
    return null;
  }
}

/* Consulta el estado real de un link de pago directo con Clip (no confiamos
   ciegamente en el body del webhook: Clip no documenta firma/verificación,
   así que este server-to-server GET es la fuente de verdad). */
export async function getPaymentLinkStatus(paymentRequestId) {
  const auth = authHeader();
  if (!auth) return null;

  try {
    const res = await fetch(`${CLIP_API_BASE}/v2/checkout/${paymentRequestId}`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("Clip getPaymentLinkStatus failed:", res.status, data);
      return null;
    }
    return data;
  } catch (err) {
    console.error("Clip getPaymentLinkStatus error:", err.message);
    return null;
  }
}
