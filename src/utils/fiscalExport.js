import { DELIVERY_PLATFORM_LABELS } from "../data/deliveryPlatforms.js";

export const FISCAL_METHOD_LABELS = {
  cash: "Efectivo",
  card_terminal: "Tarjeta (terminal)",
  online: "Pago en línea (Openpay)",
  pay_at_pickup: "Pagar al recoger",
  delivery_app: "Aplicaciones de delivery",
};

export const fiscalPlatformLabel = (id) => DELIVERY_PLATFORM_LABELS[id] || "Sin identificar";

const money = (amount) => Number(amount ?? 0).toFixed(2);
const registroDate = (date) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Tijuana", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
}).format(new Date(date));

// Los reportes parciales siempre identifican su alcance y muestran el
// resumen general para conciliar los tres archivos sin duplicar ventas.
export function buildFiscalCSV(data, groupId = null) {
  const groups = data.ingresos.grupos;
  const selected = groupId ? groups.filter((group) => group.id === groupId) : groups;
  if (!selected.length) throw new Error("Grupo de ingresos inválido");
  const rows = [
    ["Poke Palace — reporte mensual para el contador"],
    ["Mes", data.month],
    ["Moneda", "MXN"],
    ["Alcance", groupId ? `Reporte parcial: ${selected[0].label}` : "Reporte completo"],
    ["Fechas", "Fecha de registro de la venta en America/Tijuana"],
    ["Importes", "Ventas registradas con IVA incluido; no son depósitos ni liquidaciones de las apps"],
    [],
    ["Resumen general de todos los métodos", "Órdenes", "Total MXN"],
    ...groups.map((group) => [group.label, group.ordenes, money(group.total)]),
    ["TOTAL GENERAL", data.ordenesCobradas, money(data.ingresos.conIva)],
    [],
    ["Aplicaciones de delivery (incluidas en el resumen general)", "Órdenes", "Total MXN"],
    ...data.ingresos.porPlataforma.map((p) => [fiscalPlatformLabel(p.id), p.ordenes, money(p.total)]),
  ];
  for (const group of selected) {
    rows.push([], [group.label], ["ID de orden", "Fecha de registro (Tijuana)", "Método", "Plataforma de entrega", "Venta MXN"]);
    for (const movement of group.movimientos) {
      rows.push([
        movement.id, registroDate(movement.fecha), FISCAL_METHOD_LABELS[movement.metodo] || "Otro método",
        movement.plataforma ? fiscalPlatformLabel(movement.plataforma) : (movement.metodo === "delivery_app" ? "Sin identificar" : "No aplica"),
        money(movement.total),
      ]);
    }
    rows.push(["TOTAL DEL GRUPO", "", "", "", money(group.total)]);
  }
  if (!groupId) {
    rows.push([], ["Resumen de gastos e impuestos — todos los métodos", "MXN"],
      ["Gastos registrados", money(data.gastos.total)],
      ["Ingresos sin IVA", money(data.ingresos.base)],
      ["IVA trasladado", money(data.iva.trasladado)],
      ["IVA acreditable", money(data.iva.acreditable)],
      ["IVA neto estimado", money(data.iva.neto)],
      ["ISR estimado", money(data.isr.estimado)],
      ["Total estimado de impuestos", money(data.totalEstimado)],
      [], ["Notas de la estimación"], ...data.notas.map((note) => [note]));
  }
  rows.push([], ["Revisar junto con CFDI, estados de cuenta y liquidaciones de las plataformas. No sustituye la declaración del contador."]);
  return rows;
}
