import { useRef, useState } from "react";
import { BASE_LABELS, PROTEIN_LABELS, COMPLEMENT_LABELS, SAUCE_LABELS, TOPPING_LABELS, getBaseLabel } from "../order/OrderLabels";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE, PREMIUM_PROTEIN_PRICES, COMPLEMENT_FREE_LIMIT, EXTRA_COMPLEMENT_PRICE, computeExtrasSubtotal } from "../order/pricing";
import ui from "./CustomBowlBuilder.module.css";

const GROUPS = [
  { key: "bases", title: "Base", hint: "Elige 1 base o 2 para mitad y mitad, sin costo extra.", max: 2, labels: BASE_LABELS, ids: ["white_rice", "spring_mix", "quinoa"] },
  { key: "proteins", title: "Proteínas", hint: `1 o 2: mediano · 3: grande (+$${LARGE_BOWL_UPCHARGE}).`, max: 3, labels: PROTEIN_LABELS, ids: ["tuna", "salmon", "shrimp", "tofu", "seared_tuna"] },
  { key: "complements", title: "Complementos", hint: `${COMPLEMENT_FREE_LIMIT} incluidos. Cada adicional cuesta $${EXTRA_COMPLEMENT_PRICE}.`, max: 11, labels: COMPLEMENT_LABELS, ids: ["shredded_carrots", "seaweed", "edamame", "red_onion", "cucumber", "mango", "pineapple", "beet", "surimi", "spicy_surimi", "avocado"] },
  { key: "sauces", title: "Aderezos", hint: "Hasta 2 incluidos. También puedes dejarlo sin aderezos.", max: 2, labels: SAUCE_LABELS, ids: ["spicy_mayo", "sweet_dressing", "citrus_dressing", "red_sauce", "sriracha", "cilantro_dressing"] },
  { key: "toppings", title: "Toppings", hint: "Hasta 5 incluidos. También puedes dejarlo sin toppings.", max: 5, labels: TOPPING_LABELS, ids: ["black_olives", "toasted_peanuts", "sesame_seeds", "nori_strips", "masago", "croutons", "crispy_onions"] },
];

const emptyDraft = () => ({ base: null, bases: [], proteins: [], marinades: [], complements: [], sauces: [], toppings: [] });

