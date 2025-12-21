import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import OrderPage from "./order/OrderPage";
import RewardsDeals from "./pages/Promotions";
import EarnPoints from "./pages/EarnPoints";
import MoreOptions from "./more/MoreOptions";
import { OrderProvider } from "./order/OrderContext";

const App = () => {
  return (
    <Router>
      <OrderProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/order" element={<OrderPage />} />
          <Route path="/rewards-deals" element={<RewardsDeals />} />
          <Route path="/earn-points" element={<EarnPoints />} />
          <Route path="/more-options" element={<MoreOptions />} />
        </Routes>

        <Navbar />
      </OrderProvider>
    </Router>
  );
};

export default App;
