import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAvailability } from "../context/AvailabilityContext";
import { computeBowlSubtotal, computeExtrasSubtotal } from "./pricing";

const OrderContext = createContext();
const ORDER_STORAGE_KEY = "pokePalaceOrderDraft";

// Campos del bowl que se está armando ahora mismo (el "borrador") — todo lo
// demás en `order` (carrito ya confirmado, datos de checkout) sobrevive a un
// reset del borrador. Mantenerlos en una sola lista evita el bug de resetear
// por accidente los datos de checkout que el cliente ya llenó.
const blankBowlDraft = () => ({
  base: "",
  bases: [],
  protein: "",
  proteins: [],
  bowlSize: "normal",
  proteinUpcharge: 0,
  marinades: [],
  sauces: [],
  complements: [],
  toppings: [],
  extraScoopProteins: [],
});

let cartIdSeq = 0;
const generateCartId = () => `line-${Date.now().toString(36)}-${(cartIdSeq++).toString(36)}`;

const round2 = (n) => Math.round(n * 100) / 100;

const priceBowlDraft = (draft) => round2(
  computeBowlSubtotal(draft.bowlSize) + computeExtrasSubtotal({
    extraScoops: draft.extraScoopProteins.length,
    complementsCount: draft.complements.length,
    proteins: draft.proteins,
  })
);

// Quita del bowl cargado (favorito, quick bowl o repetir pedido) cualquier
// ingrediente que hoy esté marcado como no disponible, para que nunca se
// cargue en el borrador algo que el cliente no podría seleccionar a mano.
const filterAvailable = (list, unavailableSet) =>
  (Array.isArray(list) ? list : []).filter((id) => !unavailableSet.has(id));

const blankOrder = () => ({
  ...blankBowlDraft(),
  cart: [],
  editingCartId: null,
  customer: "",
  phone: "",
  notes: "",
  fulfillment: "pickup",
  paymentMethod: "pay_at_pickup",
  promoCode: "",
  discountAmount: 0,
  scheduledPickupTime: "",
  isScheduled: false,
  draftStep: 0,
});

const loadSavedOrder = () => {
  try {
    const saved = localStorage.getItem(ORDER_STORAGE_KEY);
    return saved ? { ...blankOrder(), ...JSON.parse(saved) } : blankOrder();
  } catch {
    return blankOrder();
  }
};

