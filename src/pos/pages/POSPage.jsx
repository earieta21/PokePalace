import { useState, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const MENU = [
  { id: 1,  name: "Bowl Clásico de Atún",    price: 14.50 },
  { id: 2,  name: "Bowl Salmón y Aguacate",  price: 15.00 },
  { id: 3,  name: "Bowl Camarón Picante",    price: 13.50 },
  { id: 4,  name: "Bowl Vegano",             price: 12.00 },
  { id: 5,  name: "Pollo Teriyaki",          price: 13.00 },
  { id: 6,  name: "Edamame",                 price:  4.50 },
  { id: 7,  name: "Sopa de Miso",            price:  3.50 },
  { id: 8,  name: "Ensalada de Algas",       price:  5.00 },
  { id: 9,  name: "Agua de Coco",            price:  4.00 },
  { id: 10, name: "Limonada de Matcha",      price:  4.50 },
  { id: 11, name: "Agua Mineral",            price:  2.50 },
  { id: 12, name: "Smoothie de Mango",       price:  5.50 },
];

const IVA = 0.16;

export default function POSPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [cart, setCart]         = useState([]);
  const [cliente, setCliente]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState("");
  const [error, setError]       = useState("");

  const addItem = (item) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === item.id);
      if (ex) return prev.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
    setSuccess(""); setError("");
  };

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const iva      = subtotal * IVA;
  const total    = subtotal + iva;

  const handleCobrar = async () => {
    if (cart.length === 0 || saving) return;
    setSaving(true); setError("");
    try {
      await api.post("/api/staff/orders", {
        items: cart.map(({ id: _id, ...i }) => ({ name: i.name, price: i.price, qty: i.qty })),
        customer: cliente.trim() || "Mostrador",
        total: parseFloat(total.toFixed(2)),
      });
      setSuccess(`Orden enviada — $${total.toFixed(2)}`);
      setCart([]);
      setCliente("");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.posLayout}>
      {/* Menú */}
      <div>
        <h2 style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
          Menú — toca para agregar
        </h2>
        <div className={styles.posMenuGrid}>
          {MENU.map((item) => (
            <button key={item.id} className={styles.posItem} onClick={() => addItem(item)} type="button">
              <p className={styles.posItemName}>{item.name}</p>
              <p className={styles.posItemPrice}>${item.price.toFixed(2)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Carrito */}
      <div className={styles.posCart}>
        <div className={styles.posCartTitle}>
          Orden Actual
          {cart.length > 0 && (
            <span style={{ marginLeft: 8, fontFamily: "DM Mono, monospace", fontWeight: 400, fontSize: 12, color: "var(--p-muted)" }}>
              ({cart.length} artículo{cart.length !== 1 ? "s" : ""})
            </span>
          )}
        </div>

        <div style={{ padding: "10px 14px 0" }}>
          <input
            className={styles.input}
            placeholder="Cliente / Mesa (opcional)"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>

        <div className={styles.posCartItems}>
          {cart.length === 0 ? (
            <p className={styles.posCartEmpty}>Sin artículos aún</p>
          ) : cart.map((item) => (
            <div key={item.id} className={styles.posCartItem}>
              <span className={styles.posCartItemName}>{item.name}</span>
              <span className={styles.posCartQty}>×{item.qty}</span>
              <span className={styles.posCartLinePrice}>${(item.price * item.qty).toFixed(2)}</span>
              <button className={styles.posRemoveBtn} onClick={() => removeItem(item.id)} type="button" aria-label={`Quitar ${item.name}`}>×</button>
            </div>
          ))}
        </div>

        <div className={styles.posTotal}>
          {success && <p className={styles.posSuccess} role="status">✓ {success}</p>}
          {error   && <p style={{ color: "red", fontSize: 12, marginBottom: 8 }} role="alert">{error}</p>}

          <div className={styles.posTotalRow}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          <div className={styles.posTotalRow}><span>IVA (16%)</span><span>${iva.toFixed(2)}</span></div>
          <div className={styles.posTotalFinal}><span>Total</span><span>${total.toFixed(2)}</span></div>

          <button
            className={styles.btnPrimary} style={{ width: "100%" }}
            onClick={handleCobrar} disabled={cart.length === 0 || saving} type="button"
          >
            {saving ? "Enviando…" : `Cobrar $${total.toFixed(2)}`}
          </button>

          {cart.length > 0 && (
            <button className={styles.btnGhost} style={{ width: "100%", marginTop: 8 }} onClick={() => setCart([])} type="button">
              Limpiar orden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
