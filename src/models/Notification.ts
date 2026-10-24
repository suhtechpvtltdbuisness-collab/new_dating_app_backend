import { Schema, model, type InferSchemaType, Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "chat",
  "match",
  "like",
  "super_like",
  "profile",
  "system",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: NOTIFICATION_TYPES,
      default: "system",
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    metadata: { type: Schema.Types.Mixed },
    // Unread notifications sharing a key collapse into one (e.g. one entry per
    // chat instead of one per message); `count` says how many were folded in.
    collapseKey: { type: String },
    count: { type: Number, default: 1, min: 1 },
    readAt: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index(
  { userId: 1, collapseKey: 1 },
  { partialFilterExpression: { collapseKey: { $type: "string" } } },
);

export type NotificationDocument = InferSchemaType<
  typeof notificationSchema
> & {
  _id: Types.ObjectId;
};

export const NotificationModel = model("Notification", notificationSchema);
