# Integración Uber Eats Marketplace

## Webhook

En Uber Developer Dashboard, abre **Webhooks** y usa:

```text
https://pokepalace.onrender.com/api/integrations/uber/webhook
```

El endpoint verifica `X-Uber-Signature` con HMAC-SHA256 antes de aceptar el evento. Los eventos se guardan en una bandeja durable con deduplicación y reintentos; después se obtiene el detalle completo del pedido, se crea la comanda y, si está habilitado, se acepta el pedido en Uber.

## Variables en Render

Agrega estas variables al servicio del backend, en **Environment**:

```text
UBER_EATS_ENV=sandbox
UBER_EATS_CLIENT_ID=<Application ID de Uber>
UBER_EATS_CLIENT_SECRET=<Client Secret de Uber>
UBER_EATS_WEBHOOK_SECRET=<Signing Key independiente del webhook>
UBER_EATS_AUTO_ACCEPT=true
```

No guardes ningún secreto en GitHub, mensajes o capturas. Usa una Signing Key distinta al Client Secret. Para producción cambia `UBER_EATS_ENV=production` únicamente cuando Uber apruebe la aplicación productiva y sus alcances.

Mientras **Integration Verification Result** siga pendiente, usa solamente la aplicación TEST y los dominios de sandbox.

## Flujo implementado

1. Uber envía `orders.notification` o `orders.scheduled.notification`.
2. El backend valida la firma y guarda el evento antes de responder HTTP 200.
3. Se consulta `GET /v2/eats/order/{order_id}` con OAuth `eats.order`.
4. Se crea una sola orden local aunque Uber reintente el webhook.
5. Los productos, modificadores y notas aparecen en el KDS con la etiqueta **Uber Eats**.
6. Con `UBER_EATS_AUTO_ACCEPT=true`, se llama a `accept_pos_order` después de guardar la comanda.
7. `orders.cancel` y `orders.failure` cancelan la comanda local. Una cancelación iniciada desde el POS se envía primero a Uber.

## Prueba de sandbox

Usa una tienda de prueba concedida por Uber, déjala abierta en Uber Eats Orders y realiza un pedido con la cuenta de prueba. El pedido debe aparecer en el KDS y mostrar el folio `UE XXXXX`.
