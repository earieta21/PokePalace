export const ACTIVE_ORDER_STORAGE_KEY = "pokeActiveOrderId";
const ORDER_TOKEN_KEY_PREFIX = "pokeOrderAccessToken:";

export function getOrderAccessToken(orderId) {
  if (!orderId) return null;
  return localStorage.getItem(`${ORDER_TOKEN_KEY_PREFIX}${orderId}`);
}

export function saveActiveOrder(orderId, orderToken = null) {
  if (orderToken) {
    localStorage.setItem(`${ORDER_TOKEN_KEY_PREFIX}${orderId}`, orderToken);
  }
  // Publish the active id last so another tab never observes the order before
  // its guest credential has been persisted.
  localStorage.setItem(ACTIVE_ORDER_STORAGE_KEY, orderId);
}

export function clearActiveOrder() {
  localStorage.removeItem(ACTIVE_ORDER_STORAGE_KEY);
}

export function getActiveOrderId() {
  return localStorage.getItem(ACTIVE_ORDER_STORAGE_KEY);
}
