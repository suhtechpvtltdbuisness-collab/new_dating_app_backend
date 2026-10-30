import crypto from "crypto";
import { Types } from "mongoose";
import { env } from "../config/env";
import { AuthError } from "../errors/AuthError";
import { SupportTicketModel } from "../models/SupportTicket";
import { UserModel } from "../models/User";
import { sendMail, senderAddress, type MailAttachment } from "../utils/mail";

export const SUPPORT_MAX_FILES = 5;
export const SUPPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const SUPPORT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_TICKETS_PER_HOUR = 5;

const ISSUE_TYPES = [
  "Account & Login",
  "Billing & Payments",
  "Technical Problem",
  "Content / Report",
  "Other",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SupportUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function str(value: unknown, field: string, max: number, required = true): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new AuthError(`${field} is required`, 400);
  if (text.length > max) {
    throw new AuthError(`${field} must be at most ${max} characters`, 400);
  }
  return text;
}

/** Extra issue-specific fields arrive as a JSON object of label -> value. */
function parseDetails(raw: unknown): Record<string, string> {
  if (raw == null || raw === "") return {};
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AuthError("details must be a JSON object", 400);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuthError("details must be a JSON object", 400);
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed).slice(0, 15)) {
    const k = key.trim().slice(0, 60).replace(/[.$]/g, "_");
    const v = value == null ? "" : String(value).trim().slice(0, 2000);
    if (k && v) out[k] = v;
  }
  return out;
}

/** Only PNG, JPEG and PDF, checked by file signature rather than the name. */
function detectType(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )) {
    return { ext: "png", mime: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { ext: "pdf", mime: "application/pdf" };
  }
  return null;
}

function safeFilename(name: string, ext: string): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9 _-]/g, "_").trim();
  return `${(base || "attachment").slice(0, 80)}.${ext}`;
}

function validateAttachments(files: SupportUpload[]): MailAttachment[] {
  if (files.length > SUPPORT_MAX_FILES) {
    throw new AuthError(`You can attach up to ${SUPPORT_MAX_FILES} files`, 400);
  }
  let total = 0;
  return files.map((file) => {
    if (file.size > SUPPORT_MAX_FILE_BYTES) {
      throw new AuthError(`${file.originalname} is larger than 10 MB`, 400);
    }
    total += file.size;
    if (total > SUPPORT_MAX_TOTAL_BYTES) {
      throw new AuthError("Attachments must be 20 MB or less in total", 400);
    }
    const type = detectType(file.buffer);
    if (!type) {
      throw new AuthError(
        `${file.originalname} is not a PNG, JPG or PDF file`,
        400,
      );
    }
    return {
      filename: safeFilename(file.originalname, type.ext),
      content: file.buffer,
      contentType: type.mime,
    };
  });
}

