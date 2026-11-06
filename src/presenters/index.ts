import { env } from "../config/env";
import { toViewablePhotoUrl } from "../services/media.service";

const LOOKING_FOR = ["dating", "relationship", "friendship", "networking"];
const GENDERS = ["male", "female", "other", "non-binary"];

const FEMALE_LABELS = ["female", "women", "woman", "f", "girl"];
const MALE_LABELS = ["male", "men", "man", "m", "boy"];
const NON_BINARY_LABELS = [
  "non-binary",
  "nonbinary",
  "non binary",
  "gay",
  "other",
];

export function normalizeGender(value: unknown): string {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (FEMALE_LABELS.includes(v)) return "female";
  if (MALE_LABELS.includes(v)) return "male";
  if (NON_BINARY_LABELS.includes(v)) return "non-binary";
  return "other";
}

function toId(value: unknown): string {
  return value == null ? "" : String(value);
}

function firstPhoto(user: any): string {
  return Array.isArray(user?.photos) && user.photos.length > 0
    ? presentPhoto(user.photos[0])
    : "";
}

const DEFAULT_PUBLIC_BASE =
  "https://newdatingappbackend-production.up.railway.app";

function apiBaseUrl(): string {
  const configured = env.publicBaseUrl.replace(/\/$/, "");
  // Stale PUBLIC_BASE_URL often still points at the old Vercel host after migration.
  if (configured && !configured.includes("vercel.app")) {
    return configured;
  }
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    return `https://${railwayDomain.replace(/\/$/, "")}`;
  }
  return DEFAULT_PUBLIC_BASE;
}

function presentPhoto(url: string): string {
  return toViewablePhotoUrl(url, apiBaseUrl());
}

function presentPhotos(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((item) => presentPhoto(String(item)))
    .filter((item) => item.length > 0);
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function isUserOnline(user: any): boolean {
  if (user?.preferences?.showOnline === false) return false;
  // `isOnline` is maintained by the WebSocket gateway; the lastActive window
  // covers clients that only talk REST.
  if (user?.isOnline === true) return true;
  if (!user?.lastActive) return false;
  return Date.now() - new Date(user.lastActive).getTime() < ONLINE_WINDOW_MS;
}

export function presentUser(user: any) {
  if (!user) return null;
  const photos = presentPhotos(user.photos);
  return {
    id: toId(user._id),
    _id: toId(user._id),
    publicUserId: user.publicUserId ?? "",
    email: user.email ?? "",
    name: user.name ?? "",
    phoneNumber: user.phoneNumber,
    dob: user.dob,
    dateOfBirth: user.dob,
    gender: normalizeGender(user.gender),
    interestedIn: user.interestedIn ?? "",
    profile: user.profile ?? "",
    photos,
    photoUrls: photos,
    bio: user.bio ?? user.profile ?? "",
    interests: user.interests ?? [],
    city: user.city,
    country: user.country,
    hometown: user.hometown ?? "",
    work: user.work ?? "",
    education: user.education ?? "",
    educationLevel: user.educationLevel ?? "",
    height: user.height ?? "",
    exercise: user.exercise ?? "",
    starSign: user.starSign ?? "",
    drinking: user.drinking ?? "",
    smoking: user.smoking ?? "",
    lookingFor: user.lookingFor ?? "",
    kids: user.kids ?? "",
    haveKids: user.haveKids ?? "",
    religion: user.religion ?? "",
    politics: user.politics ?? "",
    pronouns: user.pronouns ?? "",
    languages: user.languages ?? [],
    courses: user.courses ?? [],
    qualities: user.qualities ?? [],
    openingMoves: user.openingMoves ?? [],
    relationshipStatus: user.relationshipStatus ?? "single",
    location: user.location,
    isVerified: Boolean(user.isVerified),
    selfieVerification: {
      status:
        user.selfieVerification?.status ??
        (user.isVerified ? "verified" : "not_started"),
      score: user.selfieVerification?.score ?? null,
      threshold: user.selfieVerification?.threshold ?? null,
      reason: user.selfieVerification?.reason ?? "",
      verifiedAt: user.selfieVerification?.verifiedAt ?? null,
      lastAttemptAt: user.selfieVerification?.lastAttemptAt ?? null,
    },
    isOnline: isUserOnline(user),
    lastActive: user.lastActive ?? user.updatedAt,
    createdAt: user.createdAt,
    active: user.active !== false,
    isHidden: Boolean(user.isHidden),
    isIncognito: Boolean(user.isIncognito),
  };
}

function ageOn(dob: unknown, now: Date): number | null {
  if (!dob) return null;
  const birth = new Date(dob as string);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  return Math.max(age, 0);
}

/** ~1.1 km precision: enough for "X km away", not enough to find someone's home. */
function coarseLocation(location: any) {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return undefined;
  const round = (n: unknown) => Math.round(Number(n) * 100) / 100;
  return { type: "Point", coordinates: [round(coords[0]), round(coords[1])] };
}

/**
 * Another member's profile as other users may see it. Never includes email, phone,
 * real date of birth, exact location or verification internals.
 *
 * Older app versions compute age from `dob` and distance from `location`, so `dob`
 * is replaced by a date that yields the same age today, and `location` is rounded.
 */
export function presentPublicUser(user: any) {
  const full = presentUser(user);
  if (!full) return null;
  const {
    email: _email,
    phoneNumber: _phone,
    dob: _dob,
    dateOfBirth: _dateOfBirth,
    location: _location,
    selfieVerification,
    ...rest
  } = full;

  const now = new Date();
  const age = ageOn(user.dob, now);
  const ageDate =
    age === null
      ? undefined
      : new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()));

  return {
    ...rest,
    age,
    dob: ageDate,
    dateOfBirth: ageDate,
    location: coarseLocation(user.location),
    selfieVerification: {
      status: selfieVerification.status,
      verifiedAt: selfieVerification.verifiedAt,
    },
  };
}

