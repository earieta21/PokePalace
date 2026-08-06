/* Migra los inventoryRecipe (conteo de porciones) que YA existen en
   backend/config/posCatalog.js hacia el nuevo modelo Recipe -- no inventa
   ningún dato: son exactamente los mismos ids/porciones que ya usa
   getPosInventoryDemand() para descontar inventario en cada venta real.

   Deliberadamente NO migra bowl-mediano-rapido/bowl-grande-rapido,
   cacao-rice-cake ni choco-rice-cake -- esos nunca tuvieron una receta
   real (inventoryRecipe: {}), así que quedan en rojo en Costo del menú
   hasta que alguien capture su receta de verdad ahí.

   Idempotente: si un catalogId ya tiene una receta activa, se salta. */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Recipe from "../models/Recipe.js";
import { POS_CATALOG } from "../config/posCatalog.js";

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    let created = 0;
    let skipped = 0;

    for (const product of POS_CATALOG) {
      const recipeMap = product.inventoryRecipe;
      if (!recipeMap || Object.keys(recipeMap).length === 0) continue;

      const existing = await Recipe.findOne({ catalogId: product.catalogId, active: true });
      if (existing) {
        skipped += 1;
        continue;
      }

      await Recipe.create({
        catalogId: product.catalogId,
        name: product.name,
        ingredients: Object.entries(recipeMap).map(([key, portions]) => ({ key, portions })),
        packaging: [],
        commissionPct: 0,
        version: 1,
        effectiveDate: new Date().toISOString().slice(0, 10),
        active: true,
        updatedBy: "migración inicial",
        notes: "Migrado desde inventoryRecipe (posCatalog.js) -- faltan portionQty/yieldPct por artículo para costear.",
      });
      created += 1;
      console.log(`  + ${product.catalogId} (${Object.keys(recipeMap).length} ingredientes)`);
    }

    console.log(`✅ Recetas creadas: ${created}, ya existentes (sin tocar): ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error migrando recetas:", err.message);
    process.exit(1);
  }
};

run();