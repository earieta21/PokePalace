import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, Clock3, MapPin, MessageCircle, Phone, ShoppingBag } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { GOOGLE_MAPS_URL } from "../config";
import styles from "./HelpPage.module.css";

const PHONE_DISPLAY = "+52 663 108 6583";
const PHONE_LINK = "+526631086583";
const WHATSAPP_URL = `https://wa.me/${PHONE_LINK.replace("+", "")}`;

const FAQ = {
  es: [
    ["¿Puedo pedir en línea?", "Sí. Arma tu bowl, confirma tu pedido y elige recoger o comer en el restaurante."],
    ["¿Cuál es el horario?", "Abrimos todos los días de 11:00 AM a 9:00 PM."],
    ["¿Puedo cambiar o cancelar un pedido?", "Llámanos cuanto antes. Si la cocina ya comenzó a prepararlo, puede que no sea posible modificarlo."],
    ["¿Cómo funcionan los puntos?", "Inicia sesión al ordenar para acumular puntos y canjearlos desde la sección Premios."],
    ["¿Tienen opciones vegetarianas?", "Sí, puedes elegir tofu y combinarlo con las bases, complementos y salsas disponibles."],
  ],
  en: [
    ["Can I order online?", "Yes. Build your bowl, confirm your order and choose pickup or dine-in."],
    ["What are your hours?", "We are open every day from 11:00 AM to 9:00 PM."],
    ["Can I change or cancel an order?", "Call us as soon as possible. Once the kitchen starts preparing it, changes may no longer be possible."],
    ["How do rewards work?", "Sign in when ordering to earn points and redeem them from the Rewards section."],
    ["Do you have vegetarian options?", "Yes. Choose tofu and combine it with the available bases, add-ins and sauces."],
  ],
};

export default function HelpPage() {
  const { language } = useLanguage();
  const { hash } = useLocation();
  const es = language !== "en";
  const faq = FAQ[es ? "es" : "en"];

  useEffect(() => {
    if (!hash) return;
    window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [hash]);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{es ? "ESTAMOS PARA AYUDARTE" : "WE ARE HERE TO HELP"}</p>
        <h1>{es ? "Ayuda, contacto y alérgenos." : "Help, contact and allergens."}</h1>
        <p>{es ? "Respuestas rápidas y formas directas de comunicarte con Poke Palace." : "Quick answers and direct ways to reach Poke Palace."}</p>
      </header>

      <section className={styles.contactGrid} aria-labelledby="contact-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{es ? "CONTACTO" : "CONTACT"}</p>
          <h2 id="contact-title">{es ? "Hablemos." : "Let’s talk."}</h2>
        </div>
        <a className={styles.contactCard} href={WHATSAPP_URL} target="_blank" rel="noreferrer">
          <MessageCircle aria-hidden="true" />
          <strong>WhatsApp</strong>
          <span>{es ? "Escríbenos directamente" : "Message us directly"}</span>
        </a>
        <a className={styles.contactCard} href={`tel:${PHONE_LINK}`}>
          <Phone aria-hidden="true" />
          <strong>{PHONE_DISPLAY}</strong>
          <span>{es ? "Llamar al restaurante" : "Call the restaurant"}</span>
        </a>
        <a className={styles.contactCard} href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">
          <MapPin aria-hidden="true" />
          <strong>Plaza La Estación</strong>
          <span>{es ? "Abrir indicaciones" : "Open directions"}</span>
        </a>
      </section>

      <section className={styles.infoBand}>
        <div><Clock3 aria-hidden="true" /><strong>{es ? "Todos los días" : "Every day"}</strong><span>11:00 AM – 9:00 PM</span></div>
        <div><ShoppingBag aria-hidden="true" /><strong>{es ? "Recoger o comer aquí" : "Pickup or dine-in"}</strong><span>{es ? "Ordena en línea" : "Order online"}</span></div>
        <Link to="/order">{es ? "Armar mi bowl" : "Build my bowl"}</Link>
      </section>

      <section className={styles.contentSection} id="faq" aria-labelledby="faq-title">
        <p className={styles.eyebrow}>FAQ</p>
        <h2 id="faq-title">{es ? "Preguntas frecuentes." : "Frequently asked questions."}</h2>
        <div className={styles.faqList}>
          {faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.allergenSection} id="alergenos" aria-labelledby="allergen-title">
        <AlertTriangle aria-hidden="true" />
        <div>
          <p className={styles.eyebrow}>{es ? "NUTRICIÓN Y ALÉRGENOS" : "NUTRITION AND ALLERGENS"}</p>
          <h2 id="allergen-title">{es ? "Cuéntanos antes de ordenar." : "Tell us before ordering."}</h2>
          <p>{es
            ? "Nuestro menú puede contener pescado, mariscos, soya, ajonjolí, gluten, huevo, lácteos y cacahuate. Los ingredientes se preparan en áreas compartidas, por lo que no podemos garantizar ausencia de contacto cruzado. Si tienes una alergia, llama al restaurante antes de hacer tu pedido."
            : "Our menu may contain fish, shellfish, soy, sesame, gluten, egg, dairy and peanuts. Ingredients are prepared in shared areas, so we cannot guarantee there will be no cross-contact. If you have an allergy, call the restaurant before ordering."}</p>
          <a href={`tel:${PHONE_LINK}`}>{es ? "Consultar al restaurante" : "Ask the restaurant"}</a>
        </div>
      </section>
    </main>
  );
}
