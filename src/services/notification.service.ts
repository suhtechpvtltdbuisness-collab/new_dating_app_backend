import { AuthError } from "../errors/AuthError";
import type { NotificationType } from "../models/Notification";
import { presentNotification } from "../presenters";
import {
  countUnreadNotifications,
  createNotification,
  deleteAllNotifications,
  deleteNotification,
  getNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  markNotificationsReadByCollapseKey,
  takeUnreadByCollapseKey,
} from "../repository/notification.repository";
import {
  type CreateNotificationInput,
  validateCreateNotificationInput,
} from "../validation/notification.validation";
import { validateObjectId } from "../validation/chat.validation";
import { emitToUser } from "./socket.service";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  /** Unread notifications with the same key fold into one. */
  collapseKey?: string;
}

export const chatCollapseKey = (conversationId: string) =>
  `chat:${conversationId}`;

async function emitUnreadCount(userId: string): Promise<void> {
  const unreadCount = await countUnreadNotifications(userId);
  emitToUser(userId, "notification_count", { unreadCount });
}

/**
 * Stores a notification and pushes it over the user's open sockets. Never
 * throws: a notification failing must not fail the action that caused it.
 */
export async function notifyUser(
  userId: string,
  input: NotifyInput,
): Promise<void> {
  try {
    let count = 1;
    if (input.collapseKey) {
      const previous = await takeUnreadByCollapseKey(userId, input.collapseKey);
      count += previous?.count ?? 0;
    }

    const notification = await createNotification({
      userId,
      type: input.type,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 1000),
      metadata: input.metadata ?? {},
      collapseKey: input.collapseKey,
      count,
    });

    const unreadCount = await countUnreadNotifications(userId);
    emitToUser(userId, "notification", {
      notification: presentNotification(notification.toObject()),
      unreadCount,
    });
  } catch (error) {
    console.error(`Failed to notify user ${userId}`, error);
  }
}

/** Marks the collapsed chat notification read once the chat itself is read. */
export async function markChatNotificationsRead(
  userId: string,
  conversationId: string,
): Promise<void> {
  try {
    const result = await markNotificationsReadByCollapseKey(
      userId,
      chatCollapseKey(conversationId),
    );
    if (result.modifiedCount > 0) await emitUnreadCount(userId);
  } catch (error) {
    console.error("Failed to clear chat notifications", error);
  }
}

export async function createUserNotification(
  userId: string,
  payload: CreateNotificationInput,
) {
  const input = validateCreateNotificationInput(payload);
  const notification = await createNotification({
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    metadata: input.metadata,
  });

  const presented = presentNotification(notification.toObject());
  emitToUser(userId, "notification", {
    notification: presented,
    unreadCount: await countUnreadNotifications(userId),
  });
  return presented;
}

function clamp(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function getUserNotifications(
  userId: string,
  page?: unknown,
  limit?: unknown,
) {
  const safePage = clamp(page, 1, 1000);
  const safeLimit = clamp(limit, 30, 100);
  const [{ items, total }, unreadCount] = await Promise.all([
    getNotificationsForUser(userId, safePage, safeLimit),
    countUnreadNotifications(userId),
  ]);

  return {
    notifications: items.map(presentNotification),
    unreadCount,
    page: safePage,
    limit: safeLimit,
    total,
    hasMore: safePage * safeLimit < total,
  };
}

export async function getUnreadNotificationCount(userId: string) {
  return { unreadCount: await countUnreadNotifications(userId) };
}

export async function markUserNotificationAsRead(
  userId: string,
  notificationId: string,
) {
  const validNotificationId = validateObjectId(
    notificationId,
    "notificationId",
  );
  const notification = await markNotificationAsRead(
    validNotificationId,
    userId,
  );

  if (!notification) {
    throw new AuthError("Notification not found", 404);
  }

  await emitUnreadCount(userId);
  return presentNotification(notification);
}

export async function markAllUserNotificationsAsRead(userId: string) {
  await markAllNotificationsAsRead(userId);
  emitToUser(userId, "notification_count", { unreadCount: 0 });
  return { unreadCount: 0 };
}

export async function deleteUserNotification(
  userId: string,
  notificationId: string,
) {
  const validNotificationId = validateObjectId(
    notificationId,
    "notificationId",
  );
  const deleted = await deleteNotification(validNotificationId, userId);

  if (!deleted) {
    throw new AuthError("Notification not found", 404);
  }

  await emitUnreadCount(userId);
  return { deleted: true, notificationId: validNotificationId };
}

export async function clearUserNotifications(userId: string) {
  const result = await deleteAllNotifications(userId);
  emitToUser(userId, "notification_count", { unreadCount: 0 });
  return { deleted: result.deletedCount ?? 0 };
}
