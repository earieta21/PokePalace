import { useCallback, useEffect, useMemo, useState } from "react";
import { createStaffApi } from "../pos/api";

// Vincular la tienda con Uber Eats (solo dueño/admin). Sin este paso Uber no
// manda los pedidos de la tienda a la comanda aunque la app esté aprobada.
// Flujo: Conectar con Uber → el dueño autoriza en Uber → regresa aquí con la
// lista de sus tiendas → Activar en la tienda correcta.

const ENV_LABEL = { sandbox: "Pruebas (sandbox)", production: "Producción" };
const fmtDate = (value) => (value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "");

function readReturnNotice() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const result = params.get("uber");
  if (!result) return null;
  const storeCount = params.has("tiendas") ? Number(params.get("tiendas")) : null;
  const reason = params.get("motivo");
  if (result === "conectado") {
    return {
      ok: storeCount !== 0,
      text: storeCount === 0
        ? "Uber autorizó la app, pero no regresó ninguna tienda para esa cuenta."
        : "Uber autorizó la app. Elige abajo la tienda que quieres activar.",
    };
  }
  return { ok: false, text: `No se pudo conectar con Uber: ${reason || "intenta de nuevo"}` };
}

// Quita los datos del regreso de Uber de la URL, para que recargar la página
// no vuelva a mostrar el aviso.
function clearReturnParams() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("uber")) return;
  params.delete("uber"); params.delete("tiendas"); params.delete("motivo");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export default function UberEatsConnect({ token }) {
  const api = useMemo(() => createStaffApi(token), [token]);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(() => readReturnNotice());

  const load = useCallback(() => api.get("/api/staff/integrations/uber/status")
    .then((data) => { setStatus(data); setError(""); })
    .catch((e) => setError(e.message)), [api]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { clearReturnParams(); }, []);

  const connect = async () => {
    setBusy("connect"); setError("");
    try {
      const { url } = await api.post("/api/staff/integrations/uber/connect", {});
      window.location.assign(url);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };

  const activate = async (store) => {
    if (!window.confirm(`¿Activar Poke Palace en «${store.name}»? Los pedidos de esa tienda en Uber Eats llegarán a la comanda.`)) return;
    setBusy(store.storeId); setError(""); setNotice(null);
    try {
      const { status: next } = await api.post("/api/staff/integrations/uber/activate", { storeId: store.storeId });
      setStatus(next);
      setNotice({ ok: true, text: `Listo: «${store.name}» quedó vinculada. Los pedidos de Uber llegarán a la comanda.` });
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setBusy("");
    }
  };

  const active = status?.activeStoreId && !status?.deactivatedAt;

  return (
    <div className="mb-6 rounded-2xl border border-white/5 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Uber Eats</h2>
          <p className="mt-1 text-sm text-slate-400">
            Vincula tu tienda para que los pedidos de Uber lleguen solos a la comanda.
          </p>
        </div>
        {status && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.environment === "production" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
            {ENV_LABEL[status.environment] || status.environment}
          </span>
        )}
      </div>

      {notice && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${notice.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`} role="status">
          {notice.text}
        </p>
      )}
      {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300" role="alert">{error}</p>}

      {!status ? (
        !error && <p className="mt-3 text-sm text-slate-500">Cargando…</p>
      ) : !status.configured ? (
        <p className="mt-3 text-sm text-amber-300">
          Faltan las credenciales de Uber en el servidor (UBER_EATS_CLIENT_ID y UBER_EATS_CLIENT_SECRET en Render).
        </p>
      ) : (
        <>
          <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${active ? "bg-emerald-500/10 text-emerald-200" : "bg-white/5 text-slate-300"}`}>
            {active ? (
              <>✓ Vinculada a <strong>{status.activeStoreName}</strong>{status.activatedAt ? ` desde ${fmtDate(status.activatedAt)}` : ""}{status.activatedBy ? ` (por ${status.activatedBy})` : ""}.</>
            ) : status.deactivatedAt ? (
              <>Uber desconectó «{status.activeStoreName}» el {fmtDate(status.deactivatedAt)}. Vuelve a conectar para activarla.</>
            ) : (
              <>Sin tienda vinculada todavía.</>
            )}
          </div>

          {status.canActivate && status.stores.length > 0 && (
            <ul className="mt-3 space-y-2">
              {status.stores.map((store) => {
                const isActive = active && store.storeId === status.activeStoreId;
                return (
                  <li key={store.storeId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
                    <span className="min-w-0">
                      <strong className="block text-sm text-white">{store.name}</strong>
                      {store.address && <small className="block text-xs text-slate-400">{store.address}</small>}
                    </span>
                    <button
                      type="button"
                      onClick={() => activate(store)}
                      disabled={Boolean(busy) || isActive}
                      className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isActive ? "Activa" : busy === store.storeId ? "Activando…" : "Activar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {status.canActivate && status.stores.length === 0 && (
            <p className="mt-3 text-sm text-amber-300">Uber no regresó tiendas para esa cuenta. Revisa que entraste con la cuenta del restaurante (o la tienda de prueba).</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={connect}
              disabled={Boolean(busy)}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
            >
              {busy === "connect" ? "Abriendo Uber…" : active ? "Volver a conectar" : "Conectar con Uber"}
            </button>
            <small className="text-xs text-slate-500">
              Redirect URI para el panel de Uber: <code className="select-all text-slate-300">{status.redirectUri}</code>
            </small>
          </div>
        </>
      )}
    </div>
  );
}
