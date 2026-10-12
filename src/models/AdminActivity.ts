import { Schema, model, type InferSchemaType, Types } from "mongoose";

/** Audit trail of what admins did in the admin panel. */
const adminActivitySchema = new Schema(
  {
    adminUsername: { type: String, required: true, index: true },
    // e.g. "login", "ban_user", "resolve_report"
    action: { type: String, required: true },
    // e.g. "user#<id>", "report#<id>"
    target: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminActivitySchema.index({ createdAt: -1 });

export type AdminActivityDocument = InferSchemaType<
  typeof adminActivitySchema
> & {
  _id: Types.ObjectId;
};

export const AdminActivityModel = model("AdminActivity", adminActivitySchema);
