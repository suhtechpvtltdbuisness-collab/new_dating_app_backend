import { AuthError } from "../errors/AuthError";
import { UserModel } from "../models/User";
import { presentPreferences, presentUser } from "../presenters";
import { deleteBlobIfPresent, extractBlobPathname } from "./media.service";
import { validateObjectId } from "../validation/chat.validation";
import {
  validateUpdatePreferencesInput,
  validateUpdateProfileInput,
} from "../validation/profile.validation";

async function requireUser(userId: string) {
  const user = await UserModel.findById(validateObjectId(userId, "userId"));
  if (!user) {
    throw new AuthError("User not found", 404);
  }
  return user;
}

function assertSelf(actorId: string, userId: string): void {
  if (actorId !== userId) {
    throw new AuthError("You can only modify your own account", 403);
  }
}

export async function getUserById(userId: string, viewerId?: string) {
  const user = await UserModel.findById(
    validateObjectId(userId, "userId"),
  ).lean();
  if (!user || (user.isHidden && String(user._id) !== viewerId)) {
    throw new AuthError("User not found", 404);
  }
  return presentUser(user);
}

export async function updateUserById(
  actorId: string,
  userId: string,
  payload: Record<string, unknown>,
) {
  const validUserId = validateObjectId(userId, "userId");
  assertSelf(actorId, validUserId);

  const updates = validateUpdateProfileInput(payload);
  const user = await UserModel.findByIdAndUpdate(validUserId, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return presentUser(user);
}

export async function deleteUserById(actorId: string, userId: string) {
  const validUserId = validateObjectId(userId, "userId");
  assertSelf(actorId, validUserId);

  const deleted = await UserModel.findByIdAndDelete(validUserId);
  if (!deleted) {
    throw new AuthError("User not found", 404);
  }

  return { deleted: true, userId: validUserId };
}

export async function addUserPhotos(userId: string, photoUrls: string[]) {
  const user = await requireUser(userId);
  user.photos = [...(user.photos ?? []), ...photoUrls];
  await user.save();

  const presented = presentUser(user);
  return {
    photoUrls: presented?.photoUrls ?? user.photos,
    photos: presented?.photos ?? user.photos,
  };
}

export async function removeUserPhoto(userId: string, photoRef: string) {
  const reference = photoRef?.trim();
  if (!reference) {
    throw new AuthError("photoId is required", 400);
  }

  const user = await requireUser(userId);
  const refPath = extractBlobPathname(reference);
  const remaining = (user.photos ?? []).filter((url) => {
    if (url === reference || url.endsWith(`/${reference}`)) return false;
    if (refPath && extractBlobPathname(url) === refPath) return false;
    return true;
  });

  if (remaining.length === (user.photos ?? []).length) {
    throw new AuthError("Photo not found", 404);
  }

  const removed = (user.photos ?? []).find((url) => !remaining.includes(url));
  if (removed) {
    await deleteBlobIfPresent(removed);
  }

  user.photos = remaining;
  await user.save();

  const presented = presentUser(user);
  return {
    photoUrls: presented?.photoUrls ?? user.photos,
    photos: presented?.photos ?? user.photos,
  };
}

export async function getUserPreferences(userId: string) {
  const user = await UserModel.findById(
    validateObjectId(userId, "userId"),
  ).lean();
  if (!user) {
    throw new AuthError("User not found", 404);
  }
  return presentPreferences(user);
}

export async function updateUserPreferences(
  userId: string,
  payload: Record<string, unknown>,
) {
  const updates = validateUpdatePreferencesInput(payload);
  const prefixed = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [
      `preferences.${key}`,
      value,
    ]),
  );

  const user = await UserModel.findByIdAndUpdate(
    validateObjectId(userId, "userId"),
    { $set: prefixed },
    { new: true, runValidators: true },
  ).lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return presentPreferences(user);
}

export async function blockUser(actorId: string, blockedUserId: string) {
  const validBlockedId = validateObjectId(blockedUserId, "blockedUserId");
  if (actorId === validBlockedId) {
    throw new AuthError("You cannot block yourself", 400);
  }

  const user = await UserModel.findByIdAndUpdate(
    validateObjectId(actorId, "userId"),
    { $addToSet: { blockedUsers: validBlockedId } },
    { new: true },
  ).lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return { blockedUsers: (user.blockedUsers ?? []).map(String) };
}

export async function unblockUser(actorId: string, blockedUserId: string) {
  const user = await UserModel.findByIdAndUpdate(
    validateObjectId(actorId, "userId"),
    {
      $pull: {
        blockedUsers: validateObjectId(blockedUserId, "blockedUserId"),
      },
    },
    { new: true },
  ).lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return { blockedUsers: (user.blockedUsers ?? []).map(String) };
}

export async function listBlockedUsers(userId: string) {
  const user = await UserModel.findById(validateObjectId(userId, "userId"))
    .select("blockedUsers")
    .populate("blockedUsers", "name photos email")
    .lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  const blocked = (user.blockedUsers ?? []) as unknown as Array<{
    _id: unknown;
  }>;

  return {
    blockedUsers: blocked.map((item) => String(item._id ?? item)),
    users: blocked.map((item) => presentUser(item)),
  };
}
