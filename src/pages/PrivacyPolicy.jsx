import { useLanguage } from "../i18n/LanguageContext";
import styles from "./PrivacyPolicy.module.css";

const CONTACT_EMAIL = "earrieta21@gmail.com";
const LEGAL_NAME = "Eric Alexander Arrieta Nova";
const LEGAL_RFC = "AINE020521HN6";

const CONTENT = {
  es: {
    title: "Aviso de Privacidad",
    updated: "Última actualización: 22 de julio de 2026",
    sections: [
      {
        title: "1. Responsable de los datos",
        body: [
          `Poke Palace ("nosotros") es el nombre comercial bajo el cual opera ${LEGAL_NAME} (RFC: ${LEGAL_RFC}), responsable del tratamiento de los datos personales que nos proporcionas a través de nuestro sitio web, aplicación y kioscos de autoservicio, de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).`,
          `Puedes contactarnos para cualquier duda relacionada con este aviso escribiendo a ${CONTACT_EMAIL}.`,
        ],
      },
      {
        title: "2. Datos que recopilamos",
        body: ["Recopilamos los siguientes datos cuando creas una cuenta, realizas un pedido o usas nuestros servicios:"],
        list: [
          "Datos de identificación y contacto: nombre, correo electrónico, número de teléfono.",
          "Credenciales de acceso: contraseña (almacenada de forma cifrada).",
          "Historial de pedidos, preferencias de menú y puntos de recompensas.",
          "Método de pago elegido (efectivo o tarjeta). Los pagos en línea se procesan a través de Clip; no almacenamos números de tarjeta en nuestros servidores.",
          "Información técnica básica del dispositivo/navegador para el funcionamiento de la app (incluyendo notificaciones push si las activas).",
        ],
      },
      {
        title: "3. Uso de tus datos",
        body: ["Utilizamos tus datos personales para:"],
        list: [
          "Crear y administrar tu cuenta y programa de recompensas.",
          "Procesar y dar seguimiento a tus pedidos (en tienda, kiosco o en línea).",
          "Procesar pagos de forma segura a través de nuestro proveedor de pagos.",
          "Enviarte notificaciones sobre el estado de tu pedido.",
          "Mejorar nuestros productos, menú y experiencia dentro de la app.",
          "Cumplir obligaciones legales y fiscales.",
        ],
      },
      {
        title: "4. Con quién compartimos tus datos",
        body: [
          "No vendemos tus datos personales. Podemos compartir información con terceros únicamente cuando es necesario para operar el servicio:",
        ],
        list: [
          "Clip (procesador de pagos) para completar transacciones en línea.",
          "OpenStreetMap para mostrar el mapa de nuestra ubicación dentro de la app.",
          "Google Maps, si eliges el botón \"Cómo llegar\", para abrir la ruta hacia nuestra sucursal.",
          "Proveedores de hospedaje e infraestructura tecnológica que almacenan nuestros datos de forma segura.",
          "Autoridades competentes cuando así lo exija la ley.",
        ],
      },
      {
        title: "5. Derechos ARCO",
        body: [
          `Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte (derechos ARCO) al tratamiento de tus datos personales, así como a revocar tu consentimiento en cualquier momento. Para ejercer estos derechos, envía tu solicitud a ${CONTACT_EMAIL} indicando tu nombre y el derecho que deseas ejercer. Responderemos en un plazo máximo de 20 días hábiles.`,
        ],
      },
      {
        title: "6. Conservación y seguridad de los datos",
        body: [
          "Conservamos tus datos personales únicamente durante el tiempo necesario para cumplir con las finalidades descritas en este aviso o mientras mantengas una cuenta activa con nosotros. Aplicamos medidas administrativas y técnicas razonables para proteger tus datos contra pérdida, uso indebido o acceso no autorizado.",
        ],
      },
      {
        title: "7. Cambios a este aviso",
        body: [
          "Podemos actualizar este aviso de privacidad periódicamente. Cualquier cambio será publicado en esta misma página junto con la fecha de la última actualización.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: July 22, 2026",
    sections: [
      {
        title: "1. Data controller",
        body: [
          `Poke Palace ("we") is the trade name under which ${LEGAL_NAME} (RFC: ${LEGAL_RFC}) operates, responsible for processing the personal data you provide through our website, app, and self-service kiosks, in accordance with Mexico's Federal Law on Protection of Personal Data Held by Private Parties (LFPDPPP).`,
          `You can reach us with any questions about this policy at ${CONTACT_EMAIL}.`,
        ],
      },
      {
        title: "2. Data we collect",
        body: ["We collect the following data when you create an account, place an order, or use our services:"],
        list: [
          "Identification and contact details: name, email address, phone number.",
          "Login credentials: password (stored encrypted).",
          "Order history, menu preferences, and rewards points.",
          "Chosen payment method (cash or card). Online payments are processed through Clip; we do not store card numbers on our servers.",
          "Basic device/browser information needed for the app to work (including push notifications if enabled).",
        ],
      },
      {
        title: "3. How we use your data",
        body: ["We use your personal data to:"],
        list: [
          "Create and manage your account and rewards program.",
          "Process and track your orders (in-store, kiosk, or online).",
          "Securely process payments through our payment provider.",
          "Send you notifications about your order status.",
          "Improve our products, menu, and in-app experience.",
          "Comply with legal and tax obligations.",
        ],
      },
      {
        title: "4. Who we share your data with",
        body: [
          "We do not sell your personal data. We may share information with third parties only when necessary to operate the service:",
        ],
        list: [
          "Clip (payment processor) to complete online transactions.",
          "OpenStreetMap to display our location map within the app.",
          "Google Maps, if you tap the \"Get Directions\" button, to open the route to our store.",
          "Hosting and technology infrastructure providers that securely store our data.",
          "Competent authorities when required by law.",
        ],
      },
      {
        title: "5. Your rights",
        body: [
          `You have the right to access, rectify, cancel, or object to the processing of your personal data, and to withdraw your consent at any time. To exercise these rights, send your request to ${CONTACT_EMAIL} with your name and the right you wish to exercise. We will respond within 20 business days.`,
        ],
      },
      {
        title: "6. Data retention and security",
        body: [
          "We retain your personal data only for as long as necessary to fulfill the purposes described in this policy, or while you keep an active account with us. We apply reasonable administrative and technical measures to protect your data against loss, misuse, or unauthorized access.",
        ],
      },
      {
        title: "7. Changes to this policy",
        body: [
          "We may update this privacy policy from time to time. Any changes will be posted on this page along with the last updated date.",
        ],
      },
    ],
  },
};

export default function PrivacyPolicy() {
  const { language } = useLanguage();
  const copy = CONTENT[language] ?? CONTENT.es;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.title}</h1>
        <p className={styles.updated}>{copy.updated}</p>
      </div>

      {copy.sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.list && (
            <ul>
              {section.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
