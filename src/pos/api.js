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
    if (!res.ok) throw new Error(data?.msg || data?.message || `HTTP ${res.status}`);
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

    delete: (path) =>
      fetch(`${BASE}${path}`, {
        method: "DELETE",
        headers: headers(),
      }).then(handleRes),
  };
}
