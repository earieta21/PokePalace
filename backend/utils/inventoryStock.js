const sameId = (left, right) => String(left) === String(right);

export const trackedInventoryRequirements = (demand = {}, inventoryItems = [], orderId) =>
  inventoryItems.flatMap((item) => {
    const requested = [...new Set(Array.isArray(item.menuKeys) ? item.menuKeys : [])]
      .reduce((sum, key) => sum + (Number(demand[key]) || 0), 0);
    if (requested <= 0) return [];

    const exactDeduction = (Array.isArray(item.orderDeductions) ? item.orderDeductions : [])
      .filter((entry) => sameId(entry.orderId, orderId))
      .reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
    const legacyDeduction = exactDeduction === 0
      && (Array.isArray(item.deductedOrderIds) ? item.deductedOrderIds : [])
        .some((id) => sameId(id, orderId))
      ? 1
      : 0;
    const wasProcessed = (Array.isArray(item.processedOrderIds) ? item.processedOrderIds : [])
      .some((id) => sameId(id, orderId));

    return [{
      _id: item._id,
      item: item.item,
      menuKeys: item.menuKeys || [],
      requested,
      available: Math.max(0, Number(item.qty) || 0),
      wasProcessed,
      recordedDeduction: exactDeduction || legacyDeduction,
      alreadyDeducted: wasProcessed && (exactDeduction || legacyDeduction) >= requested,
      ledgerMismatch: wasProcessed && (exactDeduction || legacyDeduction) < requested,
    }];
  });

export const insufficientInventoryItems = (requirements = []) =>
  requirements
    .filter((entry) => !entry.wasProcessed && entry.available < entry.requested)
    .map((entry) => ({
      item: entry.item,
      menuKeys: entry.menuKeys,
      required: entry.requested,
      available: entry.available,
    }));

