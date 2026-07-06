import { useContext, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useContext(AuthContext);
  const { t } = useLanguage();
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
      setError(err.message || t("auth.loginError"));
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
          <h2 className={styles.title}>{t("auth.loginTitle")}</h2>
          <p className={styles.subtitle}>
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <div>
            <label className={styles.label} htmlFor="login-email">{t("auth.email")}</label>
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
            <label className={styles.label} htmlFor="login-password">{t("auth.password")}</label>
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
              {loading ? t("auth.entering") : t("auth.enter")}
            </button>

            <button
              type="button"
              className={styles.guestButton}
              onClick={handleGuest}
              disabled={loading}
            >
              {t("auth.guest")}
            </button>

            <div className={styles.secondaryRow}>
              <span>
                {t("auth.noAccount")}{" "}
                <Link className={styles.link} to="/register">
                  {t("auth.registerLink")}
                </Link>
              </span>
              <button
                type="button"
                className={styles.link}
                onClick={() => navigate(-1)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {t("auth.back")}
              </button>
            </div>
          </div>
        </form>

        <div className={styles.staffDivider} />
        <Link to="/staff/login" className={styles.staffLink}>
          {t("auth.staff")}
        </Link>
      </div>
    </div>
  );
}
