import { API_URL } from "../config";

const BASE = API_URL;

/**
 * Returns a small API client pre-loaded with the staff JWT token.
 * Usage:  const api = useStaffApi();  api.get("/api/staff/orders")
 */
export function createStaffApi(token) {
  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  const handleRes = async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data?.msg || data?.message || `HTTP ${res.status}`);
      error.status = res.status;
      error.retryable = Boolean(data?.retryable || res.status >= 500);
      error.orderId = data?.orderId || data?.order?._id || null;
      throw error;
    }
    return data;
  };

  return {
    get: (path) =>
      fetch(`${BASE}${path}`, { headers: headers() }).then(handleRes),

    post: (path, body) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      }).then(handleRes),

    patch: (path, body) =>
      fetch(`${BASE}${path}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      }).then(handleRes),

    put: (path, body) =>
      fetch(`${BASE}${path}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(body),
      }).then(handleRes),

    // Sube un archivo (Blob) tal cual como cuerpo de la petición; los datos
    // que lo acompañan van en el query string de `path`.
    upload: (path, blob) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream", Authorization: `Bearer ${token}` },
        body: blob,
      }).then(handleRes),

    delete: (path, body) =>
      fetch(`${BASE}${path}`, {
        method: "DELETE",
        headers: headers(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }).then(handleRes),
  };
}
