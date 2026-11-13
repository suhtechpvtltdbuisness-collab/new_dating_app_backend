import { Schema, model, type InferSchemaType, Types } from "mongoose";

const blogCommentSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "BlogPost",
      required: true,
      index: true,
    },
    authorName: { type: String, required: true, trim: true, maxlength: 100 },
    authorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true },
);

export type BlogCommentDocument = InferSchemaType<typeof blogCommentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BlogComment = model("BlogComment", blogCommentSchema);
export default BlogComment;
