export const COMBO_PALACE_PRICE = 279;

export const COMBO_PALACE_OPTIONS = Object.freeze({
  bowls: Object.freeze([
    Object.freeze({ id: "bowl-the-og", label: "The OG" }),
    Object.freeze({ id: "bowl-skinny", label: "Skinny Bowl" }),
    Object.freeze({ id: "bowl-quinoa", label: "Quinoa Bowl" }),
  ]),
  drinks: Object.freeze([
    Object.freeze({ id: "mineral-water", label: "Topo Chico" }),
    Object.freeze({ id: "coca-zero", label: "Coca-Zero" }),
    Object.freeze({ id: "coca-cola-regular", label: "Coca-Cola" }),
    Object.freeze({ id: "agua-del-dia", label: "Agua del día" }),
  ]),
  riceCakes: Object.freeze([
    Object.freeze({ id: "cacao-rice-cake", label: "Cacao Rice Cake" }),
    Object.freeze({ id: "choco-rice-cake", label: "Choco Rice Cake" }),
    Object.freeze({ id: "miel-rice-cake", label: "Miel Rice Cake" }),
  ]),
});

const COMBO_LABELS = Object.freeze(Object.fromEntries(
  Object.values(COMBO_PALACE_OPTIONS)
    .flat()
    .map(({ id, label }) => [id, label])
));

export const comboPalaceSelectionLabels = (line = {}) => [
  COMBO_LABELS[line.comboBowlId] || line.comboBowlId,
  COMBO_LABELS[line.comboDrinkId] || line.comboDrinkId,
  COMBO_LABELS[line.comboRiceCakeId] || line.comboRiceCakeId,
].filter(Boolean);

export const comboPalaceSelectionSummary = (line = {}) =>
  comboPalaceSelectionLabels(line).join(" + ");
