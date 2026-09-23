import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { computeBowlSubtotal } from "../order/pricing";
import bowls from "../assets/home/bowls-1200.webp";
import bowlsSmall from "../assets/home/bowls-600.webp";
import styles from "./HeroSection.module.css";

export default function HeroSection() {
  const { language } = useLanguage();
  const es = language === "es";
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span /> POKE BOWLS · TIJUANA
        </p>
        <h1 id="home-title">
          {es ? "Se ve rico." : "Looks good."}
          <br />
          <em>{es ? "Sabe mejor." : "Tastes better."}</em>
        </h1>
        <p className={styles.description}>
          {es
            ? "Tu proteína favorita, ingredientes llenos de color y ese aderezo que lo cambia todo. Tu próximo bowl empieza aquí."
            : "Your favorite protein, colorful ingredients and the dressing that brings it all together. Your next bowl starts here."}
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} to="/order">
            {es ? "Armar mi bowl" : "Build my bowl"}
            <ArrowUpRight size={20} />
          </Link>
          <Link className={styles.secondary} to="/menu">
            {es ? "Ver el menú" : "See the menu"}
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className={styles.prices}>
          <div>
            <span>{es ? "MEDIANO" : "MEDIUM"}</span>
            <strong>
              ${computeBowlSubtotal("normal")}
              <small> MXN</small>
            </strong>
            <p>{es ? "1 o 2 proteínas · 100 g" : "1 or 2 proteins · 100 g"}</p>
          </div>
          <div>
            <span>{es ? "GRANDE" : "LARGE"}</span>
            <strong>
              ${computeBowlSubtotal("large")}
              <small> MXN</small>
            </strong>
            <p>{es ? "3 proteínas · 120 g" : "3 proteins · 120 g"}</p>
          </div>
        </div>
        <p className={styles.finePrint}>
          {es
            ? "Precios base. Extras y proteínas premium con costo adicional."
            : "Base prices. Extras and premium proteins cost additional."}
        </p>
      </div>
      <div className={styles.media}>
        <img
          src={bowls}
          srcSet={`${bowlsSmall} 600w, ${bowls} 1200w`}
          sizes="(max-width: 760px) 100vw, 55vw"
          width="1200"
          height="1249"
          fetchPriority="high"
          alt={
            es
              ? "Dos bowls recién preparados en la barra de Poke Palace"
              : "Two freshly prepared bowls at Poke Palace"
          }
        />
        <div className={styles.photoLabel}>
          <span>POKE PALACE</span>
          <strong>{es ? "Así se come aquí." : "This is how we bowl."}</strong>
          <ArrowUpRight size={26} />
        </div>
      </div>
    </section>
  );
}
