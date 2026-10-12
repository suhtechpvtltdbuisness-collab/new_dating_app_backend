import { Schema, model, type InferSchemaType, Types } from "mongoose";

/** Admin panel logins. Separate from app users. */
const adminSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "superadmin"], default: "admin" },
    // Brute-force guard: sign-in is paused for a while after repeated wrong passwords.
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true },
);

export type AdminDocument = InferSchemaType<typeof adminSchema> & {
  _id: Types.ObjectId;
};

export const AdminModel = model("Admin", adminSchema);
