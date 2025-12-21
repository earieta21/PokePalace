import React, { createContext, useContext, useState } from "react";

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [order, setOrder] = useState({
    base: "",
    protein: "",
    marinades: [],
    sauces: [],
    complements: [],
    toppings: [],
  });

  const updateOrder = (type, items) => {
    setOrder((prevOrder) => ({
      ...prevOrder,
      [type]: items,
    }));
  };

  return (
    <OrderContext.Provider value={{ order, updateOrder }}>
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
