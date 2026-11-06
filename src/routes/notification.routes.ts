import { Router } from "express";
import { authenticateAccessToken } from "../middlewares/authenticate";
import {
  clearNotificationsHandler,
  createNotificationHandler,
  deleteNotificationHandler,
  getNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  registerDeviceHandler,
  unreadCountHandler,
  unregisterDeviceHandler,
} from "../controller/notification.controller";

const notificationRouter = Router();

notificationRouter.use(authenticateAccessToken);

notificationRouter.post("/", createNotificationHandler);
notificationRouter.get("/", getNotificationsHandler);
notificationRouter.delete("/", clearNotificationsHandler);
notificationRouter.get("/unread-count", unreadCountHandler);
notificationRouter.post("/devices", registerDeviceHandler);
notificationRouter.delete("/devices", unregisterDeviceHandler);
notificationRouter.patch("/read-all", markAllNotificationsReadHandler);
notificationRouter.patch("/:notificationId/read", markNotificationReadHandler);
notificationRouter.delete("/:notificationId", deleteNotificationHandler);

export default notificationRouter;
