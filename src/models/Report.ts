import { Schema, model, type InferSchemaType, Types } from "mongoose";

const reportSchema = new Schema(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User" },
    messageId: { type: Schema.Types.ObjectId, ref: "Chat" },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    details: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["open", "reviewing", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    // When an admin resolved or dismissed the report.
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

export type ReportDocument = InferSchemaType<typeof reportSchema> & {
  _id: Types.ObjectId;
};

export const ReportModel = model("Report", reportSchema);
