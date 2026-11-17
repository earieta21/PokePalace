import { useRef, useState } from "react";

// Keep the form intact until the server acknowledges the change.
export default function useStaffAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function run(action) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true); setError(""); setSaved(false);
    try {
      await action();
      setSaved(true);
      return true;
    } catch (err) {
      setError(err.message || "No se pudo guardar. Intenta de nuevo.");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, saved, run };
}
