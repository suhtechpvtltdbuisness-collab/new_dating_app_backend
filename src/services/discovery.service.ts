import { Types } from "mongoose";
import { AuthError } from "../errors/AuthError";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import { presentPublicUser, presentUser } from "../presenters";
import { validateObjectId } from "../validation/chat.validation";
import { canSeeIncognitoUser } from "./incognito.service";

const FEMALE_LABELS = ["female", "women", "woman", "f", "girl"];
const MALE_LABELS = ["male", "men", "man", "m", "boy"];
const NON_BINARY_LABELS = [
  "non-binary",
  "nonbinary",
  "non binary",
  "gay",
  "other",
];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function labelsForGender(value: string): string[] {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (FEMALE_LABELS.includes(v)) return FEMALE_LABELS;
  if (MALE_LABELS.includes(v)) return MALE_LABELS;
  if (NON_BINARY_LABELS.includes(v)) return NON_BINARY_LABELS;
  return [v];
}

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

function regexIn(values: string[]) {
  return {
    $in: values.map((v) => new RegExp(`^${escapeRegex(v)}$`, "i")),
  };
}

export interface DiscoveryQuery {
  page?: number;
  limit?: number;
  distance?: number;
  minAge?: number;
  maxAge?: number;
  gender?: string;
  interests?: string[];
  courses?: string[];
  qualities?: string[];
  languages?: string[];
  starSign?: string[];
  educationLevel?: string[];
  exercise?: string[];
  drinking?: string[];
  smoking?: string[];
  lookingFor?: string[];
  kids?: string[];
  haveKids?: string[];
  religion?: string[];
  politics?: string[];
  verifiedOnly?: boolean;
}

function clampLimit(limit?: number): number {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

export function clampPage(page?: number): number {
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

/** Shared discovery rules (who may appear + preference filters). Also used by Astro Best Matches. */
export async function baseFilter(userId: string, query: DiscoveryQuery) {
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
    isIncognito: { $ne: true },
    isBanned: { $ne: true },
    blockedUsers: { $ne: new Types.ObjectId(userId) },
  };

  const minAge = Number(query.minAge ?? prefs.minAge ?? 18);
  const maxAge = Number(query.maxAge ?? prefs.maxAge ?? 70);
  if (Number.isFinite(minAge) && Number.isFinite(maxAge)) {
    filter.dob = { $gte: ageToDob(maxAge + 1), $lte: ageToDob(minAge) };
  }

  // Advanced filters: match ANY selected within a category ($in regex)
  // and ALL selected categories (each added to filter with AND logic)
  const interests = query.interests ?? (prefs.interests as string[] | undefined);
  if (interests && interests.length > 0) {
    filter.interests = regexIn(interests);
  }

  const courses = query.courses ?? (prefs.courses as string[] | undefined);
  if (courses && courses.length > 0) {
    filter.courses = regexIn(courses);
  }

  const qualities = query.qualities ?? (prefs.qualities as string[] | undefined);
  if (qualities && qualities.length > 0) {
    filter.qualities = regexIn(qualities);
  }

  const languages = query.languages ?? (prefs.languages as string[] | undefined);
  if (languages && languages.length > 0) {
    filter.languages = regexIn(languages);
  }

  const starSign = query.starSign ?? (prefs.starSign as string[] | undefined);
  if (starSign && starSign.length > 0) {
    filter.starSign = regexIn(starSign);
  }

  const educationLevel =
    query.educationLevel ?? (prefs.educationLevel as string[] | undefined);
  if (educationLevel && educationLevel.length > 0) {
    filter.educationLevel = regexIn(educationLevel);
  }

  const exercise = query.exercise ?? (prefs.exercise as string[] | undefined);
  if (exercise && exercise.length > 0) {
    filter.exercise = regexIn(exercise);
  }

  const drinking = query.drinking ?? (prefs.drinking as string[] | undefined);
  if (drinking && drinking.length > 0) {
    filter.drinking = regexIn(drinking);
  }

  const smoking = query.smoking ?? (prefs.smoking as string[] | undefined);
  if (smoking && smoking.length > 0) {
    filter.smoking = regexIn(smoking);
  }

  const lookingFor =
    query.lookingFor ??
    (prefs.relationshipGoals as string[] | undefined) ??
    (prefs.lookingForFilter as string[] | undefined);
  if (lookingFor && lookingFor.length > 0) {
    filter.lookingFor = regexIn(lookingFor);
  }

  const kids = query.kids ?? (prefs.kids as string[] | undefined);
  if (kids && kids.length > 0) {
    filter.kids = regexIn(kids);
  }

  const haveKids = query.haveKids ?? (prefs.haveKids as string[] | undefined);
  if (haveKids && haveKids.length > 0) {
    filter.haveKids = regexIn(haveKids);
  }

  const religion = query.religion ?? (prefs.religion as string[] | undefined);
  if (religion && religion.length > 0) {
    filter.religion = regexIn(religion);
  }

  const politics = query.politics ?? (prefs.politics as string[] | undefined);
  if (politics && politics.length > 0) {
    filter.politics = regexIn(politics);
  }

  const verifiedOnly = query.verifiedOnly ?? prefs.verifiedOnly;
  if (verifiedOnly === true) {
    filter.isVerified = true;
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

  return users.map(presentPublicUser);
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

  return users.map(presentPublicUser);
}

export async function getProfileById(viewerId: string, profileId: string) {
  const user = await UserModel.findById(
    validateObjectId(profileId, "profileId"),
  ).lean();

  if (
    !user ||
    user.active === false ||
    user.isBanned ||
    (user.isHidden && String(user._id) !== viewerId)
  ) {
    throw new AuthError("Profile not found", 404);
  }

  if (
    user.isIncognito &&
    String(user._id) !== viewerId &&
    !(await canSeeIncognitoUser(viewerId, String(user._id)))
  ) {
    throw new AuthError("Profile not found", 404);
  }

  if ((user.blockedUsers ?? []).some((id) => String(id) === viewerId)) {
    throw new AuthError("Profile not available", 403);
  }

  return String(user._id) === viewerId ? presentUser(user) : presentPublicUser(user);
}
