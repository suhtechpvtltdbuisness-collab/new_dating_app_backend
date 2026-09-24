import { env } from "../config/env";

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
}): Promise<void> {
  const {
    conversationId,
    participantIds,
    message,
    lastMessage,
    lastMessageAt,
    recipientId,
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
  };

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
}): Promise<void> {
  await broadcast([
    {
      topic: `conversation:${params.conversationId}`,
      event: "typing",
      payload: { userId: params.userId, conversationId: params.conversationId },
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
  if (!hasValidUrl() || !env.supabaseAnonKey) {
    return { enabled: false as const };
  }

  return {
    enabled: true as const,
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
  };
}
