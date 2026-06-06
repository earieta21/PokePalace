import React, { createContext, useContext, useState } from "react";

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [order, setOrder] = useState({
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
  });

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

  return (
    <OrderContext.Provider value={{ order: { ...order, updateCheckout }, updateOrder }}>
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
