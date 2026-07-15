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

export const createClientOrderId = () => {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `pos-${randomPart}`;
};

export const queueOrder = (orderPayload) => {
  const queue = readQueue();
  const payload = {
    ...orderPayload,
    clientOrderId: orderPayload.clientOrderId || createClientOrderId(),
  };
  const entry = {
    localId: payload.clientOrderId,
    queuedAt: new Date().toISOString(),
    payload,
  };
  const existing = queue.find((queued) => queued.payload?.clientOrderId === payload.clientOrderId);
  if (existing) return existing;
  queue.push(entry);
  writeQueue(queue);
  return entry;
};

const removeFromQueue = (localId) => {
  writeQueue(readQueue().filter((e) => e.localId !== localId));
};

// Network-level failures (offline, DNS, server unreachable) throw a TypeError
// in fetch; HTTP error responses reject with a normal Error from the API
// client and remain visible in the queue until they can be reconciled.
export const isNetworkError = (err) =>
  err instanceof TypeError || err?.message === "Failed to fetch";

// Sends every queued order in order, stopping at the first failure so we
// don't reorder or skip pending tickets. Returns how many were flushed.
export const flushQueuedOrders = async (api, { onSuccess, onError } = {}) => {
  let queue = readQueue();
  let migrated = false;
  queue = queue.map((entry) => {
    if (entry.payload?.clientOrderId) return entry;
    migrated = true;
    const clientOrderId = entry.localId ? `pos-${entry.localId}` : createClientOrderId();
    return {
      ...entry,
      localId: clientOrderId,
      payload: { ...entry.payload, clientOrderId },
    };
  });
  if (migrated) writeQueue(queue);
  let sent = 0;

  for (const entry of queue) {
    try {
      await api.post("/api/staff/orders", entry.payload);
      removeFromQueue(entry.localId);
      sent += 1;
      onSuccess?.(entry);
    } catch (err) {
      if (isNetworkError(err)) break; // still offline — stop and retry later
      // Never discard a sale automatically. The stable clientOrderId makes
      // later retries safe after a cashier or server-side correction.
      onError?.(entry, err);
      break;
    }
  }

  return sent;
};
