import mongoose from "mongoose";

const favoriteBowlSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    base:        { type: String, default: null },
    proteins:    { type: [String], default: [] },
    bowlSize:    { type: String, enum: ["normal", "large"], default: "normal" },
    marinades:   { type: [String], default: [] },
    complements: { type: [String], default: [] },
    sauces:      { type: [String], default: [] },
    toppings:    { type: [String], default: [] },
  },
  { timestamps: true }
);

const rewardRedemptionLedgerSchema = new mongoose.Schema(
  {
    clientRedemptionId: { type: String, required: true, trim: true },
    rewardId: { type: Number, required: true },
    rewardName: { type: String, required: true },
    pointsCost: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderPointReservationSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    points: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String, default: "" }, // se guarda solo del ultimo pedido, para no volver a pedirlo
    points: { type: Number, default: 0 },          // saldo gastable — sube y baja al canjear
    lifetimePoints: { type: Number, default: 0 },   // nivel — solo sube, nunca baja al gastar
    pointsLastEarnedAt: { type: Date, default: null }, // para expirar saldo inactivo
    // Idempotency ledger for customer-order cancellation refunds. The order id
    // and point increment are written atomically to this same document.
    cancelledOrderRefunds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
    // POS cancellation ledger. The balance/lifetime decrement and insertion
    // of the order id are atomic on this document.
    cancelledPosCreditsReversed: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
    // Orders whose loyalty credit was actually applied to this balance. This
    // closes the crash/race gap between claiming an order and updating User.
    loyaltyCreditedOrderIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
    // Durable online-checkout reservation ledger. The points decrement and
    // this marker are one atomic update; a lost acknowledgement is recovered
    // by looking up orderId instead of charging the balance again.
    orderPointReservations: {
      type: [orderPointReservationSchema],
      default: [],
      select: false,
    },
    // Permanent client-request ledger for reward redemptions. Deducting the
    // balance and inserting this marker happen in one atomic User update, so a
    // lost database acknowledgement can be recovered without charging twice.
    rewardRedemptionLedger: {
      type: [rewardRedemptionLedgerSchema],
      default: [],
      select: false,
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    favoriteBowls: { type: [favoriteBowlSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
