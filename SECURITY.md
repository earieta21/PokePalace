# Seguridad del acceso del personal

## Acciones de despliegue obligatorias

1. Rota inmediatamente cualquier contraseña o PIN de producción que haya
   coincidido alguna vez con un valor publicado en el repositorio.
2. Configura `PIN_PEPPER` con un secreto aleatorio, largo y exclusivo de este
   propósito. No lo reutilices como `JWT_SECRET` ni lo guardes en Git.
3. Mantén el mismo `PIN_PEPPER` durante la migración y en todas las instancias
   del backend. Cambiarlo invalida los hashes existentes y obliga a rotar los
   PIN de todo el personal.
4. Antes de exponer la nueva versión al tráfico, ejecuta desde `backend`:

   ```text
   npm run migrate:staff-pins
   ```

   El comando convierte en hash los PIN heredados que aún estén en texto plano.

## Scripts de seed

Los scripts ya no incluyen cuentas ni credenciales predeterminadas.

- `seedStaffAdmin.js` requiere `STAFF_ADMIN_NAME`, `STAFF_ADMIN_EMAIL` y
  `STAFF_ADMIN_PASSWORD` (mínimo 12 caracteres).
- `seedKioskEmployees.js` requiere `KIOSK_LOCATION_ID` y
  `KIOSK_EMPLOYEES_JSON`. Cada elemento del arreglo JSON debe contener `name`,
  `email` y `pin`; `role` y `color` son opcionales.

Las variables `MONGO_URI`, `JWT_SECRET` y `PIN_PEPPER` deben administrarse en el
gestor de secretos del entorno de despliegue.

## Acceso al portal del staff

- **PIN por puesto.** Empleados, caja y cocina usan PIN de 4 dígitos; dueño,
  admin y gerente, de 6. Una cuenta de gerencia que todavía tenga PIN de 4
  dígitos no entra: al usarlo se le pide crear uno de 6 en ese momento. Los PIN
  nuevos no pueden ser dígitos repetidos ni seguidos (`0000`, `123456`).
- **Freno por sucursal.** Además del límite por IP, si una sucursal acumula 20
  PIN incorrectos en 15 minutos (vengan de donde vengan), el acceso con PIN se
  pausa hasta que esos intentos salgan de la ventana. Face ID sigue
  funcionando. El conteo vive en Mongo, así que un reinicio no lo borra.
- **Aviso.** Al activarse el freno se manda un mensaje de Telegram (máximo uno
  por hora) con el bot de `TELEGRAM_FINANCE_BOT_TOKEN` al chat de
  `TELEGRAM_SECURITY_CHAT_ID`, o al de `TELEGRAM_FISCAL_CHAT_ID` si no está
  definido.
- **Bitácora.** La colección `staffloginevents` guarda entradas, PIN fallidos,
  bloqueos, cambios de PIN y Face ID activados, con IP y navegador. Se borra
  sola a los 180 días.
- **Face ID.** Passkeys (WebAuthn) para `pokepalace.org` y subdominios; solo
  se ofrecen en teléfonos. El backend guarda únicamente la llave pública.
