import { Schema, model, type InferSchemaType, Types } from "mongoose";

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      maxlength: 220,
    },
    summary: { type: String, trim: true, maxlength: 500, default: "" },
    content: { type: String, required: true, trim: true },
    coverImage: { type: String, trim: true, default: "" },
    category: {
      type: String,
      trim: true,
      default: "Dating Tips",
      index: true,
    },
    author: { type: String, trim: true, default: "Vellora Team" },
    tags: [{ type: String, trim: true }],
    readTime: { type: String, trim: true, default: "3 min read" },
    isPublished: { type: Boolean, default: true, index: true },
    views: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export type BlogPostDocument = InferSchemaType<typeof blogPostSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BlogPost = model("BlogPost", blogPostSchema);
export default BlogPost;
