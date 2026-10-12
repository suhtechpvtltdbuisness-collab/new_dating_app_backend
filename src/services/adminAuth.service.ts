import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { AuthError } from "../errors/AuthError";
import { AdminModel } from "../models/Admin";
import { AdminActivityModel } from "../models/AdminActivity";
import type { AdminContext } from "../utils/context";
import { signAdminToken } from "../utils/jwt";
import {
  validateAdminLoginInput,
  validateAdminPasswordChange,
} from "../validation/admin.validation";

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

export async function logAdminActivity(
  adminUsername: string,
  action: string,
  target?: string,
): Promise<void> {
  await AdminActivityModel.create({ adminUsername, action, target });
}

/**
 * Creates the first admin from ADMIN_INITIAL_USERNAME / ADMIN_INITIAL_PASSWORD
 * while the admins collection is empty. Without a password set, nothing is created.
 */
async function ensureInitialAdmin(): Promise<void> {
  if (!env.admin.initialPassword) return;
  if (await AdminModel.exists({})) return;

  try {
    await AdminModel.create({
      username: env.admin.initialUsername,
      passwordHash: await bcrypt.hash(env.admin.initialPassword, 10),
      role: "superadmin",
    });
    console.log(`Admin login created: ${env.admin.initialUsername}`);
  } catch (error) {
    // Another request created it at the same moment.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

export async function loginAdmin(payload: Record<string, unknown>) {
  const { username, password } = validateAdminLoginInput(payload);
  await ensureInitialAdmin();

  const admin = await AdminModel.findOne({ username }).select("+passwordHash");
  if (!admin) {
    throw new AuthError("Invalid username or password", 401);
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new AuthError(
      "Too many failed sign-in attempts. Try again later.",
      429,
    );
  }

  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    const failedLogins = (admin.failedLogins ?? 0) + 1;
    const locked = failedLogins >= MAX_FAILED_LOGINS;
    await AdminModel.updateOne(
      { _id: admin._id },
      locked
        ? {
            failedLogins: 0,
            lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
          }
        : { failedLogins },
    );
    throw new AuthError("Invalid username or password", 401);
  }

  await AdminModel.updateOne(
    { _id: admin._id },
    { $set: { failedLogins: 0 }, $unset: { lockedUntil: "" } },
  );
  await logAdminActivity(admin.username, "login");

  const id = String(admin._id);
  return {
    accessToken: signAdminToken({ sub: id, username: admin.username }),
    admin: { id, username: admin.username, role: admin.role },
  };
}

export async function logoutAdmin(admin: AdminContext) {
  await logAdminActivity(admin.username, "logout");
  return { loggedOut: true };
}

export async function getAdminProfile(admin: AdminContext) {
  const row = await AdminModel.findById(admin.id).lean();
  if (!row) {
    throw new AuthError("Admin not found", 404);
  }
  return {
    id: String(row._id),
    username: row.username,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export async function changeAdminPassword(
  admin: AdminContext,
  payload: Record<string, unknown>,
) {
  const { currentPassword, newPassword } = validateAdminPasswordChange(payload);

  const row = await AdminModel.findById(admin.id).select("+passwordHash");
  if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) {
    throw new AuthError("Current password is incorrect", 400);
  }

  row.passwordHash = await bcrypt.hash(newPassword, 10);
  await row.save();
  await logAdminActivity(admin.username, "change_password");
  return { updated: true };
}
