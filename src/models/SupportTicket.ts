import { Schema, model, type InferSchemaType, Types } from "mongoose";

/** A Contact support / Report a problem request sent from the app. */
const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["contact", "problem"],
      required: true,
      default: "contact",
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    publicUserId: { type: String, trim: true, maxlength: 40 },
    issueType: { type: String, required: true, trim: true, maxlength: 60 },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    // Extra fields that depend on the issue type (platform, transaction id, ...).
    details: { type: Map, of: String, default: {} },
    attachments: [
      {
        _id: false,
        filename: String,
        size: Number,
        contentType: String,
      },
    ],
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true },
);

export type SupportTicketDocument = InferSchemaType<typeof supportTicketSchema> & {
  _id: Types.ObjectId;
};

export const SupportTicketModel = model("SupportTicket", supportTicketSchema);
