import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key:              { type: String, default: "main" },
  // Agotado hoy: solo vale el día de Tijuana de unavailableItemsDay ("YYYY-MM-DD").
  // Lo de temporada no se reinicia. Ver utils/availability.js.
  unavailableItems: { type: [String], default: [] },
  unavailableItemsDay: { type: String, default: null },
  seasonalUnavailableItems: { type: [String], default: [] },
  ordersPaused:     { type: Boolean, default: false },
  pausedMessage:    { type: String, default: "" },
  lastBackupAt:     { type: Date, default: null },
  // "YYYY-MM-17" del último recordatorio fiscal ya enviado -- evita mandarlo
  // dos veces para la misma fecha límite (ver utils/fiscalReminder.js).
  lastFiscalReminderSentFor: { type: String, default: null },
  // Correos del contador para el paquete semanal de comprobantes, y el lunes
  // ("YYYY-MM-DD") de la última semana ya procesada -- evita mandarlo dos
  // veces (ver utils/accountantReport.js).
  accountantEmails: { type: [String], default: [] },
  lastAccountantReportWeek: { type: String, default: null },
  // Comisión (%) que cobra cada app de delivery sobre el total del pedido.
  // Gerencia la edita desde Ventas; cada orden guarda la tasa vigente al
  // venderse (Order.deliveryCommissionRate) para no reescribir el historial.
  deliveryCommissions: {
    uber_eats: { type: Number, default: 0 },
    didi_food: { type: Number, default: 0 },
    rappi:     { type: Number, default: 0 },
  },
  // Vinculación de la tienda con Uber Eats (ver services/uberEatsProvisioning.js).
  // El token del dueño solo sirve para listar tiendas y activar la
  // integración; se borra en cuanto se activa una tienda.
  uberEats: {
    connectedAt:     { type: Date, default: null },
    connectedBy:     { type: String, default: null },
    stores: {
      type: [{
        _id: false,
        storeId: String,
        name: String,
        address: String,
      }],
      default: [],
    },
    activeStoreId:   { type: String, default: null },
    activeStoreName: { type: String, default: null },
    activatedAt:     { type: Date, default: null },
    activatedBy:     { type: String, default: null },
    // Lo marca el webhook store.deprovisioned si Uber desconecta la tienda.
    deactivatedAt:   { type: Date, default: null },
  },
  uberEatsUserToken:          { type: String, default: null, select: false },
  uberEatsUserTokenExpiresAt: { type: Date, default: null },
});
schema.index({ key: 1 }, { unique: true });

export default mongoose.model("StoreSettings", schema);
