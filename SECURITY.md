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
