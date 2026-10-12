import crypto from "crypto";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

interface TokenPayload {
  sub: string;
  phoneNumber: string;
}

function signToken(
  payload: TokenPayload,
  secret: Secret,
  expiresIn: string,
): string {
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, secret, options);
}

export function signAccessToken(payload: TokenPayload): string {
  return signToken(payload, env.accessSecret, env.accessTtl);
}

/// `jti` keeps two refresh tokens issued in the same second distinct, so the
/// unique index on the stored token hash cannot collide.
export function signRefreshToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.refreshTtl as SignOptions["expiresIn"],
    jwtid: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.refreshSecret, options);
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.refreshSecret) as TokenPayload;
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.accessSecret) as TokenPayload;
}

interface AdminTokenPayload {
  sub: string;
  username: string;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return signToken(
    payload as unknown as TokenPayload,
    env.admin.jwtSecret,
    env.admin.tokenTtl,
  );
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, env.admin.jwtSecret) as AdminTokenPayload;
}

export type { AdminTokenPayload, TokenPayload };
