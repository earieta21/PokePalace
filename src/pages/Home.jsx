import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Soup,
  MapPin,
  Leaf,
  Utensils,
} from "lucide-react";
import HeroSection from "../components/HeroSection";
import {
  computeBowlSubtotal,
  COMPLEMENT_FREE_LIMIT,
  PROMO_2X1_BOWLS_PRICE,
} from "../order/pricing";
import { useLanguage } from "../i18n/LanguageContext";
import { useOrder } from "../order/OrderContext";
import { AuthContext } from "../context/AuthContext";
import { useAvailability } from "../context/AvailabilityContext";
import { API_URL } from "../config";
import { COMBO_PALACE_PRICE } from "../data/comboPalace";
import styles from "./Home.module.css";
import salmon from "../assets/home/salmon-1200.webp";
import salmonSmall from "../assets/home/salmon-600.webp";
import shrimp from "../assets/home/shrimp-1200.webp";
import shrimpSmall from "../assets/home/shrimp-600.webp";
import veggie from "../assets/home/veggie-1200.webp";
import veggieSmall from "../assets/home/veggie-600.webp";
import fresh from "../assets/home/fresh-1200.webp";
import freshSmall from "../assets/home/fresh-600.webp";
import agua from "../assets/home/agua-1200.webp";
import aguaSmall from "../assets/home/agua-600.webp";

