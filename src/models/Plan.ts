import { Schema, model, type InferSchemaType, Types } from "mongoose";

const planSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    price: { type: String, required: true, trim: true, maxlength: 50 },
    period: { type: String, default: "PER WEEK", trim: true, maxlength: 50 },
    subtitle: { type: String, trim: true, default: "", maxlength: 200 },
    isBest: { type: Boolean, default: false },
    badge: { type: String, trim: true, default: "", maxlength: 50 },
    features: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type PlanDocument = InferSchemaType<typeof planSchema> & {
  _id: Types.ObjectId;
};

export const PlanModel = model("Plan", planSchema);

