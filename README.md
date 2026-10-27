# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh
# PokePalace

## Reportes mensuales para el contador

En el portal de personal, entra a **Fiscal** y elige el mes. Puedes descargar
un resumen completo en CSV o reportes separados de efectivo, aplicaciones
de delivery y otros pagos. Los tres grupos suman el total general; cada venta
se detalla únicamente en su grupo. Los reportes parciales incluyen el resumen
general para facilitar la conciliación y no calculan impuestos por separado.

El detalle muestra ID, fecha de registro en Tijuana, método de pago, plataforma
e importe de las órdenes pagadas y no canceladas. Delivery se desglosa por
Uber Eats, DiDi Food y Rappi; los registros antiguos sin plataforma aparecen
como **Sin identificar**. Los importes son ventas registradas con IVA incluido,
no liquidaciones netas: acompaña el reporte con CFDI, estados de cuenta y las
liquidaciones de las plataformas para que el contador concilie los movimientos.

Los cambios requieren actualizar tanto el frontend como el backend.

## Apps para iOS y Android

El proyecto usa Capacitor para compartir la misma aplicación React entre web,
iOS y Android. Los proyectos nativos viven en `ios/` y `android/` y usan el
identificador `com.pokepalace.app`.

### Requisitos locales

- Node.js 22 o posterior.
- Android Studio y el Android SDK para compilar Android.
- macOS con Xcode 26 o posterior para compilar y publicar iOS.

### Flujo de desarrollo

```bash
npm install
npm run mobile:sync
npm run mobile:android
```

En macOS, para iOS:

```bash
npm run mobile:ios
```

`mobile:sync` vuelve a generar los iconos y pantallas de inicio, compila Vite y
copia el resultado a ambos proyectos nativos. Si se reemplaza
`public/icons/icon-1024.png`, el branding móvil se actualiza en la siguiente
sincronización.

La cámara está declarada para el lector QR. El backend acepta los orígenes
locales de Capacitor; ese cambio debe estar desplegado antes de probar login,
pedidos o recompensas desde una instalación nativa.

La firma y publicación final se realizan desde Android Studio (Google Play) y
Xcode (App Store Connect) con las cuentas, certificados y fichas de tienda del
propietario de Poke Palace.
