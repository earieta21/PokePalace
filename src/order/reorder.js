import { isPromo2x1Protein, priceBowlDraft, PROMO_2X1_BOWLS_PRICE } from "./pricing.js";

const comboGroups = {
  comboBowlId: "bowls",
  comboDrinkId: "drinks",
  comboRiceCakeId: "riceCakes",
};
const comboFields = Object.keys(comboGroups);

// Cada bowl se edita por separado. Los artículos iguales comparten cantidad
// en el menú. En un combo también deben coincidir sus tres selecciones.
export function addCartLines(previousCart, lines, makeCartId) {
  const cart = [...previousCart];
  for (const line of lines) {
    const match = line.kind === "item"
      ? cart.findIndex((current) =>
          current.kind === "item" && current.catalogId === line.catalogId
          && comboFields.every((field) => current[field] === line[field])
        )
      : -1;
    if (match >= 0) {
      cart[match] = { ...cart[match], price: line.price, qty: cart[match].qty + line.qty };
    } else {
      cart.push({ ...line, cartId: makeCartId() });
    }
  }
  return cart;
}

export function buildReorderPlan(pastOrder, availability, language, catalogById, getItemLabel) {
  const ingredients = new Set([...availability.unavailableItems, ...availability.hiddenIngredients]);
  const blockedCatalog = new Set([
    ...ingredients, ...availability.unavailableCatalogItems, ...availability.hiddenCatalogItems,
  ]);
  const unavailable = new Set();
  const cart = [];
  const bowlName = language === "en" ? "Custom bowl" : "Bowl personalizado";
  const promoName = language === "en" ? "2-for-1 bowls" : "2x1 en Bowls";
  const source = pastOrder.cartItems?.length ? pastOrder.cartItems : [pastOrder];

  function availableSelections(ids, category, missing) {
    return (Array.isArray(ids) ? ids : []).filter((id) => {
      if (!id) return false;
      if (!ingredients.has(id)) return true;
      missing.add(getItemLabel(category, id, language));
      return false;
    });
  }

  function bowlSelections(bowl, missing) {
    const originalBases = bowl.bases?.length ? bowl.bases : [bowl.base].filter(Boolean);
    const bases = availableSelections(originalBases, "base", missing);
    return {
      base: bases[0],
      bases,
      marinades: availableSelections(bowl.marinades, "marinade", missing),
      complements: availableSelections(bowl.complements, "complement", missing),
      sauces: availableSelections(bowl.sauces, "sauce", missing),
      toppings: availableSelections(bowl.toppings, "topping", missing),
    };
  }

  function reportSkipped(name, missing) {
    unavailable.add(missing.size ? `${name} (${[...missing].join(", ")})` : name);
  }

  for (const line of source) {
    const missing = new Set();
    if (line.kind === "item") {
      const item = catalogById[line.catalogId];
      const name = item?.name || line.name || (language === "en" ? "Menu item" : "Producto del menú");
      if (!item || blockedCatalog.has(line.catalogId) || (item.isCombo && !availability.comboPalaceActive)) {
        unavailable.add(name);
        continue;
      }
      const selections = {};
      if (item.isCombo) {
        for (const field of comboFields) {
          const id = line[field];
          const options = item.comboOptions?.[comboGroups[field]];
          const offered = !options || options.some((option) => option.id === id);
          if (offered && catalogById[id] && !blockedCatalog.has(id)) selections[field] = id;
          else if (id) missing.add(catalogById[id]?.name || id);
        }
        if (Object.keys(selections).length !== comboFields.length) {
          reportSkipped(name, missing);
          continue;
        }
      }
      cart.push({
        kind: "item", catalogId: line.catalogId, name, category: item.categoryKey,
        price: item.price, qty: line.qty || 1, ...selections,
      });
      continue;
    }

    if (line.kind === "promo2x1") {
      if (!availability.promo2x1Active || blockedCatalog.has("promo-2x1-bowls")) {
        unavailable.add(promoName);
        continue;
      }
      const bowls = (line.bowls || []).map((bowl) => bowlSelections(bowl, missing));
      const [protein] = availableSelections([line.protein], "protein", missing);
      const allowedProtein = protein && isPromo2x1Protein(protein);
      if (protein && !allowedProtein) missing.add(getItemLabel("protein", protein, language));
      if (!allowedProtein || bowls.length !== 2 || bowls.some((bowl) => !bowl.base)) {
        reportSkipped(promoName, missing);
        continue;
      }
      cart.push({ kind: "promo2x1", catalogId: "promo-2x1-bowls", protein, bowls, price: PROMO_2X1_BOWLS_PRICE, qty: 1 });
    } else {
      const bowl = bowlSelections(line, missing);
      const sourceProteins = line.proteins?.length ? line.proteins : line.protein?.split(/,\s*/);
      const proteins = availableSelections(sourceProteins, "protein", missing);
      if (!bowl.base || !proteins.length) {
        reportSkipped(bowlName, missing);
        continue;
      }
      const extraScoopProteins = (line.extraScoopProteins || []).filter((id) => proteins.includes(id));
      const selections = { ...bowl, proteins, bowlSize: proteins.length === 3 ? "large" : "normal", extraScoopProteins };
      cart.push({ kind: "bowl", ...selections, price: priceBowlDraft(selections), qty: 1 });
    }
    for (const label of missing) unavailable.add(label);
  }
  return { cart, unavailable: [...unavailable] };
}

export function applyReorderPlan(current, pastOrder, plan, mode, makeCartId) {
  if (!plan.cart.length) return current;
  const cart = addCartLines(mode === "append" ? current.cart : [], plan.cart, makeCartId);
  if (current.cart.length) {
    // Si se reemplazó la línea en edición, el borrador se puede agregar como un bowl nuevo.
    return { ...current, cart, editingCartId: mode === "append" ? current.editingCartId : null };
  }
  return {
    ...current,
    cart,
    editingCartId: null,
    customer: pastOrder.customer || current.customer,
    phone: pastOrder.phone || current.phone,
    fulfillment: pastOrder.fulfillment === "dine_in" ? "dine_in" : "pickup",
    paymentMethod: "pay_at_pickup",
    promoCode: "",
    discountAmount: 0,
    notes: "",
    isScheduled: false,
    scheduledPickupTime: "",
  };
}
