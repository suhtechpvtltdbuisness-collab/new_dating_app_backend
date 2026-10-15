import dns from "node:dns";
import net from "node:net";
import nodemailer from "nodemailer";
import type Transporter from "nodemailer/lib/mailer";
import { AuthError } from "../errors/AuthError";
import { env } from "../config/env";

const RESOLVE_TTL_MS = 5 * 60 * 1000;

let resolvedConnect: { hostname: string; address: string; expires: number } | null =
  null;

/**
 * Nodemailer v8 resolves IPv4 + IPv6 and may pick IPv6 at random. Railway has no
 * IPv6 egress to Cloudflare (Hostinger). Passing a literal IPv4 skips that logic.
 */
async function smtpConnectAddress(hostname: string): Promise<string> {
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
      "Unable to send OTP email right now. Please try again.",
      502,
    );
  }

  const address = addresses[0];
  if (!address) {
    throw new AuthError(
      "Unable to send OTP email right now. Please try again.",
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

export async function sendOtpMail(email: string, otp: string): Promise<void> {
  const { transporter, hostname, connectAddress } = await createSmtpTransporter();

  try {
    await transporter.sendMail({
      from: env.mail.from,
      to: email,
      subject: "Your OTP code",
      text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>It will expire in 5 minutes.</p>`,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; responseCode?: number; message?: string };
    console.error("SMTP send failed", {
      code: err.code,
      responseCode: err.responseCode,
      message: err.message,
      smtpHost: hostname,
      connectAddress,
      port: env.mail.port,
    });

    if (err.code === "EAUTH" || err.responseCode === 535) {
      throw new AuthError(
        "Email service authentication failed. Check SMTP credentials.",
        502,
      );
    }

    throw new AuthError(
      "Unable to send OTP email right now. Please try again.",
      502,
    );
  }
}
