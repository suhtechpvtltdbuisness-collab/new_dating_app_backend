import type { WebSocket } from "ws";
import { ConversationModel } from "../models/Conversation";
import { UserModel } from "../models/User";
import { countUnreadNotifications } from "../repository/notification.repository";
import { AuthError } from "../errors/AuthError";
import { chatPartnerIds } from "./chatAccess.service";
import {
  markAllIncomingDelivered,
  markConversationRead,
  notifyTyping,
  sendConversationMessage,
} from "./conversation.service";
import {
  type ClientMessage,
  emitToSocket,
  emitToUsers,
  type SocketHooks,
} from "./socket.service";

/**
 * People who share a conversation with the user and should see their status:
 * only current matches, never someone blocked or unmatched.
 */
async function conversationPartners(userId: string): Promise<string[]> {
  const [conversations, allowed] = await Promise.all([
    ConversationModel.find({ participants: userId })
      .select("participants")
      .lean(),
    chatPartnerIds(userId),
  ]);
  const allowedSet = new Set(allowed);
  const partners = new Set<string>();
  for (const conversation of conversations) {
    for (const participant of conversation.participants ?? []) {
      const id = String(participant);
      if (id !== userId && allowedSet.has(id)) partners.add(id);
    }
  }
  return [...partners];
}

// Per-socket budget for chat events: 30 per 10 seconds.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_EVENTS = 30;
const rateBySocket = new WeakMap<WebSocket, { start: number; count: number }>();

function withinRateLimit(socket: WebSocket): boolean {
  const now = Date.now();
  const entry = rateBySocket.get(socket);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateBySocket.set(socket, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_MAX_EVENTS;
}

function errorDetails(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) {
    return { status: error.status, error: error.message };
  }
  console.error("Socket chat event failed", error);
  return { status: 500, error: "Something went wrong" };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * `send_message` → saves the message (same rules as the REST endpoint) and
 * answers this socket with `message_ack`; the message itself reaches both
 * people as `new_message`.
 */
async function handleSendMessage(
  userId: string,
  data: ClientMessage["data"],
  socket: WebSocket,
): Promise<void> {
  const clientId = str(data.clientId).slice(0, 64);
  try {
    const message = await sendConversationMessage(
      userId,
      str(data.conversationId),
      {
        message: str(data.message),
        attachmentUrl: str(data.attachmentUrl) || undefined,
        attachmentType: str(data.attachmentType) || undefined,
        clientId: clientId || undefined,
      },
    );
    emitToSocket(socket, "message_ack", { clientId, ok: true, message });
  } catch (error) {
    emitToSocket(socket, "message_ack", {
      clientId,
      ok: false,
      conversationId: str(data.conversationId),
      ...errorDetails(error),
    });
  }
}

function handleChatEvent(
  userId: string,
  message: ClientMessage,
  socket: WebSocket,
): void {
  const { event, data } = message;
  if (!["send_message", "mark_read", "typing"].includes(event)) return;

  if (!withinRateLimit(socket)) {
    if (event === "send_message") {
      emitToSocket(socket, "message_ack", {
        clientId: str(data.clientId).slice(0, 64),
        ok: false,
        status: 429,
        error: "You're sending messages too quickly",
      });
    }
    return;
  }

  const conversationId = str(data.conversationId);
  if (!conversationId) return;

  switch (event) {
    case "send_message":
      void handleSendMessage(userId, data, socket);
      return;
    case "mark_read":
      markConversationRead(userId, conversationId).catch(() => undefined);
      return;
    case "typing":
      // Validates membership and that the two can still chat.
      notifyTyping(userId, conversationId).catch(() => undefined);
      return;
  }
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

  onMessage(userId, message, socket) {
    handleChatEvent(userId, message, socket);
  },
};

/** Sockets do not survive a restart, so nobody is online when the server boots. */
export async function resetPresence(): Promise<void> {
  await UserModel.updateMany({ isOnline: true }, { $set: { isOnline: false } });
}
