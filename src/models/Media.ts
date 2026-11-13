import { Schema, model, type InferSchemaType, Types } from "mongoose";

const mediaSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

export type MediaDocument = InferSchemaType<typeof mediaSchema> & {
  _id: Types.ObjectId;
};

export const MediaModel = model("Media", mediaSchema);
