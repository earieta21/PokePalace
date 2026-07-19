import { useState, useContext, useEffect, useCallback, useRef } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import {
  createClientOrderId,
  queueOrder,
  flushQueuedOrders,
  isNetworkError,
  getQueuedOrders,
} from "../offlineQueue";
import CustomBowlBuilder from "../CustomBowlBuilder";
import { getRewardById } from "../../data/rewardsCatalog.js";
import { TOPPING_LABELS } from "../../order/OrderLabels.jsx";
import ui from "./POSPage.module.css";

const CUSTOM_BOWL_ID = "custom-bowl";

const MENU = [
  { id: 1,  name: "Bowl Clásico de Atún",    price: 249, category: "Bowls", icon: "🍣" },
  { id: 2,  name: "Bowl Salmón y Aguacate",  price: 289, category: "Bowls", icon: "🥑" },
  { id: 3,  name: "Bowl Camarón Picante",    price: 249, category: "Bowls", icon: "🍤" },
  { id: 4,  name: "Bowl Vegano",             price: 229, category: "Bowls", icon: "🥬" },
  { id: 6,  name: "Edamame",                 price:  69, category: "Entradas", icon: "🫛" },
  { id: 8,  name: "Ensalada de Algas",       price:  79, category: "Entradas", icon: "🥗" },
  { id: 11, name: "Topochico",               price:  35, category: "Bebidas", icon: "🫧" },
  { id: 13, name: "Coca-Zero",               price:  30, category: "Bebidas", icon: "🥤" },
  { id: 14, name: "Botella de Agua",         price:  20, category: "Bebidas", icon: "💧" },
  { id: 15, name: "Agua natural del día",    price:  30, category: "Bebidas", icon: "🍹" },
];

const MENU_CATEGORIES = ["Todos", "Bowls", "Entradas", "Bebidas"];

const IVA = 0; // IVA incluido en precio

