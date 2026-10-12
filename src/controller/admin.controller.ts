import type { NextFunction, Request, Response } from "express";
import {
  banUser,
  deleteUser,
  dismissReport,
  getAdminDashboard,
  getAdminStats,
  getUserDetail,
  listAdminActivity,
  listMatches,
  listReports,
  listUsers,
  resolveReport,
  unbanUser,
  verifyUser,
} from "../services/admin.service";
import {
  changeAdminPassword,
  getAdminProfile,
  loginAdmin,
  logoutAdmin,
} from "../services/adminAuth.service";
import { param, requireAdmin } from "../utils/context";
import {
  REPORT_FILTERS,
  USER_FILTERS,
  parsePagination,
  searchTerm,
  validateFilter,
} from "../validation/admin.validation";

export async function adminLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await loginAdmin(req.body);
    res.status(200).json({ message: "Login successful", data });
  } catch (error) {
    next(error);
  }
}

export async function adminLogoutHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await logoutAdmin(admin);
    res.status(200).json({ message: "Logged out", data });
  } catch (error) {
    next(error);
  }
}

export async function adminProfileHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await getAdminProfile(admin);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function adminChangePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await changeAdminPassword(admin, req.body);
    res.status(200).json({ message: "Password updated successfully", data });
  } catch (error) {
    next(error);
  }
}

export async function adminStatsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getAdminStats();
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function adminDashboardHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getAdminDashboard();
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function adminActivityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { items, pagination } = await listAdminActivity(parsePagination(req));
    res.status(200).json({ data: items, pagination });
  } catch (error) {
    next(error);
  }
}

export async function adminListUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { items, pagination } = await listUsers(
      searchTerm(req.query.q),
      validateFilter(req.query.status, USER_FILTERS, "all"),
      parsePagination(req),
    );
    res.status(200).json({ data: items, pagination });
  } catch (error) {
    next(error);
  }
}

export async function adminUserDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getUserDetail(param(req, "id"));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function adminBanUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await banUser(admin, param(req, "id"));
    res.status(200).json({ message: "User banned", data });
  } catch (error) {
    next(error);
  }
}

export async function adminUnbanUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await unbanUser(admin, param(req, "id"));
    res.status(200).json({ message: "User unbanned", data });
  } catch (error) {
    next(error);
  }
}

export async function adminVerifyUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await verifyUser(admin, param(req, "id"));
    res.status(200).json({ message: "User marked as verified", data });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await deleteUser(admin, param(req, "id"));
    res.status(200).json({ message: "User deleted", data });
  } catch (error) {
    next(error);
  }
}

export async function adminListReportsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { items, pagination } = await listReports(
      validateFilter(req.query.status, REPORT_FILTERS, "pending"),
      parsePagination(req),
    );
    res.status(200).json({ data: items, pagination });
  } catch (error) {
    next(error);
  }
}

export async function adminResolveReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await resolveReport(admin, param(req, "id"));
    res.status(200).json({ message: "Report marked as resolved", data });
  } catch (error) {
    next(error);
  }
}

export async function adminDismissReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = requireAdmin(res);
    const data = await dismissReport(admin, param(req, "id"));
    res.status(200).json({ message: "Report dismissed", data });
  } catch (error) {
    next(error);
  }
}

export async function adminListMatchesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { items, pagination } = await listMatches(parsePagination(req));
    res.status(200).json({ data: items, pagination });
  } catch (error) {
    next(error);
  }
}
