/* Meta llama GET una sola vez al guardar la config del webhook para
   comprobar que el dueño del endpoint es quien dice ser: manda un
   hub.verify_token que debe coincidir con el que se configuró en Render, y
   si coincide hay que regresarle exactamente el hub.challenge que envió. */
export const verifyWhatsAppWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

/* Eventos reales (mensajes entrantes, cambios de estado de entrega, etc.).
   Por ahora solo se confirma la recepción con 200 -- Meta reintenta y
   eventualmente desactiva el webhook si no responde rápido. No se procesa
   el contenido todavía porque hoy solo se envían notificaciones (no hay
   flujo de conversación de dos vías). */
export const receiveWhatsAppWebhook = (req, res) => {
  res.sendStatus(200);
};
