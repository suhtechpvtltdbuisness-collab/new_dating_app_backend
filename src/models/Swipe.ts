import { Schema, model, type InferSchemaType, Types } from "mongoose";

const swipeSchema = new Schema(
  {
    swiperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: ["like", "dislike"],
      index: true,
    },
    matchedAt: { type: Date, index: true },
    isSuperLike: { type: Boolean, default: false },
  },
  { timestamps: true },
);

swipeSchema.index({ swiperId: 1, targetUserId: 1 }, { unique: true });

export type SwipeDocument = InferSchemaType<typeof swipeSchema> & {
  _id: Types.ObjectId;
};

export const SwipeModel = model("Swipe", swipeSchema);
