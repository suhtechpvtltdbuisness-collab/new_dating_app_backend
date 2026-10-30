import { presentUser } from ".";

function ageFromDob(dob: unknown): number | null {
  if (!dob) return null;
  const birth = new Date(dob as string);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** The app's user shape plus what only admins see. */
export function presentAdminUser(user: any) {
  const base = presentUser(user);
  if (!base) return null;
  return {
    ...base,
    age: ageFromDob(user.dob),
    photoUrl: base.photos[0] ?? null,
    authProvider: user.authProvider ?? "email",
    isBanned: Boolean(user.isBanned),
    bannedAt: user.bannedAt ?? null,
    // The app has no paid plans yet, so every user is on the free plan.
    plan: "free",
  };
}

/** Name-and-photo summary for lists; null when the user has been deleted. */
export function presentUserSummary(user: any) {
  const full = presentAdminUser(user);
  if (!full) return null;
  return {
    id: full.id,
    publicUserId: full.publicUserId,
    name: full.name,
    email: full.email,
    photoUrl: full.photoUrl,
    isBanned: full.isBanned,
  };
}

/** `open` and `reviewing` both show as "pending" in the admin panel. */
export function presentAdminReport(report: any) {
  const pending = report.status === "open" || report.status === "reviewing";
  return {
    id: String(report._id),
    reason: report.reason,
    details: report.details ?? "",
    status: pending ? "pending" : report.status,
    messageId: report.messageId ? String(report.messageId) : null,
    reporter: presentUserSummary(report.reporterId),
    reportedUser: presentUserSummary(report.reportedUserId),
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt ?? null,
  };
}
