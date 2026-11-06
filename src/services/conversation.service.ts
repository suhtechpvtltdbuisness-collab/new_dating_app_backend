import { Types } from "mongoose";
import { AuthError } from "../errors/AuthError";
import { ChatModel } from "../models/Chat";
import { MediaModel } from "../models/Media";
import { ConversationModel } from "../models/Conversation";
import { ReportModel } from "../models/Report";
import { UserModel } from "../models/User";
import { presentConversation, presentMessage } from "../presenters";
import { assertMessageAllowed } from "../utils/contentModeration";
import { validateObjectId } from "../validation/chat.validation";
import {
  chatCollapseKey,
  markChatNotificationsRead,
  notifyUser,
} from "./notification.service";
import {
  publishConversationMessage,
  publishMessagesDelivered,
  publishMessagesRead,
  publishTyping,
} from "./realtime.service";
import { canChat, chatPartnerIds } from "./chatAccess.service";
import { canSeeIncognitoUser } from "./incognito.service";
import { extractBlobPathname } from "./media.service";
import { isUserConnected } from "./socket.service";

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CATCH_UP_MESSAGES = 200;
const PHOTO_PREVIEW = "📷 Photo";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CANNOT_CHAT_MESSAGE = "You can't message this person anymore";

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

/**
 * A conversation the user can still use: the two are matched and neither
 * has blocked the other. Unmatched or blocked chats behave as gone.
 */
