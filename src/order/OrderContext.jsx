import React, { createContext, useContext, useState } from "react";

const OrderContext = createContext();

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
});

export const OrderProvider = ({ children }) => {
  const [order, setOrder] = useState(blankOrder);

  const updateOrder = (type, items) => {
    setOrder((prevOrder) => ({
      ...prevOrder,
      [type]: items,
    }));
  };

  const updateCheckout = (field, value) => {
    setOrder((prevOrder) => ({
      ...prevOrder,
      [field]: value,
    }));
  };

  const loadFavorite = (favorite) => {
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
  };

  // Used by the self-service kiosk to wipe a session clean between customers.
  const resetOrder = () => setOrder(blankOrder());

  return (
    <OrderContext.Provider value={{ order: { ...order, updateCheckout }, updateOrder, loadFavorite, resetOrder }}>
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
