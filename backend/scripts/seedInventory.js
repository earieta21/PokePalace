import mongoose from "mongoose";
import dotenv from "dotenv";
import Inventory from "../models/Inventory.js";

dotenv.config();

const ITEMS = [
  { item: "Sushi Rice",        category: "Grains",   unit: "kg",      qty: 18.5, minQty: 5,  cost: 1.20,  supplier: "PacificGrain Co." },
  { item: "Brown Rice",        category: "Grains",   unit: "kg",      qty: 12.0, minQty: 4,  cost: 1.40,  supplier: "PacificGrain Co." },
  { item: "Mixed Greens",      category: "Grains",   unit: "kg",      qty: 6.0,  minQty: 2,  cost: 3.50,  supplier: "FreshFarm" },
  { item: "Quinoa",            category: "Grains",   unit: "kg",      qty: 5.0,  minQty: 2,  cost: 4.20,  supplier: "PacificGrain Co." },
  { item: "Ahi Tuna",          category: "Proteins", unit: "kg",      qty: 3.2,  minQty: 4,  cost: 28.00, supplier: "Ocean Fresh" },
  { item: "Atlantic Salmon",   category: "Proteins", unit: "kg",      qty: 6.8,  minQty: 3,  cost: 22.00, supplier: "Ocean Fresh" },
  { item: "Shrimp",            category: "Proteins", unit: "kg",      qty: 4.5,  minQty: 2,  cost: 18.00, supplier: "Ocean Fresh" },
  { item: "Chicken Breast",    category: "Proteins", unit: "kg",      qty: 5.0,  minQty: 3,  cost: 8.50,  supplier: "FreshFarm" },
  { item: "Tofu",              category: "Proteins", unit: "kg",      qty: 3.0,  minQty: 2,  cost: 4.00,  supplier: "AsiaMarket" },
  { item: "Edamame",           category: "Veggies",  unit: "kg",      qty: 2.1,  minQty: 2,  cost: 4.50,  supplier: "FreshFarm" },
  { item: "Avocado",           category: "Veggies",  unit: "pc",      qty: 14,   minQty: 20, cost: 0.85,  supplier: "FreshFarm" },
  { item: "Cucumber",          category: "Veggies",  unit: "kg",      qty: 4.5,  minQty: 2,  cost: 1.80,  supplier: "FreshFarm" },
  { item: "Mango",             category: "Veggies",  unit: "kg",      qty: 3.4,  minQty: 2,  cost: 3.20,  supplier: "FreshFarm" },
  { item: "Green Onion",       category: "Veggies",  unit: "bunches", qty: 5,    minQty: 3,  cost: 0.80,  supplier: "FreshFarm" },
  { item: "Sesame Oil",        category: "Sauces",   unit: "L",       qty: 1.2,  minQty: 1,  cost: 9.00,  supplier: "AsiaMarket" },
  { item: "Soy Sauce",         category: "Sauces",   unit: "L",       qty: 0.8,  minQty: 2,  cost: 3.50,  supplier: "AsiaMarket" },
  { item: "Sriracha",          category: "Sauces",   unit: "bottles", qty: 3,    minQty: 2,  cost: 4.00,  supplier: "AsiaMarket" },
  { item: "Miso Paste",        category: "Sauces",   unit: "kg",      qty: 0.9,  minQty: 1,  cost: 6.50,  supplier: "AsiaMarket" },
  { item: "Ponzu Sauce",       category: "Sauces",   unit: "L",       qty: 2.1,  minQty: 1,  cost: 5.00,  supplier: "AsiaMarket" },
  { item: "Seaweed",           category: "Extras",   unit: "pkg",     qty: 8,    minQty: 4,  cost: 2.20,  supplier: "Ocean Fresh" },
  { item: "Sesame Seeds",      category: "Extras",   unit: "kg",      qty: 1.5,  minQty: 0.5,cost: 7.00,  supplier: "AsiaMarket" },
  { item: "Crispy Onion",      category: "Extras",   unit: "kg",      qty: 1.0,  minQty: 0.3,cost: 5.00,  supplier: "FreshFarm" },
];

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    const existing = await Inventory.countDocuments();
    if (existing > 0) {
      console.log(`⚠️  Inventory already has ${existing} items — skipping seed`);
      process.exit(0);
    }

    await Inventory.insertMany(ITEMS);
    console.log(`✅ Seeded ${ITEMS.length} inventory items`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding inventory:", err.message);
    process.exit(1);
  }
};

run();
