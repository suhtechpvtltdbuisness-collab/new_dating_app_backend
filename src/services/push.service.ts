import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import { env } from "../config/env";
import { AuthError } from "../errors/AuthError";
import { DeviceTokenModel } from "../models/DeviceToken";
import type { NotificationType } from "../models/Notification";

/**
 * Firebase Cloud Messaging: reaches the phone when the app is closed or in
 * the background. Turned on by FIREBASE_SERVICE_ACCOUNT (the service account
 * JSON, raw or base64); without it pushes are skipped and only the socket is
 * used.
 */

// Android channel ids; must match NotificationService in the app.
const CHANNELS: Record<string, string> = {
  chat: "velora_messages",
  match: "velora_matches",
  like: "velora_likes",
  super_like: "velora_likes",
};
const ACCOUNT_CHANNEL = "velora_account";

// FCM answers these for tokens that will never work again.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const MAX_TOKENS_PER_USER = 10;
const MAX_TOKEN_LENGTH = 4096;
const MAX_MUTED = 500;

let app: App | null | undefined;

function parseServiceAccount(raw: string): Record<string, string> | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const json = text.startsWith("{")
      ? text
      : Buffer.from(text, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON");
    return null;
  }
}

function firebaseApp(): App | null {
  if (app !== undefined) return app;
  const account = parseServiceAccount(env.firebaseServiceAccount);
  if (!account) {
    app = null;
    return app;
  }
  try {
    app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        }),
      });
  } catch (error) {
    console.error("Firebase init failed; push notifications are off", error);
    app = null;
  }
  return app;
}

export function isPushConfigured(): boolean {
  return firebaseApp() !== null;
}

// ------------------------------------------------------------- devices

export interface DevicePreferences {
  enabled?: boolean;
  messages?: boolean;
  matches?: boolean;
  likes?: boolean;
  account?: boolean;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Saves (or moves to this user) the device's token and its settings. */
export async function registerDevice(
  userId: string,
  payload: {
    token?: unknown;
    platform?: unknown;
    preferences?: unknown;
    mutedConversations?: unknown;
  },
) {
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new AuthError("token is required", 400);
  }
  const platform = String(payload.platform ?? "");
  if (!["android", "ios", "web"].includes(platform)) {
    throw new AuthError("platform must be android, ios or web", 400);
  }

  const raw = (payload.preferences ?? {}) as Record<string, unknown>;
  const preferences = {
    enabled: bool(raw.enabled) ?? true,
    messages: bool(raw.messages) ?? true,
    matches: bool(raw.matches) ?? true,
    likes: bool(raw.likes) ?? true,
    account: bool(raw.account) ?? true,
  };
  const mutedConversations = Array.isArray(payload.mutedConversations)
    ? payload.mutedConversations
        .filter((id): id is string => typeof id === "string" && id.length <= 64)
        .slice(0, MAX_MUTED)
    : [];

  // A token belongs to one install; signing in as someone else moves it.
  await DeviceTokenModel.updateOne(
    { token },
    { $set: { userId, platform, preferences, mutedConversations } },
    { upsert: true },
  );

  // Keep only the newest installs per user.
  const stale = await DeviceTokenModel.find({ userId })
    .sort({ updatedAt: -1 })
    .skip(MAX_TOKENS_PER_USER)
    .select("_id")
    .lean();
  if (stale.length > 0) {
    await DeviceTokenModel.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
  }

  return { registered: true, pushEnabled: isPushConfigured() };
}

/** Logout on this device. */
export async function unregisterDevice(userId: string, token: unknown) {
  if (typeof token !== "string" || !token.trim()) {
    throw new AuthError("token is required", 400);
  }
  await DeviceTokenModel.deleteOne({ userId, token: token.trim() });
  return { unregistered: true };
}

export async function removeAllDevices(userId: string): Promise<void> {
  await DeviceTokenModel.deleteMany({ userId });
}

// ------------------------------------------------------------- sending

export interface PushInput {
  notificationId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  /** Folded unread notifications ("3 new messages"). */
  count: number;
  unreadCount: number;
}

function allowed(
  device: { preferences?: DevicePreferences | null; mutedConversations?: string[] },
  input: PushInput,
): boolean {
  const prefs = device.preferences ?? {};
  if (prefs.enabled === false) return false;
  switch (input.type) {
    case "chat": {
      const conversationId = String(input.metadata.conversationId ?? "");
      return (
        prefs.messages !== false &&
        !(device.mutedConversations ?? []).includes(conversationId)
      );
    }
    case "match":
      return prefs.matches !== false;
    case "like":
    case "super_like":
      return prefs.likes !== false;
    default:
      return prefs.account !== false;
  }
}

/** Same ids the app uses for its own banners, so one replaces the other. */
function tagFor(input: PushInput): string {
  const meta = input.metadata;
  switch (input.type) {
    case "chat":
      return `chat_${meta.conversationId ?? ""}`;
    case "match":
      return `match_${meta.userId ?? ""}`;
    case "like":
    case "super_like":
      return `like_${meta.userId ?? ""}`;
    default:
      return `notification_${input.notificationId}`;
  }
}

function buildMessage(token: string, input: PushInput): Message {
  const body =
    input.type === "chat" && input.count > 1
      ? `${input.body} (${input.count} new messages)`
      : input.body;
  const tag = tagFor(input);

  return {
    token,
    notification: { title: input.title, body },
    // Data values must be strings; the app rebuilds the tap payload from these.
    data: {
      notificationId: input.notificationId,
      type: input.type,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
    android: {
      priority: "high",
      notification: {
        channelId: CHANNELS[input.type] ?? ACCOUNT_CHANNEL,
        tag,
        icon: "ic_notification",
        color: "#FF3D77",
        sound: "default",
      },
    },
    apns: {
      headers: { "apns-collapse-id": tag.slice(0, 64) },
      payload: {
        aps: {
          sound: "default",
          badge: input.unreadCount,
          threadId: tag,
        },
      },
    },
  };
}

/**
 * Pushes to every device the user is signed in on. Never throws. The app
 * ignores pushes while it's in the foreground (the socket shows those).
 */
export async function pushToUser(userId: string, input: PushInput): Promise<void> {
  const firebase = firebaseApp();
  if (!firebase) return;

  try {
    const devices = await DeviceTokenModel.find({ userId })
      .select("token preferences mutedConversations")
      .lean();
    const targets = devices.filter((device) => allowed(device, input));
    if (targets.length === 0) return;

    const response = await getMessaging(firebase).sendEach(
      targets.map((device) => buildMessage(device.token, input)),
    );

    const dead = response.responses
      .map((result, index) =>
        !result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? "")
          ? targets[index].token
          : null,
      )
      .filter((token): token is string => token !== null);
    if (dead.length > 0) {
      await DeviceTokenModel.deleteMany({ token: { $in: dead } });
    }
    for (const result of response.responses) {
      if (!result.success && !DEAD_TOKEN_CODES.has(result.error?.code ?? "")) {
        console.error("Push failed", result.error?.code, result.error?.message);
      }
    }
  } catch (error) {
    console.error(`Push to user ${userId} failed`, error);
  }
}
