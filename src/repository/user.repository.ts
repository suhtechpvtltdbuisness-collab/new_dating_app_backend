import { OtpCodeModel } from "../models/OtpCode";
import { RefreshTokenModel } from "../models/RefreshToken";
import { UserModel } from "../models/User";
import { sha256 } from "../utils/hash";
import { Types } from "mongoose";

export interface CreateUserInput {
  phoneNumber: string;
  name: string;
  dob: Date;
  gender: string;
  interestedIn: string;
  profile: string;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  active: boolean;
  ipAddress: string;
  email: string;
  password?: string;
  googleId?: string;
  authProvider?: "email" | "google";
}

export function findUserByGoogleId(googleId: string) {
  return UserModel.findOne({ googleId });
}

export function findUserByEmail(email: string) {
  return UserModel.findOne({ email: email.toLowerCase() }).select("+password");
}

export function findUserByPhone(phoneNumber: string) {
  return UserModel.findOne({ phoneNumber });
}

const FEMALE_LABELS = ["female", "women", "woman", "f", "girl"];
const MALE_LABELS = ["male", "men", "man", "m", "boy"];

function labelsForGender(value: string): string[] {
  const v = value.trim().toLowerCase();
  if (FEMALE_LABELS.includes(v)) return FEMALE_LABELS;
  if (MALE_LABELS.includes(v)) return MALE_LABELS;
  return [v];
}

const DEFAULT_SUGGESTIONS_LIMIT = 30;

export function getSuggestedUsers(
  userId: string,
  userGender: string,
  userInterestedIn: string,
  limit = DEFAULT_SUGGESTIONS_LIMIT,
) {
  const candidateGenders = labelsForGender(userInterestedIn);
  const candidateInterestedIn = labelsForGender(userGender);
  const cap = Math.min(Math.max(1, limit), 100);
  return UserModel.find({
    _id: { $ne: new Types.ObjectId(userId) },
    gender: { $in: candidateGenders },
    interestedIn: { $in: candidateInterestedIn },
    active: true,
  })
    .limit(cap)
    .lean();
}

export function createUser(input: CreateUserInput) {
  return UserModel.create(input);
}

export function createOtpRecord(phoneNumber: string, otp: string) {
  return OtpCodeModel.create({
    phoneNumber,
    purpose: "login",
    codeHash: sha256(otp),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
}

export function findValidOtp(phoneNumber: string, otp: string) {
  return OtpCodeModel.findOne({
    phoneNumber,
    purpose: "login",
    codeHash: sha256(otp),
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

export function createEmailOtpRecord(email: string, otp: string) {
  return OtpCodeModel.create({
    email,
    purpose: "login",
    codeHash: sha256(otp),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
}

export function findValidEmailOtp(email: string, otp: string) {
  return OtpCodeModel.findOne({
    email,
    purpose: "login",
    codeHash: sha256(otp),
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

export function findRefreshToken(refreshToken: string) {
  return RefreshTokenModel.findOne({
    tokenHash: sha256(refreshToken),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export function revokeRefreshToken(refreshToken: string) {
  return RefreshTokenModel.updateOne(
    { tokenHash: sha256(refreshToken) },
    { revokedAt: new Date() },
  );
}
