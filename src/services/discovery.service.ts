import { Types } from "mongoose";
import { AuthError } from "../errors/AuthError";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import { presentUser } from "../presenters";
import { validateObjectId } from "../validation/chat.validation";

const FEMALE_LABELS = ["female", "women", "woman", "f", "girl"];
const MALE_LABELS = ["male", "men", "man", "m", "boy"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function labelsForGender(value: string): string[] {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (FEMALE_LABELS.includes(v)) return FEMALE_LABELS;
  if (MALE_LABELS.includes(v)) return MALE_LABELS;
  return [v];
}

export interface DiscoveryQuery {
  page?: number;
  limit?: number;
  distance?: number;
  minAge?: number;
  maxAge?: number;
  gender?: string;
}

function clampLimit(limit?: number): number {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

function clampPage(page?: number): number {
  const value = Number(page);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function ageToDob(age: number): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - age);
  return date;
}

async function currentUserOrThrow(userId: string) {
  const user = await UserModel.findById(
    validateObjectId(userId, "userId"),
  ).lean();
  if (!user) {
    throw new AuthError("User not found", 404);
  }
  return user;
}

async function excludedIds(userId: string): Promise<Types.ObjectId[]> {
  const swipes = await SwipeModel.find({ swiperId: userId })
    .select("targetUserId")
    .lean();
  return swipes.map((swipe) => swipe.targetUserId as Types.ObjectId);
}

async function baseFilter(userId: string, query: DiscoveryQuery) {
  const currentUser = await currentUserOrThrow(userId);
  const prefs = (currentUser.preferences ?? {}) as Record<string, any>;

  const swipedIds = await excludedIds(userId);
  const blocked = (currentUser.blockedUsers ?? []) as Types.ObjectId[];

  const genderFilter = query.gender
    ? labelsForGender(query.gender)
    : labelsForGender(currentUser.interestedIn);

  const filter: Record<string, unknown> = {
    _id: {
      $nin: [new Types.ObjectId(userId), ...swipedIds, ...blocked],
    },
    gender: { $in: genderFilter },
    active: true,
    isHidden: { $ne: true },
    blockedUsers: { $ne: new Types.ObjectId(userId) },
  };

  const minAge = Number(query.minAge ?? prefs.minAge ?? 18);
  const maxAge = Number(query.maxAge ?? prefs.maxAge ?? 70);
  if (Number.isFinite(minAge) && Number.isFinite(maxAge)) {
    filter.dob = { $gte: ageToDob(maxAge + 1), $lte: ageToDob(minAge) };
  }

  return { currentUser, filter };
}

export async function listProfiles(userId: string, query: DiscoveryQuery) {
  const limit = clampLimit(query.limit);
  const page = clampPage(query.page);
  const { filter } = await baseFilter(userId, query);

  const users = await UserModel.find(filter)
    .sort({ lastActive: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return users.map(presentUser);
}

export async function listNearbyProfiles(
  userId: string,
  query: DiscoveryQuery,
) {
  const limit = clampLimit(query.limit);
  const { currentUser, filter } = await baseFilter(userId, query);

  const coordinates = currentUser.location?.coordinates;
  if (!coordinates || coordinates.length !== 2) {
    throw new AuthError("Your location is not set", 400);
  }

  const prefs = (currentUser.preferences ?? {}) as Record<string, any>;
  const distanceKm = Number(query.distance ?? prefs.maxDistance ?? 50);

  const users = await UserModel.find({
    ...filter,
    location: {
      $nearSphere: {
        $geometry: { type: "Point", coordinates },
        $maxDistance: Math.max(1, distanceKm) * 1000,
      },
    },
  })
    .limit(limit)
    .lean();

  return users.map(presentUser);
}

export async function getProfileById(viewerId: string, profileId: string) {
  const user = await UserModel.findById(
    validateObjectId(profileId, "profileId"),
  ).lean();

  if (
    !user ||
    user.active === false ||
    (user.isHidden && String(user._id) !== viewerId)
  ) {
    throw new AuthError("Profile not found", 404);
  }

  if ((user.blockedUsers ?? []).some((id) => String(id) === viewerId)) {
    throw new AuthError("Profile not available", 403);
  }

  return presentUser(user);
}
