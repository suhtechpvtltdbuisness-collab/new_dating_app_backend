import type { Request } from "express";
import { AuthError } from "../errors/AuthError";

export const USER_FILTERS = ["all", "verified", "banned", "premium"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

export const REPORT_FILTERS = [
  "pending",
  "resolved",
  "dismissed",
  "all",
] as const;
export type ReportFilter = (typeof REPORT_FILTERS)[number];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

function positiveInt(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePagination(req: Request): Pagination {
  const page = positiveInt(req.query.page, 1);
  const limit = Math.min(
    positiveInt(req.query.limit, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function validateFilter<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw === undefined || raw === "") return fallback;
  if (typeof raw === "string" && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  throw new AuthError(`status must be one of: ${allowed.join(", ")}`, 400);
}

export function searchTerm(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 100) : "";
}

export function validateAdminLoginInput(payload: Record<string, unknown>) {
  const username =
    typeof payload?.username === "string"
      ? payload.username.trim().toLowerCase()
      : "";
  const password =
    typeof payload?.password === "string" ? payload.password : "";
  if (!username || !password) {
    throw new AuthError("username and password are required", 400);
  }
  return { username, password };
}

export function validateAdminPasswordChange(payload: Record<string, unknown>) {
  const field = (name: string) =>
    typeof payload?.[name] === "string" ? (payload[name] as string) : "";
  const currentPassword = field("currentPassword");
  const newPassword = field("newPassword");
  const confirmPassword = field("confirmPassword");

  if (!currentPassword) {
    throw new AuthError("currentPassword is required", 400);
  }
  if (newPassword.length < 8) {
    throw new AuthError("New password must be at least 8 characters", 400);
  }
  if (newPassword !== confirmPassword) {
    throw new AuthError("New password and confirmation do not match", 400);
  }
  return { currentPassword, newPassword };
}
