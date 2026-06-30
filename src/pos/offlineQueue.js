const QUEUE_KEY = "pos_offline_order_queue";

const readQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const getQueuedOrders = () => readQueue();

export const queueOrder = (orderPayload) => {
  const queue = readQueue();
  const entry = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    payload: orderPayload,
  };
  queue.push(entry);
  writeQueue(queue);
  return entry;
};

const removeFromQueue = (localId) => {
  writeQueue(readQueue().filter((e) => e.localId !== localId));
};

// Network-level failures (offline, DNS, server unreachable) throw a TypeError
// in fetch; HTTP error responses (4xx/5xx) reject with a normal Error from
// the API client and should NOT be queued for retry — they need a human.
export const isNetworkError = (err) =>
  err instanceof TypeError || err?.message === "Failed to fetch";

// Sends every queued order in order, stopping at the first failure so we
// don't reorder or skip pending tickets. Returns how many were flushed.
export const flushQueuedOrders = async (api, { onSuccess } = {}) => {
  const queue = readQueue();
  let sent = 0;

  for (const entry of queue) {
    try {
      await api.post("/api/staff/orders", entry.payload);
      removeFromQueue(entry.localId);
      sent += 1;
      onSuccess?.(entry);
    } catch (err) {
      if (isNetworkError(err)) break; // still offline — stop and retry later
      removeFromQueue(entry.localId); // bad request — drop it, it'll never succeed
    }
  }

  return sent;
};
