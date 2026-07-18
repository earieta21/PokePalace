import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./MoreOptions.module.css";

const SECTIONS = [
  {
    titleKey: "more.account",
    items: [
      { icon: "👤", labelKey: "more.profile", path: "/mi-cuenta" },
      { icon: "📦", labelKey: "more.orders", path: "/mi-cuenta" },
      { icon: "⭐", labelKey: "more.points", path: "/rewards-deals" },
    ],
  },
  {
    titleKey: "more.restaurant",
    items: [
      { icon: "📍", labelKey: "more.locations", path: "/ubicaciones" },
      { icon: "🥗", labelKey: "more.fullMenu", path: "/order" },
      { icon: "🥑", labelKey: "more.nutrition", path: null },
      { icon: "🔳", labelKey: "more.qrCode", path: "/qr" },
    ],
  },
  {
    titleKey: "more.help",
    items: [
      { icon: "💬", labelKey: "more.contact", path: null },
      { icon: "❓", labelKey: "more.faq", path: null },
      { icon: "⚖️", labelKey: "more.privacy", path: null },
    ],
  },
];

export default function MoreOptions() {
  const { isLoggedIn, logout } = useContext(AuthContext);
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleClick = (path) => {
    if (path) navigate(path);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("more.title")}</h1>
        <p className={styles.pageSubtitle}>{t("more.subtitle")}</p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.titleKey} className={styles.section}>
          <p className={styles.sectionTitle}>{t(section.titleKey)}</p>
          <div className={styles.listCard}>
            {section.items.map((item, i) => (
              <button
                key={item.labelKey}
                className={`${styles.listItem} ${i < section.items.length - 1 ? styles.listItemBorder : ""}`}
                onClick={() => handleClick(item.path)}
                disabled={!item.path}
              >
                <span className={styles.itemIcon}>{item.icon}</span>
                <span className={styles.itemLabel}>{t(item.labelKey)}</span>
                {item.path && <span className={styles.itemChevron}>›</span>}
                {!item.path && <span className={styles.itemSoon}>{t("more.soon")}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Auth section */}
      <section className={styles.section}>
        {isLoggedIn ? (
          <button className={styles.logoutBtn} onClick={logout}>
            {t("more.logout")}
          </button>
        ) : (
          <div className={styles.authRow}>
            <button className={styles.primaryBtn} onClick={() => navigate("/login")}>
              {t("more.login")}
            </button>
            <button className={styles.ghostBtn} onClick={() => navigate("/register")}>
              {t("more.register")}
            </button>
          </div>
        )}
      </section>

      <p className={styles.version}>Poke Palace · v1.0</p>
    </div>
  );
}
