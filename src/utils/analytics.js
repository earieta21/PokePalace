const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

export function initAnalytics() {
  if (!MEASUREMENT_ID || typeof document === "undefined") return;
  if (document.querySelector(`script[data-poke-analytics="${MEASUREMENT_ID}"]`)) return;

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

export function trackEvent(name, parameters = {}) {
  if (typeof window === "undefined") return;
  const safeParameters = Object.fromEntries(
    Object.entries(parameters).filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value)),
  );
  window.dispatchEvent(new CustomEvent("pokepalace:analytics", {
    detail: { name, parameters: safeParameters },
  }));
  if (MEASUREMENT_ID && window.gtag) {
    window.gtag("event", name, safeParameters);
  }
}

export function trackPageView(path, title) {
  trackEvent("page_view", {
    page_path: path,
    page_title: title,
  });
}
