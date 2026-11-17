export function receiptDocuments(receipt) {
  if (receipt.documents?.length) return receipt.documents;
  const extension = String(receipt.imageUrl || "").match(/\/raw\/upload\/.*\.(pdf|xml)(?:$|\?)/i)?.[1]?.toLowerCase();
  return [{ url: receipt.imageUrl, mimeType: extension ? `application/${extension}` : "image/jpeg", name: extension ? `Comprobante.${extension}` : "Foto del comprobante" }];
}
