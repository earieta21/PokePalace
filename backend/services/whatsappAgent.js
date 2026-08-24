/* Agente conversacional de WhatsApp — toma pedidos del menú fijo de apertura.
   Sin SDK: fetch nativo a la Messages API de Anthropic, mismo estilo que
   notify.js. El precio y la disponibilidad de cada producto SIEMPRE se
   resuelven contra POS_CATALOG en el servidor (vía sanitizeCustomerCart,
   la misma validación que ya usa la web/kiosco) — el modelo solo elige
   catalogId + cantidad, nunca decide precios. */
import StoreSettings from "../models/StoreSettings.js";
import Order from "../models/Order.js";
import {
  POS_CATALOG,
  getPosCatalogItem,
  getUnavailablePosSelections,
} from "../config/posCatalog.js";
import {
  sanitizeCustomerCart,
  findUnavailableCustomerCartItems,
  isWithinRestaurantHours,
  isRestaurantClosedDay,
} from "../utils/customerOrder.js";
import { computeCartPricing } from "../pricing.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

const MAX_HISTORY_MESSAGES = 16; // turnos de texto plano guardados en la sesión
const MAX_TOOL_ITERATIONS = 4;

// Menú vendible por WhatsApp: los 3 bowls de la casa + bebidas + rice cakes.
// Excluye "bowl-mediano-rapido"/"bowl-grande-rapido" (venta exprés del POS
// sin receta conocida) y "seared-tuna-extra" (solo tiene sentido como
// scoop extra de un bowl, no como artículo suelto por chat).
const MENU_CATALOG_IDS = [
  "bowl-the-og", "bowl-skinny", "bowl-quinoa",
  "mineral-water", "coca-zero", "coca-cola-regular", "bottled-water", "agua-del-dia",
  "cacao-rice-cake", "choco-rice-cake", "miel-rice-cake",
];

export function whatsappAgentConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

const isMenuItemAvailable = (catalogItem, unavailableItems) =>
  getUnavailablePosSelections({ items: [{ catalogId: catalogItem.catalogId }], unavailableItems }).length === 0;

const cartTotal = (cart) => cart.reduce((sum, item) => sum + item.price * item.qty, 0);

const cartSummary = (cart) => ({
  items: cart.map((c) => ({ name: c.name, qty: c.qty, price: c.price })),
  total: cartTotal(cart),
});

const buildSystemPrompt = ({ menuItems, cart, customerName }) => {
  const menuLines = menuItems
    .map((i) => `- [${i.catalogId}] ${i.name} — $${i.price} MXN`)
    .join("\n");
  const cartLines = cart.length
    ? cart.map((c) => `- ${c.name} x${c.qty} — $${c.price * c.qty} MXN`).join("\n") +
      `\nTotal actual: $${cartTotal(cart)} MXN`
    : "(carrito vacío)";

  return `Eres el asistente de pedidos de Poke Palace, un restaurante de poke en Plaza La Estación, Local 24, Tijuana. Atiendes por WhatsApp en español, con tono cálido, breve y directo — mensajes cortos como se escribe en WhatsApp, sin markdown ni listas numeradas largas.

MENÚ DISPONIBLE AHORA (usa el texto entre corchetes como "catalogId" al llamar una función; nunca se lo muestres al cliente, a él dile solo el nombre):
${menuLines}

Reglas:
- Solo puedes vender lo que está en este menú. No inventes productos ni ofrezcas personalizar bowls (bases, proteínas, salsas a la carta) — hoy solo se venden los bowls tal como están armados.
- Para agregar o quitar productos usa siempre las funciones (agregar_producto / quitar_producto) — nunca lo calcules tú de palabra, el total real solo lo sabe el sistema.
- Antes de confirmar, resume el pedido y el total, y pregunta el nombre del cliente si no lo tienes.
- Llama confirmar_pedido solo cuando el cliente ya dijo explícitamente que quiere cerrar el pedido y ya tienes su nombre.
- El pedido se paga al recogerlo en el restaurante (efectivo o tarjeta) — no se cobra por WhatsApp.
- Horario: jueves a martes, 11:00 a 21:00. Cerrado los miércoles.
- Si el cliente pide algo fuera de tu alcance (cancelar un pedido ya hecho, quejas, algo fuera del menú, o cualquier pregunta que no puedas responder con certeza), discúlpate y dile que llame o visite el restaurante directamente — nunca inventes información.

CARRITO ACTUAL:
${cartLines}
${customerName ? `\nNombre del cliente: ${customerName}` : ""}`;
};

