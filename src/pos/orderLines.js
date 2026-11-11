import {
  BASE_LABELS, PROTEIN_LABELS, MARINADE_LABELS,
  COMPLEMENT_LABELS, SAUCE_LABELS, TOPPING_LABELS,
} from "../order/OrderLabels";
import { comboPalaceSelectionSummary } from "../data/comboPalace";

/* Cómo se lee un pedido en el portal: una línea por bowl/artículo. Lo usan el
   historial de órdenes y la ficha del cliente. */

export const labelList = (ids, labels) => (ids || []).map((id) => labels[id] ?? id);

// Una línea legible por bowl/artículo — a diferencia del resumen de la
// tabla (una sola frase truncada), aquí cada campo del bowl es su propio
// renglón para poder leerlo completo en el detalle.
export function orderLines(order) {
  const lines = [];

  const bowlLine = (bowl, index) => {
    const isHalfHalf = bowl.bases?.length > 1;
    const bases = isHalfHalf ? bowl.bases : (bowl.base ? [bowl.base] : []);
    lines.push({
      title: `Bowl ${index != null ? `${index} ` : ""}${bowl.bowlSize === "large" ? "Grande" : "Normal"}`,
      rows: [
        ["Base", `${labelList(bases, BASE_LABELS).join(" + ") || "—"}${isHalfHalf ? " ⚠️ MITAD Y MITAD" : ""}`],
        ["Proteína", labelList(bowl.proteins, PROTEIN_LABELS).join(", ") || "—"],
        ["Marinado", labelList(bowl.marinades, MARINADE_LABELS).join(", ") || "—"],
        ["Complementos", labelList(bowl.complements, COMPLEMENT_LABELS).join(", ") || "—"],
        ["Salsas", labelList(bowl.sauces, SAUCE_LABELS).join(", ") || "—"],
        ["Toppings", labelList(bowl.toppings, TOPPING_LABELS).join(", ") || "—"],
        ...(bowl.extraScoopProteins?.length
          ? [["Proteína extra", labelList(bowl.extraScoopProteins, PROTEIN_LABELS).join(", ")]]
          : []),
      ],
    });
  };

  if (order.cartItems?.length) {
    let bowlIndex = 0;
    for (const line of order.cartItems) {
      if (line.kind === "item") {
        const combo = line.catalogId === "combo-palace" ? ` — ${comboPalaceSelectionSummary(line)}` : "";
        lines.push({ title: `${line.qty} × ${line.name}${combo}`, rows: [] });
      } else if (line.kind === "promo2x1") {
        bowlIndex += 1;
        lines.push({
          title: "Promo 2x1 en Bowls",
          rows: [["Proteína compartida", PROTEIN_LABELS[line.protein] ?? line.protein ?? "—"]],
        });
        (line.bowls || []).forEach((bowl) => bowlLine(bowl, ++bowlIndex));
      } else {
        bowlIndex += 1;
        bowlLine(line, bowlIndex);
      }
    }
    return lines;
  }

  (order.items || []).forEach((item) => {
    const proteinSuffix = item.proteins?.length ? ` (${labelList(item.proteins, PROTEIN_LABELS).join(", ")})`
      : item.protein ? ` (${PROTEIN_LABELS[item.protein] ?? item.protein})`
      : item.complement ? ` (${COMPLEMENT_LABELS[item.complement] ?? item.complement})`
        : item.sauce ? ` (${SAUCE_LABELS[item.sauce] ?? item.sauce})` : "";
    const comboSuffix = item.catalogId === "combo-palace" ? ` — ${comboPalaceSelectionSummary(item)}` : "";
    lines.push({ title: `${item.qty} × ${item.name}${proteinSuffix}${comboSuffix}`, rows: [] });
  });

  if (order.base) bowlLine(order, null);

  return lines.length > 0 ? lines : [{ title: "Bowl personalizado", rows: [] }];
}

// Resumen de una sola frase para la columna de la tabla — se sigue
// truncando ahí por espacio, pero el detalle completo ya no depende de
// esta frase (ver orderLines).
export function itemBrief(order) {
  return orderLines(order).map((l) => l.title).join(" + ");
}
