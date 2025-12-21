import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { OrderProvider } from "../src/order/OrderContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <OrderProvider>
    <App />
  </OrderProvider>
);
