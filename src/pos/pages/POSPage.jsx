import { useState, useContext, useEffect, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { queueOrder, flushQueuedOrders, isNetworkError, getQueuedOrders } from "../offlineQueue";
import CustomBowlBuilder from "../CustomBowlBuilder";
import { getRewardById } from "../../../backend/config/rewardsCatalog.js";

const CUSTOM_BOWL_ID = "custom-bowl";

const MENU = [
  { id: 1,  name: "Bowl Clásico de Atún",    price: 249 },
  { id: 2,  name: "Bowl Salmón y Aguacate",  price: 289 },
  { id: 3,  name: "Bowl Camarón Picante",    price: 249 },
  { id: 4,  name: "Bowl Vegano",             price: 229 },
  { id: 5,  name: "Pollo Teriyaki",          price: 239 },
  { id: 6,  name: "Edamame",                 price:  69 },
  { id: 7,  name: "Sopa de Miso",            price:  49 },
  { id: 8,  name: "Ensalada de Algas",       price:  79 },
  { id: 9,  name: "Agua de Coco",            price:  55 },
  { id: 10, name: "Limonada de Matcha",      price:  65 },
  { id: 11, name: "Agua Mineral",            price:  30 },
  { id: 12, name: "Smoothie de Mango",       price:  89 },
];

const IVA = 0; // IVA incluido en precio

export default function POSPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [cart, setCart]         = useState([]);
  const [cliente, setCliente]   = useState("");
  const [phone, setPhone]       = useState("");
  const [notes, setNotes]       = useState("");
  const [fulfillment, setFulfillment] = useState("pickup");
  const [paymentMethod, setPaymentMethod] = useState("card_terminal");
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState("");
  const [error, setError]       = useState("");
  const [queuedCount, setQueuedCount] = useState(() => getQueuedOrders().length);
  const [mode, setMode] = useState("menu"); // "menu" | "bowl"
  const [rewardCode, setRewardCode] = useState("");
  const [reward, setReward] = useState(null);
  const [rewardLoading, setRewardLoading] = useState(false);

  const tryFlushQueue = useCallback(async () => {
    if (getQueuedOrders().length === 0) return;
    const sent = await flushQueuedOrders(api, {
      onSuccess: () => setQueuedCount(getQueuedOrders().length),
    });
    if (sent > 0) setQueuedCount(getQueuedOrders().length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffToken]);

  // Retry queued orders when the browser regains connectivity, and poll
  // periodically in case the 'online' event doesn't fire reliably.
  useEffect(() => {
    window.addEventListener("online", tryFlushQueue);
    const interval = setInterval(tryFlushQueue, 15000);
    tryFlushQueue();
    return () => {
      window.removeEventListener("online", tryFlushQueue);
      clearInterval(interval);
    };
  }, [tryFlushQueue]);

  const addItem = (item) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === item.id);
      if (ex) return prev.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
    setSuccess(""); setError("");
  };

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  // Only one custom bowl is supported per ticket — the Order model stores a
  // single set of bowl fields per document. A second person's bowl is a new
  // ticket, same as ringing up two separate customers.
  const handleAddBowl = (bowl) => {
    setCart((prev) => [
      ...prev.filter((i) => i.id !== CUSTOM_BOWL_ID),
      {
        id: CUSTOM_BOWL_ID,
        name: `Bowl Personalizado${bowl.bowlSize === "large" ? " (Grande)" : ""}`,
        price: bowl.price,
        qty: 1,
        bowl,
      },
    ]);
    setSuccess(""); setError("");
    setMode("menu");
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const iva      = subtotal * IVA;
  const customRewardBowl = cart.find((i) => i.id === CUSTOM_BOWL_ID);
  const bowlLines = cart.filter((i) => /bowl|pollo teriyaki/i.test(i.name));
  const drinkLines = cart.filter((i) => /agua de coco|limonada de matcha/i.test(i.name));
  let rewardDiscount = 0;
  if (reward?.type === "free_drink" && bowlLines.length && drinkLines.length) {
    rewardDiscount = Math.min(...drinkLines.map((item) => item.price));
  } else if (reward?.type === "double_protein" && customRewardBowl?.bowl?.proteins?.length >= 3) {
    rewardDiscount = 40;
  } else if (reward?.type === "free_bowl" && bowlLines.length) {
    rewardDiscount = Math.min(249, Math.min(...bowlLines.map((item) => item.price)));
  }
  const total = Math.max(0, subtotal + iva - rewardDiscount);

  const lookupReward = async () => {
    const clean = rewardCode.trim().toUpperCase();
    if (!clean || rewardLoading) return;
    setRewardLoading(true); setError(""); setReward(null);
    try {
      const data = await api.get(`/api/staff/rewards/${clean}`);
      if (data.redemption?.status !== "active") throw new Error("El código no está activo");
      const catalogReward = getRewardById(data.redemption.rewardId);
      if (!catalogReward) throw new Error("Premio no disponible");
      setReward({ ...catalogReward, code: clean });
    } catch (e) {
      setError(e.message);
    } finally {
      setRewardLoading(false);
    }
  };

  const handleCobrar = async () => {
    if (cart.length === 0 || saving) return;
    setSaving(true); setError("");

    const customBowl = cart.find((i) => i.id === CUSTOM_BOWL_ID);
    const regularItems = cart.filter((i) => i.id !== CUSTOM_BOWL_ID);

    const payload = {
      items: regularItems.map(({ id: _id, ...i }) => ({ name: i.name, price: i.price, qty: i.qty })),
      customer: cliente.trim() || "Mostrador",
      phone: phone.trim(),
      notes: notes.trim(),
      fulfillment,
      paymentMethod,
      rewardCode: reward?.code || null,
      ...(customBowl && {
        base: customBowl.bowl.base,
        proteins: customBowl.bowl.proteins,
        bowlSize: customBowl.bowl.bowlSize,
        marinades: customBowl.bowl.marinades,
        complements: customBowl.bowl.complements,
        sauces: customBowl.bowl.sauces,
        toppings: customBowl.bowl.toppings,
      }),
    };

    try {
      const data = await api.post("/api/staff/orders", payload);
      setSuccess(`Orden enviada — $${data.order.total.toLocaleString("es-MX")} MXN`);
    } catch (e) {
      if (isNetworkError(e) && !reward) {
        queueOrder(payload);
        setQueuedCount(getQueuedOrders().length);
        setSuccess(`Sin conexión — orden guardada y se enviará sola ($${total.toLocaleString("es-MX")} MXN)`);
      } else {
        setError(e.message);
        setSaving(false);
        return;
      }
    }

    setCart([]);
    setCliente("");
    setPhone("");
    setNotes("");
    setFulfillment("pickup");
    setPaymentMethod("card_terminal");
    setRewardCode("");
    setReward(null);
    setTimeout(() => setSuccess(""), 4000);
    setSaving(false);
  };

  return (
    <div className={styles.posLayout}>
      {/* Menú / Bowl personalizado */}
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setMode("menu")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              border: mode === "menu" ? "1px solid var(--p-accent, #1a1a1a)" : "1px solid var(--p-border, #ddd)",
              background: mode === "menu" ? "var(--p-accent, #1a1a1a)" : "transparent",
              color: mode === "menu" ? "#fff" : "var(--p-text, #222)",
            }}
          >
            Menú rápido
          </button>
          <button
            type="button"
            onClick={() => setMode("bowl")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              border: mode === "bowl" ? "1px solid var(--p-accent, #1a1a1a)" : "1px solid var(--p-border, #ddd)",
              background: mode === "bowl" ? "var(--p-accent, #1a1a1a)" : "transparent",
              color: mode === "bowl" ? "#fff" : "var(--p-text, #222)",
            }}
          >
            Bowl Personalizado
          </button>
        </div>

        {mode === "menu" ? (
          <>
            <h2 style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Menú — toca para agregar
            </h2>
            <div className={styles.posMenuGrid}>
              {MENU.map((item) => (
                <button key={item.id} className={styles.posItem} onClick={() => addItem(item)} type="button">
                  <p className={styles.posItemName}>{item.name}</p>
                  <p className={styles.posItemPrice}>${item.price} MXN</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <CustomBowlBuilder onAdd={handleAddBowl} onCancel={() => setMode("menu")} />
        )}
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

        {queuedCount > 0 && (
          <div
            style={{
              margin: "0 14px 10px",
              padding: "8px 12px",
              borderRadius: 8,
              background: "#fff3cd",
              border: "1px solid #ffe69c",
              fontSize: 12,
              fontWeight: 600,
              color: "#7a5c00",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>
              ⚠ {queuedCount} orden{queuedCount !== 1 ? "es" : ""} sin enviar (sin conexión)
            </span>
            <button
              type="button"
              onClick={tryFlushQueue}
              style={{ border: "none", background: "transparent", fontWeight: 700, color: "#7a5c00", cursor: "pointer" }}
            >
              Reintentar
            </button>
          </div>
        )}

        <div style={{ padding: "10px 14px 0" }}>
          <input
            className={styles.input}
            placeholder="Cliente / Mesa (opcional)"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            style={{ fontSize: 12 }}
          />
          <input
            className={styles.input}
            placeholder="Telefono (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ fontSize: 12, marginTop: 8 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <select
              className={styles.select}
              value={fulfillment}
              onChange={(e) => setFulfillment(e.target.value)}
              style={{ fontSize: 12 }}
            >
              <option value="pickup">Recoger</option>
              <option value="dine_in">En restaurante</option>
              <option value="delivery">Delivery</option>
            </select>
            <select
              className={styles.select}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ fontSize: 12 }}
            >
              <option value="card_terminal">Tarjeta</option>
              <option value="cash">Efectivo</option>
              <option value="pay_at_pickup">Pendiente</option>
            </select>
          </div>
          <input
            className={styles.input}
            placeholder="Notas para cocina (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ fontSize: 12, marginTop: 8 }}
          />
        </div>

        <div className={styles.posCartItems}>
          {cart.length === 0 ? (
            <p className={styles.posCartEmpty}>Sin artículos aún</p>
          ) : cart.map((item) => (
            <div key={item.id} className={styles.posCartItem}>
              <span className={styles.posCartItemName}>{item.name}</span>
              <span className={styles.posCartQty}>×{item.qty}</span>
              <span className={styles.posCartLinePrice}>${(item.price * item.qty).toLocaleString("es-MX")}</span>
              <button className={styles.posRemoveBtn} onClick={() => removeItem(item.id)} type="button" aria-label={`Quitar ${item.name}`}>×</button>
            </div>
          ))}
        </div>

        <div className={styles.posTotal}>
          {success && <p className={styles.posSuccess} role="status">✓ {success}</p>}
          {error   && <p style={{ color: "red", fontSize: 12, marginBottom: 8 }} role="alert">{error}</p>}

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              className={styles.input}
              value={rewardCode}
              onChange={(e) => { setRewardCode(e.target.value.toUpperCase()); setReward(null); }}
              placeholder="Código de premio"
              maxLength={6}
              style={{ margin: 0, textTransform: "uppercase" }}
            />
            <button type="button" className={styles.btnGhost} onClick={lookupReward} disabled={!rewardCode.trim() || rewardLoading}>
              {rewardLoading ? "Buscando…" : "Aplicar"}
            </button>
          </div>
          {reward && (
            <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: "#ecfdf3", color: "#166534", fontSize: 12 }}>
              <strong>{reward.name.es}</strong><br />{reward.terms.es}
            </div>
          )}

          {rewardDiscount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#166534", fontSize: 12, marginBottom: 8 }}>
              <span>Descuento de premio</span><strong>−${rewardDiscount.toLocaleString("es-MX")}</strong>
            </div>
          )}

          <div className={styles.posTotalFinal}>
            <span>Total</span>
            <span>${total.toLocaleString("es-MX")} MXN</span>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--p-muted)", textAlign: "right" }}>
            IVA incluido
          </p>

          <button
            className={styles.btnPrimary} style={{ width: "100%" }}
            onClick={handleCobrar} disabled={cart.length === 0 || saving} type="button"
          >
            {saving ? "Enviando…" : `Cobrar $${total.toLocaleString("es-MX")} MXN`}
          </button>

          {cart.length > 0 && (
            <button className={styles.btnGhost} style={{ width: "100%", marginTop: 8 }} onClick={() => { setCart([]); setReward(null); setRewardCode(""); }} type="button">
              Limpiar orden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
