import { useState } from "react";
import {
  BASE_LABELS,
  PROTEIN_LABELS,
  COMPLEMENT_LABELS,
  SAUCE_LABELS,
  TOPPING_LABELS,
} from "../order/OrderLabels";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE, computeExtrasSubtotal } from "../order/pricing";
import { useAvailability } from "../context/AvailabilityContext";
import {
  getUnavailableBowlSelections,
  MAX_POS_PROTEINS,
  MIN_POS_PROTEINS,
} from "./posRules.js";

// Real base ids only — BASE_LABELS has a legacy "mixed_greens" alias pointing
// at the same label as "spring_mix", which would render as a duplicate chip.
const BASE_IDS = ["white_rice", "spring_mix", "quinoa"];
const PROTEIN_IDS = ["tuna", "salmon", "shrimp", "tofu"];
const COMPLEMENT_IDS = [
  "shredded_carrots", "seaweed", "edamame", "red_onion", "cucumber",
  "pineapple", "beet", "surimi", "spicy_surimi", "avocado",
];
const SAUCE_IDS = [
  "spicy_mayo", "sweet_dressing", "citrus_dressing", "red_sauce",
  "sriracha", "cilantro_dressing",
];
const TOPPING_IDS = [
  "black_olives", "toasted_peanuts", "sesame_seeds", "nori_strips", "masago", "croutons",
];

const MAX_COMPLEMENTS = COMPLEMENT_IDS.length;
const MAX_BASES = 2;
const MAX_SAUCES = 2;
const MAX_TOPPINGS = 5;

const emptyDraft = () => ({
  bases: [],
  proteins: [],
  marinades: [],
  complements: [],
  sauces: [],
  toppings: [],
});

function toggleInList(list, id, max) {
  if (list.includes(id)) return list.filter((x) => x !== id);
  if (list.length >= max) return list;
  return [...list, id];
}

function ChipGroup({ title, hint, ids, labels, selected, max, onToggle, unavailableItems = [] }) {
  const unavailable = new Set(unavailableItems);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--p-muted)" }}>
          {title}
        </span>
        {max != null && (
          <span style={{ fontSize: 11, color: "var(--p-muted)" }}>{selected.length}/{max}{hint}</span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ids.map((id) => {
          const active = selected.includes(id);
          const isUnavailable = unavailable.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              disabled={isUnavailable && !active}
              aria-label={`${labels[id] || id}${isUnavailable ? " (agotado)" : ""}`}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: isUnavailable && !active ? "not-allowed" : "pointer",
                border: active ? "2px solid #52b788" : "1.5px solid rgba(82,183,136,0.35)",
                background: active ? "#52b788" : isUnavailable ? "#f1f3f1" : "rgba(82,183,136,0.08)",
                color: active ? "#fff" : isUnavailable ? "#8a958d" : "inherit",
                opacity: isUnavailable ? 0.72 : 1,
                transition: "all 120ms ease",
                transform: active ? "scale(1.04)" : "scale(1)",
              }}
            >
              {active ? "✓ " : ""}{labels[id] || id}{isUnavailable ? " · Agotado" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CustomBowlBuilder({ onAdd, onCancel }) {
  const { unavailableItems } = useAvailability();
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");

  const isLarge = draft.proteins.length === MAX_POS_PROTEINS;
  const price = BOWL_BASE_PRICE
    + (isLarge ? LARGE_BOWL_UPCHARGE : 0)
    + computeExtrasSubtotal({ complementsCount: draft.complements.length });

  const handleAdd = () => {
    if (draft.bases.length === 0) return setError("Selecciona al menos una base.");
    if (draft.proteins.length < MIN_POS_PROTEINS) return setError("Selecciona al menos 1 proteína.");
    if (getUnavailableBowlSelections(draft, unavailableItems).length > 0) {
      return setError("Quita los ingredientes agotados antes de agregar el bowl.");
    }

    onAdd({
      // Keep the first base in the legacy singular field while the full list
      // carries a possible half-and-half selection through the POS pipeline.
      base: draft.bases[0],
      bases: draft.bases,
      proteins: draft.proteins,
      bowlSize: isLarge ? "large" : "normal",
      marinades: draft.marinades,
      complements: draft.complements,
      sauces: draft.sauces,
      toppings: draft.toppings,
      price,
    });
    setDraft(emptyDraft());
    setError("");
  };

  return (
    <div>
      <ChipGroup
        title="Base"
        hint=" · elige 2 para mitad y mitad"
        ids={BASE_IDS}
        labels={BASE_LABELS}
        selected={draft.bases}
        max={MAX_BASES}
        unavailableItems={unavailableItems}
        onToggle={(id) => {
          setDraft((d) => ({ ...d, bases: toggleInList(d.bases, id, MAX_BASES) }));
          setError("");
        }}
      />

      <ChipGroup
        title="Proteínas"
        hint={` · 1-2 = mediano · 3 = grande (+$${LARGE_BOWL_UPCHARGE} MXN)`}
        ids={PROTEIN_IDS}
        labels={PROTEIN_LABELS}
        selected={draft.proteins}
        max={MAX_POS_PROTEINS}
        unavailableItems={unavailableItems}
        onToggle={(id) => { setDraft((d) => ({ ...d, proteins: toggleInList(d.proteins, id, MAX_POS_PROTEINS) })); setError(""); }}
      />

      <ChipGroup
        title="Complementos"
        hint=" · más de 6 cuestan $15 c/u"
        ids={COMPLEMENT_IDS}
        labels={COMPLEMENT_LABELS}
        selected={draft.complements}
        max={MAX_COMPLEMENTS}
        unavailableItems={unavailableItems}
        onToggle={(id) => setDraft((d) => ({ ...d, complements: toggleInList(d.complements, id, MAX_COMPLEMENTS) }))}
      />

      <ChipGroup
        title="Aderezos"
        ids={SAUCE_IDS}
        labels={SAUCE_LABELS}
        selected={draft.sauces}
        max={MAX_SAUCES}
        unavailableItems={unavailableItems}
        onToggle={(id) => setDraft((d) => ({ ...d, sauces: toggleInList(d.sauces, id, MAX_SAUCES) }))}
      />

      <ChipGroup
        title="Toppings"
        ids={TOPPING_IDS}
        labels={TOPPING_LABELS}
        selected={draft.toppings}
        max={MAX_TOPPINGS}
        unavailableItems={unavailableItems}
        onToggle={(id) => setDraft((d) => ({ ...d, toppings: toggleInList(d.toppings, id, MAX_TOPPINGS) }))}
      />

      {error && <p style={{ color: "red", fontSize: 12, margin: "4px 0 10px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={handleAdd}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: "var(--p-accent, #1a1a1a)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          Agregar bowl — ${price} MXN
        </button>
        <button
          type="button"
          onClick={() => { setDraft(emptyDraft()); onCancel?.(); }}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid var(--p-border, #ddd)",
            background: "transparent",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