function ticketNumber(): string {
  const d = new Date();
  const date = `${d.getUTCFullYear() % 100}`.padStart(2, "0") +
    `${d.getUTCMonth() + 1}`.padStart(2, "0") +
    `${d.getUTCDate()}`.padStart(2, "0");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `VEL-${date}-${rand}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlRows(rows: [string, string][]): string {
  return rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap"><b>${escapeHtml(k)}</b></td>` +
        `<td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
}

function textRows(rows: [string, string][]): string {
  return rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}

export function supportInbox(): string {
  return env.supportEmail || senderAddress();
}

export async function createSupportTicket(
  userId: string,
  body: Record<string, unknown>,
  files: SupportUpload[],
) {
  const kind = body.kind === "problem" ? "problem" : "contact";
  const name = str(body.name, "Name", 100);
  const email = str(body.email, "Email", 200).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthError("Enter a valid email address", 400);
  const issueType = str(body.issueType, "Issue type", 60);
  if (!ISSUE_TYPES.includes(issueType)) throw new AuthError("Select a valid issue type", 400);
  const subject = str(body.subject, "Subject", 150);
  const description = str(body.description, "Description", 5000);
  const details = parseDetails(body.details);
  const attachments = validateAttachments(files);

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await SupportTicketModel.countDocuments({
    userId: new Types.ObjectId(userId),
    createdAt: { $gte: since },
  });
  if (recent >= MAX_TICKETS_PER_HOUR) {
    throw new AuthError(
      "You've sent several requests in the last hour. Please wait a bit before sending another.",
      429,
    );
  }

  const user = await UserModel.findById(userId).lean<Record<string, unknown>>();
  if (!user) throw new AuthError("User not found", 404);
  const accountEmail = typeof user.email === "string" ? user.email : "";
  const accountPhone =
    typeof user.phoneNumber === "string" ? user.phoneNumber : "";
  const publicUserId =
    typeof user.publicUserId === "string" ? user.publicUserId : "";

  const ticket = await SupportTicketModel.create({
    ticketNumber: ticketNumber(),
    userId,
    kind,
    name,
    email,
    publicUserId,
    issueType,
    subject,
    description,
    details,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      size: a.content.length,
      contentType: a.contentType,
    })),
  });

  const label = kind === "problem" ? "Report a problem" : "Contact support";
  const rows: [string, string][] = [
    ["Ticket", ticket.ticketNumber],
    ["Form", label],
    ["Issue type", issueType],
    ["Name", name],
    ["Contact email", email],
    ["Account email", accountEmail],
    ["Account phone", accountPhone],
    ["User ID", publicUserId],
    ["Internal ID", userId],
    ["Submitted", new Date().toUTCString()],
  ];
  const detailRows = Object.entries(details) as [string, string][];
  const attachmentNote = attachments.length
    ? attachments.map((a) => a.filename).join(", ")
    : "None";

  const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">
  <h2 style="margin:0 0 12px">${escapeHtml(label)}: ${escapeHtml(subject)}</h2>
  <table style="border-collapse:collapse">${htmlRows(rows)}</table>
  <h3 style="margin:20px 0 6px">Description</h3>
  <div style="white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:6px">${escapeHtml(description)}</div>
  ${detailRows.length ? `<h3 style="margin:20px 0 6px">Details</h3><table style="border-collapse:collapse">${htmlRows(detailRows)}</table>` : ""}
  <h3 style="margin:20px 0 6px">Attachments</h3>
  <div>${escapeHtml(attachmentNote)}</div>
  <p style="color:#888;margin-top:24px">Reply to this email to answer the user directly.</p>
</div>`;
  const text = [
    `${label}: ${subject}`,
    "",
    textRows(rows),
    "",
    "Description:",
    description,
    detailRows.length ? `\nDetails:\n${textRows(detailRows)}` : "",
    "",
    `Attachments: ${attachmentNote}`,
    "",
    "Reply to this email to answer the user directly.",
  ].join("\n");

  try {
    await sendMail(
      {
        to: supportInbox(),
        replyTo: email,
        subject: `[${ticket.ticketNumber}] ${label} · ${issueType} · ${subject}`,
        text,
        html,
        attachments,
      },
      "We couldn't send your request right now. Please try again in a moment.",
    );
  } catch (error) {
    ticket.emailStatus = "failed";
    await ticket.save().catch(() => {});
    throw error;
  }

  ticket.emailStatus = "sent";
  await ticket.save();

  // Confirmation to the user. Best effort: the request already reached support.
  sendMail({
    to: email,
    replyTo: supportInbox(),
    subject: `We received your request [${ticket.ticketNumber}]`,
    text:
      `Hi ${name},\n\nThanks for contacting Vellora support. We received your request ` +
      `"${subject}" and will reply to this email address as soon as possible.\n\n` +
      `Your ticket number is ${ticket.ticketNumber}.\n\n— Vellora Support`,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">` +
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Thanks for contacting Vellora support. We received your request ` +
      `<b>"${escapeHtml(subject)}"</b> and will reply to this email address as soon as possible.</p>` +
      `<p>Your ticket number is <b>${ticket.ticketNumber}</b>.</p><p>— Vellora Support</p></div>`,
  }).catch((error) =>
    console.error("Support confirmation email failed", {
      ticket: ticket.ticketNumber,
      message: (error as Error).message,
    }),
  );

  return {
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    createdAt: ticket.createdAt,
  };
}
