import { AuthError } from "../errors/AuthError";
import { NOTIFICATION_TYPES, type NotificationType } from "../models/Notification";

export interface CreateNotificationInput {
  type: string;
  title: string;
  body: string;
  metadata?: unknown;
}

export interface ValidNotificationInput extends CreateNotificationInput {
  type: NotificationType;
}

export function validateCreateNotificationInput(
  payload: CreateNotificationInput,
): ValidNotificationInput {
  const type = payload?.type?.trim() as NotificationType | undefined;
  const title = payload?.title?.trim();
  const body = payload?.body?.trim();

  if (!type || !NOTIFICATION_TYPES.includes(type)) {
    throw new AuthError(
      `type must be one of: ${NOTIFICATION_TYPES.join(", ")}`,
      400,
    );
  }

  if (!title) {
    throw new AuthError("title is required", 400);
  }

  if (!body) {
    throw new AuthError("body is required", 400);
  }

  return { ...payload, type, title, body };
}
