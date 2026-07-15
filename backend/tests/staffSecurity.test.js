import { test } from "node:test";
import assert from "node:assert/strict";

import { computeBowlSubtotal } from "../pricing.js";
import {
  canAssignStaffRole,
  canManageStaffRole,
  isRoleAllowed,
  manageableRolesFor,
} from "../utils/staffRoles.js";
import {
  getPosInventoryDemand,
  getUnavailablePosSelections,
  PosOrderValidationError,
  normalizePosClientOrderId,
  resolvePosItems,
  sanitizePosBowl,
  sanitizePosRewardTopping,
} from "../config/posCatalog.js";

test("clientOrderId acepta ids estables y rechaza valores ambiguos", () => {
  assert.equal(normalizePosClientOrderId(" pos:terminal-1:00042 "), "pos:terminal-1:00042");
  assert.equal(normalizePosClientOrderId(null), null);
  assert.throws(() => normalizePosClientOrderId("corto"), PosOrderValidationError);
  assert.throws(() => normalizePosClientOrderId("id con espacios"), PosOrderValidationError);
});

test("un gerente administra roles operativos pero nunca eleva privilegios", () => {
  assert.equal(canAssignStaffRole("manager", "employee"), true);
  assert.equal(canAssignStaffRole("manager", "cashier"), false);
  assert.equal(canAssignStaffRole("manager", "kitchen"), false);
  assert.equal(canAssignStaffRole("manager", "manager"), false);
  assert.equal(canAssignStaffRole("manager", "admin"), false);
  assert.equal(canAssignStaffRole("manager", "owner"), false);
  assert.equal(canManageStaffRole("manager", "admin"), false);
  assert.equal(canManageStaffRole("manager", "owner"), false);
  assert.equal(canManageStaffRole("manager", "cashier"), true);
});

test("admin delega gerencia pero solo owner administra roles protegidos", () => {
  assert.equal(canAssignStaffRole("admin", "manager"), true);
  assert.equal(canAssignStaffRole("admin", "admin"), false);
  assert.equal(canAssignStaffRole("admin", "owner"), false);
  assert.equal(canManageStaffRole("admin", "admin"), false);
  assert.equal(canManageStaffRole("admin", "owner"), false);
  assert.equal(canAssignStaffRole("owner", "admin"), true);
  assert.equal(canManageStaffRole("owner", "owner"), true);
  assert.deepEqual(manageableRolesFor("manager").sort(), ["cashier", "employee", "kitchen"]);
});

test("las matrices de rutas distinguen cocina, caja y empleado general", () => {
  const readers = ["cashier", "kitchen", "manager", "admin", "owner"];
  const sellers = ["cashier", "manager", "admin", "owner"];
  assert.equal(isRoleAllowed("kitchen", readers), true);
  assert.equal(isRoleAllowed("kitchen", sellers), false);
  assert.equal(isRoleAllowed("cashier", sellers), true);
  assert.equal(isRoleAllowed("employee", readers), false);
});

test("el POS ignora precio y nombre manipulados cuando recibe un id de catálogo", () => {
  const [item] = resolvePosItems([{
    catalogId: "coconut-water",
    name: "Producto inventado",
    price: 0.01,
    qty: 2,
  }]);
  assert.equal(item.name, "Agua de Coco");
  assert.equal(item.price, 55);
  assert.equal(item.qty, 2);
});

test("el POS mantiene compatibilidad por nombre exacto sin confiar en price", () => {
  const [item] = resolvePosItems([{ name: "Edamame", price: 9999, qty: 1 }]);
  assert.equal(item.catalogId, "edamame");
  assert.equal(item.price, 69);
});

test("el POS rechaza productos, ids y cantidades fuera del catálogo", () => {
  assert.throws(
    () => resolvePosItems([{ name: "Artículo secreto", price: 1, qty: 1 }]),
    PosOrderValidationError
  );
  assert.throws(
    () => resolvePosItems([{ id: 999, name: "Edamame", price: 1, qty: 1 }]),
    PosOrderValidationError
  );
  assert.throws(
    () => resolvePosItems([{ catalogId: "edamame", qty: 1.5 }]),
    PosOrderValidationError
  );
});

