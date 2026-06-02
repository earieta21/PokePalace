import { useContext, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // a dónde quería ir el usuario antes de caer en login
  const from = location.state?.from || "/order";

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form);

      // ✅ después de login, regresa a donde venía (ej. /summary o /checkout)
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    const safeTarget = ["/checkout", "/mi-cuenta"].some((path) =>
      String(from).startsWith(path)
    )
      ? "/summary"
      : from;

    navigate(safeTarget, {
      replace: true,
      state: { guest: true },
    });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.badge}>Poke Palace</div>
          <h2 className={styles.title}>Iniciar sesión</h2>
          <p className={styles.subtitle}>
            Accede para guardar tus pedidos, ver historial y puntos.
          </p>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <div>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className={styles.input}
              name="email"
              type="email"
              placeholder="tucorreo@email.com"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className={styles.label} htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              className={styles.input}
              name="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button className={styles.primaryBtn} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <button
              type="button"
              className={styles.guestButton}
              onClick={handleGuest}
              disabled={loading}
            >
              Continuar como invitado
            </button>

            <div className={styles.secondaryRow}>
              <span>
                ¿No tienes cuenta?{" "}
                <Link className={styles.link} to="/register">
                  Regístrate
                </Link>
              </span>
              <button
                type="button"
                className={styles.link}
                onClick={() => navigate(-1)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Volver
              </button>
            </div>
          </div>
        </form>

        <div className={styles.staffDivider} />
        <Link to="/staff/login" className={styles.staffLink}>
          ¿Eres del personal? → Acceso al Portal
        </Link>
      </div>
    </div>
  );
}
