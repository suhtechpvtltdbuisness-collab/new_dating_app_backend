import { Router } from "express";
import {
  adminActivityHandler,
  adminBanUserHandler,
  adminChangePasswordHandler,
  adminDashboardHandler,
  adminDeleteUserHandler,
  adminDismissReportHandler,
  adminListMatchesHandler,
  adminListReportsHandler,
  adminListUsersHandler,
  adminLoginHandler,
  adminLogoutHandler,
  adminProfileHandler,
  adminResolveReportHandler,
  adminStatsHandler,
  adminUnbanUserHandler,
  adminUserDetailHandler,
  adminVerifyUserHandler,
} from "../controller/admin.controller";
import { authenticateAdmin } from "../middlewares/authenticateAdmin";

const adminRouter = Router();

adminRouter.post("/auth/login", adminLoginHandler);

adminRouter.use(authenticateAdmin);

adminRouter.post("/auth/logout", adminLogoutHandler);
adminRouter.get("/auth/me", adminProfileHandler);
adminRouter.put("/auth/password", adminChangePasswordHandler);

adminRouter.get("/stats", adminStatsHandler);
adminRouter.get("/dashboard", adminDashboardHandler);
adminRouter.get("/activity", adminActivityHandler);

adminRouter.get("/users", adminListUsersHandler);
adminRouter.get("/users/:id", adminUserDetailHandler);
adminRouter.post("/users/:id/ban", adminBanUserHandler);
adminRouter.post("/users/:id/unban", adminUnbanUserHandler);
adminRouter.post("/users/:id/verify", adminVerifyUserHandler);
adminRouter.delete("/users/:id", adminDeleteUserHandler);

adminRouter.get("/reports", adminListReportsHandler);
adminRouter.post("/reports/:id/resolve", adminResolveReportHandler);
adminRouter.post("/reports/:id/dismiss", adminDismissReportHandler);

adminRouter.get("/matches", adminListMatchesHandler);

export default adminRouter;
