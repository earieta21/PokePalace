/* Pagos en línea via Openpay (procesador de BBVA) — https://documents.openpay.mx
   Sin dependencias npm — solo fetch nativo de Node 18+.
   Si OPENPAY_MERCHANT_ID/OPENPAY_PRIVATE_KEY no están configuradas, cada
   función es un no-op silencioso: el pedido se guarda igual, solo sin link
   de pago. */

const OPENPAY_API_BASE = process.env.OPENPAY_PRODUCTION === "true"
  ? "https://api.openpay.mx"
  : "https://sandbox-api.openpay.mx";
const SITE_URL = process.env.SITE_URL || "https://pokepalace.netlify.app";

function authHeader() {
  const key = process.env.OPENPAY_PRIVATE_KEY;
  if (!key) return null;
  // Openpay usa Basic Auth con la llave privada como usuario y contraseña vacía.
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

function merchantId() {
  return process.env.OPENPAY_MERCHANT_ID || null;
}

/* Crea un cargo con confirm:false + redirect_url, que Openpay expone como un
   link de pago hospedado. Devuelve { paymentRequestId, url } o null si
   Openpay no está configurado o la petición falla. */
export async function createPaymentLink({ orderId, amount, description, customerName, customerEmail }) {
  const auth = authHeader();
  const merchant = merchantId();
  if (!auth || !merchant) return null;

  const [firstName, ...rest] = (customerName || "Cliente").trim().split(/\s+/);

  try {
    const res = await fetch(`${OPENPAY_API_BASE}/v1/${merchant}/charges`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "card",
        amount,
        currency: "MXN",
        description: description.slice(0, 250),
        order_id: String(orderId),
        send_email: false,
        confirm: false,
        redirect_url: `${SITE_URL}/seguimiento/${orderId}`,
        customer: {
          name: firstName || "Cliente",
          last_name: rest.join(" ") || "Poke Palace",
          email: customerEmail || "clientes@pokepalace.org",
        },
      }),
    });

    const data = await res.json().catch(() => null);
    const url = data?.payment_method?.url;
    if (!res.ok || !url) {
      console.error("Openpay createPaymentLink failed:", res.status, data);
      return null;
    }

    return { paymentRequestId: data.id, url };
  } catch (err) {
    console.error("Openpay createPaymentLink error:", err.message);
    return null;
  }
}

/* Consulta el estado real de un cargo directo con Openpay — el webhook trae
   usuario/contraseña verificables (ver isValidWebhookAuth) pero igual no
   basta: este GET server-to-server es la fuente de verdad antes de marcar
   un pedido como pagado. */
export async function getPaymentLinkStatus(paymentRequestId) {
  const auth = authHeader();
  const merchant = merchantId();
  if (!auth || !merchant) return null;

  try {
    const res = await fetch(`${OPENPAY_API_BASE}/v1/${merchant}/charges/${paymentRequestId}`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("Openpay getPaymentLinkStatus failed:", res.status, data);
      return null;
    }
    return data;
  } catch (err) {
    console.error("Openpay getPaymentLinkStatus error:", err.message);
    return null;
  }
}

/* Openpay manda usuario/contraseña Basic Auth en cada webhook (se configuran
   al dar de alta la URL en el panel de Openpay). Confirma que la llamada
   viene realmente de Openpay antes de gastar una consulta de estado. */
export function isValidWebhookAuth(authorizationHeader) {
  const user = process.env.OPENPAY_WEBHOOK_USER;
  const pass = process.env.OPENPAY_WEBHOOK_PASSWORD;
  if (!user || !pass || !authorizationHeader) return false;
  const expected = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  return authorizationHeader === expected;
}
