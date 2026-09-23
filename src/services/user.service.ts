import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { RefreshTokenModel } from "../models/RefreshToken";
import { UserModel } from "../models/User";
import {
  createEmailOtpRecord,
  createOtpRecord,
  createUser,
  findRefreshToken,
  findValidEmailOtp,
  findUserByEmail,
  findUserByGoogleId,
  findUserByPhone,
  findValidOtp,
  revokeRefreshToken,
} from "../repository/user.repository";
import { presentUser } from "../presenters";
import { AuthError } from "../errors/AuthError";
import { sha256 } from "../utils/hash";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import {
  type LoginRequestInput,
  validateEmailOtpInput,
  type LoginInput,
  type RegisterInput,
  validateLoginRequestInput,
  validateOtpEmail,
  validateLoginInput,
  validateOtpInput,
  validateOtpNumber,
  validateRegisterInput,
} from "../validation/user.validation";
import { generateOtp } from "../utils/otp";
import { sendOtpMail } from "../utils/mail";
import {
  signGoogleSignupToken,
  verifyGoogleIdToken,
  verifyGoogleSignupToken,
} from "../utils/google";

function resolveIp(rawIp?: string, fallback?: string): string {
  const candidate = rawIp?.trim() || fallback?.trim() || "0.0.0.0";
  return candidate.split(",")[0].trim();
}

function parseRefreshTtlMs(ttl: string): number {
  const match = ttl.match(/^(\d+)([mhd])$/i);
  if (!match) {
    return 1000 * 60 * 60 * 24 * 30;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  return value * 24 * 60 * 60 * 1000;
}

async function issueTokens(
  userId: string,
  phoneNumber: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: userId, phoneNumber });
  const refreshToken = signRefreshToken({ sub: userId, phoneNumber });

  await RefreshTokenModel.create({
    userId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + parseRefreshTtlMs(env.refreshTtl)),
  });

  return { accessToken, refreshToken };
}

export async function registerWithEmail(
  payload: RegisterInput,
  requestIp?: string,
) {
  const input = validateRegisterInput(payload);
  const google = input.googleSignupToken
    ? verifyGoogleSignupToken(input.googleSignupToken)
    : null;
  if (google) {
    input.email = google.email;
  }

  const [existingEmail, existingPhone, existingGoogle] = await Promise.all([
    findUserByEmail(input.email),
    findUserByPhone(input.phoneNumber),
    google ? findUserByGoogleId(google.googleId) : null,
  ]);

  if (existingEmail || existingGoogle) {
    throw new AuthError("Email already exists", 409);
  }

  if (existingPhone) {
    throw new AuthError("Phone number already exists", 409);
  }

  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 10)
    : undefined;

  const user = await createUser({
    phoneNumber: input.phoneNumber,
    name: input.name,
    dob: new Date(input.dob),
    gender: input.gender,
    interestedIn: input.interestedIn,
    profile: input.profile,
    location: {
      type: "Point",
      coordinates: input.location.coordinates,
    },
    active: input.active ?? true,
    ipAddress: resolveIp(input.ipAddress, requestIp),
    email: input.email,
    password: passwordHash,
    googleId: google?.googleId,
    authProvider: google ? "google" : "email",
  });

  const tokens = await issueTokens(user._id.toString(), user.phoneNumber);

  return {
    userId: user._id.toString(),
    email: user.email,
    ...tokens,
  };
}

export async function loginWithEmail(payload: LoginInput) {
  const { email, password } = validateLoginInput(payload);

  const user = await findUserByEmail(email);
  if (!user?.password) {
    throw new AuthError("Invalid credentials", 401);
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    throw new AuthError("Invalid credentials", 401);
  }

  const tokens = await issueTokens(user._id.toString(), user.phoneNumber);
  return { userId: user._id.toString(), email: user.email, ...tokens };
}

export async function loginWithGoogle(idToken?: string) {
  if (!idToken) {
    throw new AuthError("idToken is required", 400);
  }

  const profile = await verifyGoogleIdToken(idToken);
  const user =
    (await findUserByGoogleId(profile.googleId)) ??
    (await findUserByEmail(profile.email));

  if (!user) {
    return {
      isNewUser: true,
      email: profile.email,
      name: profile.name,
      signupToken: signGoogleSignupToken(profile),
    };
  }

  if (!user.googleId) {
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { googleId: profile.googleId } },
    );
  }

  const tokens = await issueTokens(user._id.toString(), user.phoneNumber);
  return {
    isNewUser: false,
    userId: user._id.toString(),
    email: user.email,
    ...tokens,
  };
}

