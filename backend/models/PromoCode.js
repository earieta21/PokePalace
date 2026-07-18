import mongoose from "mongoose";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE } from "../pricing.js";

const MAX_FIXED_DISCOUNT = BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE;

const promoCodeSchema = new mongoose.Schema(
  {
    code:          { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType:  { type: String, enum: ["percent", "fixed"], required: true },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(value) {
          return this.discountType === "percent"
            ? value <= 100
            : value <= MAX_FIXED_DISCOUNT;
        },
        message: "El descuento excede el máximo permitido",
      },
    },
    description:   { type: String, default: "" },
    expiresAt:     { type: Date, default: null },
    maxUses:       { type: Number, default: null, min: 1 },
    usedCount:     { type: Number, default: 0 },
    isActive:      { type: Boolean, default: true },
    // Active checkout reservations. The order id and usedCount increment are
    // written atomically, so a retry can prove that a lost acknowledgement did
    // apply and must not consume the promotion a second time.
    reservedOrderUses: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
    // Keeps releasing a promo reservation idempotent when cancellation is
    // retried or two requests arrive at the same time.
    releasedOrderUses: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("PromoCode", promoCodeSchema);
