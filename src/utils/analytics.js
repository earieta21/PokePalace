const MEASUREMENT_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID?.trim();
const INTERNAL_PATH_PREFIXES = [
  "/kiosk",
  "/staff",
  "/empleados",
  "/pos",
  "/kitchen",
  "/pair",
];
const ANALYTICS_GATE_KEY = "__pokePalaceAnalyticsNavigationGate";

const analyticsDisableKey = () => `ga-disable-${MEASUREMENT_ID}`;

export function isCustomerAnalyticsPath(pathname = "") {
  return !INTERNAL_PATH_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function setAnalyticsDisabled(disabled) {
  if (!MEASUREMENT_ID || typeof window === "undefined") return;
  window[analyticsDisableKey()] = disabled;
}

// GA4 Enhanced Measurement listens to history changes independently from
// send_page_view. Pause collection before every SPA navigation; CustomerLayout
// re-enables it only after the public page title and canonical URL are ready,
// then sends the single authoritative page_view.
function installNavigationGate() {
  if (typeof window === "undefined" || window[ANALYTICS_GATE_KEY]) return;
  window[ANALYTICS_GATE_KEY] = true;

  ["pushState", "replaceState"].forEach((method) => {
    const original = window.history?.[method];
    if (typeof original !== "function") return;
    window.history[method] = function gatedHistoryChange(...args) {
      setAnalyticsDisabled(true);
      return original.apply(this, args);
    };
  });
  window.addEventListener("popstate", () => setAnalyticsDisabled(true), true);
}

export function initAnalytics() {
  if (!MEASUREMENT_ID || typeof document === "undefined") return;
  if (!isCustomerAnalyticsPath(window.location.pathname)) {
    setAnalyticsDisabled(true);
    return;
  }
  if (document.querySelector(`script[data-poke-analytics="${MEASUREMENT_ID}"]`)) return;

  setAnalyticsDisabled(true);
  installNavigationGate();
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  });

  const script = document.createElement("script");
  script.async = true;
  script.dataset.pokeAnalytics = MEASUREMENT_ID;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

const ITEM_KEYS = new Set([
  "item_id",
  "item_name",
  "item_category",
  "item_variant",
  "price",
  "quantity",
  "index",
]);

function sanitizeItems(items) {
  if (!Array.isArray(items)) return undefined;
  return items.slice(0, 100).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    return Object.fromEntries(
      Object.entries(item).filter(([key, value]) =>
        ITEM_KEYS.has(key)
        && ["string", "number", "boolean"].includes(typeof value)),
    );
  }).filter((item) => item && (item.item_id || item.item_name));
}

export function analyticsItemFromCartLine(line, index = 0) {
  if (!line || typeof line !== "object") return null;
  const quantity = Math.max(1, Number(line.qty) || 1);
  const price = Number(line.price);

  if (line.kind === "promo2x1") {
    return {
      item_id: line.catalogId || "promo-2x1-bowls",
      item_name: "2x1 Bowls",
      item_category: "promo_bowls",
      price: Number.isFinite(price) ? price : 0,
      quantity,
      index,
    };
  }

  if (line.kind === "item") {
    return {
      item_id: line.catalogId || "menu_item",
      item_name: line.name || line.catalogId || "Menu item",
      item_category: line.category || "menu",
      price: Number.isFinite(price) ? price : 0,
      quantity,
      index,
    };
  }

  return {
    item_id: "custom_bowl",
    item_name: "Custom Bowl",
    item_category: "bowls",
    item_variant: line.bowlSize === "large" ? "large" : "medium",
    price: Number.isFinite(price) ? price : 0,
    quantity,
    index,
  };
}

export function analyticsItemsFromCart(cart) {
  return (Array.isArray(cart) ? cart : [])
    .map(analyticsItemFromCartLine)
    .filter(Boolean);
}

export function trackEvent(name, parameters = {}) {
  if (typeof window === "undefined") return;
  if (!isCustomerAnalyticsPath(window.location.pathname)) return;
  const safeParameters = Object.fromEntries(
    Object.entries(parameters).flatMap(([key, value]) => {
      if (key === "items") {
        const items = sanitizeItems(value);
        return items?.length ? [[key, items]] : [];
      }
      return ["string", "number", "boolean"].includes(typeof value)
        ? [[key, value]]
        : [];
    }),
  );
  window.dispatchEvent(new CustomEvent("pokepalace:analytics", {
    detail: { name, parameters: safeParameters },
  }));
  if (MEASUREMENT_ID && window.gtag) {
    window.gtag("event", name, safeParameters);
  }
}

export function trackPageView(path, title) {
  if (typeof window === "undefined" || !isCustomerAnalyticsPath(path)) return;
  setAnalyticsDisabled(false);
  trackEvent("page_view", {
    page_path: path,
    page_location: new URL(path, window.location.origin).href,
    page_title: title,
  });
}
