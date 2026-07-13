export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5001" : "https://pokepalace.onrender.com");

export const GOOGLE_MAPS_URL =
  "https://maps.app.goo.gl/XY9uU2vr8MER54CG7?g_st=ic";

// Google Business Profile can provide a direct "Ask for reviews" link. Until
// that link is configured, use the verified Maps listing for this location.
export const GOOGLE_REVIEW_URL =
  import.meta.env.VITE_GOOGLE_REVIEW_URL || GOOGLE_MAPS_URL;
