import type { WebSocket } from "ws";
import { ConversationModel } from "../models/Conversation";
import { UserModel } from "../models/User";
import { countUnreadNotifications } from "../repository/notification.repository";
import { markAllIncomingDelivered, notifyTyping } from "./conversation.service";
import {
  emitToSocket,
  emitToUsers,
  type SocketHooks,
} from "./socket.service";

/** People who share a conversation with the user and should see their status. */
async function conversationPartners(userId: string): Promise<string[]> {
  const conversations = await ConversationModel.find({ participants: userId })
    .select("participants")
    .lean();
  const partners = new Set<string>();
  for (const conversation of conversations) {
    for (const participant of conversation.participants ?? []) {
      const id = String(participant);
      if (id !== userId) partners.add(id);
    }
  }
  return [...partners];
}

async function setPresence(userId: string, isOnline: boolean): Promise<void> {
  const lastActive = new Date();
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { isOnline, lastActive } },
    { new: true },
  )
    .select("preferences.showOnline")
    .lean();
  if (!user || user.preferences?.showOnline === false) return;

  emitToUsers(await conversationPartners(userId), "presence", {
    userId,
    isOnline,
    lastActive: lastActive.toISOString(),
  });
}

function logFailure(label: string) {
  return (error: unknown) => console.error(label, error);
}

export const socketHooks: SocketHooks = {
  async authorize(userId) {
    const user = await UserModel.findById(userId).select("isBanned").lean();
    return Boolean(user && !user.isBanned);
  },

  onUserOnline(userId) {
    setPresence(userId, true).catch(logFailure("Presence update failed"));
    markAllIncomingDelivered(userId).catch(
      logFailure("Delivering pending messages failed"),
    );
  },

  onSocketOpen(userId: string, socket: WebSocket) {
    countUnreadNotifications(userId)
      .then((unreadCount) =>
        emitToSocket(socket, "notification_count", { unreadCount }),
      )
      .catch(logFailure("Unread count failed"));
  },

  onUserOffline(userId) {
    setPresence(userId, false).catch(logFailure("Presence update failed"));
  },

  onMessage(userId, message) {
    if (message.event === "typing") {
      const conversationId = String(message.data.conversationId ?? "");
      if (!conversationId) return;
      // Validates that the user belongs to the conversation.
      notifyTyping(userId, conversationId).catch(() => undefined);
    }
  },
};

/** Sockets do not survive a restart, so nobody is online when the server boots. */
export async function resetPresence(): Promise<void> {
  await UserModel.updateMany({ isOnline: true }, { $set: { isOnline: false } });
}
