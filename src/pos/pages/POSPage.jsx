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
import { PROTEIN_LABELS, TOPPING_LABELS } from "../../order/OrderLabels.jsx";
import { BOWL_BASE_PRICE, EXTRA_SCOOP_PRICE } from "../../order/pricing.js";
import { useAvailability } from "../../context/AvailabilityContext.jsx";
import { POS_MENU, POS_MENU_CATEGORIES, POS_REWARD_TOPPING_IDS } from "../posMenu.js";
import {
  CUSTOM_BOWL_ID,
  getDoubleProteinExtraScoops,
  getUnavailableBowlSelections,
  isBowlMenuItem,
  isMenuItemUnavailable,
} from "../posRules.js";
import ui from "./POSPage.module.css";

const IVA = 0; // IVA incluido en precio

export default function POSPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const { unavailableItems, refetch: refetchAvailability } = useAvailability();
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
  const [rewardProtein, setRewardProtein] = useState("");
  const [rewardLoading, setRewardLoading] = useState(false);
  const [menuCategory, setMenuCategory] = useState("Todos");
  const [menuSearch, setMenuSearch] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState(false);
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

  // Availability is operational data at the register, so refresh it much
  // faster than the public ordering pages and whenever the cashier returns.
  useEffect(() => {
    refetchAvailability();
    const interval = setInterval(refetchAvailability, 30000);
    window.addEventListener("focus", refetchAvailability);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refetchAvailability);
    };
  }, [refetchAvailability]);

  const addItem = (item) => {
    if (isMenuItemUnavailable(item, unavailableItems)) {
      setError(`${item.name} está agotado por el momento.`);
      return;
    }
    setCart((prev) => {
      const ex = prev.find((i) => i.id === item.id);
      if (ex) return prev.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
    setSuccess(""); setError("");
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
    if (id === CUSTOM_BOWL_ID) setRewardProtein("");
  };

  const changeQty = (id, delta) => {
    const item = cart.find((candidate) => candidate.id === id);
    if (delta > 0 && item && isMenuItemUnavailable(item, unavailableItems)) {
      setError(`${item.name} está agotado por el momento.`);
      return;
    }
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
    setRewardProtein("");
    setShowCustomerDetails(false);
    setShowReward(false);
    setShowLoyalty(false);
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
        name: `Bowl personalizado (${bowl.bowlSize === "large" ? "Grande" : "Mediano"})`,
        price: bowl.price,
        qty: 1,
        category: "Bowls",
        categoryKey: "bowls",
        bowl,
      },
    ]);
    setRewardProtein("");
    setSuccess(""); setError("");
    setMode("menu");
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const visibleMenu = POS_MENU.filter((item) => {
    const matchesCategory = menuCategory === "Todos" || item.category === menuCategory;
    const matchesSearch = item.name.toLowerCase().includes(menuSearch.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });
  const customRewardBowl = cart.find((i) => i.id === CUSTOM_BOWL_ID);
  const rewardExtraScoopProteins = getDoubleProteinExtraScoops(
    reward,
    customRewardBowl?.bowl,
    rewardProtein,
  );
  const extraScoopCharge = rewardExtraScoopProteins.length * EXTRA_SCOOP_PRICE;
  const itemsSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const subtotal = itemsSubtotal + extraScoopCharge;
  const iva = subtotal * IVA;
  const bowlLines = cart.filter(isBowlMenuItem);
  const drinkLines = cart.filter((item) => item.rewardDrink);
  const unavailableCartItems = cart.filter((item) => (
    item.id === CUSTOM_BOWL_ID
      ? getUnavailableBowlSelections(item.bowl, unavailableItems).length > 0
      : isMenuItemUnavailable(item, unavailableItems)
  ));
  const rewardToppingUnavailable = Boolean(
    rewardTopping && unavailableItems.includes(rewardTopping),
  );
  const doubleProteinBowlEligible = customRewardBowl?.bowl?.bowlSize === "large"
    && customRewardBowl.bowl.proteins?.length === 3;
  const doubleProteinReady = reward?.type !== "double_protein"
    || rewardExtraScoopProteins.length === 1;
  const checkoutHasUnavailableItem = unavailableCartItems.length > 0 || rewardToppingUnavailable;
  let rewardDiscount = 0;
  if (reward?.type === "free_drink" && bowlLines.length && drinkLines.length) {
    rewardDiscount = Math.min(...drinkLines.map((item) => item.price));
  } else if (reward?.type === "double_protein" && rewardExtraScoopProteins.length === 1) {
    rewardDiscount = EXTRA_SCOOP_PRICE;
  } else if (reward?.type === "free_bowl" && bowlLines.length) {
    rewardDiscount = Math.min(BOWL_BASE_PRICE, Math.min(...bowlLines.map((item) => item.price)));
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
    setRewardLoading(true); setError(""); setReward(null); setRewardTopping(""); setRewardProtein("");
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
    if (checkoutHasUnavailableItem) {
      setError("Quita los productos o ingredientes agotados antes de cobrar.");
      return;
    }
    if (reward?.type === "extra_topping" && !rewardTopping) {
      setError("Selecciona el topping extra elegido por el cliente.");
      return;
    }
    if (reward?.type === "double_protein" && !doubleProteinBowlEligible) {
      setError("Proteína doble requiere un bowl personalizado grande.");
      return;
    }
    if (reward?.type === "double_protein" && !doubleProteinReady) {
      setError("Selecciona cuál proteína llevará el scoop extra.");
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
        bases: customBowl.bowl.bases,
        proteins: customBowl.bowl.proteins,
        bowlSize: customBowl.bowl.bowlSize,
        extraScoopProteins: rewardExtraScoopProteins,
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
    setRewardProtein("");
    setShowCustomerDetails(false);
    setShowReward(false);
    setShowLoyalty(false);
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
              {POS_MENU_CATEGORIES.map((category) => (
                <button key={category} type="button" aria-pressed={menuCategory === category} onClick={() => setMenuCategory(category)}>{category}</button>
              ))}
            </div>
            <div className={ui.productGrid}>
              {visibleMenu.map((item) => {
                const quantity = cart.find((cartItem) => cartItem.id === item.id)?.qty || 0;
                const isUnavailable = isMenuItemUnavailable(item, unavailableItems);
                return (
                <button
                  key={item.id}
                  className={ui.productCard}
                  onClick={() => addItem(item)}
                  type="button"
                  disabled={isUnavailable}
                  aria-label={`${item.name}, $${item.price}${isUnavailable ? ", agotado" : ""}`}
                >
                  {quantity > 0 && <span className={ui.inCartBadge}>{quantity}</span>}
                  <span className={ui.productIcon}>{item.icon}</span>
                  <span className={ui.productInfo}>
                    <strong>{item.name}</strong>
                    <small className={isUnavailable ? ui.productUnavailable : ""}>
                      {isUnavailable ? "Agotado" : item.category}
                    </small>
                  </span>
                  <span className={ui.productPrice}>${item.price}</span>
                  <span className={ui.addProduct}>{isUnavailable ? "×" : "+"}</span>
                </button>
                );
              })}
            </div>
            {visibleMenu.length === 0 && <div className={ui.noProducts}>No encontramos productos con ese nombre.</div>}
          </>
        ) : (
          <div className={ui.bowlPanel}>
            <div className={ui.menuIntro}><div><span>Paso 1</span><h2>Arma un bowl</h2><p>Selecciona una o dos bases, proteína y complementos.</p></div></div>
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
          ) : cart.map((item) => {
            const isUnavailable = item.id === CUSTOM_BOWL_ID
              ? getUnavailableBowlSelections(item.bowl, unavailableItems).length > 0
              : isMenuItemUnavailable(item, unavailableItems);
            return (
            <div key={item.id} className={ui.cartItem}>
              <div className={ui.cartItemInfo}>
                <strong>{item.name}</strong>
                <small className={isUnavailable ? ui.unavailableLabel : ""}>
                  {isUnavailable ? "Agotado · quítalo para cobrar" : `$${item.price} c/u`}
                </small>
              </div>
              <div className={ui.qtyControl}>
                <button type="button" onClick={() => changeQty(item.id, -1)} aria-label={`Reducir ${item.name}`}>−</button>
                <span>{item.qty}</span>
                {item.id !== CUSTOM_BOWL_ID && <button type="button" onClick={() => changeQty(item.id, 1)} aria-label={`Agregar otro ${item.name}`}>+</button>}
              </div>
              <strong className={ui.linePrice}>${(item.price * item.qty).toLocaleString("es-MX")}</strong>
              <button className={ui.removeItem} onClick={() => removeItem(item.id)} type="button" aria-label={`Quitar ${item.name}`}>×</button>
            </div>
            );
          })}
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

          <button
            type="button"
            className={ui.detailsToggle}
            aria-expanded={showLoyalty || Boolean(rewardsCustomer)}
            onClick={() => setShowLoyalty((visible) => !visible)}
          >
            <span>
              <span className={ui.loyaltyIcon} aria-hidden="true">★</span>{" "}
              {rewardsCustomer ? rewardsCustomer.name : "Cliente Rewards"} <small>Opcional · suma puntos</small>
            </span>
            <span>{(showLoyalty || rewardsCustomer) ? "−" : "+"}</span>
          </button>
          {(showLoyalty || rewardsCustomer) && (
          <section className={ui.loyaltyPanel} aria-label="Cliente Rewards">
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
          )}

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
                <input className={styles.input} value={rewardCode} onChange={(e) => { setRewardCode(e.target.value.toUpperCase()); setReward(null); setRewardTopping(""); setRewardProtein(""); }} placeholder="Código" maxLength={6} />
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
                    {POS_REWARD_TOPPING_IDS.map((id) => (
                      <option key={id} value={id} disabled={unavailableItems.includes(id)}>
                        {TOPPING_LABELS[id] || id}{unavailableItems.includes(id) ? " · Agotado" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {reward?.type === "double_protein" && (
                doubleProteinBowlEligible ? (
                  <label>
                    <span>Elige cuál proteína llevará el scoop extra</span>
                    <select
                      className={styles.input}
                      value={rewardProtein}
                      onChange={(event) => { setRewardProtein(event.target.value); setError(""); }}
                      required
                    >
                      <option value="">Seleccionar proteína…</option>
                      {customRewardBowl.bowl.proteins.map((id) => (
                        <option key={id} value={id}>{PROTEIN_LABELS[id] || id}</option>
                      ))}
                    </select>
                    <small>Se agrega un scoop de 40 g (+${EXTRA_SCOOP_PRICE}) y el premio descuenta ese cargo.</small>
                  </label>
                ) : (
                  <p className={ui.rewardRequirement}>
                    Agrega un bowl personalizado grande (3 proteínas) para usar este premio.
                  </p>
                )
              )}
            </div>
          )}

          <div className={ui.totalBreakdown}>
            <div><span>Productos</span><span>${itemsSubtotal.toLocaleString("es-MX")}</span></div>
            {extraScoopCharge > 0 && <div><span>Scoop extra de proteína</span><span>+${extraScoopCharge.toLocaleString("es-MX")}</span></div>}
            {rewardDiscount > 0 && <div className={ui.discountRow}><span>Premio aplicado</span><strong>−${rewardDiscount.toLocaleString("es-MX")}</strong></div>}
            <div className={ui.totalFinal}><span>Total</span><strong>${total.toLocaleString("es-MX")} MXN</strong></div>
            <small>IVA incluido</small>
          </div>

          {checkoutHasUnavailableItem && (
            <p className={ui.checkoutWarning}>Quita los productos o ingredientes agotados antes de cobrar.</p>
          )}
          <div className={ui.checkoutStep}><span>Paso 3</span><strong>Confirma y cobra</strong></div>
          <button
            className={ui.chargeButton}
            onClick={handleCobrar}
            disabled={cart.length === 0
              || saving
              || checkoutHasUnavailableItem
              || (reward?.type === "extra_topping" && !rewardTopping)
              || !doubleProteinReady}
            type="button"
          >
            {saving ? "Enviando orden…" : cart.length === 0 ? "Agrega productos para cobrar" : `Cobrar $${total.toLocaleString("es-MX")} MXN`}
          </button>
        </div>
      </aside>
      </div>
    </div>
  );
}
