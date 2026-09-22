import { useLanguage } from "../i18n/LanguageContext";
import styles from "./PrivacyPolicy.module.css";

const CONTACT_EMAIL = "earrieta21@gmail.com";
const LEGAL_NAME = "Eric Alexander Arrieta Nova";
const LEGAL_RFC = "AINE020521HN6";

const CONTENT = {
  es: {
    title: "Términos de Servicio",
    updated: "Última actualización: 6 de septiembre de 2026",
    sections: [
      {
        title: "1. Aceptación de los términos",
        body: [
          `Poke Palace ("nosotros") es el nombre comercial bajo el cual opera ${LEGAL_NAME} (RFC: ${LEGAL_RFC}). Al usar nuestro sitio web, aplicación, kioscos de autoservicio o cuentas en redes sociales, aceptas estos Términos de Servicio. Si no estás de acuerdo, te pedimos no utilizar nuestros servicios.`,
        ],
      },
      {
        title: "2. Descripción del servicio",
        body: [
          "Ofrecemos un servicio de pedidos de comida (poke bowls y productos relacionados) para consumo en tienda, para llevar o a domicilio, a través de nuestro sitio web, app, kioscos y redes sociales. También podemos publicar contenido (fotos, videos y promociones) en nuestras cuentas oficiales de redes sociales, incluyendo Instagram, Facebook y TikTok.",
        ],
      },
      {
        title: "3. Cuentas y programa de recompensas",
        body: [
          "Si creas una cuenta, eres responsable de mantener la confidencialidad de tu contraseña y de toda actividad realizada desde tu cuenta. El programa de recompensas y sus puntos no tienen valor monetario, no son transferibles ni canjeables por efectivo, y podemos ajustar sus reglas en cualquier momento.",
        ],
      },
      {
        title: "4. Pedidos, precios y pagos",
        body: [
          "Los precios mostrados incluyen los impuestos aplicables salvo que se indique lo contrario, y pueden cambiar sin previo aviso. Nos reservamos el derecho de rechazar o cancelar un pedido por disponibilidad de ingredientes, error evidente de precio, o sospecha de fraude. Los pagos en línea se procesan a través de nuestro proveedor de pagos (Clip); no almacenamos los datos completos de tu tarjeta.",
        ],
      },
      {
        title: "5. Contenido en redes sociales",
        body: [
          "El contenido que publicamos en nuestras redes sociales (fotos, videos, promociones y menús) es propiedad de Poke Palace o se usa con el permiso correspondiente. No está permitido reproducir ese contenido con fines comerciales sin autorización previa por escrito.",
        ],
      },
      {
        title: "6. Propiedad intelectual",
        body: [
          "El nombre \"Poke Palace\", su logotipo y los materiales de nuestro sitio, app y redes sociales son propiedad de Poke Palace y están protegidos por las leyes de propiedad intelectual aplicables. No se otorga ninguna licencia para su uso sin autorización expresa.",
        ],
      },
      {
        title: "7. Limitación de responsabilidad",
        body: [
          "Hacemos nuestro mejor esfuerzo por mantener la información de menú, precios y disponibilidad actualizada, pero no garantizamos que esté libre de errores en todo momento. En la medida permitida por la ley, no somos responsables por daños indirectos derivados del uso de nuestros servicios digitales.",
        ],
      },
      {
        title: "8. Ley aplicable",
        body: [
          "Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se resolverá ante los tribunales competentes de Tijuana, Baja California, salvo que la ley disponga otra cosa.",
        ],
      },
      {
        title: "9. Cambios a estos términos",
        body: [
          `Podemos actualizar estos Términos de Servicio periódicamente. Cualquier cambio será publicado en esta misma página junto con la fecha de la última actualización. Para dudas, escríbenos a ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  en: {
    title: "Terms of Service",
    updated: "Last updated: September 6, 2026",
    sections: [
      {
        title: "1. Acceptance of terms",
        body: [
          `Poke Palace ("we") is the trade name under which ${LEGAL_NAME} (RFC: ${LEGAL_RFC}) operates. By using our website, app, self-service kiosks, or social media accounts, you accept these Terms of Service. If you do not agree, please do not use our services.`,
        ],
      },
      {
        title: "2. Description of service",
        body: [
          "We offer a food ordering service (poke bowls and related products) for dine-in, takeout, or delivery, through our website, app, kiosks, and social media. We may also publish content (photos, videos, and promotions) on our official social media accounts, including Instagram, Facebook, and TikTok.",
        ],
      },
      {
        title: "3. Accounts and rewards program",
        body: [
          "If you create an account, you're responsible for keeping your password confidential and for all activity under your account. Rewards points have no monetary value, are non-transferable, cannot be redeemed for cash, and we may adjust the program's rules at any time.",
        ],
      },
      {
        title: "4. Orders, pricing, and payments",
        body: [
          "Displayed prices include applicable taxes unless stated otherwise, and may change without notice. We reserve the right to refuse or cancel an order due to ingredient availability, an obvious pricing error, or suspected fraud. Online payments are processed through our payment provider (Clip); we do not store your full card details.",
        ],
      },
      {
        title: "5. Social media content",
        body: [
          "Content we publish on our social media (photos, videos, promotions, and menus) is owned by Poke Palace or used with proper permission. Reproducing that content for commercial purposes without prior written authorization is not allowed.",
        ],
      },
      {
        title: "6. Intellectual property",
        body: [
          "The \"Poke Palace\" name, logo, and materials on our site, app, and social media are owned by Poke Palace and protected under applicable intellectual property laws. No license is granted for their use without express authorization.",
        ],
      },
      {
        title: "7. Limitation of liability",
        body: [
          "We do our best to keep menu, pricing, and availability information up to date, but we don't guarantee it's error-free at all times. To the extent permitted by law, we are not liable for indirect damages arising from the use of our digital services.",
        ],
      },
      {
        title: "8. Governing law",
        body: [
          "These terms are governed by the laws of Mexico. Any dispute will be resolved before the competent courts of Tijuana, Baja California, unless the law provides otherwise.",
        ],
      },
      {
        title: "9. Changes to these terms",
        body: [
          `We may update these Terms of Service from time to time. Any changes will be posted on this page along with the last updated date. For questions, email us at ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
};

export default function TermsOfService() {
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
        </section>
      ))}
    </div>
  );
}
