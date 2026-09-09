/* Subida de imágenes a Cloudinary — sin SDK, solo fetch nativo (FormData +
   Blob globales de Node 18+) y crypto nativo para firmar la petición.
   Env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. */
import { createHash } from "node:crypto";

export function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/* Cloudinary firma con SHA-1 sobre los parámetros (menos file/api_key/
   signature/resource_type), ordenados alfabéticamente como key=value&...,
   con el API secret pegado al final -- ver
   https://cloudinary.com/documentation/authentication_signatures */
function signParams(params) {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
}

/* Sube un buffer de imagen a una carpeta de Cloudinary. Regresa
   { url, publicId } o lanza si falla -- quien llama decide qué hacer
   (el webhook de Telegram avisa al usuario en vez de perder la foto en
   silencio). */
export async function uploadImageToCloudinary(buffer, { folder = "facturas", mimeType = "image/jpeg" } = {}) {
  if (!cloudinaryConfigured()) throw new Error("Cloudinary no está configurado");

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ folder, timestamp });

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), "factura.jpg");
  form.append("api_key", process.env.CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: form }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.secure_url) {
    throw new Error(`Cloudinary upload falló: ${res.status} ${JSON.stringify(data)}`);
  }
  return { url: data.secure_url, publicId: data.public_id };
}