const TOOLS = [
  {
    name: "agregar_producto",
    description: "Agrega un producto del menú al pedido (o suma cantidad si ya estaba). Usa el catalogId exacto entre corchetes del menú.",
    input_schema: {
      type: "object",
      properties: {
        catalogId: { type: "string", description: "catalogId exacto del producto en el menú." },
        qty: { type: "integer", description: "Cantidad a agregar. Por defecto 1.", minimum: 1, maximum: 20 },
      },
      required: ["catalogId"],
    },
  },
  {
    name: "quitar_producto",
    description: "Quita por completo un producto del pedido actual.",
    input_schema: {
      type: "object",
      properties: { catalogId: { type: "string", description: "catalogId del producto a quitar." } },
      required: ["catalogId"],
    },
  },
  {
    name: "confirmar_pedido",
    description: "Confirma y envía el pedido a cocina. Solo llamar cuando el cliente confirmó explícitamente y ya diste su nombre.",
    input_schema: {
      type: "object",
      properties: { nombreCliente: { type: "string", description: "Nombre del cliente para el pedido." } },
      required: ["nombreCliente"],
    },
  },
];

async function callClaude({ system, messages, tools }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      system,
      messages,
      tools,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  return res.json();
}

async function addToCart(session, catalogId, qty) {
  const catalogItem = getPosCatalogItem(catalogId);
  if (!catalogItem || !MENU_CATALOG_IDS.includes(catalogItem.catalogId)) {
    return { error: true, message: "Ese producto no está disponible para pedir por aquí." };
  }

  const settings = await StoreSettings.findOne({ key: "main" });
  if (!isMenuItemAvailable(catalogItem, settings?.unavailableItems || [])) {
    return { error: true, message: `${catalogItem.name} está agotado por ahora.` };
  }

  const safeQty = Number.isInteger(qty) && qty > 0 ? Math.min(qty, 20) : 1;
  const existing = session.cart.find((c) => c.catalogId === catalogItem.catalogId);
  if (existing) {
    existing.qty = Math.min(existing.qty + safeQty, 99);
  } else {
    session.cart.push({ catalogId: catalogItem.catalogId, name: catalogItem.name, price: catalogItem.price, qty: safeQty });
  }
  return { ok: true, cart: cartSummary(session.cart) };
}

async function removeFromCart(session, catalogId) {
  const idx = session.cart.findIndex((c) => c.catalogId === catalogId);
  if (idx === -1) return { error: true, message: "Ese producto no estaba en tu pedido." };
  session.cart.splice(idx, 1);
  return { ok: true, cart: cartSummary(session.cart) };
}

