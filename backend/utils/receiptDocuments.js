export const RECEIPT_BUNDLE_TYPE = "application/vnd.pokepalace.receipt+json";
export const MAX_RECEIPT_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function detectReceiptDocument(buffer) {
  const image = detectImageType(buffer);
  if (image) return image;
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-" && buffer.subarray(-1024).includes(Buffer.from("%%EOF"))) return "application/pdf";
  const xml = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  // Store CFDI XML as an opaque attachment, never resolve entities or render
  // it as HTML. This is format detection, not fiscal validation.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const root = xml.replace(/^<\?xml[\s\S]*?\?>\s*/, "").replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");
  if (/^<(?:[\w.-]+:)?Comprobante(?:\s|\/?>)/.test(root) && /http:\/\/www\.sat\.gob\.mx\/cfd\//.test(root)) return "application/xml";
  return null;
}

export function parseReceiptFiles(body, bundled = false) {
  let files;
  if (!Buffer.isBuffer(body)) throw new Error("Adjunta una imagen, PDF o XML de CFDI.");
  if (bundled) {
    let payload;
    try { payload = JSON.parse(body.toString("utf8")); } catch { throw new Error("No se pudo leer el paquete de archivos."); }
    if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length > MAX_RECEIPT_FILES) throw new Error("Adjunta entre 1 y 10 archivos por comprobante.");
    files = payload.files.map((file) => {
      if (typeof file?.content !== "string" || file.content.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 || file.content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)) throw new Error("Archivo inválido o mayor a 8 MB.");
      const buffer = Buffer.from(file.content, "base64");
      if (buffer.toString("base64") !== file.content) throw new Error("El archivo está incompleto.");
      const name = typeof file.name === "string" ? Array.from(file.name.slice(0, 120)).map((c) => c.charCodeAt(0) < 32 || c === "/" || c === "\\" ? "_" : c).join("") : "comprobante";
      return { buffer, name: name || "comprobante" };
    });
  } else files = [{ buffer: body, name: "comprobante" }];
  let total = 0;
  for (const file of files) {
    total += file.buffer.length;
    if (file.buffer.length > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) throw new Error("Máximo 8 MB por archivo y 20 MB por comprobante.");
    file.mimeType = detectReceiptDocument(file.buffer);
    if (!file.mimeType) throw new Error("Solo se aceptan imágenes JPG, PNG o WEBP, PDF y XML de CFDI sin entidades externas.");
  }
  return files;
}

export function receiptDocuments(receipt) {
  return receipt.documents?.length ? receipt.documents : [{ url: receipt.imageUrl, publicId: receipt.publicId, mimeType: "image/jpeg", resourceType: "image", name: "comprobante.jpg" }];
}
