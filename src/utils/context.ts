import type { Request, Response } from "express";
import { AuthError } from "../errors/AuthError";

export function requireUserId(res: Response): string {
  const userId = res.locals.user?.sub as string | undefined;
  if (!userId) {
    throw new AuthError("Missing authenticated user context", 401);
  }
  return userId;
}

export function optionalUserId(res: Response): string | undefined {
  return res.locals.user?.sub as string | undefined;
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function numericQuery(
  req: Request,
  name: string,
): number | undefined {
  const raw = req.query[name];
  if (typeof raw !== "string") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface AdminContext {
  id: string;
  username: string;
  role: string;
}

export function requireAdmin(res: Response): AdminContext {
  const admin = res.locals.admin as AdminContext | undefined;
  if (!admin?.id) {
    throw new AuthError("Missing authenticated admin context", 401);
  }
  return admin;
}
