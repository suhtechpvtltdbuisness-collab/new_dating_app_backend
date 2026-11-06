import type { NextFunction, Request, Response } from "express";
import {
  clearUserNotifications,
  createUserNotification,
  deleteUserNotification,
  getUnreadNotificationCount,
  getUserNotifications,
  markAllUserNotificationsAsRead,
  markUserNotificationAsRead,
} from "../services/notification.service";
import { registerDevice, unregisterDevice } from "../services/push.service";
import { param, requireUserId } from "../utils/context";

/** POST /notifications/devices — save this install's FCM token and settings. */
export async function registerDeviceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await registerDevice(userId, req.body ?? {});
    res.status(200).json({ message: "Device registered", data: result });
  } catch (error) {
    next(error);
  }
}

/** DELETE /notifications/devices — stop pushes to this install (logout). */
export async function unregisterDeviceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await unregisterDevice(userId, req.body?.token);
    res.status(200).json({ message: "Device removed", data: result });
  } catch (error) {
    next(error);
  }
}

export async function createNotificationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const notification = await createUserNotification(userId, req.body);
    res
      .status(201)
      .json({ message: "Notification created", data: notification });
  } catch (error) {
    next(error);
  }
}

export async function getNotificationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const data = await getUserNotifications(
      userId,
      req.query.page,
      req.query.limit,
    );
    res.status(200).json({ message: "Notifications", data });
  } catch (error) {
    next(error);
  }
}

export async function unreadCountHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getUnreadNotificationCount(requireUserId(res));
    res.status(200).json({ message: "Unread count", data });
  } catch (error) {
    next(error);
  }
}

export async function markNotificationReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const notification = await markUserNotificationAsRead(
      userId,
      param(req, "notificationId"),
    );
    res
      .status(200)
      .json({ message: "Notification marked as read", data: notification });
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsReadHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await markAllUserNotificationsAsRead(requireUserId(res));
    res.status(200).json({ message: "All notifications marked as read", data });
  } catch (error) {
    next(error);
  }
}

export async function deleteNotificationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await deleteUserNotification(
      userId,
      param(req, "notificationId"),
    );
    res.status(200).json({ message: "Notification deleted", data: result });
  } catch (error) {
    next(error);
  }
}

export async function clearNotificationsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await clearUserNotifications(requireUserId(res));
    res.status(200).json({ message: "Notifications cleared", data });
  } catch (error) {
    next(error);
  }
}
