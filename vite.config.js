import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SW_VERSION_PLACEHOLDER = "__BUILD_ID__";

// Le pone a public/sw.js una versión sacada del contenido del build. Cuando
// el sitio cambia, cambia sw.js, y las iPads del kiosco (que nadie recarga a
// mano) se actualizan solas en cuanto nadie las está usando — ver index.html.
// Antes la versión se subía a mano y casi siempre se quedaba igual, así que
// el kiosco seguía con lo viejo hasta la recarga de las 4 AM. Si el build
// sale igual (p. ej. un cambio solo del backend), la versión no cambia y
// nadie se recarga de gusto.
function serviceWorkerVersion() {
  let version = "";
  return {
    name: "pokepalace-sw-version",
    apply: "build",
    generateBundle(_options, bundle) {
      const hash = createHash("sha256");
      for (const fileName of Object.keys(bundle).sort()) {
        hash.update(`${fileName}\n`);
        // Los nombres de JS, CSS e imágenes ya llevan el hash de su
        // contenido; el HTML no, así que entra completo.
        const output = bundle[fileName];
        if (fileName.endsWith(".html") && output.type === "asset") hash.update(output.source);
      }
      version = hash.digest("hex").slice(0, 12);
    },
    // Vite copia public/ antes de escribir el bundle, así que aquí sw.js ya
    // está en la carpeta de salida.
    async writeBundle(options) {
      const file = path.join(options.dir, "sw.js");
      const source = await readFile(file, "utf8");
      if (!source.includes(SW_VERSION_PLACEHOLDER)) {
        throw new Error(
          `public/sw.js ya no tiene ${SW_VERSION_PLACEHOLDER}: las iPads del kiosco dejarían de actualizarse solas.`
        );
      }
      await writeFile(file, source.split(SW_VERSION_PLACEHOLDER).join(version));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerVersion()],
  server: {
    port: 5173,
  },
});
