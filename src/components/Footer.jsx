import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { GOOGLE_MAPS_URL } from "../config";
import styles from "./Footer.module.css";

export default function Footer() {
  const { t, language } = useLanguage();
  const es = language !== "en";

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div>
          <p className={styles.brand}>poke palace</p>
          <p className={styles.tagline}>{es ? "Fresh bowls. Good mood. Hecho en Tijuana." : "Fresh bowls. Good mood. Made in Tijuana."}</p>
        </div>
        <div className={styles.column}>
          <strong>{es ? "VISÍTANOS" : "VISIT US"}</strong>
          <span>Plaza La Estación, Local 24<br />Tijuana, B.C.</span>
          <span>{es ? "Todos los días · 11 AM–9 PM" : "Every day · 11 AM–9 PM"}</span>
          <a href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">{es ? "Cómo llegar" : "Get directions"}</a>
        </div>
        <div className={styles.column}>
          <strong>POKE PALACE</strong>
          <Link to="/menu">{es ? "Menú" : "Menu"}</Link>
          <Link to="/rewards-deals">{es ? "Premios" : "Rewards"}</Link>
          <Link to="/ayuda">{es ? "Ayuda y contacto" : "Help and contact"}</Link>
          <a href="tel:+526631086583">+52 663 108 6583</a>
        </div>
      </div>
      <div className={styles.legal}>
        <span>© {new Date().getFullYear()} Poke Palace</span>
        <Link to="/aviso-de-privacidad">{t("footer.privacyLink")}</Link>
        <Link to="/terminos-de-servicio">{es ? "Términos de servicio" : "Terms of service"}</Link>
        <Link to="/ayuda#alergenos">{es ? "Alérgenos" : "Allergens"}</Link>
      </div>
    </footer>
  );
}
