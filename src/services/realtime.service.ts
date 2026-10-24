import { env } from "../config/env";
import { SOCKET_PATH, emitToUser, emitToUsers } from "./socket.service";

type BroadcastMessage = {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
};

function isConfigured(): boolean {
  return Boolean(hasValidUrl() && env.supabaseServiceRoleKey);
}

function hasValidUrl(): boolean {
  return /^https:\/\//.test(env.supabaseUrl);
}

async function broadcast(messages: BroadcastMessage[]): Promise<void> {
  if (!isConfigured() || messages.length === 0) return;

  const url = `${env.supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.supabaseServiceRoleKey,
        Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Realtime broadcast failed", response.status, body);
    }
  } catch (error) {
    console.error("Realtime broadcast error", error);
  }
}

export async function publishConversationMessage(params: {
  conversationId: string;
  participantIds: string[];
  message: Record<string, unknown>;
  lastMessage: string;
  lastMessageAt: string | Date;
  recipientId: string;
  senderId?: string;
  senderName?: string;
}): Promise<void> {
  const {
    conversationId,
    participantIds,
    message,
    lastMessage,
    lastMessageAt,
    recipientId,
    senderId,
    senderName,
  } = params;

  const conversationTopic = `conversation:${conversationId}`;
  const lastMessageAtIso =
    lastMessageAt instanceof Date
      ? lastMessageAt.toISOString()
      : String(lastMessageAt);

  const inboxPayload = {
    conversationId,
    lastMessage,
    lastMessageAt: lastMessageAtIso,
    message,
    senderId: senderId ?? "",
    senderName: senderName ?? "",
  };

  emitToUsers(participantIds, "new_message", message);
  for (const userId of participantIds) {
    emitToUser(userId, "conversation_updated", {
      ...inboxPayload,
      unreadDelta: userId === recipientId ? 1 : 0,
    });
  }

  await broadcast([
    {
      topic: conversationTopic,
      event: "new_message",
      payload: message,
    },
    ...participantIds.map((userId) => ({
      topic: `user:${userId}`,
      event: "conversation_updated",
      payload: {
        ...inboxPayload,
        unreadDelta: userId === recipientId ? 1 : 0,
      },
    })),
  ]);
}

export async function publishTyping(params: {
  conversationId: string;
  userId: string;
  participantIds?: string[];
}): Promise<void> {
  const others = (params.participantIds ?? []).filter(
    (id) => id !== params.userId,
  );
  emitToUsers(others, "typing", {
    userId: params.userId,
    conversationId: params.conversationId,
  });

  await broadcast([
    {
      topic: `conversation:${params.conversationId}`,
      event: "typing",
      payload: { userId: params.userId, conversationId: params.conversationId },
    },
  ]);
}

export async function publishMessagesDelivered(params: {
  conversationId: string;
  userId: string;
  participantIds: string[];
  messageIds: string[];
}): Promise<void> {
  if (params.messageIds.length === 0) return;

  const payload = {
    conversationId: params.conversationId,
    userId: params.userId,
    messageIds: params.messageIds,
  };

  emitToUsers(params.participantIds, "messages_delivered", payload);

  await broadcast([
    {
      topic: `conversation:${params.conversationId}`,
      event: "messages_delivered",
      payload,
    },
  ]);
}

export async function publishMessagesRead(params: {
  conversationId: string;
  userId: string;
  participantIds: string[];
}): Promise<void> {
  const payload = {
    conversationId: params.conversationId,
    userId: params.userId,
    unreadCount: 0,
  };

  emitToUsers(params.participantIds, "messages_read", payload);
  emitToUsers(params.participantIds, "conversation_updated", {
    conversationId: params.conversationId,
    readerId: params.userId,
    unreadCountForReader: 0,
  });

  await broadcast([
    {
      topic: `conversation:${params.conversationId}`,
      event: "messages_read",
      payload,
    },
    ...params.participantIds.map((userId) => ({
      topic: `user:${userId}`,
      event: "conversation_updated",
      payload: {
        conversationId: params.conversationId,
        readerId: params.userId,
        unreadCountForReader: 0,
      },
    })),
  ]);
}

export function realtimePublicConfig() {
  const websocket = { path: SOCKET_PATH };
  if (!hasValidUrl() || !env.supabaseAnonKey) {
    return { enabled: false as const, websocket };
  }

  return {
    enabled: true as const,
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
    websocket,
  };
}
