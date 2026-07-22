import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer
      style={{
        padding: "24px 20px calc(90px + env(safe-area-inset-bottom))",
        textAlign: "center",
        fontSize: 12,
        color: "var(--text-3, #999)",
      }}
    >
      <p style={{ margin: 0 }}>{t("footer.operatedBy")}</p>
      <p style={{ margin: "4px 0 0" }}>
        <Link to="/aviso-de-privacidad" style={{ color: "inherit" }}>
          {t("footer.privacyLink")}
        </Link>
      </p>
    </footer>
  );
}
