import { Router } from "express";
import { authenticateAccessToken } from "../middlewares/authenticate";
import { uploadAny } from "../middlewares/upload";
import {
  blockUserHandler,
  deletePhotoHandler,
  deleteUserHandler,
  getBlockedUsersHandler,
  getPreferencesHandler,
  getUserHandler,
  unblockUserHandler,
  updatePreferencesHandler,
  updateUserHandler,
  uploadPhotoHandler,
} from "../controller/account.controller";
import {
  changePasswordHandler,
  forgotPasswordHandler,
  generateEmailOtpHandler,
  generateOtpHandler,
  getMeHandler,
  getSuggestionsHandler,
  googleLoginHandler,
  loginUserHandler,
  logoutHandler,
  refreshTokenHandler,
  registerUserHandler,
  resetPasswordHandler,
  validateEmailOtpHandler,
  validateOtpHandler,
} from "../controller/user.controller";

const userRouter = Router();

userRouter.get("/otp/email/:email", generateEmailOtpHandler);
userRouter.post("/otp/email/validate", validateEmailOtpHandler);
userRouter.get("/otp/:number", generateOtpHandler);
userRouter.post("/otp/validate", validateOtpHandler);
userRouter.post("/register", registerUserHandler);
userRouter.post("/login", loginUserHandler);
userRouter.post("/google", googleLoginHandler);
userRouter.post("/refresh", refreshTokenHandler);
userRouter.post("/logout", logoutHandler);
userRouter.post("/forgot-password", forgotPasswordHandler);
userRouter.post("/reset-password", resetPasswordHandler);

userRouter.use(
  [
    "/me",
    "/suggestions",
    "/change-password",
    "/preferences",
    "/blocked",
    "/upload-photo",
    "/delete-photo",
  ],
  authenticateAccessToken,
);

userRouter.post("/change-password", changePasswordHandler);
userRouter.get("/me", getMeHandler);
userRouter.get("/suggestions", getSuggestionsHandler);
userRouter.get("/preferences", getPreferencesHandler);
userRouter.put("/preferences", updatePreferencesHandler);
userRouter.get("/blocked", getBlockedUsersHandler);
userRouter.post("/upload-photo", uploadAny, uploadPhotoHandler);
userRouter.delete("/delete-photo", deletePhotoHandler);
userRouter.delete("/delete-photo/:photoId", deletePhotoHandler);

userRouter.use("/:id", authenticateAccessToken);

userRouter.post("/:id/block", blockUserHandler);
userRouter.delete("/:id/unblock/:blockedUserId", unblockUserHandler);
userRouter.delete("/:id/unblock", unblockUserHandler);
userRouter.get("/:id", getUserHandler);
userRouter.put("/:id", updateUserHandler);
userRouter.delete("/:id", deleteUserHandler);

export default userRouter;
