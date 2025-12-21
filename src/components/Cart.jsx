import React from "react";
import "./Cart.css";

const Cart = ({ cartItems, onRemove, onCheckout }) => {
  const calculateTotal = () => {
    return cartItems
      .reduce((total, item) => total + item.price * item.quantity, 0)
      .toFixed(2);
  };

  return (
    <div className="cart">
      <h2>Your Cart</h2>
      {cartItems.length > 0 ? (
        <div>
          <ul>
            {cartItems.map((item) => (
              <li key={item.id} className="cart-item">
                <img src={item.img} alt={item.name} className="cart-item-img" />
                <div className="cart-item-info">
                  <h4>{item.name}</h4>
                  <p>Price: ${item.price.toFixed(2)}</p>
                  <p>Quantity: {item.quantity}</p>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  className="remove-btn"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="cart-total">
            <h3>Total: ${calculateTotal()}</h3>
            <button onClick={onCheckout} className="checkout-btn">
              Checkout
            </button>
          </div>
        </div>
      ) : (
        <p>Your cart is empty.</p>
      )}
    </div>
  );
};

export default Cart;