async function confirmOrder(session, phone, nombreCliente) {
  if (session.cart.length === 0) {
    return { error: true, message: "Tu pedido está vacío, agrega algo primero." };
  }

  const name = String(nombreCliente || "").trim().slice(0, 80);
  if (!name) return { error: true, message: "Necesito un nombre para el pedido." };

  const settings = await StoreSettings.findOne({ key: "main" });
  if (settings?.ordersPaused) {
    return { error: true, message: settings.pausedMessage || "En este momento no estamos aceptando pedidos, intenta más tarde." };
  }
  const now = new Date();
  if (!isWithinRestaurantHours(now)) {
    return {
      error: true,
      message: isRestaurantClosedDay(now)
        ? "Hoy miércoles estamos cerrados. Te leo de jueves a martes, 11:00 a 21:00."
        : "Estamos cerrados ahora. Abrimos de jueves a martes, 11:00 a 21:00.",
    };
  }

  const cartLines = session.cart.map((c) => ({ kind: "item", catalogId: c.catalogId, qty: c.qty }));
  const unavailableNow = findUnavailableCustomerCartItems(cartLines, settings?.unavailableItems || []);
  if (unavailableNow.length > 0) {
    return { error: true, message: "Uno de los productos de tu pedido se agotó justo ahora — ¿lo cambiamos por otra cosa?" };
  }

  let safeCart;
  try {
    safeCart = sanitizeCustomerCart(cartLines);
  } catch {
    return { error: true, message: "Hubo un problema validando tu pedido, intenta de nuevo." };
  }

  const { subtotal, discount, tax, total } = computeCartPricing(safeCart, null);
  const legacyItems = safeCart.map((line) => ({
    catalogId: line.catalogId, name: line.name, price: line.price, qty: line.qty,
  }));

  session.orderSeq += 1;
  const clientOrderId = `wa:${session._id}:${session.orderSeq}`;

  let order;
  try {
    order = await Order.create({
      clientOrderId,
      cartItems: safeCart,
      items: legacyItems,
      customer: name,
      phone,
      fulfillment: "pickup",
      paymentMethod: "pay_at_pickup",
      paymentStatus: "pending",
      source: "whatsapp",
      subtotal,
      discountAmount: discount,
      tax,
      total,
      status: "pending",
    });
  } catch (err) {
    if (err?.code === 11000) {
      order = await Order.findOne({ clientOrderId });
      if (!order) throw err;
    } else {
      throw err;
    }
  }

  session.cart = [];
  session.customerName = name;
  session.lastOrderId = order._id;

  return { ok: true, orderNumber: String(order._id).slice(-5).toUpperCase(), total: order.total };
}

async function executeTool(name, input, session, phone) {
  try {
    if (name === "agregar_producto") return await addToCart(session, String(input?.catalogId || ""), Number(input?.qty ?? 1));
    if (name === "quitar_producto") return await removeFromCart(session, String(input?.catalogId || ""));
    if (name === "confirmar_pedido") return await confirmOrder(session, phone, input?.nombreCliente);
    return { error: true, message: "Función desconocida." };
  } catch (err) {
    console.error("whatsapp tool error:", name, err.message);
    return { error: true, message: "Ocurrió un problema interno, intenta de nuevo." };
  }
}

// Corre un turno completo del agente: agrega el mensaje del cliente, deja que
// Claude llame las funciones necesarias, y regresa el texto final a enviar.
// Muta `session` (cart/messages/etc.) — quien llama es responsable de guardarla.
export async function runWhatsAppAgent(session, phone, userText) {
  const settings = await StoreSettings.findOne({ key: "main" });
  const unavailable = settings?.unavailableItems || [];
  const menuItems = POS_CATALOG.filter(
    (i) => MENU_CATALOG_IDS.includes(i.catalogId) && isMenuItemAvailable(i, unavailable)
  );

  const system = buildSystemPrompt({ menuItems, cart: session.cart, customerName: session.customerName });

  const anthropicMessages = session.messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.text }));
  anthropicMessages.push({ role: "user", content: userText });

  let finalText = null;
  for (let i = 0; i < MAX_TOOL_ITERATIONS && finalText === null; i++) {
    const response = await callClaude({ system, messages: anthropicMessages, tools: TOOLS });
    anthropicMessages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      finalText = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      break;
    }

    const toolResults = [];
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, session, phone);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: Boolean(result?.error),
      });
    }
    anthropicMessages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText = "Perdón, se me complicó armar tu pedido. ¿Puedes repetirme lo que necesitas?";
  }

  session.messages.push({ role: "user", text: userText.slice(0, 2000) });
  session.messages.push({ role: "assistant", text: finalText.slice(0, 2000) });
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  session.lastActivityAt = new Date();

  return finalText;
}
