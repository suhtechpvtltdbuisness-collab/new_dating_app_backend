import type { NextFunction, Request, Response } from "express";
import {
  changePassword,
  generateEmailOtp,
  generateUserOtp,
  getUserProfile,
  loginUser,
  loginWithGoogle,
  logoutUser,
  refreshUserToken,
  registerWithEmail,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetOtp,
  validateEmailOtp,
  validateUserOtp,
} from "../services/user.service";
import { listProfiles } from "../services/discovery.service";
import { numericQuery, optionalUserId, requireUserId } from "../utils/context";

export async function registerUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registerWithEmail(req.body, req.ip);
    res.status(201).json({ message: "User registered", data: result });
  } catch (error) {
    next(error);
  }
}

export async function loginUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await loginUser(req.body);
    res.status(200).json({ message: "Login successful", data: result });
  } catch (error) {
    next(error);
  }
}

export async function googleLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await loginWithGoogle(
      req.body?.idToken,
      req.body?.accessToken,
    );
    res.status(200).json({ message: "Google sign-in successful", data: result });
  } catch (error) {
    next(error);
  }
}

export async function generateOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const number = Array.isArray(req.params.number)
      ? req.params.number[0]
      : req.params.number;
    const result = await generateUserOtp(number ?? "");
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function validateOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { number, otp } = req.body as { number?: string; otp?: string };
    const result = await validateUserOtp(number ?? "", otp);
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function generateEmailOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const email = Array.isArray(req.params.email)
      ? req.params.email[0]
      : req.params.email;
    const result = await generateEmailOtp(email ?? "");
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function validateEmailOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };
    const result = await validateEmailOtp(email ?? "", otp);
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMeHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await getUserProfile(requireUserId(res));
    res.status(200).json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function getSuggestionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const suggestedUsers = await listProfiles(requireUserId(res), {
      page: numericQuery(req, "page"),
      limit: numericQuery(req, "limit"),
    });
    res.status(200).json({ data: suggestedUsers });
  } catch (error) {
    next(error);
  }
}

export async function refreshTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    const tokens = await refreshUserToken(refreshToken ?? "");
    res.status(200).json({ message: "Token refreshed", data: tokens });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
    const result = await logoutUser(refreshToken, optionalUserId(res));
    res.status(200).json({ message: "Logged out", data: result });
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body as { email?: string };
    const result = await requestPasswordReset(email ?? "");
    res.status(200).json({ message: result.message, data: result });
  } catch (error) {
    next(error);
  }
}

export async function verifyResetOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };
    const result = await verifyPasswordResetOtp(email ?? "", otp);
    res.status(200).json({ message: "OTP verified", data: result });
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, otp, newPassword, password } = req.body as {
      email?: string;
      otp?: string;
      newPassword?: string;
      password?: string;
    };
    const result = await resetPassword(
      email ?? "",
      otp,
      newPassword ?? password ?? "",
    );
    res.status(200).json({ message: "Password updated", data: result });
  } catch (error) {
    next(error);
  }
}

export async function changePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    const result = await changePassword(
      userId,
      currentPassword ?? "",
      newPassword ?? "",
    );
    res.status(200).json({ message: "Password changed", data: result });
  } catch (error) {
    next(error);
  }
}
