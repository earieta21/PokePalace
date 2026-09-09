/* Agente que lee una foto de factura/ticket y extrae los datos del gasto —
   sin SDK, fetch nativo a la Messages API de Anthropic, mismo estilo que
   whatsappAgent.js. Nunca inventa un monto que no pudo leer: si no está
   seguro, regresa confianza "baja" con la duda específica en vez de
   adivinar (justo el tipo de error que ya nos costó una factura de
   $429,300 por un mal tecleo manual -- aquí el punto es que ni la máquina
   ni el humano metan un número sin verificar). */
import { EXPENSE_CATEGORIES } from "../models/Expense.js";
import { dateKeyInTimeZone } from "../utils/timeZone.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

// Un solo gasto de mostrador razonable en un restaurante chico -- por
// encima de esto, mejor que un humano lo confirme aunque Claude "lea" bien
// el número (podría ser una factura mensual grande, o un error de OCR).
export const MAX_AUTO_AMOUNT = 30000;

const EXTRACT_TOOL = {
  name: "registrar_gasto",
  description: "Registra los datos leídos de la foto de la factura o ticket. Llámala siempre, aunque tengas dudas -- usa confianza:\"baja\" y explica la duda en vez de no responder.",
  input_schema: {
    type: "object",
    properties: {
      monto: { type: "number", description: "Monto total en pesos mexicanos (MXN), tal como aparece en el ticket. Sin comas ni símbolo de peso." },
      iva: { type: "number", description: "El IVA de ESTA factura tal como viene desglosado en el ticket (no lo calcules ni asumas una tasa -- solo repórtalo si el ticket lo muestra explícitamente como línea de IVA). Omite este campo por completo si no se ve un desglose de IVA." },
      fecha: { type: "string", description: "Fecha del ticket en formato YYYY-MM-DD. Si no se alcanza a leer, usa la fecha de hoy que te dieron." },
      categoria: { type: "string", enum: EXPENSE_CATEGORIES, description: "La categoría que mejor describe este gasto." },
      descripcion: { type: "string", description: "Breve descripción: proveedor y qué se compró (máx. 100 caracteres)." },
      confianza: { type: "string", enum: ["alta", "baja"], description: "\"baja\" si el monto, la fecha o la categoría no quedaron claros en la foto o en lo que dijo el usuario." },
      duda: { type: "string", description: "Si confianza es \"baja\", la pregunta concreta que se le debe hacer al usuario para aclarar (ej. \"¿Cuánto fue el total? No se alcanza a leer.\"). Vacío si confianza es \"alta\"." },
    },
    required: ["monto", "fecha", "categoria", "descripcion", "confianza"],
  },
};

async function callClaude(imageBase64, mimeType, userNotes) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const today = dateKeyInTimeZone();
  const notesText = userNotes.length > 0
    ? userNotes.map((n) => `- ${n}`).join("\n")
    : "(el usuario no escribió nada todavía)";

  const system = `Eres el asistente de Finanzas de Poke Palace, un restaurante de poke en Tijuana. Tu única tarea es leer la foto de una factura, ticket o comprobante de compra y extraer los datos del gasto llamando a la función registrar_gasto.

Hoy es ${today} (zona horaria de Tijuana) -- úsala como fecha por defecto si el ticket no trae una legible.

Categorías válidas: ${EXPENSE_CATEGORIES.join(", ")}.

Lo que el usuario ha dicho sobre este gasto (puede aclarar el monto, para qué fue, o quedar vacío si mandó la foto sola):
${notesText}

Reglas:
- Nunca inventes un monto que no puedas leer con razonable certeza en la imagen o en lo que dijo el usuario -- en ese caso usa confianza "baja" y pregunta concretamente qué falta.
- Si el usuario ya aclaró algo en su texto (por ejemplo dictó el monto porque la foto salió borrosa), confía en eso.
- La descripción debe ser corta y útil para un estado de cuenta, no una transcripción completa del ticket.
- Todo lo que llega por este bot se trata como factura (CFDI) real -- nunca calcules ni asumas el IVA a partir del total; repórtalo solo si el ticket lo muestra desglosado como línea de IVA, y omite el campo si no.`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 512,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
            { type: "text", text: "Lee esta factura/ticket y registra el gasto." },
          ],
        },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "registrar_gasto" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  return res.json();
}

/* Lee la foto (+ lo que el usuario haya escrito) y regresa los datos
   extraídos. `userNotes` es un arreglo de líneas de texto acumuladas por si
   el usuario mandó varias aclaraciones antes de que la confianza subiera. */
export async function extractExpenseFromReceipt(buffer, mimeType, userNotes = []) {
  const response = await callClaude(buffer.toString("base64"), mimeType, userNotes);
  const toolUse = response.content?.find((b) => b.type === "tool_use");
  if (!toolUse?.input) throw new Error("El agente no regresó datos estructurados");

  const { monto, iva, fecha, categoria, descripcion, confianza, duda } = toolUse.input;
  const numericAmount = Number(monto);
  const safeAmount = Number.isFinite(numericAmount) ? Math.round(numericAmount * 100) / 100 : null;
  const numericIva = Number(iva);
  const safeIva = Number.isFinite(numericIva) && numericIva >= 0 ? Math.round(numericIva * 100) / 100 : null;

  const needsReview = confianza !== "alta"
    || safeAmount === null
    || safeAmount <= 0
    || safeAmount > MAX_AUTO_AMOUNT
    || !EXPENSE_CATEGORIES.includes(categoria);

  return {
    amount: safeAmount,
    iva: safeIva,
    date: /^\d{4}-\d{2}-\d{2}$/.test(fecha || "") ? fecha : today(),
    category: EXPENSE_CATEGORIES.includes(categoria) ? categoria : "Otros",
    description: String(descripcion || "Factura por Telegram").slice(0, 200),
    needsReview,
    doubt: needsReview
      ? (duda || (safeAmount > MAX_AUTO_AMOUNT
          ? `El monto leído ($${safeAmount.toLocaleString("es-MX")}) es inusualmente alto -- confírmalo antes de registrarlo.`
          : "No quedó claro algún dato -- por favor confírmalo."))
      : null,
  };
}

function today() {
  return dateKeyInTimeZone();
}
