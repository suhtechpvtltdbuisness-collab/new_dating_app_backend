import { Types } from "mongoose";
import { AuthError } from "../errors/AuthError";
import { ChatModel } from "../models/Chat";
import { ConversationModel } from "../models/Conversation";
import { ReportModel } from "../models/Report";
import { UserModel } from "../models/User";
import { presentConversation, presentMessage } from "../presenters";
import { validateObjectId } from "../validation/chat.validation";
import {
  publishConversationMessage,
  publishMessagesRead,
  publishTyping,
} from "./realtime.service";

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 2000;

function clamp(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function makePairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

function otherParticipantId(
  conversation: { participants: unknown[] },
  userId: string,
): string {
  const other = conversation.participants.find(
    (participant) => String(participant) !== userId,
  );
  return String(other ?? "");
}

function participantIds(conversation: { participants: unknown[] }): string[] {
  return conversation.participants.map((participant) => String(participant));
}

async function requireConversation(userId: string, chatId: string) {
  const conversation = await ConversationModel.findOne({
    _id: validateObjectId(chatId, "chatId"),
    participants: userId,
  });

  if (!conversation) {
    throw new AuthError("Chat not found", 404);
  }

  return conversation;
}

async function loadMessages(
  conversationId: Types.ObjectId,
  page: number,
  limit: number,
) {
  const filter = {
    conversationId,
    deletedAt: { $exists: false },
  };

  const [messages, total] = await Promise.all([
    ChatModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ChatModel.countDocuments(filter),
  ]);

  const senderIds = [...new Set(messages.map((item) => String(item.senderId)))];
  const senders = await UserModel.find({ _id: { $in: senderIds } })
    .select("name photos")
    .lean();
  const senderById = new Map(senders.map((user) => [String(user._id), user]));

  const presented = messages
    .reverse()
    .map((message) =>
      presentMessage(message, senderById.get(String(message.senderId))),
    );

  return {
    messages: presented,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

export async function listConversations(
  userId: string,
  page = 1,
  limit = 20,
) {
  const validUserId = validateObjectId(userId, "userId");
  const safeLimit = clamp(limit, 20, 100);
  const safePage = clamp(page, 1, 1000);

  const conversations = await ConversationModel.find({
    participants: validUserId,
    deletedFor: { $ne: new Types.ObjectId(validUserId) },
  })
    .sort({ lastMessageAt: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit)
    .lean();

  const otherIds = conversations.map((conversation) =>
    otherParticipantId(conversation, validUserId),
  );
  const users = await UserModel.find({ _id: { $in: otherIds } })
    .select("name photos isOnline lastActive")
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));

  return conversations.map((conversation) =>
    presentConversation(
      conversation,
      validUserId,
      userById.get(otherParticipantId(conversation, validUserId)),
    ),
  );
}

async function findDirectConversation(userA: string, userB: string) {
  const pairKey = makePairKey(userA, userB);

  let conversation = await ConversationModel.findOne({ pairKey });
  if (conversation) return conversation;

  conversation = await ConversationModel.findOne({
    participants: { $all: [userA, userB], $size: 2 },
  });

  if (conversation && !(conversation as { pairKey?: string }).pairKey) {
    await ConversationModel.updateOne(
      { _id: conversation._id },
      { $set: { pairKey, type: "direct" } },
    );
    conversation.pairKey = pairKey;
  }

  return conversation;
}

export async function createConversation(
  userId: string,
  payload: { recipientId?: string; message?: string },
) {
  const validUserId = validateObjectId(userId, "userId");
  const recipientId = validateObjectId(payload?.recipientId ?? "", "recipientId");

  if (recipientId === validUserId) {
    throw new AuthError("You cannot start a chat with yourself", 400);
  }

  const recipient = await UserModel.findById(recipientId)
    .select("name photos isOnline lastActive blockedUsers")
    .lean();
  if (!recipient) {
    throw new AuthError("Recipient not found", 404);
  }

  if ((recipient.blockedUsers ?? []).some((id) => String(id) === validUserId)) {
    throw new AuthError("You cannot message this user", 403);
  }

  const pairKey = makePairKey(validUserId, recipientId);
  let conversation = await findDirectConversation(validUserId, recipientId);

  if (!conversation) {
    try {
      conversation = await ConversationModel.create({
        pairKey,
        type: "direct",
        participants: [validUserId, recipientId],
        lastMessage: "",
        lastMessageAt: new Date(),
      });
    } catch (error: any) {
      // Concurrent create — unique pairKey wins; reload the winner.
      if (error?.code === 11000) {
        conversation = await findDirectConversation(validUserId, recipientId);
      } else {
        throw error;
      }
    }
  }

  if (!conversation) {
    throw new AuthError("Unable to create conversation", 500);
  }

  await ConversationModel.updateOne(
    { _id: conversation._id },
    {
      $pull: { deletedFor: new Types.ObjectId(validUserId) },
      $set: { pairKey, type: "direct" },
    },
  );

  const message = payload?.message?.trim();
  if (message) {
    await appendMessage(conversation, validUserId, recipientId, { message });
  }

  const refreshed = await ConversationModel.findById(conversation._id).lean();
  const messagePage = await loadMessages(
    conversation._id,
    1,
    DEFAULT_MESSAGE_LIMIT,
  );

  return presentConversation(
    refreshed ?? conversation.toObject(),
    validUserId,
    recipient,
    messagePage.messages,
  );
}

async function appendMessage(
  conversation: { _id: Types.ObjectId; participants?: unknown[]; unread?: unknown },
  senderId: string,
  recipientId: string,
  payload: {
    message: string;
    attachmentUrl?: string;
    attachmentType?: string;
  },
) {
  const chat = await ChatModel.create({
    conversationId: conversation._id,
    senderId,
    recipientId,
    message: payload.message,
    attachmentUrl: payload.attachmentUrl,
    attachmentType: payload.attachmentType,
  });

  await ConversationModel.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: payload.message,
        lastMessageAt: chat.createdAt,
      },
      $inc: { [`unread.${recipientId}`]: 1 },
      $pull: { deletedFor: new Types.ObjectId(recipientId) },
    },
  );

  const sender = await UserModel.findById(senderId).select("name photos").lean();
  const presented = presentMessage(chat.toObject(), sender);
  const members =
    conversation.participants && conversation.participants.length > 0
      ? conversation.participants.map((participant) => String(participant))
      : [senderId, recipientId];

  void publishConversationMessage({
    conversationId: String(conversation._id),
    participantIds: members,
    message: presented,
    lastMessage: payload.message,
    lastMessageAt: chat.createdAt,
    recipientId,
  });

  return { chat, presented };
}

