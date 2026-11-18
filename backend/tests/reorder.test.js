import assert from "node:assert/strict";
import { test } from "node:test";
import { applyReorderPlan, buildReorderPlan } from "../../src/order/reorder.js";
import { priceBowlDraft } from "../../src/order/pricing.js";

const drink = { catalogId: "coca-zero", name: "Coca-Cola Zero", price: 35, categoryKey: "drinks" };
const soup = { catalogId: "miso-soup", name: "Sopa Miso", price: 50, categoryKey: "soups" };
const combo = { catalogId: "combo-palace", name: "Combo Palace", price: 289, isCombo: true };
const houseBowl = { catalogId: "bowl-the-og", name: "The OG" };
const cake = { catalogId: "miel-rice-cake", name: "Miel Rice Cake" };
const catalog = Object.fromEntries([drink, soup, combo, houseBowl, cake].map((p) => [p.catalogId, p]));
const item = (product, qty = 1) => ({ kind: "item", ...product, qty });
const bowl = { kind: "bowl", base: "white_rice", proteins: ["tuna"], extraScoopProteins: ["tuna", "tuna"] };
const past = { customer: "Cliente anterior", phone: "anterior", fulfillment: "pickup", cartItems: [bowl] };
const current = {
  cart: [{ ...item(drink), cartId: "original" }],
  customer: "Cliente actual",
  phone: "actual",
  fulfillment: "dine_in",
  notes: "Sin cubiertos",
  promoCode: "PROMO",
  bases: ["quinoa"],
  editingCartId: null,
  draftStep: 1,
};

const prepare = (order, stock = {}) => buildReorderPlan(
  order,
  {
    unavailableItems: [], unavailableCatalogItems: [], hiddenIngredients: [], hiddenCatalogItems: [],
    comboPalaceActive: true, promo2x1Active: true, ...stock,
  },
  "es",
  catalog,
  (_category, id) => ({ salmon: "Salmón", mango: "Mango" })[id] || id,
);

function apply(order, plan, mode) {
  let sequence = 0;
  return applyReorderPlan(order, past, plan, mode, () => `nueva-${++sequence}`);
}

test("agregar conserva la bebida, el borrador del bowl y los datos del checkout actual", () => {
  const before = structuredClone(current);
  const result = apply(current, prepare(past), "append");
  const { cart, ...checkoutAndDraft } = result;
  const { cart: originalCart, ...originalFields } = before;
  assert.deepEqual(checkoutAndDraft, originalFields);
  assert.deepEqual(cart[0], originalCart[0]);
  assert.equal(cart.length, 2);
  assert.equal(cart[1].kind, "bowl");
  assert.ok(cart[1].cartId && cart[1].cartId !== cart[0].cartId);
  assert.deepEqual(current, before);
});

test("reemplazar quita las líneas anteriores y conserva el checkout actual", () => {
  const result = apply(current, prepare(past), "replace");
  assert.deepEqual(result.cart.map((line) => line.kind), ["bowl"]);
  assert.equal(result.customer, current.customer);
  assert.equal(result.fulfillment, current.fulfillment);
  assert.equal(result.notes, current.notes);
});

test("si todos los productos están agotados, ni reemplazar ni agregar vacían el carrito", () => {
  const plan = prepare({ cartItems: [item(soup)] }, { unavailableCatalogItems: [soup.catalogId] });
  assert.deepEqual(plan.cart, []);
  assert.match(plan.unavailable.join(" "), /Sopa Miso/i);
  for (const mode of ["append", "replace"]) assert.deepEqual(apply(current, plan, mode), current);
});

test("avisa qué ingredientes faltan y conserva los scoops de proteínas disponibles con su precio", () => {
  const previousBowl = {
    ...bowl,
    proteins: ["tuna", "salmon"],
    extraScoopProteins: ["salmon", "tuna", "tuna"],
    complements: ["mango", "cucumber"],
  };
  const plan = prepare({ cartItems: [previousBowl, item(soup, 2)] }, {
    unavailableItems: ["salmon"],
    hiddenIngredients: ["mango"],
  });
  assert.equal(plan.cart.length, 2);
  const [availableBowl, availableSoup] = plan.cart;
  assert.deepEqual(availableBowl.proteins, ["tuna"]);
  assert.deepEqual(availableBowl.complements, ["cucumber"]);
  assert.deepEqual(availableBowl.extraScoopProteins, ["tuna", "tuna"]);
  assert.equal(availableBowl.price, priceBowlDraft(availableBowl));
  assert.equal(availableSoup.qty, 2);
  assert.match(plan.unavailable.join(" "), /Salmón/i);
  assert.match(plan.unavailable.join(" "), /Mango/i);
});

test("agregar un artículo que ya está en el carrito suma las cantidades con el mismo identificador", () => {
  const result = apply(current, prepare({ cartItems: [item(drink, 2)] }), "append");
  assert.equal(result.cart.length, 1);
  assert.equal(result.cart[0].qty, 3);
  assert.equal(result.cart[0].cartId, "original");
  assert.equal(current.cart[0].qty, 1);
});

test("un pedido anterior al carrito se recupera como un bowl y mantiene sus porciones extra", () => {
  const plan = prepare({ base: "white_rice", protein: "tuna", extraScoopProteins: ["tuna"] });
  assert.deepEqual(plan.unavailable, []);
  assert.equal(plan.cart.length, 1);
  assert.deepEqual(plan.cart[0].bases, ["white_rice"]);
  assert.deepEqual(plan.cart[0].extraScoopProteins, ["tuna"]);
});

test("si se agota la bebida de un combo, avisa del combo y conserva los otros productos", () => {
  const previousCombo = {
    ...item(combo), comboBowlId: houseBowl.catalogId, comboDrinkId: drink.catalogId, comboRiceCakeId: cake.catalogId,
  };
  const plan = prepare({ cartItems: [previousCombo, { ...item(soup, 2), price: 1 }] }, {
    hiddenCatalogItems: [drink.catalogId],
  });
  assert.deepEqual(plan.cart.map((line) => line.catalogId), [soup.catalogId]);
  assert.equal(plan.cart[0].price, soup.price);
  assert.match(plan.unavailable.join(" "), /Combo Palace/);
  assert.match(plan.unavailable.join(" "), /Coca-Cola Zero/);
});

test("una promoción 2x1 solo se agrega si aplica hoy y conserva los dos bowls", () => {
  const promo = { kind: "promo2x1", protein: "tuna", bowls: [{ base: "white_rice" }, { base: "quinoa" }] };
  const active = prepare({ cartItems: [promo] });
  assert.deepEqual(active.cart[0].bowls.map((b) => b.base), ["white_rice", "quinoa"]);
  assert.deepEqual(active.unavailable, []);
  const inactive = prepare({ cartItems: [promo] }, { promo2x1Active: false });
  assert.equal(inactive.cart.length, 0);
  assert.match(inactive.unavailable.join(" "), /2x1/);
});
