import { AuthError } from "../errors/AuthError";
import { AdminActivityModel } from "../models/AdminActivity";
import { RefreshTokenModel } from "../models/RefreshToken";
import { ReportModel } from "../models/Report";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import {
  presentAdminReport,
  presentAdminUser,
  presentUserSummary,
} from "../presenters/admin";
import type { AdminContext } from "../utils/context";
import type {
  Pagination,
  ReportFilter,
  UserFilter,
} from "../validation/admin.validation";
import { validateObjectId } from "../validation/chat.validation";
import { logAdminActivity } from "./adminAuth.service";
import { notifyUser } from "./notification.service";
import { CloseCode, disconnectUser, emitToUser } from "./socket.service";

const SUMMARY_FIELDS = "name email photos isBanned publicUserId";

// A match is stored as two swipes (one per direction) that both carry `matchedAt`.
// Keeping the one whose swiper has the lower id counts each match once.
const MATCH_FILTER = {
  matchedAt: { $ne: null },
  $expr: { $lt: ["$swiperId", "$targetUserId"] },
};

const PENDING_REPORT_STATUSES = ["open", "reviewing"];

function pageInfo(total: number, { page, limit }: Pagination) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ------------------------------------------------------------------ dashboard
export async function getAdminStats() {
  const [totalUsers, verifiedUsers, bannedUsers, totalMatches, pendingReports] =
    await Promise.all([
      UserModel.countDocuments({}),
      UserModel.countDocuments({ isVerified: true }),
      UserModel.countDocuments({ isBanned: true }),
      SwipeModel.countDocuments(MATCH_FILTER),
      ReportModel.countDocuments({ status: { $in: PENDING_REPORT_STATUSES } }),
    ]);

  return {
    totalUsers,
    verifiedUsers,
    bannedUsers,
    // The app has no paid plans yet.
    premiumUsers: 0,
    totalMatches,
    pendingReports,
  };
}

function findReports(filter: Record<string, unknown>) {
  return ReportModel.find(filter)
    .sort({ createdAt: -1 })
    .populate("reporterId", SUMMARY_FIELDS)
    .populate("reportedUserId", SUMMARY_FIELDS);
}

/** Everything the dashboard shows: the stat cards plus the latest users and reports. */
export async function getAdminDashboard() {
  const [stats, recentUsers, recentReports] = await Promise.all([
    getAdminStats(),
    UserModel.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    findReports({}).limit(5).lean(),
  ]);

  return {
    stats,
    recentUsers: recentUsers.map(presentAdminUser),
    recentReports: recentReports.map(presentAdminReport),
  };
}

export async function listAdminActivity(pagination: Pagination) {
  const [rows, total] = await Promise.all([
    AdminActivityModel.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    AdminActivityModel.countDocuments({}),
  ]);

  return {
    items: rows.map((row) => ({
      id: String(row._id),
      adminUsername: row.adminUsername,
      action: row.action,
      target: row.target ?? null,
      createdAt: row.createdAt,
    })),
    pagination: pageInfo(total, pagination),
  };
}

// ------------------------------------------------------------------ users
export async function listUsers(
  q: string,
  status: UserFilter,
  pagination: Pagination,
) {
  // No paid plans yet, so nobody is premium.
  if (status === "premium") {
    return { items: [], pagination: pageInfo(0, pagination) };
  }

  const filter: Record<string, unknown> = {};
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { name: pattern },
      { email: pattern },
      { phoneNumber: pattern },
      { publicUserId: pattern },
    ];
  }
  if (status === "verified") filter.isVerified = true;
  else if (status === "banned") filter.isBanned = true;

  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return {
    items: users.map(presentAdminUser),
    pagination: pageInfo(total, pagination),
  };
}

/** A user with their matches and the reports filed against them. */
export async function getUserDetail(userId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const user = await UserModel.findById(validUserId).lean();
  if (!user) {
    throw new AuthError("User not found", 404);
  }

  const [matches, reports] = await Promise.all([
    SwipeModel.find({ swiperId: validUserId, matchedAt: { $ne: null } })
      .sort({ matchedAt: -1 })
      .populate("targetUserId", SUMMARY_FIELDS)
      .lean(),
    findReports({ reportedUserId: validUserId }).lean(),
  ]);

  return {
    user: presentAdminUser(user),
    matches: matches.map((match) => ({
      id: String(match._id),
      matchedUser: presentUserSummary(match.targetUserId),
      matchedAt: match.matchedAt,
    })),
    reports: reports.map(presentAdminReport),
  };
}

async function updateUser(
  admin: AdminContext,
  userId: string,
  update: Record<string, unknown>,
  action: string,
) {
  const validUserId = validateObjectId(userId, "userId");
  const user = await UserModel.findByIdAndUpdate(validUserId, update, {
    new: true,
  }).lean();
  if (!user) {
    throw new AuthError("User not found", 404);
  }
  await logAdminActivity(admin.username, action, `user#${validUserId}`);
  return presentAdminUser(user);
}