export async function getConversation(
  userId: string,
  chatId: string,
  page = 1,
  limit = DEFAULT_MESSAGE_LIMIT,
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);
  const otherId = otherParticipantId(conversation, validUserId);

  const [otherUser, messagePage] = await Promise.all([
    UserModel.findById(otherId).select("name photos isOnline lastActive").lean(),
    loadMessages(
      conversation._id,
      clamp(page, 1, 1000),
      clamp(limit, DEFAULT_MESSAGE_LIMIT, 200),
    ),
  ]);

  return presentConversation(
    conversation.toObject(),
    validUserId,
    otherUser,
    messagePage.messages,
  );
}

export async function listConversationMessages(
  userId: string,
  chatId: string,
  page = 1,
  limit = DEFAULT_MESSAGE_LIMIT,
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);
  const safePage = clamp(page, 1, 1000);
  const safeLimit = clamp(limit, DEFAULT_MESSAGE_LIMIT, 200);

  return loadMessages(conversation._id, safePage, safeLimit);
}

export async function sendConversationMessage(
  userId: string,
  chatId: string,
  payload: {
    message?: string;
    attachmentUrl?: string;
    attachmentType?: string;
  },
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);

  const message = payload?.message?.trim();
  if (!message) {
    throw new AuthError("message is required", 400);
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new AuthError(
      `message must be at most ${MAX_MESSAGE_LENGTH} characters`,
      400,
    );
  }

  if ((conversation.blockedBy ?? []).length > 0) {
    throw new AuthError("This conversation is blocked", 403);
  }

  const recipientId = otherParticipantId(conversation, validUserId);
  const { presented } = await appendMessage(
    conversation,
    validUserId,
    recipientId,
    {
      message,
      attachmentUrl: payload.attachmentUrl,
      attachmentType: payload.attachmentType,
    },
  );

  return presented;
}

