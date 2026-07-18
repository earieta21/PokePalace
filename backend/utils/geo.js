// Ubicación real del restaurante (misma que usamos en el JSON-LD del sitio).
export const RESTAURANT_LOCATION = { lat: 32.455826, lng: -116.919307 };

// Radio de tolerancia — suficiente para GPS impreciso dentro del local
// (el GPS de un celular en interiores puede desviarse 50-100m fácilmente).
export const MAX_DISTANCE_METERS = 200;

// Fórmula de Haversine — distancia en metros entre dos coordenadas.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinRestaurant(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  return distanceMeters(lat, lng, RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng) <= MAX_DISTANCE_METERS;
}
