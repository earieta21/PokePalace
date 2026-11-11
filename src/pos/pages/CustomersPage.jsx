import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { PROTEIN_LABELS } from "../../order/OrderLabels";
import { itemBrief } from "../orderLines";
import ui from "./CustomersPage.module.css";

const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

// El servidor manda los umbrales reales; estos solo sirven mientras carga.
const DEFAULT_THRESHOLDS = {
  newDays: 30,
  frequentWindowDays: 60,
  frequentMinPurchases: 3,
  dormantDays: 30,
  goldMinPoints: 300,
  expiryWarningDays: 60,
};

// Al elegir un segmento se cambia también el orden al que más sirve para él.
const SEGMENTS = [
  { id: "all", label: "Todos", sort: "recent", hint: () => "" },
  { id: "new", label: "Nuevos", sort: "recent", hint: (t) => `Se registraron en los últimos ${t.newDays} días.` },
  { id: "frequent", label: "Frecuentes", sort: "purchases", hint: (t) => `${t.frequentMinPurchases} o más compras en los últimos ${t.frequentWindowDays} días.` },
  { id: "dormant", label: "Dormidos", sort: "spent", hint: (t) => `Ya compraron, pero llevan más de ${t.dormantDays} días sin venir. Primero los que más gastaban.` },
  { id: "never", label: "Sin compras", sort: "recent", hint: () => "Crearon cuenta pero todavía no compran." },
  { id: "gold", label: "Oro", sort: "spent", hint: (t) => `${t.goldMinPoints} o más puntos históricos: ganan puntos al doble.` },
  { id: "expiring", label: "Puntos por vencer", sort: "expiry", hint: (t) => `Sus puntos se borran en los próximos ${t.expiryWarningDays} días si no vuelven a comprar.` },
];

const SORTS = [
  { id: "recent", label: "Registro más reciente" },
  { id: "spent", label: "Más gastado" },
  { id: "purchases", label: "Más compras" },
  { id: "lastPurchase", label: "Compra más reciente" },
  { id: "points", label: "Más puntos" },
  { id: "expiry", label: "Puntos que vencen antes" },
];

const TAG_BADGES = {
  gold: { label: "Oro", cls: "gold" },
  new: { label: "Nuevo", cls: "badgeBlue" },
  frequent: { label: "Frecuente", cls: "badgeGreen" },
  dormant: { label: "Dormido", cls: "badgeYellow" },
  expiring: { label: "Puntos por vencer", cls: "badgeRed" },
};

const SOURCE_LABEL = { online: "En línea", pos: "POS", whatsapp: "WhatsApp", delivery: "Delivery" };

const REDEMPTION_STATUS = {
  active: { label: "Activo", cls: "badgeGreen" },
  used: { label: "Usado", cls: "badgeGray" },
  expired: { label: "Vencido", cls: "badgeGray" },
  cancelled: { label: "Cancelado", cls: "badgeRed" },
};

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const number = (value) => Number(value || 0).toLocaleString("es-MX");

const dateOnly = (value, emptyLabel = "—") => value
  ? new Date(value).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })
  : emptyLabel;

const dateTime = (value, emptyLabel = "—") => value
  ? new Date(value).toLocaleString("es-MX", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  : emptyLabel;

function relativeDays(value) {
  if (!value) return "";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 60) return `hace ${days} días`;
  const months = Math.round(days / 30);
  return months < 24 ? `hace ${months} meses` : `hace ${Math.round(days / 365)} años`;
}

function expiryText(expiresAt) {
  if (!expiresAt) return "";
  return new Date(expiresAt).getTime() <= Date.now()
    ? `vencieron el ${dateOnly(expiresAt)}`
    : `vencen el ${dateOnly(expiresAt)}`;
}

function Tags({ tags, styles }) {
  const visible = (tags || []).filter((tag) => TAG_BADGES[tag]);
  if (visible.length === 0) return null;
  return (
    <span className={ui.tags}>
      {visible.map((tag) => {
        const { label, cls } = TAG_BADGES[tag];
        return (
          <span key={tag} className={`${styles.badge} ${cls === "gold" ? ui.goldBadge : styles[cls]}`}>
            {cls === "gold" ? "★ " : ""}{label}
          </span>
        );
      })}
    </span>
  );
}

