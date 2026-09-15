import { Router } from "express";
import { authenticateAccessToken } from "../middlewares/authenticate";
import { uploadAny } from "../middlewares/upload";
import {
  createChatHandler,
  deleteChatHandler,
  deleteMessageHandler,
  getChatHandler,
  getChatsByRecipientHandler,
  listChatsHandler,
  listMessagesHandler,
  markChatReadHandler,
  realtimeConfigHandler,
  reportMessageHandler,
  sendMessageHandler,
  typingIndicatorHandler,
  updateChatHandler,
  uploadChatMediaHandler,
} from "../controller/chat.controller";

const chatRouter = Router();

chatRouter.use(authenticateAccessToken);

chatRouter.get("/", listChatsHandler);
chatRouter.post("/", createChatHandler);
chatRouter.get("/realtime-config", realtimeConfigHandler);
chatRouter.post("/messages/report", reportMessageHandler);
chatRouter.get("/recipient/:recipientId", getChatsByRecipientHandler);
chatRouter.get("/:chatId/messages", listMessagesHandler);
chatRouter.post("/:chatId/messages", sendMessageHandler);
chatRouter.delete("/:chatId/messages/:messageId", deleteMessageHandler);
chatRouter.post("/:chatId/read", markChatReadHandler);
chatRouter.post("/:chatId/upload", uploadAny, uploadChatMediaHandler);
chatRouter.post("/:chatId/typing", typingIndicatorHandler);
chatRouter.get("/:chatId", getChatHandler);
chatRouter.put("/:chatId", updateChatHandler);
chatRouter.delete("/:chatId", deleteChatHandler);

export default chatRouter;
