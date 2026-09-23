import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthError } from "../errors/AuthError";

const client = new OAuth2Client();
const SIGNUP_PURPOSE = "google_signup";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (env.googleClientIds.length === 0) {
    throw new AuthError("Google sign-in is not configured", 503);
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleClientIds,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AuthError("Invalid Google token", 401);
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new AuthError("Google account email is not verified", 401);
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? "",
  };
}

export async function verifyGoogleAccessToken(
  accessToken: string,
): Promise<GoogleProfile> {
  if (env.googleClientIds.length === 0) {
    throw new AuthError("Google sign-in is not configured", 503);
  }

  let info;
  try {
    info = await client.getTokenInfo(accessToken);
  } catch {
    throw new AuthError("Invalid Google token", 401);
  }

  if (!info.aud || !env.googleClientIds.includes(info.aud)) {
    throw new AuthError("Invalid Google token", 401);
  }
  if (!info.sub || !info.email || !info.email_verified) {
    throw new AuthError("Google account email is not verified", 401);
  }

  let name = "";
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) name = ((await res.json()) as { name?: string }).name ?? "";
  } catch {}

  return { googleId: info.sub, email: info.email.toLowerCase(), name };
}

export function signGoogleSignupToken(profile: GoogleProfile): string {
  return jwt.sign({ ...profile, purpose: SIGNUP_PURPOSE }, env.accessSecret, {
    expiresIn: "1d",
  });
}

export function verifyGoogleSignupToken(token: string): GoogleProfile {
  try {
    const payload = jwt.verify(token, env.accessSecret) as GoogleProfile & {
      purpose?: string;
    };
    if (payload.purpose !== SIGNUP_PURPOSE) throw new Error();
    return {
      googleId: payload.googleId,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    throw new AuthError("Google sign-up session expired. Please try again.", 401);
  }
}