export default function CustomersPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [segmentCounts, setSegmentCounts] = useState(null);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const closeDetail = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          segment,
          sort,
          ...(search.trim() ? { q: search.trim() } : {}),
        });
        const data = await api.get(`/api/staff/customers?${params}`);
        if (!active) return;
        setCustomers(data.customers ?? []);
        setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
        setSegmentCounts(data.segments ?? null);
        if (data.thresholds) setThresholds(data.thresholds);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, page, search, segment, sort]);

  const chooseSegment = (option) => {
    setSegment(option.id);
    setSort(option.sort);
    setPage(1);
  };

  const activeSegment = SEGMENTS.find((option) => option.id === segment) ?? SEGMENTS[0];
  const totalAccounts = segmentCounts?.all;
  const subtitle = loading && totalAccounts === undefined
    ? "Cargando…"
    : `${number(totalAccounts ?? pagination.total)} cuentas registradas en la página`;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Clientes registrados</h1>
          <p className={styles.pageSubtitle}>{subtitle}</p>
        </div>
      </div>

      <div className={ui.toolbar}>
        <input
          className={`${styles.input} ${ui.search}`}
          type="search"
          placeholder="Buscar por nombre, correo o teléfono…"
          aria-label="Buscar clientes"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <label className={ui.sortLabel}>
          <span>Ordenar por</span>
          <select
            className={`${styles.input} ${ui.sortSelect}`}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className={ui.chips} role="group" aria-label="Filtrar por tipo de cliente">
        {SEGMENTS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={segment === option.id}
            onClick={() => chooseSegment(option)}
          >
            {option.label}
            {segmentCounts && <span className={ui.chipCount}>{number(segmentCounts[option.id])}</span>}
          </button>
        ))}
      </div>
      {activeSegment.hint(thresholds) && <p className={ui.segmentHint}>{activeSegment.hint(thresholds)}</p>}

      {error && <p className={ui.errorText} role="alert">{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Compras</th>
              <th>Total gastado</th>
              <th>Última compra</th>
              <th>Puntos</th>
              <th>Registro</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={ui.tableMessage}>Cargando…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className={ui.tableMessage}>No hay clientes en esta vista</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer._id} className={ui.clickableRow} onClick={() => setSelectedId(customer._id)}>
                <td>
                  <button
                    type="button"
                    className={ui.nameButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(customer._id);
                    }}
                  >
                    {customer.name}
                  </button>
                  <Tags tags={customer.tags} styles={styles} />
                  <small className={ui.email}>{customer.email}</small>
                </td>
                <td className={styles.tdMono}>{customer.phone || "Sin teléfono"}</td>
                <td className={styles.tdMono}>{number(customer.purchaseCount)}</td>
                <td className={styles.tdMono}>{money.format(Number(customer.totalSpent || 0))}</td>
                <td className={styles.tdMuted} title={dateTime(customer.lastPurchaseAt, "")}>
                  {customer.lastPurchaseAt ? relativeDays(customer.lastPurchaseAt) : "Sin compras"}
                </td>
                <td className={styles.tdMono}>
                  {number(customer.points)}
                  {customer.pointsExpireAt && customer.tags?.includes("expiring") && (
                    <small className={ui.expiryNote}>{expiryText(customer.pointsExpireAt)}</small>
                  )}
                </td>
                <td className={styles.tdMuted}>{dateOnly(customer.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className={ui.pager}>
          <button className={styles.btnGhost} type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Anterior
          </button>
          <span className={styles.tdMuted}>Página {pagination.page} de {pagination.pages}</span>
          <button className={styles.btnGhost} type="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>
            Siguiente
          </button>
        </div>
      )}

      {selectedId && (
        <CustomerDetail id={selectedId} api={api} styles={styles} onClose={closeDetail} />
      )}
    </div>
  );
}