test("el POS agrupa productos repetidos y limita su cantidad total", () => {
  const [item] = resolvePosItems([
    { catalogId: "miso-soup", qty: 2 },
    { name: "Sopa de Miso", price: 0, qty: 3 },
  ]);
  assert.equal(item.qty, 5);
  assert.throws(
    () => resolvePosItems([
      { catalogId: "miso-soup", qty: 60 },
      { catalogId: "miso-soup", qty: 40 },
    ]),
    PosOrderValidationError
  );
});

test("el inventario POS multiplica qty y desglosa recetas de bowls predefinidos", () => {
  const items = resolvePosItems([
    { catalogId: "bowl-tuna-classic", qty: 2 },
    { catalogId: "edamame", qty: 3 },
  ]);
  const demand = getPosInventoryDemand({ items });

  assert.equal(demand.white_rice, 2);
  assert.equal(demand.tuna, 2);
  assert.equal(demand.cucumber, 2);
  assert.equal(demand.soy_sauce, 2);
  // Dos porciones dentro de los bowls, más tres entradas independientes.
  assert.equal(demand.edamame, 5);
});

test("el inventario POS suma ingredientes compartidos del bowl personalizado", () => {
  const demand = getPosInventoryDemand({
    base: "white_rice",
    proteins: ["tuna", "seared_tuna"],
    complements: ["cucumber"],
    toppings: ["sesame_seeds"],
    rewardExtraTopping: "sesame_seeds",
    items: [{ catalogId: "bowl-tuna-classic", name: "Bowl Clásico de Atún", qty: 1 }],
  });

  assert.equal(demand.white_rice, 2);
  assert.equal(demand.tuna, 2);
  assert.equal(demand.seared_tuna, 1);
  assert.equal(demand.cucumber, 2);
  assert.equal(demand.sesame_seeds, 3);
});

test("el servidor detecta productos e ingredientes agotados aunque el POS esté desactualizado", () => {
  const items = resolvePosItems([
    { catalogId: "bowl-salmon-avocado", qty: 1 },
    { catalogId: "coconut-water", qty: 1 },
  ]);
  const bowl = sanitizePosBowl({
    base: "white_rice",
    proteins: ["tuna", "shrimp"],
    toppings: ["furikake"],
  });

  assert.deepEqual(
    getUnavailablePosSelections({
      items,
      bowl,
      unavailableItems: ["salmon", "coconut-water", "furikake", "not-selected"],
    }),
    ["coconut-water", "furikake", "salmon"]
  );
});

test("el topping Rewards se limita al catálogo operativo", () => {
  assert.equal(sanitizePosRewardTopping("furikake"), "furikake");
  assert.throws(() => sanitizePosRewardTopping("topping_inventado"), PosOrderValidationError);
  assert.deepEqual(
    getUnavailablePosSelections({ rewardTopping: "furikake", unavailableItems: ["furikake"] }),
    ["furikake"]
  );
});

test("el tamaño y precio del bowl se derivan de proteínas validadas", () => {
  const bowl = sanitizePosBowl({
    base: "white_rice",
    proteins: ["salmon", "tuna", "shrimp"],
    marinades: ["ponzu_marinade"],
    complements: ["avocado"],
    sauces: ["spicy_mayo"],
    toppings: ["furikake"],
  });
  assert.equal(bowl.bowlSize, "large");
  assert.equal(computeBowlSubtotal(bowl.bowlSize), 289);
});

test("el bowl personalizado rechaza duplicados, ingredientes falsos y excesos", () => {
  assert.throws(
    () => sanitizePosBowl({ base: "white_rice", proteins: ["salmon", "salmon"] }),
    PosOrderValidationError
  );
  assert.throws(
    () => sanitizePosBowl({ base: "base_falsa", proteins: ["salmon", "tuna"] }),
    PosOrderValidationError
  );
  assert.throws(
    () => sanitizePosBowl({
      base: "white_rice",
      proteins: ["salmon", "tuna"],
      sauces: ["spicy_mayo", "soy_sauce", "ponzu_sauce"],
    }),
    PosOrderValidationError
  );
});
