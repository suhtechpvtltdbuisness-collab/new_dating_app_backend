import type { NextFunction, Request, Response } from "express";
import { getUserChatUsers } from "../services/chat.service";
import {
  attachConversationMedia,
  createConversation,
  deleteConversation,
  deleteConversationMessage,
  getConversation,
  getConversationsWith,
  listConversationMessages,
  listConversations,
  markConversationRead,
  notifyTyping,
  reportConversationMessage,
  sendConversationMessage,
  updateConversation,
} from "../services/conversation.service";
import { realtimePublicConfig } from "../services/realtime.service";
import { storeUploads } from "../services/media.service";
import { numericQuery, param, requireUserId } from "../utils/context";

export async function listChatsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const chats = await listConversations(
      userId,
      numericQuery(req, "page") ?? 1,
      numericQuery(req, "limit") ?? 20,
    );
    res.status(200).json({ data: { chats } });
  } catch (error) {
    next(error);
  }
}

export async function createChatHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const chat = await createConversation(userId, req.body);
    res.status(201).json({ message: "Chat created", data: chat });
  } catch (error) {
    next(error);
  }
}

export async function getChatHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const chat = await getConversation(
      userId,
      param(req, "chatId"),
      numericQuery(req, "page") ?? 1,
      numericQuery(req, "limit") ?? 50,
    );
    res.status(200).json({ data: chat });
  } catch (error) {
    next(error);
  }
}

export async function updateChatHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const chat = await updateConversation(
      userId,
      param(req, "chatId"),
      req.body,
    );
    res.status(200).json({ message: "Chat updated", data: chat });
  } catch (error) {
    next(error);
  }
}

export async function deleteChatHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await deleteConversation(userId, param(req, "chatId"));
    res.status(200).json({ message: "Chat deleted", data: result });
  } catch (error) {
    next(error);
  }
}

export async function listMessagesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await listConversationMessages(
      userId,
      param(req, "chatId"),
      numericQuery(req, "page") ?? 1,
      numericQuery(req, "limit") ?? 50,
    );
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function sendMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const message = await sendConversationMessage(
      userId,
      param(req, "chatId"),
      req.body,
    );
    res.status(201).json({ message: "Message sent", data: message });
  } catch (error) {
    next(error);
  }
}

export async function markChatReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await markConversationRead(userId, param(req, "chatId"));
    res.status(200).json({ message: "Chat marked as read", data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await deleteConversationMessage(
      userId,
      param(req, "chatId"),
      param(req, "messageId"),
    );
    res.status(200).json({ message: "Message deleted", data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadChatMediaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const [mediaUrl] = await storeUploads(req, userId);
    const result = await attachConversationMedia(
      userId,
      param(req, "chatId"),
      mediaUrl,
    );
    res.status(201).json({ message: "Media uploaded", data: result });
  } catch (error) {
    next(error);
  }
}

export async function typingIndicatorHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await notifyTyping(userId, param(req, "chatId"));
    res.status(202).json({ message: "Typing", data: result });
  } catch (error) {
    next(error);
  }
}

export async function realtimeConfigHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireUserId(res);
    res.status(200).json({ data: realtimePublicConfig() });
  } catch (error) {
    next(error);
  }
}

export async function reportMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await reportConversationMessage(userId, req.body);
    res.status(201).json({ message: "Message reported", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getChatUsersHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const users = await getUserChatUsers(userId);
    res.status(200).json({ data: { users } });
  } catch (error) {
    next(error);
  }
}

export async function getChatsByRecipientHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const chats = await getConversationsWith(
      userId,
      param(req, "recipientId"),
      true,
    );
    res.status(200).json({ data: { chats } });
  } catch (error) {
    next(error);
  }
}

export async function getChatHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const history = await getConversationsWith(
      userId,
      param(req, "userId"),
      true,
    );
    res.status(200).json({ data: { history } });
  } catch (error) {
    next(error);
  }
}
