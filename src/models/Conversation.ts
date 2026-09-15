import { Schema, model, type InferSchemaType, Types } from "mongoose";

const conversationSchema = new Schema(
  {
    // Sorted "userA:userB" — enforces one direct conversation per pair.
    pairKey: { type: String, unique: true, sparse: true, index: true },
    // "direct" now; "group" can be added later without rewriting the schema.
    type: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
      index: true,
    },
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ],
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    unread: { type: Map, of: Number, default: {} },
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User" }],
    blockedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export type ConversationDocument = InferSchemaType<
  typeof conversationSchema
> & {
  _id: Types.ObjectId;
};

export const ConversationModel = model("Conversation", conversationSchema);