async function requireActiveConversation(userId: string, chatId: string) {
  const conversation = await requireConversation(userId, chatId);
  if (!(await canChat(userId, otherParticipantId(conversation, userId)))) {
    throw new AuthError(CANNOT_CHAT_MESSAGE, 403);
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

  const partners = await chatPartnerIds(validUserId);
  if (partners.length === 0) return [];

  const conversations = await ConversationModel.find({
    $and: [{ participants: validUserId }, { participants: { $in: partners } }],
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
    .select("name photos isOnline lastActive preferences.showOnline")
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
    .select(
      "name photos isOnline lastActive preferences.showOnline blockedUsers isHidden isIncognito",
    )
    .lean();
  if (!recipient) {
    throw new AuthError("Recipient not found", 404);
  }

  if ((recipient.blockedUsers ?? []).some((id) => String(id) === validUserId)) {
    throw new AuthError("You cannot message this user", 403);
  }

  if (!(await canChat(validUserId, recipientId))) {
    throw new AuthError("You can chat once you both like each other", 403);
  }

  const pairKey = makePairKey(validUserId, recipientId);
  let conversation = await findDirectConversation(validUserId, recipientId);

  if (!conversation && recipient.isHidden) {
    throw new AuthError("This user is not accepting new messages", 403);
  }

  if (
    !conversation &&
    recipient.isIncognito &&
    !(await canSeeIncognitoUser(validUserId, recipientId))
  ) {
    throw new AuthError("This user is not accepting new messages", 403);
  }

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
    assertMessageAllowed(message);
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
    clientMessageId?: string;
  },
) {
  if (payload.message) assertMessageAllowed(payload.message);
  const preview = payload.message || (payload.attachmentUrl ? PHOTO_PREVIEW : "");

  const recipient = await UserModel.findById(recipientId)
    .select("blockedUsers")
    .lean();
  // A connected socket receives the message right away, so it is delivered.
  const deliveredNow = isUserConnected(recipientId) ? new Date() : undefined;

  const chat = await ChatModel.create({
    conversationId: conversation._id,
    senderId,
    recipientId,
    message: payload.message,
    attachmentUrl: payload.attachmentUrl,
    attachmentType: payload.attachmentType,
    ...(payload.clientMessageId
      ? { clientMessageId: payload.clientMessageId }
      : {}),
    ...(deliveredNow ? { deliveredAt: deliveredNow } : {}),
  });

  await ConversationModel.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: preview,
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

  const senderName = sender?.name?.trim() || "Someone";

  void publishConversationMessage({
    conversationId: String(conversation._id),
    participantIds: members,
    message: presented,
    lastMessage: preview,
    lastMessageAt: chat.createdAt,
    recipientId,
    senderId,
    senderName,
  });

  const recipientBlockedSender = (recipient?.blockedUsers ?? []).some(
    (id) => String(id) === senderId,
  );
  if (!recipientBlockedSender) {
    const body =
      preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
    void notifyUser(recipientId, {
      type: "chat",
      title: senderName,
      body,
      collapseKey: chatCollapseKey(String(conversation._id)),
      metadata: {
        conversationId: String(conversation._id),
        senderId,
        senderName,
        senderPhoto: presented.senderImage,
        messageId: String(chat._id),
      },
    });
  }

  return { chat, presented };
}

async function markIncomingDelivered(
  userId: string,
  conversation: { _id: Types.ObjectId; participants: unknown[] },
) {
  const pending = await ChatModel.find({
    conversationId: conversation._id,
    recipientId: userId,
    deliveredAt: { $exists: false },
    deletedAt: { $exists: false },
  })
    .select("_id")
    .lean();

  if (pending.length === 0) return;

  const now = new Date();
  const ids = pending.map((item) => item._id);
  await ChatModel.updateMany(
    { _id: { $in: ids } },
    { $set: { deliveredAt: now } },
  );

  void publishMessagesDelivered({
    conversationId: String(conversation._id),
    userId,
    participantIds: participantIds(conversation),
    messageIds: ids.map((id) => String(id)),
  });
}

/** Called when a user's device connects: everything waiting for them is now delivered. */
export async function markAllIncomingDelivered(userId: string): Promise<void> {
  const pending = await ChatModel.find({
    recipientId: userId,
    deliveredAt: { $exists: false },
    deletedAt: { $exists: false },
  })
    .select("_id conversationId senderId")
    .lean();
  if (pending.length === 0) return;

  await ChatModel.updateMany(
    { _id: { $in: pending.map((item) => item._id) } },
    { $set: { deliveredAt: new Date() } },
  );

  const byConversation = new Map<string, { ids: string[]; senders: Set<string> }>();
  for (const item of pending) {
    const key = String(item.conversationId);
    const entry = byConversation.get(key) ?? { ids: [], senders: new Set() };
    entry.ids.push(String(item._id));
    entry.senders.add(String(item.senderId));
    byConversation.set(key, entry);
  }

  for (const [conversationId, entry] of byConversation) {
    void publishMessagesDelivered({
      conversationId,
      userId,
      participantIds: [userId, ...entry.senders],
      messageIds: entry.ids,
    });
  }
}

export async function getConversation(
  userId: string,
  chatId: string,
  page = 1,
  limit = DEFAULT_MESSAGE_LIMIT,
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireActiveConversation(validUserId, chatId);
  const otherId = otherParticipantId(conversation, validUserId);

  await markIncomingDelivered(validUserId, conversation);

  const [otherUser, messagePage] = await Promise.all([
    UserModel.findById(otherId).select("name photos isOnline lastActive preferences.showOnline").lean(),
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
  afterMessageId?: string,
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireActiveConversation(validUserId, chatId);

  await markIncomingDelivered(validUserId, conversation);

  if (afterMessageId) {
    return loadMessagesAfter(conversation._id, afterMessageId);
  }

  const safePage = clamp(page, 1, 1000);
  const safeLimit = clamp(limit, DEFAULT_MESSAGE_LIMIT, 200);
  return loadMessages(conversation._id, safePage, safeLimit);
}

/**
 * Messages newer than `afterMessageId`, oldest first — lets a client that
 * was offline catch up from the last message it has.
 */
async function loadMessagesAfter(
  conversationId: Types.ObjectId,
  afterMessageId: string,
) {
  const anchor = await ChatModel.findOne({
    _id: validateObjectId(afterMessageId, "after"),
    conversationId,
  })
    .select("createdAt")
    .lean();
  if (!anchor) {
    // Unknown or deleted anchor: fall back to the latest page.
    return loadMessages(conversationId, 1, DEFAULT_MESSAGE_LIMIT);
  }

  const messages = await ChatModel.find({
    conversationId,
    deletedAt: { $exists: false },
    $or: [
      { createdAt: { $gt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $gt: anchor._id } },
    ],
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(MAX_CATCH_UP_MESSAGES + 1)
    .lean();

  const hasMore = messages.length > MAX_CATCH_UP_MESSAGES;
  const page = hasMore ? messages.slice(0, MAX_CATCH_UP_MESSAGES) : messages;

  const senderIds = [...new Set(page.map((item) => String(item.senderId)))];
  const senders = await UserModel.find({ _id: { $in: senderIds } })
    .select("name photos")
    .lean();
  const senderById = new Map(senders.map((user) => [String(user._id), user]));

  return {
    messages: page.map((message) =>
      presentMessage(message, senderById.get(String(message.senderId))),
    ),
    page: 1,
    limit: MAX_CATCH_UP_MESSAGES,
    total: page.length,
    // True when more than MAX_CATCH_UP_MESSAGES arrived: reload from page 1.
    hasMore,
  };
}

/** Only photos the sender uploaded through our own media endpoints. */
async function assertOwnPhoto(senderId: string, attachmentUrl: string) {
  const pathname = extractBlobPathname(attachmentUrl);
  if (
    pathname &&
    !pathname.includes("..") &&
    pathname.startsWith(`profiles/${senderId}/`)
  ) {
    return;
  }

  const mediaId = attachmentUrl.match(/\/media\/([a-f0-9]{24})(?:[?#].*)?$/i)?.[1];
  if (mediaId) {
    const media = await MediaModel.findById(mediaId).select("ownerId").lean();
    if (media && String(media.ownerId) === senderId) return;
  }

  throw new AuthError("Invalid attachment", 400);
}

export async function sendConversationMessage(
  userId: string,
  chatId: string,
  payload: {
    message?: string;
    attachmentUrl?: string;
    attachmentType?: string;
    clientId?: string;
  },
) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireActiveConversation(validUserId, chatId);

  const message =
    typeof payload?.message === "string" ? payload.message.trim() : "";
  const attachmentUrl =
    typeof payload?.attachmentUrl === "string"
      ? payload.attachmentUrl.trim()
      : "";
  if (!message && !attachmentUrl) {
    throw new AuthError("message is required", 400);
  }
  if (attachmentUrl) {
    if ((payload.attachmentType ?? "image") !== "image") {
      throw new AuthError("Only photos can be attached", 400);
    }
    await assertOwnPhoto(validUserId, attachmentUrl);
  }

  const clientId =
    typeof payload?.clientId === "string" && CLIENT_ID_PATTERN.test(payload.clientId)
      ? payload.clientId
      : undefined;
  if (clientId) {
    // A retried send (socket timeout, then REST) returns the stored message.
    const existing = await findByClientId(validUserId, clientId);
    if (existing) return existing;
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
  try {
    const { presented } = await appendMessage(
      conversation,
      validUserId,
      recipientId,
      {
        message,
        attachmentUrl: attachmentUrl || undefined,
        attachmentType: attachmentUrl ? "image" : undefined,
        clientMessageId: clientId,
      },
    );
    return presented;
  } catch (error: any) {
    // Two copies of the same send raced; the first one won.
    if (clientId && error?.code === 11000) {
      const existing = await findByClientId(validUserId, clientId);
      if (existing) return existing;
    }
    throw error;
  }
}

async function findByClientId(senderId: string, clientMessageId: string) {
  const chat = await ChatModel.findOne({ senderId, clientMessageId }).lean();
  if (!chat) return null;
  const sender = await UserModel.findById(senderId).select("name photos").lean();
  return presentMessage(chat, sender);
}

export async function markConversationRead(userId: string, chatId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireActiveConversation(validUserId, chatId);
  const now = new Date();

  await Promise.all([
    ChatModel.updateMany(
      {
        conversationId: conversation._id,
        recipientId: validUserId,
        readAt: { $exists: false },
      },
      {
        $set: {
          readAt: now,
          deliveredAt: now,
        },
      },
    ),
    ConversationModel.updateOne(
      { _id: conversation._id },
      { $set: { [`unread.${validUserId}`]: 0 } },
    ),
  ]);

  // Ensure deliveredAt is set even when readAt already existed.
  await ChatModel.updateMany(
    {
      conversationId: conversation._id,
      recipientId: validUserId,
      deliveredAt: { $exists: false },
    },
    { $set: { deliveredAt: now } },
  );

  void publishMessagesRead({
    conversationId: String(conversation._id),
    userId: validUserId,
    participantIds: participantIds(conversation),
  });
  void markChatNotificationsRead(validUserId, String(conversation._id));

  return { chatId: String(conversation._id), unreadCount: 0 };
}

export async function notifyTyping(userId: string, chatId: string) {
  const validUserId = validateObjectId(userId, "userId");
  const conversation = await requireActiveConversation(validUserId, chatId);

  void publishTyping({
    conversationId: String(conversation._id),
    userId: validUserId,
    participantIds: participantIds(conversation),
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
  payload: {
    messageId?: string;
    reason?: string;
    details?: string;
    reportedUserId?: string;
  },
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
  if (messageId && !message) {
    throw new AuthError("Message not found", 404);
  }

  // Profile/user reports send reportedUserId directly; message reports
  // can infer the accused user from the message sender.
  const reportedUserId = payload?.reportedUserId
    ? validateObjectId(payload.reportedUserId, "reportedUserId")
    : message?.senderId
      ? String(message.senderId)
      : undefined;

  if (!reportedUserId) {
    throw new AuthError("reportedUserId or messageId is required", 400);
  }

  const reportedUser = await UserModel.findById(reportedUserId)
    .select("_id name")
    .lean();
  if (!reportedUser) {
    throw new AuthError("Reported user not found", 404);
  }

  const report = await ReportModel.create({
    reporterId: validUserId,
    messageId,
    reportedUserId,
    reportedUserName: reportedUser.name ?? "",
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

  if (!conversation || !(await canChat(validUserId, validOtherId))) {
    return [];
  }

  const otherUser = await UserModel.findById(validOtherId)
    .select("name photos isOnline lastActive preferences.showOnline")
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
