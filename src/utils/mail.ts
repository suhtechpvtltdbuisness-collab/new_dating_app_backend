import dns from "node:dns";
import nodemailer from "nodemailer";
import { AuthError } from "../errors/AuthError";
import { env } from "../config/env";

/** Nodemailer ignores `family` for DNS; force A records so Railway avoids broken IPv6 egress. */
function ipv4Lookup(
  hostname: string,
  _options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
): void {
  dns.lookup(hostname, { family: 4, verbatim: false }, callback);
}

function getTransporter() {
  const { host, port, user, pass, forceIpv4 } = env.mail;
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    ...(forceIpv4
      ? {
          family: 4,
          lookup: ipv4Lookup,
          tls: { servername: host },
        }
      : {}),
    auth: {
      user,
      pass,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
}

export async function sendOtpMail(email: string, otp: string): Promise<void> {
  const transporter = getTransporter();

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