export async function markConversationRead(userId: string, chatId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);

  await Promise.all([
    ChatModel.updateMany(
      {
        conversationId: conversation._id,
        recipientId: validUserId,
        readAt: { $exists: false },
      },
      { readAt: new Date() },
    ),
    ConversationModel.updateOne(
      { _id: conversation._id },
      { $set: { [`unread.${validUserId}`]: 0 } },
    ),
  ]);

  void publishMessagesRead({
    conversationId: String(conversation._id),
    userId: validUserId,
    participantIds: participantIds(conversation),
  });

  return { chatId: String(conversation._id), unreadCount: 0 };
}

export async function notifyTyping(userId: string, chatId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);

  void publishTyping({
    conversationId: String(conversation._id),
    userId: validUserId,
  });

  return { received: true, conversationId: String(conversation._id) };
}

export async function updateConversation(
  userId: string,
  chatId: string,
  payload: { isBlocked?: boolean },
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);

  if (typeof payload?.isBlocked === "boolean") {
    await ConversationModel.updateOne(
      { _id: conversation._id },
      payload.isBlocked
        ? { $addToSet: { blockedBy: new Types.ObjectId(validUserId) } }
        : { $pull: { blockedBy: new Types.ObjectId(validUserId) } },
    );
  }

  return getConversation(validUserId, chatId);
}

export async function deleteConversation(userId: string, chatId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);

  await ConversationModel.updateOne(
    { _id: conversation._id },
    { $addToSet: { deletedFor: new Types.ObjectId(validUserId) } },
  );

  return { deleted: true, chatId: String(conversation._id) };
}

export async function deleteConversationMessage(
  userId: string,
  chatId: string,
  messageId: string,
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireConversation(validUserId, chatId);

  const message = await ChatModel.findOneAndUpdate(
    {
      _id: validateObjectId(messageId, "messageId"),
      conversationId: conversation._id,
      senderId: validUserId,
      deletedAt: { $exists: false },
    },
    { deletedAt: new Date() },
    { new: true },
  );

  if (!message) {
    throw new AuthError("Message not found", 404);
  }

  return { deleted: true, messageId: String(message._id) };
}

export async function attachConversationMedia(
  userId: string,
  chatId: string,
  mediaUrl: string,
) {
  const validUserId = validateObjectId(userId, "userId");
  await requireConversation(validUserId, chatId);
  return { mediaUrl };
}

export async function reportConversationMessage(
  userId: string,
  payload: { messageId?: string; reason?: string; details?: string },
) {
  const validUserId = validateObjectId(userId, "userId");
  const reason = payload?.reason?.trim();
  if (!reason) {
    throw new AuthError("reason is required", 400);
  }

  const messageId = payload?.messageId
    ? validateObjectId(payload.messageId, "messageId")
    : undefined;

  const message = messageId ? await ChatModel.findById(messageId).lean() : null;

  const report = await ReportModel.create({
    reporterId: validUserId,
    messageId,
    reportedUserId: message?.senderId,
    reason,
    details: payload?.details,
  });

  return { reported: true, reportId: String(report._id) };
}

/// Conversations with a specific counterpart — backs
/// `GET /chats/recipient/:recipientId` and `GET /chat-history/:userId`.
export async function getConversationsWith(
  userId: string,
  otherUserId: string,
  withMessages = false,
) {
  const validUserId = validateObjectId(userId, "userId");
  const validOtherId = validateObjectId(otherUserId, "userId");

  const conversation = await findDirectConversation(validUserId, validOtherId);

  if (!conversation) {
    return [];
  }

  const otherUser = await UserModel.findById(validOtherId)
    .select("name photos isOnline lastActive")
    .lean();

  const lean = conversation.toObject ? conversation.toObject() : conversation;

  return [
    presentConversation(
      lean,
      validUserId,
      otherUser,
      withMessages
        ? (await loadMessages(conversation._id, 1, DEFAULT_MESSAGE_LIMIT))
            .messages
        : [],
    ),
  ];
}
