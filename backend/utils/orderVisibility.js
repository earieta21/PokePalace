export const SCHEDULED_ORDER_LEAD_TIME_MS = 30 * 60 * 1000;

// Scheduled tickets become operational only when the kitchen is within the
// preparation window. `{ scheduledPickupTime: null }` also matches legacy
// orders where the field is missing.
export const scheduledOrderVisibilityFilter = (now = new Date()) => {
  const currentTime = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(currentTime.getTime())) {
    throw new TypeError("now must be a valid date");
  }

  return {
    $or: [
      { scheduledPickupTime: null },
      {
        scheduledPickupTime: {
          $lte: new Date(currentTime.getTime() + SCHEDULED_ORDER_LEAD_TIME_MS),
        },
      },
    ],
  };
};

