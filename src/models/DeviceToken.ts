import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * One FCM registration token per app install. The notification settings
 * live on the device (they're per-install in the app), so each token carries
 * a copy that the server checks before pushing.
 */
const deviceTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true },
    platform: {
      type: String,
      enum: ["android", "ios", "web"],
      required: true,
    },
    preferences: {
      enabled: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      matches: { type: Boolean, default: true },
      likes: { type: Boolean, default: true },
      account: { type: Boolean, default: true },
    },
    mutedConversations: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type DeviceTokenDocument = InferSchemaType<typeof deviceTokenSchema> & {
  _id: Types.ObjectId;
};

export const DeviceTokenModel = model("DeviceToken", deviceTokenSchema);
