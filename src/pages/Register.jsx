import { useContext, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./Register.module.css";

export default function Register() {
  const { register } = useContext(AuthContext);
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/order"); // ✅ al crear cuenta, manda a ordenar
    } catch (err) {
      setError(err.message || t("auth.registerError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("auth.registerTitle")}</h2>
          <p className={styles.subTitle}>
            {t("auth.registerSubtitle")}
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t("auth.name")}</label>
            <input
              className={styles.input}
              name="name"
              placeholder={t("auth.name")}
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t("auth.email")}</label>
            <input
              className={styles.input}
              name="email"
              type="email"
              placeholder={t("auth.email")}
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t("auth.password")}</label>
            <input
              className={styles.input}
              name="password"
              type="password"
              placeholder={t("auth.passwordPlaceholder")}
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          <button className={styles.button} disabled={loading}>
            {loading ? t("auth.creating") : t("auth.create")}
          </button>
        </form>

        <p className={styles.footer}>
          {t("auth.haveAccount")}{" "}
          <Link className={styles.link} to="/login">
            {t("auth.loginTitle")}
          </Link>
        </p>
      </div>
    </div>
  );
}
