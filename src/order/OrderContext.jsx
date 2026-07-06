import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const OrderContext = createContext();
const ORDER_STORAGE_KEY = "pokePalaceOrderDraft";

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
    setOrder((prevOrder) => ({
      ...prevOrder,
      base: favorite.base || "",
      proteins: favorite.proteins || [],
      protein: (favorite.proteins || []).join(", "),
      bowlSize: favorite.bowlSize || "normal",
      marinades: favorite.marinades || [],
      complements: favorite.complements || [],
      sauces: favorite.sauces || [],
      toppings: favorite.toppings || [],
    }));
  }, []);

  const reorder = useCallback((pastOrder) => {
    setOrder((prev) => ({
      ...prev,
      base: pastOrder.base || "",
      proteins: pastOrder.proteins || [],
      protein: (pastOrder.proteins || []).join(", "),
      bowlSize: pastOrder.bowlSize || "normal",
      marinades: pastOrder.marinades || [],
      complements: pastOrder.complements || [],
      sauces: pastOrder.sauces || [],
      toppings: pastOrder.toppings || [],
      customer: pastOrder.customer || prev.customer,
      phone: pastOrder.phone || prev.phone,
      fulfillment: pastOrder.fulfillment || "pickup",
      paymentMethod: "pay_at_pickup",
      promoCode: "",
      notes: "",
      draftStep: 0,
    }));
  }, []);

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