export async function loginUser(payload: Partial<LoginRequestInput>) {
  const input = validateLoginRequestInput(payload);

  if ("email" in input) {
    return loginWithEmail(input);
  }

  const otpDoc = await findValidOtp(input.phoneNumber, input.otp);
  if (!otpDoc) {
    throw new AuthError("Invalid or expired OTP", 401);
  }

  const user = await findUserByPhone(input.phoneNumber);
  if (!user) {
    throw new AuthError("User not found for this phone number", 404);
  }

  otpDoc.consumedAt = new Date();
  await otpDoc.save();

  const tokens = await issueTokens(user._id.toString(), user.phoneNumber);
  return { userId: user._id.toString(), email: user.email, ...tokens };
}

export async function generateUserOtp(number: string) {
  const normalizedNumber = validateOtpNumber(number);
  const otp = generateOtp();

  await createOtpRecord(normalizedNumber, otp);
  console.log(`OTP for ${normalizedNumber}: ${otp}`);

  return {
    number: normalizedNumber,
    message: { "Generated OTP": otp },
  };
}

export async function validateUserOtp(number: string, otp?: string) {
  const input = validateOtpInput(number, otp);
  const otpDoc = await findValidOtp(input.number, input.otp);

  if (!otpDoc) {
    throw new AuthError("Invalid or expired OTP", 401);
  }

  otpDoc.consumedAt = new Date();
  await otpDoc.save();

  return { number: input.number, valid: true };
}

export async function generateEmailOtp(email: string) {
  const normalizedEmail = validateOtpEmail(email);
  const otp = generateOtp();

  await createEmailOtpRecord(normalizedEmail, otp);
  await sendOtpMail(normalizedEmail, otp);

  return {
    email: normalizedEmail,
    message: "OTP sent to email",
  };
}

export async function validateEmailOtp(email: string, otp?: string) {
  const input = validateEmailOtpInput(email, otp);
  const otpDoc = await findValidEmailOtp(input.email, input.otp);

  if (!otpDoc) {
    throw new AuthError("Invalid or expired OTP", 401);
  }

  otpDoc.consumedAt = new Date();
  await otpDoc.save();

  return { email: input.email, valid: true };
}

export async function getUserProfile(userId: string) {
  const user = await UserModel.findById(userId).lean();
  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return presentUser(user);
}

export async function refreshUserToken(refreshToken: string) {
  if (!refreshToken) {
    throw new AuthError("Refresh token is required", 400);
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenRecord = await findRefreshToken(refreshToken);

    if (!tokenRecord) {
      throw new AuthError("Invalid or expired refresh token", 401);
    }

    const newTokens = await issueTokens(payload.sub, payload.phoneNumber);
    return newTokens;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("Invalid refresh token", 401);
  }
}

export async function logoutUser(refreshToken?: string, userId?: string) {
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  } else if (userId) {
    await RefreshTokenModel.updateMany(
      { userId, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    );
  }

  return { loggedOut: true };
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = validateOtpEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  // Do not leak account existence — always report success.
  if (user) {
    const otp = generateOtp();
    await createEmailOtpRecord(normalizedEmail, otp);
    await sendOtpMail(normalizedEmail, otp);
  }

  return { email: normalizedEmail, message: "Password reset OTP sent" };
}

export async function resetPassword(
  email: string,
  otp: string | undefined,
  newPassword: string,
) {
  const input = validateEmailOtpInput(email, otp);
  assertStrongPassword(newPassword);

  const otpDoc = await findValidEmailOtp(input.email, input.otp);
  if (!otpDoc) {
    throw new AuthError("Invalid or expired OTP", 401);
  }

  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AuthError("User not found", 404);
  }

  otpDoc.consumedAt = new Date();
  await otpDoc.save();

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  await RefreshTokenModel.updateMany(
    { userId: user._id, revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );

  return { email: input.email, updated: true };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  assertStrongPassword(newPassword);

  const user = await UserModel.findById(userId).select("+password");
  if (!user?.password) {
    throw new AuthError("User not found", 404);
  }

  const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordMatch) {
    throw new AuthError("Current password is incorrect", 401);
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return { updated: true };
}

function assertStrongPassword(password: string): void {
  if (!password || password.length < 6) {
    throw new AuthError("Password must be at least 6 characters", 400);
  }
}
