import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/AuthError";
import { UserModel } from "../models/User";
import { verifyAccessToken } from "../utils/jwt";

export function authenticateAccessToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError("Missing or invalid Authorization header", 401);
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AuthError("Access token is required", 401);
    }

    const payload = verifyAccessToken(token);
    res.locals.user = payload;
    const now = Date.now();
    UserModel.updateOne(
      { _id: payload.sub, lastActive: { $lt: new Date(now - 30_000) } },
      { lastActive: new Date(now) },
    ).catch(() => {});
    next();
  } catch (_error) {
    next(new AuthError("Invalid or expired access token", 401));
  }
}
