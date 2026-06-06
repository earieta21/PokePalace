import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import styles from "./MoreOptions.module.css";

const SECTIONS = [
  {
    title: "Mi Cuenta",
    items: [
      { icon: "👤", label: "Perfil y datos",       path: "/mi-cuenta" },
      { icon: "📦", label: "Mis pedidos",           path: "/mi-cuenta" },
      { icon: "⭐", label: "Premios y puntos",      path: "/rewards-deals" },
    ],
  },
  {
    title: "El Restaurante",
    items: [
      { icon: "📍", label: "Ubicaciones",           path: "/ubicaciones" },
      { icon: "🥗", label: "Menú completo",         path: "/order" },
      { icon: "🥑", label: "Información nutricional",path: null },
    ],
  },
  {
    title: "Ayuda",
    items: [
      { icon: "💬", label: "Contáctanos",           path: null },
      { icon: "❓", label: "Preguntas frecuentes",  path: null },
      { icon: "⚖️", label: "Aviso de privacidad",   path: null },
    ],
  },
];

export default function MoreOptions() {
  const { isLoggedIn, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleClick = (path) => {
    if (path) navigate(path);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Más opciones</h1>
        <p className={styles.pageSubtitle}>Explora todo lo que Poke Palace tiene para ti.</p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className={styles.section}>
          <p className={styles.sectionTitle}>{section.title}</p>
          <div className={styles.listCard}>
            {section.items.map((item, i) => (
              <button
                key={item.label}
                className={`${styles.listItem} ${i < section.items.length - 1 ? styles.listItemBorder : ""}`}
                onClick={() => handleClick(item.path)}
                disabled={!item.path}
              >
                <span className={styles.itemIcon}>{item.icon}</span>
                <span className={styles.itemLabel}>{item.label}</span>
                {item.path && <span className={styles.itemChevron}>›</span>}
                {!item.path && <span className={styles.itemSoon}>Próximamente</span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Auth section */}
      <section className={styles.section}>
        {isLoggedIn ? (
          <button className={styles.logoutBtn} onClick={logout}>
            Cerrar sesión
          </button>
        ) : (
          <div className={styles.authRow}>
            <button className={styles.primaryBtn} onClick={() => navigate("/login")}>
              Iniciar sesión
            </button>
            <button className={styles.ghostBtn} onClick={() => navigate("/register")}>
              Crear cuenta
            </button>
          </div>
        )}
      </section>

      <p className={styles.version}>Poke Palace · v1.0</p>
    </div>
  );
}
