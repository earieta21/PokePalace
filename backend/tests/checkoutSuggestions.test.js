import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPosCatalogItem } from "../config/posCatalog.js";
import { CUSTOMER_EXCLUDED_CATALOG_IDS } from "../utils/customerOrder.js";
import { SUGGESTION_SLOTS, checkoutSuggestionIds } from "../../src/order/checkoutSuggestionRules.js";

// Categorías como en src/data/customerCatalog.js (categoryKey). Ese archivo
// importa fotos y Node no lo puede cargar.
const CATEGORY = {
  "combo-palace": "combos",
  "bowl-the-og": "bowls",
  "bowl-skinny": "bowls",
  "bowl-quinoa": "bowls",
  "miso-soup": "soups",
  "mineral-water": "drinks",
  "coca-zero": "drinks",
  "coca-cola-regular": "drinks",
  "bottled-water": "drinks",
  "agua-del-dia": "drinks",
  "choco-rice-cake": "extras",
  "miel-rice-cake": "extras",
};
const categoryOf = (id) => CATEGORY[id];
const suggest = (cart, options = {}) => checkoutSuggestionIds(cart, { categoryOf, ...options });

const bowl = { kind: "bowl", cartId: "b1", qty: 1 };
const item = (catalogId, extra = {}) => ({ kind: "item", cartId: catalogId, catalogId, qty: 1, ...extra });

test("con un bowl se sugiere bebida, sopa miso y rice cake", () => {
  assert.deepEqual(suggest([bowl]), ["agua-del-dia", "miso-soup", "choco-rice-cake"]);
  // También con el 2x1 o un bowl de la casa.
  assert.deepEqual(suggest([{ kind: "promo2x1", cartId: "p1", qty: 1 }]), ["agua-del-dia", "miso-soup", "choco-rice-cake"]);
  assert.deepEqual(suggest([item("bowl-the-og")]), ["agua-del-dia", "miso-soup", "choco-rice-cake"]);
});

test("sin bowl, o con el Combo Palace, no se sugiere nada", () => {
  assert.deepEqual(suggest([]), []);
  assert.deepEqual(suggest(null), []);
  assert.deepEqual(suggest([item("coca-zero"), item("miso-soup")]), []);
  // El combo ya trae bebida y rice cake, aunque también haya otro bowl.
  assert.deepEqual(suggest([bowl, item("combo-palace", { comboDrinkId: "coca-zero" })]), []);
});

test("no se ofrece lo que el pedido ya trae de ese grupo", () => {
  assert.deepEqual(suggest([bowl, item("coca-zero")]), ["miso-soup", "choco-rice-cake"]);
  assert.deepEqual(suggest([bowl, item("miel-rice-cake"), item("miso-soup")]), ["agua-del-dia"]);
  assert.deepEqual(suggest([bowl, item("agua-del-dia"), item("miso-soup"), item("choco-rice-cake")]), []);
});

test("si algo está agotado u oculto se ofrece lo siguiente del grupo, o nada", () => {
  const out = new Set(["agua-del-dia", "coca-cola-regular", "miso-soup", "choco-rice-cake"]);
  assert.deepEqual(
    suggest([bowl], { isUnavailable: (id) => out.has(id) }),
    ["mineral-water", "miel-rice-cake"],
  );
});

test("lo que se agregó desde aquí se queda en su lugar para cambiar la cantidad", () => {
  const cart = [bowl, item("agua-del-dia", { qty: 2 })];
  assert.deepEqual(suggest(cart), ["miso-soup", "choco-rice-cake"]);
  assert.deepEqual(suggest(cart, { keepIds: ["agua-del-dia"] }), ["agua-del-dia", "miso-soup", "choco-rice-cake"]);
  // Aunque lo quite del todo, la tarjeta sigue ahí para volver a agregarlo.
  assert.deepEqual(suggest([bowl], { keepIds: ["agua-del-dia"] }), ["agua-del-dia", "miso-soup", "choco-rice-cake"]);
});

test("las categorías de esta prueba son las del catálogo del portal", () => {
  // Se lee como texto: cada artículo empieza en su `catalogId:` y trae su categoryKey.
  const source = readFileSync(new URL("../../src/data/customerCatalog.js", import.meta.url), "utf8");
  const portal = Object.fromEntries(source.split(/catalogId:\s*/).slice(1).map((block) => [
    block.match(/^"([^"]+)"/)?.[1],
    block.match(/categoryKey:\s*"([^"]+)"/)?.[1],
  ]));
  for (const [id, category] of Object.entries(CATEGORY)) {
    assert.equal(portal[id], category, `${id} en src/data/customerCatalog.js`);
  }
});

test("todo lo sugerido existe en el catálogo del servidor y se puede pedir en línea", () => {
  for (const { category, candidates } of SUGGESTION_SLOTS) {
    for (const id of candidates) {
      assert.ok(getPosCatalogItem(id), `${id} no existe en el catálogo del servidor`);
      assert.equal(CUSTOMER_EXCLUDED_CATALOG_IDS.has(id), false, `${id} no se vende en línea`);
      assert.equal(categoryOf(id), category, `${id} no es de ${category}`);
    }
  }
});