export default function POSPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);
  const pendingSaleRef = useRef(null);

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
  const [rewardTopping, setRewardTopping] = useState("");
  const [rewardLoading, setRewardLoading] = useState(false);
  const [menuCategory, setMenuCategory] = useState("Todos");
  const [menuSearch, setMenuSearch] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [rewardsCustomer, setRewardsCustomer] = useState(null);
  const [customerLookup, setCustomerLookup] = useState("");
  const [customerMatches, setCustomerMatches] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerSearchDone, setCustomerSearchDone] = useState(false);

  const tryFlushQueue = useCallback(async () => {
    if (getQueuedOrders().length === 0) return;
    const sent = await flushQueuedOrders(api, {
      onSuccess: () => setQueuedCount(getQueuedOrders().length),
      onError: (_entry, err) => setError(`No se pudo reenviar una orden pendiente: ${err.message}`),
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

  const changeQty = (id, delta) => {
    setCart((previous) => previous
      .map((item) => item.id === id ? { ...item, qty: item.qty + delta } : item)
      .filter((item) => item.qty > 0));
    setSuccess("");
    setError("");
  };

  const clearOrder = () => {
    pendingSaleRef.current = null;
    setCart([]);
    setCliente("");
    setPhone("");
    setNotes("");
    setFulfillment("pickup");
    setPaymentMethod("card_terminal");
    setRewardCode("");
    setReward(null);
    setRewardTopping("");
    setShowCustomerDetails(false);
    setShowReward(false);
    setRewardsCustomer(null);
    setCustomerLookup("");
    setCustomerMatches([]);
    setCustomerSearchDone(false);
    setSuccess("");
    setError("");
  };

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
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const visibleMenu = MENU.filter((item) => {
    const matchesCategory = menuCategory === "Todos" || item.category === menuCategory;
    const matchesSearch = item.name.toLowerCase().includes(menuSearch.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });
  const iva      = subtotal * IVA;
  const customRewardBowl = cart.find((i) => i.id === CUSTOM_BOWL_ID);
  const bowlLines = cart.filter((i) => /bowl/i.test(i.name));
  const drinkLines = cart.filter((i) => /agua natural/i.test(i.name));
  let rewardDiscount = 0;
  if (reward?.type === "free_drink" && bowlLines.length && drinkLines.length) {
    rewardDiscount = Math.min(...drinkLines.map((item) => item.price));
  } else if (reward?.type === "double_protein" && customRewardBowl?.bowl?.proteins?.length >= 3) {
    rewardDiscount = 40;
  } else if (reward?.type === "free_bowl" && bowlLines.length) {
    rewardDiscount = Math.min(249, Math.min(...bowlLines.map((item) => item.price)));
  }
  const total = Math.max(0, subtotal + iva - rewardDiscount);
  const rewardsMultiplier = (rewardsCustomer?.lifetimePoints ?? 0) >= 300 ? 2 : 1;
  const rewardsPointsPreview = Math.floor(total / 10) * rewardsMultiplier;

  const searchRewardsCustomers = async () => {
    const query = customerLookup.trim();
    if (query.length < 3 || customerSearching) return;
    setCustomerSearching(true);
    setCustomerMatches([]);
    setCustomerSearchDone(false);
    setError("");
    try {
      const data = await api.get(`/api/staff/orders/customers/search?q=${encodeURIComponent(query)}`);
      setCustomerMatches(data.customers || []);
      setCustomerSearchDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setCustomerSearching(false);
    }
  };

  const selectRewardsCustomer = (customer) => {
    setRewardsCustomer(customer);
    setCliente(customer.name || "");
    if (customer.phone) setPhone(customer.phone);
    setCustomerLookup("");
    setCustomerMatches([]);
    setCustomerSearchDone(false);
    setError("");
  };

  const removeRewardsCustomer = () => {
    setRewardsCustomer(null);
    setCustomerLookup("");
    setCustomerMatches([]);
    setCustomerSearchDone(false);
  };

  const lookupReward = async () => {
    const clean = rewardCode.trim().toUpperCase();
    if (!clean || rewardLoading) return;
    setRewardLoading(true); setError(""); setReward(null); setRewardTopping("");
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
    if (reward?.type === "extra_topping" && !rewardTopping) {
      setError("Selecciona el topping extra elegido por el cliente.");
      return;
    }
    setSaving(true); setError("");

    const customBowl = cart.find((i) => i.id === CUSTOM_BOWL_ID);
    const regularItems = cart.filter((i) => i.id !== CUSTOM_BOWL_ID);

    const nextPayload = {
      clientOrderId: createClientOrderId(),
      items: regularItems.map(({ id, qty }) => ({ id, qty })),
      customer: cliente.trim() || "Mostrador",
      phone: phone.trim(),
      notes: notes.trim(),
      fulfillment,
      paymentMethod,
      rewardCode: reward?.code || null,
      rewardTopping: reward?.type === "extra_topping" ? rewardTopping : null,
      customerUserId: rewardsCustomer?._id || null,
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
    const payload = pendingSaleRef.current || nextPayload;
    pendingSaleRef.current = payload;

    try {
      const data = await api.post("/api/staff/orders", payload);
      const pointsMessage = data.loyalty?.earned
        ? ` · ${data.loyalty.customer} ganó ${data.loyalty.earned} puntos (saldo: ${data.loyalty.balance})`
        : rewardsCustomer && paymentMethod === "pay_at_pickup"
          ? " · Los puntos se acreditarán al registrar el pago"
          : "";
      setSuccess(`Orden enviada — $${data.order.total.toLocaleString("es-MX")} MXN${pointsMessage}`);
      pendingSaleRef.current = null;
    } catch (e) {
      if (isNetworkError(e)) {
        queueOrder(payload);
        pendingSaleRef.current = null;
        setQueuedCount(getQueuedOrders().length);
        const queuedRewards = rewardsCustomer ? " Los puntos se acreditarán cuando vuelva la conexión." : "";
        setSuccess(`Sin conexión — orden guardada y se enviará sola ($${total.toLocaleString("es-MX")} MXN).${queuedRewards}`);
      } else {
        if (!e.retryable && !e.orderId) pendingSaleRef.current = null;
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
    setRewardTopping("");
    setShowCustomerDetails(false);
    setShowReward(false);
    setRewardsCustomer(null);
    setCustomerLookup("");
    setCustomerMatches([]);
    setCustomerSearchDone(false);
    setTimeout(() => setSuccess(""), 4000);
    setSaving(false);
  };

  return (
    <div className={ui.posRoot}>
      <header className={ui.posHeader}>
        <div>
          <span className={ui.eyebrow}>Punto de venta</span>
          <h1>Nueva orden</h1>
          <p>Selecciona productos, revisa el pedido y cobra.</p>
        </div>
        <div className={ui.headerSummary}>
          <span>{cartItemCount} producto{cartItemCount !== 1 ? "s" : ""}</span>
          <strong>${total.toLocaleString("es-MX")} MXN</strong>
        </div>
      </header>

      {success && <div className={ui.successBanner} role="status"><span>✓</span>{success}</div>}
      {error && <div className={ui.errorBanner} role="alert"><span>!</span>{error}</div>}

      <div className={ui.posWorkspace}>
      {/* Menú / Bowl personalizado */}
      <section className={ui.menuPanel}>
        <div className={ui.modeSwitch}>
          <button
            type="button"
            onClick={() => setMode("menu")}
            className={mode === "menu" ? ui.modeActive : ""}
            aria-pressed={mode === "menu"}
          >
            <span>▦</span> Productos
          </button>
          <button
            type="button"
            onClick={() => setMode("bowl")}
            className={mode === "bowl" ? ui.modeActive : ""}
            aria-pressed={mode === "bowl"}
          >
            <span>＋</span> Crear bowl
          </button>
        </div>

        {mode === "menu" ? (
          <>
            <div className={ui.menuIntro}>
              <div><span>Paso 1</span><h2>Elige los productos</h2><p>Toca una tarjeta para agregarla a la orden.</p></div>
              <label className={ui.menuSearch}>
                <span>⌕</span>
                <input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="Buscar producto…" />
              </label>
            </div>
            <div className={ui.categoryTabs} aria-label="Categorías del menú">
              {MENU_CATEGORIES.map((category) => (
                <button key={category} type="button" aria-pressed={menuCategory === category} onClick={() => setMenuCategory(category)}>{category}</button>
              ))}
            </div>
            <div className={ui.productGrid}>
              {visibleMenu.map((item) => {
                const quantity = cart.find((cartItem) => cartItem.id === item.id)?.qty || 0;
                return (
                <button key={item.id} className={ui.productCard} onClick={() => addItem(item)} type="button">
                  {quantity > 0 && <span className={ui.inCartBadge}>{quantity}</span>}
                  <span className={ui.productIcon}>{item.icon}</span>
                  <span className={ui.productInfo}><strong>{item.name}</strong><small>{item.category}</small></span>
                  <span className={ui.productPrice}>${item.price}</span>
                  <span className={ui.addProduct}>+</span>
                </button>
                );
              })}
            </div>
            {visibleMenu.length === 0 && <div className={ui.noProducts}>No encontramos productos con ese nombre.</div>}
          </>
        ) : (
          <div className={ui.bowlPanel}>
            <div className={ui.menuIntro}><div><span>Paso 1</span><h2>Arma un bowl</h2><p>Selecciona una base, proteína y complementos.</p></div></div>
            <CustomBowlBuilder onAdd={handleAddBowl} onCancel={() => setMode("menu")} />
          </div>
        )}
      </section>

      {/* Carrito */}
      <aside className={ui.cartPanel}>
        <div className={ui.cartHeader}>
          <div><span>Paso 2</span><strong>Revisa la orden</strong></div>
          {cart.length > 0 && (
            <button type="button" onClick={clearOrder}>Nueva orden</button>
          )}
        </div>

        {queuedCount > 0 && (
          <div className={ui.offlineNotice}>
            <span>
              ⚠ {queuedCount} orden{queuedCount !== 1 ? "es" : ""} pendiente{queuedCount !== 1 ? "s" : ""} de enviar
            </span>
            <button type="button" onClick={tryFlushQueue}>
              Reintentar
            </button>
          </div>
        )}

        <div className={ui.cartItems}>
          {cart.length === 0 ? (
            <div className={ui.cartEmpty}><span>🛒</span><strong>La orden está vacía</strong><p>Selecciona un producto del menú para comenzar.</p></div>
          ) : cart.map((item) => (
            <div key={item.id} className={ui.cartItem}>
              <div className={ui.cartItemInfo}><strong>{item.name}</strong><small>${item.price} c/u</small></div>
              <div className={ui.qtyControl}>
                <button type="button" onClick={() => changeQty(item.id, -1)} aria-label={`Reducir ${item.name}`}>−</button>
                <span>{item.qty}</span>
                {item.id !== CUSTOM_BOWL_ID && <button type="button" onClick={() => changeQty(item.id, 1)} aria-label={`Agregar otro ${item.name}`}>+</button>}
              </div>
              <strong className={ui.linePrice}>${(item.price * item.qty).toLocaleString("es-MX")}</strong>
              <button className={ui.removeItem} onClick={() => removeItem(item.id)} type="button" aria-label={`Quitar ${item.name}`}>×</button>
            </div>
          ))}
        </div>

        <div className={ui.orderOptions}>
          <div className={ui.optionGroup}>
            <span>Entrega</span>
            <div className={ui.optionButtons}>
              {[
                ["pickup", "Para llevar"], ["dine_in", "En restaurante"], ["delivery", "Delivery"],
              ].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={fulfillment === value} onClick={() => setFulfillment(value)}>{label}</button>
              ))}
            </div>
          </div>
          <div className={ui.optionGroup}>
            <span>Forma de pago</span>
            <div className={ui.optionButtons}>
              {[
                ["card_terminal", "Tarjeta"], ["cash", "Efectivo"], ["pay_at_pickup", "Pendiente"],
              ].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={paymentMethod === value} onClick={() => setPaymentMethod(value)}>{label}</button>
              ))}
            </div>
          </div>

          <section className={ui.loyaltyPanel} aria-label="Cliente Rewards">
            <div className={ui.loyaltyHeading}>
              <span className={ui.loyaltyIcon}>★</span>
              <div>
                <strong>Cliente Rewards</strong>
                <small>Opcional · vincula la compra para sumar puntos</small>
              </div>
            </div>

            {rewardsCustomer ? (
              <div className={ui.loyaltySelected}>
                <div>
                  <strong>{rewardsCustomer.name}</strong>
                  <span>{rewardsCustomer.phone || rewardsCustomer.email}</span>
                  <small>Saldo actual: {rewardsCustomer.points ?? 0} puntos</small>
                </div>
                <button type="button" onClick={removeRewardsCustomer}>Cambiar</button>
                <p>
                  {paymentMethod === "pay_at_pickup"
                    ? `Ganará ${rewardsPointsPreview} puntos cuando se registre el pago.`
                    : `Ganará ${rewardsPointsPreview} puntos con esta compra${rewardsMultiplier === 2 ? " · Nivel Oro 2×" : ""}.`}
                </p>
              </div>
            ) : (
              <>
                <form
                  className={ui.loyaltySearch}
                  onSubmit={(event) => { event.preventDefault(); searchRewardsCustomers(); }}
                >
                  <input
                    value={customerLookup}
                    onChange={(event) => {
                      setCustomerLookup(event.target.value);
                      setCustomerMatches([]);
                      setCustomerSearchDone(false);
                    }}
                    placeholder="Teléfono, correo o nombre"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={customerLookup.trim().length < 3 || customerSearching}>
                    {customerSearching ? "Buscando…" : "Buscar"}
                  </button>
                </form>
                {customerMatches.length > 0 && (
                  <div className={ui.loyaltyResults}>
                    {customerMatches.map((customer) => (
                      <button key={customer._id} type="button" onClick={() => selectRewardsCustomer(customer)}>
                        <span><strong>{customer.name}</strong><small>{customer.phone || customer.email}</small></span>
                        <em>{customer.points ?? 0} pts</em>
                      </button>
                    ))}
                  </div>
                )}
                {customerSearchDone && customerMatches.length === 0 && (
                  <p className={ui.loyaltyEmpty}>No encontramos una cuenta. La venta puede continuar sin Rewards.</p>
                )}
              </>
            )}
          </section>

          <button type="button" className={ui.detailsToggle} aria-expanded={showCustomerDetails} onClick={() => setShowCustomerDetails((visible) => !visible)}>
            <span>Cliente y notas <small>Opcional</small></span><span>{showCustomerDetails ? "−" : "+"}</span>
          </button>
          {showCustomerDetails && (
            <div className={ui.optionalFields}>
              <input className={styles.input} placeholder="Cliente o número de mesa" value={cliente} onChange={(e) => setCliente(e.target.value)} />
              <input className={styles.input} placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className={styles.input} placeholder="Notas para cocina" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}
        </div>

        <div className={ui.checkoutPanel}>
          <button type="button" className={ui.detailsToggle} aria-expanded={showReward} onClick={() => setShowReward((visible) => !visible)}>
            <span>Código de premio <small>Opcional</small></span><span>{showReward ? "−" : "+"}</span>
          </button>
          {showReward && (
            <div className={ui.rewardArea}>
              <div>
                <input className={styles.input} value={rewardCode} onChange={(e) => { setRewardCode(e.target.value.toUpperCase()); setReward(null); setRewardTopping(""); }} placeholder="Código" maxLength={6} />
                <button type="button" className={styles.btnGhost} onClick={lookupReward} disabled={!rewardCode.trim() || rewardLoading}>{rewardLoading ? "Buscando…" : "Aplicar"}</button>
              </div>
              {reward && <div className={ui.rewardSuccess}><strong>{reward.name.es}</strong><span>{reward.terms.es}</span></div>}
              {reward?.type === "extra_topping" && (
                <label>
                  <span>Elige el topping extra</span>
                  <select
                    className={styles.input}
                    value={rewardTopping}
                    onChange={(event) => { setRewardTopping(event.target.value); setError(""); }}
                    required
                  >
                    <option value="">Seleccionar topping…</option>
                    {Object.entries(TOPPING_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className={ui.totalBreakdown}>
            <div><span>Subtotal</span><span>${subtotal.toLocaleString("es-MX")}</span></div>
            {rewardDiscount > 0 && <div className={ui.discountRow}><span>Premio aplicado</span><strong>−${rewardDiscount.toLocaleString("es-MX")}</strong></div>}
            <div className={ui.totalFinal}><span>Total</span><strong>${total.toLocaleString("es-MX")} MXN</strong></div>
            <small>IVA incluido</small>
          </div>

          <div className={ui.checkoutStep}><span>Paso 3</span><strong>Confirma y cobra</strong></div>
          <button className={ui.chargeButton} onClick={handleCobrar} disabled={cart.length === 0 || saving || (reward?.type === "extra_topping" && !rewardTopping)} type="button">
            {saving ? "Enviando orden…" : cart.length === 0 ? "Agrega productos para cobrar" : `Cobrar $${total.toLocaleString("es-MX")} MXN`}
          </button>
        </div>
      </aside>
      </div>
    </div>
  );
}

