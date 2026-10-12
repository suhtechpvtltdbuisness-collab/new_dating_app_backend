import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/AuthError";
import { AdminModel } from "../models/Admin";
import { verifyAdminToken } from "../utils/jwt";

/** Requires `Authorization: Bearer <admin token>` for an admin that still exists. */
export async function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError("Missing or invalid Authorization header", 401);
    }

    const payload = verifyAdminToken(authHeader.slice(7).trim());
    const admin = await AdminModel.findById(payload.sub).lean();
    if (!admin) {
      throw new AuthError("Admin no longer exists", 401);
    }

    res.locals.admin = {
      id: String(admin._id),
      username: admin.username,
      role: admin.role,
    };
    next();
  } catch (_error) {
    next(new AuthError("Invalid or expired admin token", 401));
  }
}
