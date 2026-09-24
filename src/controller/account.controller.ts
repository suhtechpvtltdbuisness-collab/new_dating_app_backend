import type { NextFunction, Request, Response } from "express";
import {
  addUserPhotos,
  blockUser,
  deleteUserById,
  getUserById,
  getUserPreferences,
  listBlockedUsers,
  removeUserPhoto,
  unblockUser,
  updateUserById,
  updateUserPreferences,
} from "../services/account.service";
import { storeUploads } from "../services/media.service";
import { param, requireUserId } from "../utils/context";

export async function getUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const viewerId = requireUserId(res);
    const user = await getUserById(param(req, "id"), viewerId);
    res.status(200).json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = requireUserId(res);
    const user = await updateUserById(actorId, param(req, "id"), req.body);
    res.status(200).json({ message: "User updated", data: user });
  } catch (error) {
    next(error);
  }
}

export async function deleteUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = requireUserId(res);
    const result = await deleteUserById(actorId, param(req, "id"));
    res.status(200).json({ message: "Account deleted", data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadPhotoHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const photoUrls = await storeUploads(req, userId);
    const result = await addUserPhotos(userId, photoUrls);
    res.status(201).json({ message: "Photo uploaded", data: result });
  } catch (error) {
    next(error);
  }
}

export async function deletePhotoHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const photoRef =
      param(req, "photoId") ||
      (req.body?.photoId as string) ||
      (req.body?.photoUrl as string) ||
      "";
    const result = await removeUserPhoto(userId, photoRef);
    res.status(200).json({ message: "Photo deleted", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getPreferencesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const preferences = await getUserPreferences(userId);
    res.status(200).json({ data: preferences });
  } catch (error) {
    next(error);
  }
}

export async function updatePreferencesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const preferences = await updateUserPreferences(userId, req.body);
    res.status(200).json({ message: "Preferences updated", data: preferences });
  } catch (error) {
    next(error);
  }
}

export async function blockUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const blockedUserId =
      (req.body?.blockedUserId as string) || param(req, "blockedUserId");
    const result = await blockUser(userId, blockedUserId);
    res.status(200).json({ message: "User blocked", data: result });
  } catch (error) {
    next(error);
  }
}

export async function unblockUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const blockedUserId =
      param(req, "blockedUserId") || (req.body?.blockedUserId as string) || "";
    const result = await unblockUser(userId, blockedUserId);
    res.status(200).json({ message: "User unblocked", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getBlockedUsersHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await listBlockedUsers(userId);
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
