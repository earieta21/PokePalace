import { useContext, useEffect, useState } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const PAGE_SIZE = 25;

const dateTime = (value, emptyLabel = "—") => value
  ? new Date(value).toLocaleString("es-MX", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  : emptyLabel;

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export default function CustomersPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const api = createStaffApi(staffToken);
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          ...(search.trim() ? { q: search.trim() } : {}),
        });
        const data = await api.get(`/api/staff/customers?${params}`);
        if (!active) return;
        setCustomers(data.customers ?? []);
        setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
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
  }, [staffToken, page, search]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Clientes registrados</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${pagination.total} cuentas registradas en la página`}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className={styles.input}
          style={{ maxWidth: 360 }}
          type="search"
          placeholder="Buscar por nombre, correo o teléfono…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <p style={{ color: "#8b1a1a", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Compras realizadas</th>
              <th>Total gastado</th>
              <th>Última compra</th>
              <th>Puntos</th>
              <th>Puntos históricos</th>
              <th>Fecha de registro</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 28 }}>Cargando…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 28 }}>No se encontraron clientes</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer._id}>
                <td style={{ fontWeight: 600 }}>{customer.name}</td>
                <td>{customer.email}</td>
                <td className={styles.tdMono}>{customer.phone || "Sin teléfono"}</td>
                <td className={styles.tdMono}>{Number(customer.purchaseCount || 0).toLocaleString("es-MX")}</td>
                <td className={styles.tdMono}>{money.format(Number(customer.totalSpent || 0))}</td>
                <td className={styles.tdMuted}>{dateTime(customer.lastPurchaseAt, "Sin compras")}</td>
                <td className={styles.tdMono}>{Number(customer.points || 0).toLocaleString("es-MX")}</td>
                <td className={styles.tdMono}>{Number(customer.lifetimePoints || 0).toLocaleString("es-MX")}</td>
                <td className={styles.tdMuted}>{dateTime(customer.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 14 }}>
          <button className={styles.btnGhost} type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Anterior
          </button>
          <span className={styles.tdMuted}>Página {pagination.page} de {pagination.pages}</span>
          <button className={styles.btnGhost} type="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