export default function CustomBowlBuilder({ onAdd, onCancel, initialBowl }) {
  const [draft, setDraft] = useState(() => {
    const bases = initialBowl?.bases?.length ? [...initialBowl.bases] : initialBowl?.base ? [initialBowl.base] : [];
    return { ...emptyDraft(), ...initialBowl, bases, base: bases[0] || null };
  });
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const stepRefs = useRef([]);
  const group = GROUPS[step];
  const selection = (key) => draft[key];
  const selected = selection(group.key);
  const isLarge = draft.proteins.length === 3;
  const premium = draft.proteins.reduce((sum, id) => sum + (PREMIUM_PROTEIN_PRICES[id] || 0), 0);
  const extraComplements = Math.max(0, draft.complements.length - COMPLEMENT_FREE_LIMIT);
  const price = BOWL_BASE_PRICE + (isLarge ? LARGE_BOWL_UPCHARGE : 0)
    + computeExtrasSubtotal({ complementsCount: draft.complements.length, proteins: draft.proteins });
  const missing = !draft.base ? "Selecciona una base" : !draft.proteins.length ? "Selecciona al menos una proteína" : "";

  const navigate = (index) => {
    setStep(index);
    setMessage("");
    stepRefs.current[index]?.focus();
  };

  const toggle = (id) => {
    if (!selected.includes(id) && selected.length >= group.max) {
      setMessage(`Puedes elegir hasta ${group.max}. Quita una selección para cambiarla.`);
      return;
    }
    setDraft((current) => {
      const next = current[group.key].includes(id) ? current[group.key].filter((value) => value !== id) : [...current[group.key], id];
      return { ...current, [group.key]: next, ...(group.key === "bases" && { base: next[0] || null }) };
    });
    setMessage("");
  };

  return (
    <div className={ui.builder}>
      <div className={ui.sizeBanner}>
        <div><strong>{initialBowl ? "Editando tu bowl" : "Bowl a tu gusto"}</strong><span>Mediano ${BOWL_BASE_PRICE} · Grande ${BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE}</span></div>
        <span className={ui.sizeBadge}>{isLarge ? "Grande · 3 proteínas" : "Mediano · 1–2 proteínas"}</span>
      </div>
      <nav className={ui.steps} aria-label="Pasos para armar el bowl">
        {GROUPS.map((entry, index) => (
          <button key={entry.key} type="button" ref={(element) => { stepRefs.current[index] = element; }} aria-current={step === index ? "step" : undefined} onClick={() => navigate(index)}>
            <span>{selection(entry.key).length ? "✓" : index + 1}</span>{entry.title}
            <small>{selection(entry.key).length}/{entry.max}</small>
          </button>
        ))}
      </nav>
      <section className={ui.ingredientPanel} aria-labelledby="bowl-step-title">
        <div className={ui.groupHeader}><div><span>Paso {step + 1} de 5{step < 2 ? " · Obligatorio" : " · Opcional"}</span><h3 id="bowl-step-title">{group.title}</h3></div><strong>{selected.length} de {group.max}</strong></div>
        <p className={ui.hint}>{group.hint}</p>
        <div className={ui.ingredients}>
          {group.ids.map((id) => {
            const active = selected.includes(id);
            const extra = group.key === "proteins" ? PREMIUM_PROTEIN_PRICES[id] || 0 : group.key === "complements" && !active && selected.length >= COMPLEMENT_FREE_LIMIT ? EXTRA_COMPLEMENT_PRICE : 0;
            return <button key={id} type="button" aria-pressed={active} aria-disabled={!active && selected.length >= group.max} onClick={() => toggle(id)}><span className={ui.check}>{active ? "✓" : "+"}</span><span>{group.labels[id]}{extra > 0 && <small>+${extra}</small>}</span></button>;
          })}
        </div>
        <p className={ui.feedback} role="status">{message || (group.key === "bases" && selected.length === 2 ? "Mitad y mitad: 50% de cada base. Toca una base seleccionada para quitarla." : selected.length >= group.max ? "Límite alcanzado. Toca un ingrediente seleccionado para quitarlo." : "Toca un ingrediente para elegirlo o quitarlo.")}</p>
        <div className={ui.navigation}>
          <button type="button" disabled={step === 0} onClick={() => navigate(step - 1)}>← Anterior</button>
          {step < 4 && <button type="button" className={ui.next} disabled={step < 2 && !selected.length} onClick={() => navigate(step + 1)}>{step > 1 && !selected.length ? "Continuar sin " + group.title.toLowerCase() : "Siguiente: " + GROUPS[step + 1].title} →</button>}
        </div>
      </section>
      <section className={ui.summary} aria-label="Resumen del bowl">
        <h3>Así queda el bowl <small>Toca una sección para cambiarla</small></h3>
        {GROUPS.map((entry, index) => <button type="button" key={entry.key} onClick={() => navigate(index)}><strong>{entry.title}</strong><span>{(entry.key === "bases" ? (draft.bases.length ? getBaseLabel(draft.bases, draft.base) : "") : selection(entry.key).map((id) => entry.labels[id]).join(", ")) || (index < 2 ? "Falta elegir" : "Sin " + entry.title.toLowerCase())}</span><span aria-hidden="true">✎</span></button>)}
      </section>
      <div className={ui.footer}>
        <div className={ui.pricing} aria-live="polite"><span>{isLarge ? "Bowl grande" : "Bowl mediano"}<strong>${price} <small>MXN</small></strong></span><small>Base ${BOWL_BASE_PRICE}{isLarge ? ` + tamaño $${LARGE_BOWL_UPCHARGE}` : ""}{premium ? ` + proteína premium $${premium}` : ""}{extraComplements ? ` + ${extraComplements} complemento(s) extra $${extraComplements * EXTRA_COMPLEMENT_PRICE}` : ""}</small></div>
        {missing && <p className={ui.missing}>{missing} para agregar el bowl.</p>}
        <div className={ui.actions}><button type="button" onClick={onCancel}>Cancelar</button><button type="button" className={ui.add} disabled={Boolean(missing)} onClick={() => onAdd({ ...draft, bowlSize: isLarge ? "large" : "normal", price })}>{initialBowl ? "Guardar cambios" : "Agregar a la orden"} · ${price}</button></div>
      </div>
    </div>
  );
}
