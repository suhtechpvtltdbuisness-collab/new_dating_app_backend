import dns from "node:dns";
import net from "node:net";
import nodemailer from "nodemailer";
import type Transporter from "nodemailer/lib/mailer";
import { AuthError } from "../errors/AuthError";
import { env } from "../config/env";

const RESOLVE_TTL_MS = 5 * 60 * 1000;
const OTP_SUBJECT = "Your OTP code";

let resolvedConnect: { hostname: string; address: string; expires: number } | null =
  null;

function otpBodies(otp: string) {
  return {
    text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>It will expire in 5 minutes.</p>`,
  };
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

const OTP_FAILURE = "Unable to send OTP email right now. Please try again.";

async function sendViaResend(
  message: MailMessage,
  failureMessage: string,
): Promise<void> {
  if (env.mail.provider !== "resend") return;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.mail.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.mail.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
              })),
            }
          : {}),
      }),
    });
  } catch (error) {
    console.error("Resend request failed", { message: (error as Error).message });
    throw new AuthError(failureMessage, 502);
  }

  if (res.ok) return;

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  console.error("Resend send failed", {
    status: res.status,
    message: body.message,
  });

  if (res.status === 401 || res.status === 403) {
    throw new AuthError(
      "Email service authentication failed. Check RESEND_API_KEY.",
      502,
    );
  }

  throw new AuthError(failureMessage, 502);
}

async function smtpConnectAddress(hostname: string): Promise<string> {
  if (env.mail.provider !== "smtp") return hostname;

  if (!env.mail.forceIpv4 || net.isIP(hostname)) {
    return hostname;
  }

  const now = Date.now();
  if (
    resolvedConnect &&
    resolvedConnect.hostname === hostname &&
    resolvedConnect.expires > now
  ) {
    return resolvedConnect.address;
  }

  let addresses: string[];
  try {
    addresses = await dns.promises.resolve4(hostname);
  } catch (error) {
    console.error("SMTP DNS resolve4 failed", {
      hostname,
      message: (error as Error).message,
    });
    throw new AuthError(
      "Unable to send email right now. Please try again.",
      502,
    );
  }

  const address = addresses[0];
  if (!address) {
    throw new AuthError(
      "Unable to send email right now. Please try again.",
      502,
    );
  }

  resolvedConnect = { hostname, address, expires: now + RESOLVE_TTL_MS };
  return address;
}

async function createSmtpTransporter(): Promise<{
  transporter: Transporter;
  hostname: string;
  connectAddress: string;
}> {
  if (env.mail.provider !== "smtp") {
    throw new Error("createSmtpTransporter called without SMTP provider");
  }

  const { host, port, user, pass } = env.mail;
  const secure = port === 465;
  const connectAddress = await smtpConnectAddress(host);

  const transporter = nodemailer.createTransport({
    host: connectAddress,
    port,
    secure,
    requireTLS: !secure,
    tls: { servername: host },
    auth: {
      user,
      pass,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });

  return { transporter, hostname: host, connectAddress };
}

async function sendViaSmtp(
  message: MailMessage,
  failureMessage: string,
): Promise<void> {
  const { transporter, hostname, connectAddress } = await createSmtpTransporter();

  try {
    await transporter.sendMail({
      from: env.mail.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  } catch (error: unknown) {
    const err = error as { code?: string; responseCode?: number; message?: string };
    console.error("SMTP send failed", {
      code: err.code,
      responseCode: err.responseCode,
      message: err.message,
      smtpHost: hostname,
      connectAddress,
      port: env.mail.provider === "smtp" ? env.mail.port : undefined,
    });

    if (err.code === "EAUTH" || err.responseCode === 535) {
      throw new AuthError(
        "Email service authentication failed. Check SMTP credentials.",
        502,
      );
    }

    throw new AuthError(failureMessage, 502);
  }
}

/** Sends any email through the configured provider (Resend or SMTP). */
export async function sendMail(
  message: MailMessage,
  failureMessage = "Unable to send email right now. Please try again.",
): Promise<void> {
  if (env.mail.provider === "resend") {
    await sendViaResend(message, failureMessage);
    return;
  }
  await sendViaSmtp(message, failureMessage);
}

/** The bare address of the sender, e.g. "reply@suhtech.in" from "App <reply@suhtech.in>". */
export function senderAddress(): string {
  const match = env.mail.from.match(/<([^>]+)>/);
  return (match ? match[1] : env.mail.from).trim();
}

export async function sendOtpMail(email: string, otp: string): Promise<void> {
  const { text, html } = otpBodies(otp);
  await sendMail({ to: email, subject: OTP_SUBJECT, text, html }, OTP_FAILURE);
}