export const OrderProvider = ({ children }) => {
  const [order, setOrder] = useState(loadSavedOrder);
  const { unavailableItems } = useAvailability();

  useEffect(() => {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const updateOrder = useCallback((type, items) => {
    setOrder((prevOrder) => ({
      ...prevOrder,
      [type]: items,
    }));
  }, []);

  const updateCheckout = useCallback((field, value) => {
    setOrder((prevOrder) => ({
      ...prevOrder,
      [field]: value,
    }));
  }, []);

  // Confirma el bowl que se está armando como una línea del carrito — si
  // `editingCartId` está activo, reemplaza esa línea en vez de agregar una
  // nueva. Deja el borrador listo para empezar otro bowl.
  const addBowlToCart = useCallback(() => {
    setOrder((prev) => {
      const line = {
        cartId: prev.editingCartId || generateCartId(),
        kind: "bowl",
        base: prev.base,
        bases: prev.bases,
        proteins: prev.proteins,
        bowlSize: prev.bowlSize,
        marinades: prev.marinades,
        complements: prev.complements,
        sauces: prev.sauces,
        toppings: prev.toppings,
        extraScoopProteins: prev.extraScoopProteins,
        price: priceBowlDraft(prev),
        qty: 1,
      };
      const cart = prev.editingCartId
        ? prev.cart.map((l) => (l.cartId === prev.editingCartId ? line : l))
        : [...prev.cart, line];
      return { ...prev, ...blankBowlDraft(), editingCartId: null, cart, draftStep: 0 };
    });
  }, []);

  // Limpia el borrador para empezar un bowl nuevo sin tocar el carrito ya
  // confirmado ni los datos de checkout.
  const startNewBowl = useCallback(() => {
    setOrder((prev) => ({ ...prev, ...blankBowlDraft(), editingCartId: null, draftStep: 0 }));
  }, []);

  // Carga una línea de bowl ya en el carrito de vuelta al borrador para
  // editarla — al terminar el armador, addBowlToCart() la reemplaza en vez
  // de agregar una línea nueva.
  const editCartBowl = useCallback((cartId) => {
    setOrder((prev) => {
      const line = prev.cart.find((l) => l.cartId === cartId && l.kind === "bowl");
      if (!line) return prev;
      return {
        ...prev,
        base: line.base,
        bases: line.bases,
        protein: (line.proteins || []).join(", "),
        proteins: line.proteins,
        bowlSize: line.bowlSize,
        proteinUpcharge: line.proteins?.length === 3 ? 1 : 0,
        marinades: line.marinades,
        complements: line.complements,
        sauces: line.sauces,
        toppings: line.toppings,
        extraScoopProteins: line.extraScoopProteins,
        editingCartId: cartId,
        draftStep: 0,
      };
    });
  }, []);

  // Agrega un artículo del catálogo (bebida, entrada, bowl de la casa) al
  // carrito — si ya estaba, solo suma la cantidad.
  const addCatalogItem = useCallback((catalogItem, qty = 1) => {
    setOrder((prev) => {
      const existingIndex = prev.cart.findIndex(
        (l) => l.kind === "item" && l.catalogId === catalogItem.catalogId
      );
      const cart = existingIndex === -1
        ? [...prev.cart, {
            cartId: generateCartId(),
            kind: "item",
            catalogId: catalogItem.catalogId,
            name: catalogItem.name,
            price: catalogItem.price,
            qty,
          }]
        : prev.cart.map((l, i) => (i === existingIndex ? { ...l, qty: l.qty + qty } : l));
      return { ...prev, cart };
    });
  }, []);

  const updateCartItemQty = useCallback((cartId, qty) => {
    setOrder((prev) => ({
      ...prev,
      cart: qty > 0
        ? prev.cart.map((l) => (l.cartId === cartId ? { ...l, qty } : l))
        : prev.cart.filter((l) => l.cartId !== cartId),
    }));
  }, []);

  const removeCartLine = useCallback((cartId) => {
    setOrder((prev) => ({
      ...prev,
      cart: prev.cart.filter((l) => l.cartId !== cartId),
      editingCartId: prev.editingCartId === cartId ? null : prev.editingCartId,
    }));
  }, []);

  // Favoritos guardados: precargan el borrador (no el carrito) para que el
  // cliente los revise/edite en el armador antes de agregarlos, igual que
  // armar cualquier otro bowl desde cero.
  const loadFavorite = useCallback((favorite) => {
    const unavailable = new Set(unavailableItems);
    const proteins = filterAvailable(favorite.proteins, unavailable);
    // Los favoritos guardados antes de "mitad y mitad" solo traen `base`
    // (string) — se envuelve en un arreglo de 1 para tratarlo igual.
    const favoriteBases = Array.isArray(favorite.bases) && favorite.bases.length > 0
      ? favorite.bases
      : favorite.base ? [favorite.base] : [];
    const bases = filterAvailable(favoriteBases, unavailable);
    setOrder((prevOrder) => ({
      ...prevOrder,
      base: bases[0] || "",
      bases,
      proteins,
      protein: proteins.join(", "),
      // Se recalcula a partir de las proteínas que sobrevivieron el filtro
      // de disponibilidad — no del bowlSize guardado, que puede haber
      // quedado obsoleto si se quitó una proteína no disponible.
      bowlSize: proteins.length === 3 ? "large" : "normal",
      marinades: filterAvailable(favorite.marinades, unavailable),
      complements: filterAvailable(favorite.complements, unavailable),
      sauces: filterAvailable(favorite.sauces, unavailable),
      toppings: filterAvailable(favorite.toppings, unavailable),
      // Un scoop extra solo tiene sentido si su proteína sobrevivió el
      // filtro de disponibilidad — igual que valida normalizeExtraScoops
      // en el backend.
      extraScoopProteins: (Array.isArray(favorite.extraScoopProteins) ? favorite.extraScoopProteins : [])
        .filter((id) => proteins.includes(id)),
      editingCartId: null,
      draftStep: 0,
    }));
  }, [unavailableItems]);

  // Reconstruye un carrito completo a partir de un pedido anterior — usa
  // `cartItems` si el pedido ya lo trae; envuelve un pedido legado de un
  // solo bowl en un carrito de 1 línea. Salta cualquier línea que ya no
  // pueda armarse (ej. todas sus proteínas dejaron de estar disponibles).
  const reorder = useCallback((pastOrder) => {
    const unavailable = new Set(unavailableItems);

    const sourceLines = Array.isArray(pastOrder.cartItems) && pastOrder.cartItems.length > 0
      ? pastOrder.cartItems
      : [{
          kind: "bowl",
          base: pastOrder.base,
          bases: pastOrder.bases,
          proteins: pastOrder.proteins,
          bowlSize: pastOrder.bowlSize,
          marinades: pastOrder.marinades,
          complements: pastOrder.complements,
          sauces: pastOrder.sauces,
          toppings: pastOrder.toppings,
        }];

    const cart = sourceLines
      .map((line) => {
        if (line.kind === "item") {
          if (unavailable.has(line.catalogId)) return null;
          return {
            cartId: generateCartId(),
            kind: "item",
            catalogId: line.catalogId,
            name: line.name,
            price: line.price,
            qty: line.qty || 1,
          };
        }
        const proteins = filterAvailable(line.proteins, unavailable);
        if (proteins.length === 0) return null;
        const lineBases = Array.isArray(line.bases) && line.bases.length > 0
          ? line.bases
          : line.base ? [line.base] : [];
        const bases = filterAvailable(lineBases, unavailable);
        if (bases.length === 0) return null;
        const bowlDraft = {
          ...blankBowlDraft(),
          bases,
          proteins,
          bowlSize: proteins.length === 3 ? "large" : "normal",
          marinades: filterAvailable(line.marinades, unavailable),
          complements: filterAvailable(line.complements, unavailable),
          sauces: filterAvailable(line.sauces, unavailable),
          toppings: filterAvailable(line.toppings, unavailable),
        };
        return {
          cartId: generateCartId(),
          kind: "bowl",
          base: bases[0],
          bases,
          proteins,
          bowlSize: bowlDraft.bowlSize,
          marinades: bowlDraft.marinades,
          complements: bowlDraft.complements,
          sauces: bowlDraft.sauces,
          toppings: bowlDraft.toppings,
          extraScoopProteins: [],
          price: priceBowlDraft(bowlDraft),
          qty: 1,
        };
      })
      .filter(Boolean);

    setOrder((prev) => ({
      ...prev,
      ...blankBowlDraft(),
      editingCartId: null,
      cart,
      customer: pastOrder.customer || prev.customer,
      phone: pastOrder.phone || prev.phone,
      fulfillment: pastOrder.fulfillment || "pickup",
      paymentMethod: "pay_at_pickup",
      promoCode: "",
      notes: "",
      draftStep: 0,
    }));
  }, [unavailableItems]);

  // Used by the self-service kiosk to wipe a session clean between customers.
  const resetOrder = useCallback(() => {
    setOrder(blankOrder());
    localStorage.removeItem(ORDER_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      order: { ...order, updateCheckout },
      updateOrder,
      addBowlToCart,
      startNewBowl,
      editCartBowl,
      addCatalogItem,
      updateCartItemQty,
      removeCartLine,
      loadFavorite,
      reorder,
      resetOrder,
    }),
    [
      order, updateOrder, addBowlToCart, startNewBowl, editCartBowl, addCatalogItem,
      updateCartItemQty, removeCartLine, loadFavorite, reorder, resetOrder, updateCheckout,
    ]
  );

  return (
    <OrderContext.Provider value={value}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrder = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder must be used within an OrderProvider");
  }
  return context;
};