export default function Home() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const es = language === "es";
  const { addCatalogItem, reorder, startPromo2x1 } = useOrder();
  const { user, isLoggedIn, token } = useContext(AuthContext);
  const { promo2x1Active, comboPalaceActive } = useAvailability();
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    if (!isLoggedIn || !token) {
      setLastOrder(null);
      return undefined;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/orders/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setLastOrder(
          (data.orders || []).find(
            (order) =>
              order.status === "completed" &&
              (order.base || order.cartItems?.length > 0),
          ) || null,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, token]);

  // These photographs show custom bowls, not the fixed catalog recipes.
  const inspirations = [
    {
      image: salmon,
      small: salmonSmall,
      tag: es ? "PARA EL ANTOJO" : "FOR THE CRAVING",
      title: es ? "Salmón, por favor." : "Salmon, please.",
      text: es
        ? "Color, frescura y tu aderezo favorito."
        : "Color, freshness and your favorite dressing.",
      alt: es
        ? "Bowl real de salmón, pepino, zanahoria y wakame"
        : "Salmon bowl with cucumber, carrot and wakame",
    },
    {
      image: shrimp,
      small: shrimpSmall,
      tag: es ? "CON TODO EL SABOR" : "FULL OF FLAVOR",
      title: es ? "Hoy toca camarón." : "Make it shrimp.",
      text: es
        ? "Un toque cremoso y mucho que disfrutar."
        : "A creamy touch and plenty to enjoy.",
      alt: es
        ? "Bowl de camarón con edamame y aderezo de cilantro"
        : "Shrimp bowl with edamame and cilantro dressing",
    },
    {
      image: veggie,
      small: veggieSmall,
      tag: es ? "LLENO DE COLOR" : "COLOR IN EVERY BITE",
      title: es ? "Algo más verde." : "Go a little greener.",
      text: es
        ? "Haz tu mezcla con los ingredientes que te gustan."
        : "Mix it up with the ingredients you love.",
      alt: es
        ? "Bowl con tofu, mango, pepino, edamame y zanahoria"
        : "Bowl with tofu, mango, cucumber, edamame and carrot",
    },
  ];
  const steps = es
    ? [
        ["Elige tu base", "Arroz blanco, ensalada orgánica o quinoa."],
        ["Ponle tu proteína", "Mediano: 1 o 2 proteínas. Grande: 3."],
        [
          "Dale color",
          `Elige hasta ${COMPLEMENT_FREE_LIMIT} complementos incluidos.`,
        ],
        ["Termina con tu toque", "Aderezos, toppings y listo para disfrutar."],
      ]
    : [
        ["Pick your base", "White rice, organic greens or quinoa."],
        ["Choose your protein", "Medium: 1 or 2 proteins. Large: 3."],
        [
          "Add some color",
          `Choose up to ${COMPLEMENT_FREE_LIMIT} included add-ins.`,
        ],
        ["Make it yours", "Dressings, toppings and you're ready to dig in."],
      ];
  const recipes = [
    ["bowl-the-og", "menu.emeraldSalmon", "menu.emeraldSalmonDescription"],
    ["bowl-skinny", "menu.spicyTuna", "menu.spicyTunaDescription"],
    ["bowl-quinoa", "menu.tropicalShrimp", "menu.tropicalShrimpDescription"],
  ];

  return (
    <main className={styles.home}>
      <header className={styles.masthead}>
        <Link to="/" className={styles.brand} aria-label="Poke Palace, inicio">
          <Soup size={32} strokeWidth={1.6} />
          <span>
            poke palace<small>FRESH BOWLS. GOOD MOOD.</small>
          </span>
        </Link>
        <Link to="/ubicaciones" className={styles.location}>
          <MapPin size={16} />
          {es ? "Visítanos en Tijuana" : "Visit us in Tijuana"}
          <ArrowUpRight size={16} />
        </Link>
      </header>

      {isLoggedIn && (
        <div className={styles.welcomeCard}>
          <div>
            <strong>{t("home.welcomeBack", { name: user?.name || "" })}</strong>
            {lastOrder && <p>{t("home.reorderHint")}</p>}
          </div>
          {lastOrder && (
            <button
              className={styles.primaryBtn}
              onClick={() => {
                reorder(lastOrder);
                navigate("/summary");
              }}
            >
              {t("home.reorderCta")}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      )}

      <HeroSection />
      <div className={styles.values}>
        <span>
          <Leaf size={17} />
          {es ? "Ingredientes frescos" : "Fresh ingredients"}
        </span>
        <span>
          <Soup size={18} />
          {es ? "Hecho a tu gusto" : "Made your way"}
        </span>
        <span>
          <Utensils size={17} />
          {es
            ? "Disfrútalo en el local o para llevar"
            : "Dine in or take it to go"}
        </span>
      </div>

      <section className={styles.section} aria-labelledby="inspiration-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>
              {es ? "UN POCO DE INSPIRACIÓN" : "A LITTLE INSPIRATION"}
            </p>
            <h2 id="inspiration-title">
              {es ? "¿Cuál se te antoja hoy?" : "What are you craving?"}
            </h2>
          </div>
          <Link className={styles.textLink} to="/order">
            {es ? "Crear el mío" : "Create my own"}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className={styles.photoGrid}>
          {inspirations.map((item) => (
            <Link to="/order" className={styles.photoCard} key={item.tag}>
              <div className={styles.photoWrap}>
                <img
                  src={item.image}
                  srcSet={`${item.small} 600w, ${item.image} 1200w`}
                  sizes="(max-width: 620px) 100vw, 33vw"
                  alt={item.alt}
                  loading="lazy"
                  width="600"
                  height="600"
                />
                <span className={styles.roundArrow}>
                  <ArrowUpRight size={21} />
                </span>
              </div>
              <p className={styles.cardTag}>{item.tag}</p>
              <h3>{item.title}</h3>
              <p className={styles.cardDescription}>{item.text}</p>
            </Link>
          ))}
        </div>
        <p className={styles.photoNote}>
          {es
            ? "Bowls preparados en Poke Palace. Inspírate en estas combinaciones y arma la tuya."
            : "Bowls made at Poke Palace. Get inspired by these combinations and build your own."}
        </p>
      </section>

      <section className={styles.howSection} aria-labelledby="how-title">
        <div className={styles.prepPhoto}>
          <img
            src={fresh}
            srcSet={`${freshSmall} 600w, ${fresh} 1200w`}
            sizes="(max-width: 760px) 100vw, 40vw"
            alt={
              es
                ? "Un bowl recién preparado frente a nuestra barra de ingredientes"
                : "A freshly prepared bowl at our ingredient counter"
            }
            loading="lazy"
            width="600"
            height="800"
          />
          <span>
            {es
              ? "De nuestra barra a tu bowl."
              : "From our counter to your bowl."}
          </span>
        </div>
        <div className={styles.howCopy}>
          <p className={styles.eyebrow}>
            {es ? "ASÍ DE FÁCIL" : "AS SIMPLE AS THAT"}
          </p>
          <h2 id="how-title">
            {es ? "Tu bowl. Tus reglas." : "Your bowl. Your rules."}
          </h2>
          <ol className={styles.steps}>
            {steps.map(([title, description], i) => (
              <li key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link className={styles.lightBtn} to="/order">
            {es ? "Vamos a armarlo" : "Let's build it"}
            <ArrowUpRight size={19} />
          </Link>
        </div>
      </section>

      {promo2x1Active && (
        <section className={styles.promo}>
          <div>
            <p className={styles.eyebrow}>
              {es ? "HOY SE COMPARTE" : "BETTER TOGETHER"}
            </p>
            <h2>{es ? "2 bowls. 1 gran plan." : "2 bowls. 1 great plan."}</h2>
            <p>
              {es
                ? "Misma proteína en ambos (60 g + 60 g) y hasta 4 complementos por bowl. Solo para comer en el restaurante; no aplica para llevar."
                : "The same protein in both (60 g + 60 g) and up to 4 add-ins per bowl. Dine-in only; not available for takeout."}
            </p>
          </div>
          <div className={styles.promoAction}>
            <strong>
              ${PROMO_2X1_BOWLS_PRICE}
              <small> MXN</small>
            </strong>
            <button
              className={styles.primaryBtn}
              onClick={() => {
                startPromo2x1();
                navigate("/order");
              }}
            >
              {es ? "Armar mis 2 bowls" : "Build my 2 bowls"}
              <ArrowUpRight size={18} />
            </button>
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="recipes-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>
              {es ? "NOSOTROS PONEMOS LA RECETA" : "LEAVE THE RECIPE TO US"}
            </p>
            <h2 id="recipes-title">
              {es ? "Los de la casa." : "House favorites."}
            </h2>
          </div>
          <Link className={styles.textLink} to="/menu">
            {es ? "Menú completo" : "Full menu"}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className={styles.recipes}>
          {recipes.map(([catalogId, nameKey, descriptionKey], i) => (
            <button
              className={styles.recipe}
              key={catalogId}
              onClick={() => {
                addCatalogItem(
                  {
                    catalogId,
                    name: t(nameKey),
                    price: computeBowlSubtotal("normal"),
                  },
                  1,
                );
                navigate("/menu");
              }}
            >
              <span className={styles.recipeNumber}>0{i + 1}</span>
              <h3>{t(nameKey)}</h3>
              <p>{t(descriptionKey)}</p>
              <span className={styles.recipeBottom}>
                <strong>
                  ${computeBowlSubtotal("normal")} <small>MXN</small>
                </strong>
                <span>
                  {es ? "Agregar" : "Add"}
                  <ArrowRight size={17} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* El Combo Palace solo corre lunes, miércoles y viernes — sin esto
          el banner mandaba al menú en días en que el combo no está. */}
      {comboPalaceActive && (
      <section className={styles.combo} aria-labelledby="combo-title">
        <div className={styles.comboCopy}>
          <p className={styles.eyebrow}>
            {es ? "EL PLAN COMPLETO" : "THE WHOLE PACKAGE"}
          </p>
          <h2 id="combo-title">Combo Palace.</h2>
          <p>
            {es
              ? "Tu bowl de la casa, algo fresco para tomar y un final dulce. Todo en un solo combo."
              : "A house bowl, a refreshing drink and a sweet finish. All in one combo."}
          </p>
          <div className={styles.comboIncludes}>
            <span>1 bowl</span>
            <b>+</b>
            <span>{es ? "1 bebida" : "1 drink"}</span>
            <b>+</b>
            <span>1 Rice Cake</span>
          </div>
          <div className={styles.comboAction}>
            <strong>
              ${COMBO_PALACE_PRICE}
              <small> MXN</small>
            </strong>
            <Link className={styles.primaryBtn} to="/menu?select=combo-palace">
              {es ? "Elegir mi combo" : "Choose my combo"}
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
        <div className={styles.drinkPhoto}>
          <img
            src={agua}
            srcSet={`${aguaSmall} 600w, ${agua} 1200w`}
            sizes="(max-width: 760px) 100vw, 40vw"
            alt={
              es
                ? "Sirviendo un agua fresca en Poke Palace"
                : "Pouring a fresh drink at Poke Palace"
            }
            loading="lazy"
            width="600"
            height="800"
          />
          <span>
            {es
              ? "¿Y para tomar? Algo fresco."
              : "To drink? Something refreshing."}
          </span>
        </div>
      </section>
      )}

      <div className={styles.closing}>
        <Soup size={28} />
        <h2>{es ? "Buen bowl. Buen día." : "Good bowl. Good day."}</h2>
        <p>{es ? "Te esperamos en Poke Palace." : "See you at Poke Palace."}</p>
        <Link className={styles.textLink} to="/ubicaciones">
          {es ? "Cómo llegar" : "Find us"}
          <ArrowUpRight size={18} />
        </Link>
        <Link className={styles.dealsLink} to="/rewards-deals">
          {t("home.specialBowls")}
        </Link>
      </div>
    </main>
  );
}
