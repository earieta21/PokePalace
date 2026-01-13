import { useContext, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form);
      navigate("/order");
    } catch (err) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
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
            <div className={styles.label}>Email</div>
            <input
              className={styles.input}
              name="email"
              placeholder="tucorreo@email.com"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
            />
          </div>

          <div>
            <div className={styles.label}>Password</div>
            <input
              className={styles.input}
              name="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button className={styles.primaryBtn} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <div className={styles.secondaryRow}>
              <span>
                ¿No tienes cuenta?{" "}
                <Link className={styles.link} to="/register">
                  Regístrate
                </Link>
              </span>
              <Link className={styles.link} to="/">
                Volver
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
