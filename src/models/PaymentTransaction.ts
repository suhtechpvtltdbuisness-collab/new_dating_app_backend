import { Schema, model, type InferSchemaType, Types } from "mongoose";

export type PaymentStatus = "pending" | "success" | "failure" | "cancelled";

const paymentTransactionSchema = new Schema(
  {
    txnid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planTitle: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failure", "cancelled"],
      default: "pending",
      index: true,
    },
    paymentGateway: {
      type: String,
      default: "payu",
      trim: true,
    },
    payuPaymentId: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    bankRefNum: {
      type: String,
      trim: true,
    },
    mode: {
      type: String,
      trim: true,
    },
    hash: {
      type: String,
      trim: true,
    },
    customer: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    requestPayload: {
      type: Schema.Types.Mixed,
    },
    responsePayload: {
      type: Schema.Types.Mixed,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

paymentTransactionSchema.index({ userId: 1, createdAt: -1 });

export type PaymentTransactionDocument = InferSchemaType<
  typeof paymentTransactionSchema
> & {
  _id: Types.ObjectId;
};

export const PaymentTransactionModel = model(
  "PaymentTransaction",
  paymentTransactionSchema,
);
