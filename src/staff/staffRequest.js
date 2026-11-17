export async function readStaffResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(response.status === 401
      ? "Tu sesión venció. Vuelve a ingresar con tu PIN."
      : data?.message || data?.msg || "No se pudo confirmar la operación. Intenta de nuevo.");
    error.status = response.status;
    throw error;
  }
  return data;
}