function CustomerDetail({ id, api, styles, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const closeButton = useRef(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api.get(`/api/staff/customers/${id}`)
      .then((result) => { if (active) setData(result); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [api, id]);

  useEffect(() => { closeButton.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const customer = data?.customer;

  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-label="Ficha del cliente" onClick={onClose}>
      <div className={ui.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={ui.dialogHead}>
          <div className={ui.dialogTitle}>
            <h2>{customer?.name ?? (error ? "Cliente" : "Cargando…")}</h2>
            {customer && <Tags tags={data.tags} styles={styles} />}
            {customer && (
              <p className={ui.contact}>
                {customer.email}
                {customer.phone ? <> · <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>{customer.phone}</a></> : " · Sin teléfono"}
              </p>
            )}
          </div>
          <button ref={closeButton} type="button" className={ui.closeButton} onClick={onClose} aria-label="Cerrar ficha">×</button>
        </div>

        {error && <p className={ui.errorText} role="alert">{error}</p>}
        {!data && !error && <p className={ui.muted}>Cargando la ficha…</p>}
        {data && <CustomerDetailBody data={data} styles={styles} />}
      </div>
    </div>
  );
}

function CustomerDetailBody({ data, styles }) {
  const { customer, stats, loyalty, favorites, orders, redemptions } = data;
  const sources = Object.entries(favorites?.bySource ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${SOURCE_LABEL[source] ?? source} ${count}`)
    .join(" · ");
  const expired = loyalty.pointsExpireAt && new Date(loyalty.pointsExpireAt).getTime() <= Date.now();

  return (
    <>
      <div className={ui.tiles}>
        <div className={ui.tile}><small>Compras</small><strong>{number(stats.purchaseCount)}</strong></div>
        <div className={ui.tile}><small>Total gastado</small><strong>{money.format(stats.totalSpent)}</strong></div>
        <div className={ui.tile}><small>Ticket promedio</small><strong>{stats.purchaseCount ? money.format(stats.avgTicket) : "—"}</strong></div>
        <div className={ui.tile}>
          <small>Última compra</small>
          <strong title={dateTime(stats.lastPurchaseAt, "")}>{stats.lastPurchaseAt ? relativeDays(stats.lastPurchaseAt) : "Nunca"}</strong>
        </div>
      </div>
      <p className={ui.muted}>
        Cliente desde el {dateOnly(customer.createdAt)}
        {stats.firstPurchaseAt ? ` · primera compra el ${dateOnly(stats.firstPurchaseAt)}` : " · todavía no compra"}
        {sources ? ` · ${sources}` : ""}
      </p>

      <section className={ui.section}>
        <h3>Puntos</h3>
        <div className={ui.pointsRow}>
          <div><small>Saldo</small><strong>{number(customer.points)}</strong></div>
          <div><small>Históricos</small><strong>{number(customer.lifetimePoints)}</strong></div>
          <div>
            <small>Nivel</small>
            <strong>{loyalty.isGold ? "★ Oro" : "Normal"}</strong>
          </div>
        </div>
        <p className={ui.muted}>
          {loyalty.isGold
            ? "Gana puntos al doble en cada compra."
            : `Le faltan ${number(loyalty.pointsToGold)} puntos históricos para llegar a Oro (${number(loyalty.goldMinPoints)}).`}
        </p>
        {loyalty.pointsExpireAt && (
          <p className={expired || loyalty.expiringSoon ? ui.warnText : ui.muted}>
            {expired
              ? `Sus ${number(customer.points)} puntos vencieron el ${dateOnly(loyalty.pointsExpireAt)} por no comprar en 12 meses.`
              : `Sus puntos vencen el ${dateOnly(loyalty.pointsExpireAt)} si no vuelve a comprar antes.`}
          </p>
        )}
      </section>

      {(favorites.topItems.length > 0 || customer.favoriteBowls.length > 0) && (
        <section className={ui.section}>
          <h3>Lo que más pide</h3>
          {favorites.topItems.length > 0 && (
            <ul className={ui.favList}>
              {favorites.topItems.map((item) => (
                <li key={item.key}><span>{item.key}</span><b>{number(item.count)}</b></li>
              ))}
            </ul>
          )}
          {favorites.topProteins.length > 0 && (
            <p className={ui.muted}>
              Proteína favorita: {favorites.topProteins.map((p) => PROTEIN_LABELS[p.key] ?? p.key).join(", ")}
            </p>
          )}
          {customer.favoriteBowls.length > 0 && (
            <p className={ui.muted}>
              Bowls guardados en su cuenta: {customer.favoriteBowls.map((bowl) => bowl.name).join(", ")}
            </p>
          )}
        </section>
      )}

      <section className={ui.section}>
        <h3>Últimos pedidos</h3>
        {orders.length === 0 ? (
          <p className={ui.muted}>Sin pedidos todavía.</p>
        ) : (
          <ul className={ui.orderList}>
            {orders.map((order) => (
              <li key={order._id} className={order.status === "cancelled" ? ui.cancelledOrder : undefined}>
                <div className={ui.orderTop}>
                  <span>{dateTime(order.createdAt)} · {SOURCE_LABEL[order.source] ?? order.source}</span>
                  <strong>{order.total != null ? money.format(order.total) : "—"}</strong>
                </div>
                <div className={ui.orderBrief}>{itemBrief(order)}</div>
                <div className={ui.orderMeta}>
                  {order.status === "cancelled" && <span className={`${styles.badge} ${styles.badgeRed}`}>Cancelado</span>}
                  {order.status !== "cancelled" && order.paymentStatus !== "paid" && (
                    <span className={`${styles.badge} ${styles.badgeYellow}`}>Sin pagar</span>
                  )}
                  {order.loyaltyPointsEarned > 0 && <span>+{number(order.loyaltyPointsEarned)} pts</span>}
                  {order.pointsRedeemed > 0 && <span>−{number(order.pointsRedeemed)} pts</span>}
                  {order.rewardCode && <span>Usó un premio</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {redemptions.length > 0 && (
        <section className={ui.section}>
          <h3>Premios</h3>
          <ul className={ui.orderList}>
            {redemptions.map((redemption) => {
              const status = REDEMPTION_STATUS[redemption.status] ?? { label: redemption.status, cls: "badgeGray" };
              return (
                <li key={redemption._id}>
                  <div className={ui.orderTop}>
                    <span>{redemption.rewardName}</span>
                    <span className={`${styles.badge} ${styles[status.cls]}`}>{status.label}</span>
                  </div>
                  <div className={ui.orderMeta}>
                    <span>{redemption.source === "social_story" ? "Por historia en redes" : `${number(redemption.pointsCost)} pts`}</span>
                    <span>Canjeado el {dateOnly(redemption.createdAt)}</span>
                    {redemption.usedAt && <span>usado el {dateOnly(redemption.usedAt)}</span>}
                    {redemption.status === "active" && redemption.expiresAt && <span>vence el {dateOnly(redemption.expiresAt)}</span>}
                    {redemption.code && <span className={ui.code}>{redemption.code}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