/**
 * A banned user disappears from discovery and can no longer sign in or refresh
 * their session; the access token they already hold lasts until it expires.
 */
export async function banUser(admin: AdminContext, userId: string) {
  const user = await updateUser(
    admin,
    userId,
    { $set: { isBanned: true, bannedAt: new Date(), isOnline: false } },
    "ban_user",
  );
  await RefreshTokenModel.updateMany(
    { userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
  emitToUser(userId, "account_suspended", {
    message: "This account has been suspended",
  });
  disconnectUser(userId, CloseCode.suspended, "account suspended");
  return user;
}

export function unbanUser(admin: AdminContext, userId: string) {
  return updateUser(
    admin,
    userId,
    { $set: { isBanned: false }, $unset: { bannedAt: "" } },
    "unban_user",
  );
}

export async function verifyUser(admin: AdminContext, userId: string) {
  const wasVerified = await UserModel.exists({
    _id: validateObjectId(userId, "userId"),
    isVerified: true,
  });
  const user = await updateUser(
    admin,
    userId,
    {
      $set: {
        isVerified: true,
        "selfieVerification.status": "verified",
        "selfieVerification.provider": "admin",
        "selfieVerification.verifiedAt": new Date(),
      },
    },
    "verify_user",
  );
  if (!wasVerified) {
    void notifyUser(userId, {
      type: "profile",
      title: "You're verified ✅",
      body: "Your profile now shows the verified badge.",
      metadata: { action: "verified" },
    });
  }
  return user;
}

/** Also removes their swipes (so their matches), sessions and the reports against them. */
export async function deleteUser(admin: AdminContext, userId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const deleted = await UserModel.findByIdAndDelete(validUserId);
  if (!deleted) {
    throw new AuthError("User not found", 404);
  }

  await Promise.all([
    SwipeModel.deleteMany({
      $or: [{ swiperId: validUserId }, { targetUserId: validUserId }],
    }),
    RefreshTokenModel.deleteMany({ userId: validUserId }),
    ReportModel.deleteMany({ reportedUserId: validUserId }),
  ]);
  await logAdminActivity(admin.username, "delete_user", `user#${validUserId}`);
  disconnectUser(validUserId, CloseCode.suspended, "account deleted");

  return { deleted: true, userId: validUserId };
}

// ------------------------------------------------------------------ reports
export async function listReports(
  status: ReportFilter,
  pagination: Pagination,
) {
  const filter: Record<string, unknown> = {};
  if (status === "pending") filter.status = { $in: PENDING_REPORT_STATUSES };
  else if (status !== "all") filter.status = status;

  const [reports, total] = await Promise.all([
    findReports(filter).skip(pagination.skip).limit(pagination.limit).lean(),
    ReportModel.countDocuments(filter),
  ]);

  return {
    items: reports.map(presentAdminReport),
    pagination: pageInfo(total, pagination),
  };
}

async function closeReport(
  admin: AdminContext,
  reportId: string,
  status: "resolved" | "dismissed",
) {
  const validReportId = validateObjectId(reportId, "reportId");
  const report = await ReportModel.findByIdAndUpdate(
    validReportId,
    { status, resolvedAt: new Date() },
    { new: true },
  )
    .populate("reporterId", SUMMARY_FIELDS)
    .populate("reportedUserId", SUMMARY_FIELDS)
    .lean();
  if (!report) {
    throw new AuthError("Report not found", 404);
  }

  await logAdminActivity(
    admin.username,
    status === "resolved" ? "resolve_report" : "dismiss_report",
    `report#${validReportId}`,
  );

  const reporterId = (report.reporterId as any)?._id ?? report.reporterId;
  if (reporterId) {
    void notifyUser(String(reporterId), {
      type: "system",
      title: "Update on your report",
      body:
        status === "resolved"
          ? "Thanks for keeping Vellora safe. We reviewed your report and took action."
          : "Thanks for your report. We reviewed it and found no violation of our guidelines.",
      metadata: { reportId: validReportId, status },
    });
  }
  return presentAdminReport(report);
}

export const resolveReport = (admin: AdminContext, reportId: string) =>
  closeReport(admin, reportId, "resolved");

export const dismissReport = (admin: AdminContext, reportId: string) =>
  closeReport(admin, reportId, "dismissed");

// ------------------------------------------------------------------ matches
export async function listMatches(pagination: Pagination) {
  const [matches, total] = await Promise.all([
    SwipeModel.find(MATCH_FILTER)
      .sort({ matchedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("swiperId", SUMMARY_FIELDS)
      .populate("targetUserId", SUMMARY_FIELDS)
      .lean(),
    SwipeModel.countDocuments(MATCH_FILTER),
  ]);

  return {
    items: matches.map((match) => ({
      id: String(match._id),
      userA: presentUserSummary(match.swiperId),
      userB: presentUserSummary(match.targetUserId),
      status: "active",
      matchedAt: match.matchedAt,
    })),
    pagination: pageInfo(total, pagination),
  };
}
