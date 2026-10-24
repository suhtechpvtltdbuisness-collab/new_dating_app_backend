import { NotificationModel } from "../models/Notification";

const UNREAD = { readAt: { $exists: false } };

export function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: unknown;
  collapseKey?: string;
  count?: number;
}) {
  return NotificationModel.create(input);
}

/** Removes the unread notification with this key and returns it, if any. */
export function takeUnreadByCollapseKey(userId: string, collapseKey: string) {
  return NotificationModel.findOneAndDelete({
    userId,
    collapseKey,
    ...UNREAD,
  }).lean();
}

export async function getNotificationsForUser(
  userId: string,
  page: number,
  limit: number,
) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments(filter),
  ]);
  return { items, total };
}

export function countUnreadNotifications(userId: string) {
  return NotificationModel.countDocuments({ userId, ...UNREAD });
}

export function markNotificationAsRead(notificationId: string, userId: string) {
  return NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId },
    { readAt: new Date() },
    { new: true },
  ).lean();
}

export function markAllNotificationsAsRead(userId: string) {
  return NotificationModel.updateMany(
    { userId, ...UNREAD },
    { readAt: new Date() },
  );
}

export function markNotificationsReadByCollapseKey(
  userId: string,
  collapseKey: string,
) {
  return NotificationModel.updateMany(
    { userId, collapseKey, ...UNREAD },
    { readAt: new Date() },
  );
}

export function deleteNotification(notificationId: string, userId: string) {
  return NotificationModel.findOneAndDelete({ _id: notificationId, userId });
}

export function deleteAllNotifications(userId: string) {
  return NotificationModel.deleteMany({ userId });
}