export function presentPreferences(user: any) {
  const prefs = user?.preferences ?? {};
  const lookingFor = (prefs.lookingFor ?? []).filter((item: string) =>
    LOOKING_FOR.includes(item),
  );
  const preferredGenders = (prefs.preferredGenders ?? [])
    .map(normalizeGender)
    .filter((item: string) => GENDERS.includes(item));

  return {
    id: toId(user?._id),
    userId: toId(user?._id),
    minAge: prefs.minAge ?? 18,
    maxAge: prefs.maxAge ?? 70,
    maxDistance: prefs.maxDistance ?? 50,
    lookingFor: lookingFor.length ? lookingFor : ["dating"],
    interests: prefs.interests ?? [],
    preferredGenders: preferredGenders.length
      ? preferredGenders
      : [normalizeGender(user?.interestedIn)],
    locationEnabled: prefs.locationEnabled !== false,
    showOnline: prefs.showOnline !== false,
    notificationsEnabled: prefs.notificationsEnabled !== false,
    lastUpdated: prefs.lastUpdated ?? new Date(),
  };
}

export function presentMessage(chat: any, sender?: any) {
  const isRead = Boolean(chat.readAt);
  const isDelivered = Boolean(chat.deliveredAt) || isRead;
  const status = isRead ? "read" : isDelivered ? "delivered" : "sent";

  return {
    id: toId(chat._id),
    conversationId: toId(chat.conversationId),
    senderId: toId(chat.senderId),
    senderName: sender?.name ?? "",
    senderImage: firstPhoto(sender),
    message: chat.message ?? "",
    timestamp: chat.createdAt,
    status,
    isRead,
    deliveredAt: chat.deliveredAt ?? null,
    readAt: chat.readAt ?? null,
    attachmentUrl: chat.attachmentUrl
      ? presentPhoto(String(chat.attachmentUrl))
      : null,
    attachmentType: chat.attachmentType ?? null,
    clientId: chat.clientMessageId ?? null,
  };
}

export function presentConversation(
  conversation: any,
  currentUserId: string,
  otherUser: any,
  messages: any[] = [],
) {
  const unread = conversation.unread;
  const unreadCount =
    unread instanceof Map
      ? (unread.get(currentUserId) ?? 0)
      : (unread?.[currentUserId] ?? 0);

  return {
    id: toId(conversation._id),
    userId: currentUserId,
    otherUserId: toId(otherUser?._id),
    otherUserName: otherUser?.name ?? "",
    otherUserImage: firstPhoto(otherUser),
    lastMessage: conversation.lastMessage ?? "",
    lastMessageTime: conversation.lastMessageAt ?? conversation.updatedAt,
    unreadCount,
    isOnline: isUserOnline(otherUser),
    lastSeenTime: otherUser?.lastActive ?? null,
    messages,
    isBlocked: (conversation.blockedBy ?? []).some(
      (id: unknown) => toId(id) === currentUserId,
    ),
  };
}

export function presentMatch(swipe: any, currentUserId: string, user: any) {
  return {
    id: toId(swipe._id),
    userId: currentUserId,
    targetUserId: toId(swipe.targetUserId),
    status: swipe.matchedAt ? "accepted" : "pending",
    createdAt: swipe.createdAt,
    acceptedAt: swipe.matchedAt ?? null,
    isNew: Boolean(swipe.matchedAt),
    likeCount: 1,
    superLikeCount: swipe.isSuperLike ? 1 : 0,
    matchedUser: presentPublicUser(user),
  };
}

export function presentNotification(notification: any) {
  return {
    id: toId(notification._id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    metadata: notification.metadata ?? {},
    count: notification.count ?? 1,
    isRead: Boolean(notification.readAt),
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}

/** Small public card of a user, embedded in notifications and socket events. */
export function presentActor(user: any) {
  if (!user) return null;
  return {
    userId: toId(user._id),
    name: user.name ?? "",
    photo: firstPhoto(user),
  };
}
