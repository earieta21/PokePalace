import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAvailability } from "../context/AvailabilityContext";

const OrderContext = createContext();
const ORDER_STORAGE_KEY = "pokePalaceOrderDraft";

// Quita del bowl cargado (favorito, quick bowl o repetir pedido) cualquier
// ingrediente que hoy esté marcado como no disponible, para que nunca se
// cargue en el borrador algo que el cliente no podría seleccionar a mano.
const filterAvailable = (list, unavailableSet) =>
  (Array.isArray(list) ? list : []).filter((id) => !unavailableSet.has(id));

const blankOrder = () => ({
  base: "",
  protein: "",
  proteins: [],
  bowlSize: "normal",
  proteinUpcharge: 0,
  marinades: [],
  sauces: [],
  complements: [],
  toppings: [],
  extraScoopProteins: [],
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

  const loadFavorite = useCallback((favorite) => {
    const unavailable = new Set(unavailableItems);
    const proteins = filterAvailable(favorite.proteins, unavailable);
    setOrder((prevOrder) => ({
      ...prevOrder,
      base: favorite.base && !unavailable.has(favorite.base) ? favorite.base : "",
      proteins,
      protein: proteins.join(", "),
      // Se recalcula a partir de las proteínas que sobrevivieron el filtro
      // de disponibilidad — no del bowlSize guardado, que puede haber
      // quedado obsoleto si se quitó una proteína no disponible.
      bowlSize: proteins.length === 3 ? "large" : "normal",
      // Los marinados ya no forman parte del armador — se ignoran aunque el
      // favorito o pedido guardado los traiga de antes.
      marinades: [],
      complements: filterAvailable(favorite.complements, unavailable),
      sauces: filterAvailable(favorite.sauces, unavailable),
      toppings: filterAvailable(favorite.toppings, unavailable),
      extraScoopProteins: [],
    }));
  }, [unavailableItems]);

  const reorder = useCallback((pastOrder) => {
    const unavailable = new Set(unavailableItems);
    const proteins = filterAvailable(pastOrder.proteins, unavailable);
    setOrder((prev) => ({
      ...prev,
      base: pastOrder.base && !unavailable.has(pastOrder.base) ? pastOrder.base : "",
      proteins,
      protein: proteins.join(", "),
      bowlSize: proteins.length === 3 ? "large" : "normal",
      marinades: [],
      complements: filterAvailable(pastOrder.complements, unavailable),
      sauces: filterAvailable(pastOrder.sauces, unavailable),
      toppings: filterAvailable(pastOrder.toppings, unavailable),
      extraScoopProteins: [],
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
    () => ({ order: { ...order, updateCheckout }, updateOrder, loadFavorite, reorder, resetOrder }),
    [order, loadFavorite, reorder, resetOrder, updateCheckout, updateOrder]
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
