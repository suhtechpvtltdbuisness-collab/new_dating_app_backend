import { Router } from "express";
import {
  changePasswordHandler,
  forgotPasswordHandler,
  googleLoginHandler,
  loginUserHandler,
  logoutHandler,
  refreshTokenHandler,
  registerUserHandler,
  resetPasswordHandler,
  verifyResetOtpHandler,
} from "../controller/user.controller";
import { authenticateAccessToken } from "../middlewares/authenticate";

const authRouter = Router();

authRouter.post("/register", registerUserHandler);
authRouter.post("/login", loginUserHandler);
authRouter.post("/google", googleLoginHandler);
authRouter.post("/refresh-token", refreshTokenHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/forgot-password", forgotPasswordHandler);
authRouter.post("/verify-reset-otp", verifyResetOtpHandler);
authRouter.post("/reset-password", resetPasswordHandler);
authRouter.post(
  "/change-password",
  authenticateAccessToken,
  changePasswordHandler,
);

export default authRouter;
