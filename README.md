# Dating Backend (Express + TypeScript + MongoDB)

This backend provides OTP-based auth APIs for a dating app:

- OTP generate/validate flow
- Register user with required profile fields + email/password
- Login with email + password
- Protected user profile route with JWT access token

## Tech Stack

- Express
- TypeScript
- MongoDB + Mongoose
- JWT (access + refresh tokens)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and update values:

```bash
cp .env.example .env
```

3. Run in dev mode:

```bash
npm run dev
```

## Environment Variables

- `PORT`: API port
- `MONGO_URI`: MongoDB connection string
- `JWT_ACCESS_SECRET`: access token secret
- `JWT_REFRESH_SECRET`: refresh token secret
- `ACCESS_TOKEN_TTL`: e.g. `15m`
- `REFRESH_TOKEN_TTL`: e.g. `30d`
- `OTP_TTL_MINUTES`: OTP validity duration
- `CLIENT_ORIGIN`: allowed CORS origin
- `RESEND_API_KEY`: (recommended on Railway) sends OTP mail via HTTPS; when set, SMTP vars are not required
- `SMTP_FROM`: sender used for OTP emails (must match a domain verified in Resend when using `RESEND_API_KEY`)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`: SMTP for local dev when `RESEND_API_KEY` is unset
- `FACE_RECOGNITION_SERVICE_URL`: optional OpenCV face service base URL for selfie verification
- `FACE_RECOGNITION_SERVICE_KEY`: shared secret sent to the face service
- `FACE_MATCH_THRESHOLD`: cosine distance threshold; default `0.42`
- `ADMIN_INITIAL_USERNAME`: first admin panel login, default `admin`
- `ADMIN_INITIAL_PASSWORD`: its password. The admin is created on the first sign-in attempt while no admin exists; if this is unset no admin is created
- `ADMIN_JWT_SECRET`: optional signing key for admin tokens; derived from `JWT_ACCESS_SECRET` when unset
- `ADMIN_TOKEN_TTL`: admin token lifetime, default `12h`

## Users Module Endpoints

Base URL: `/users`

### 1) Generate OTP

`GET /users/otp/:number`

Example:

`GET /users/otp/+919999999999`

This generates OTP and prints it in server console for now.

### 2) Validate OTP

`POST /users/otp/validate`

```json
{
  "number": "+919999999999",
  "otp": "1234"
}
```

### 3) Register (with email + password)

`POST /users/register`

```json
{
  "phoneNumber": "+919999999999",
  "name": "Alex",
  "dob": "1998-05-20",
  "gender": "male",
  "interestedIn": "female",
  "profile": "Love music, travel and coffee",
  "location": {
    "coordinates": [77.5946, 12.9716]
  },
  "active": true,
  "ipAddress": "203.0.113.10",
  "email": "alex@example.com",
  "password": "secret123"
}
```

### 4) Login (email + password or phone + OTP)

`POST /users/login`

```json
{
  "email": "alex@example.com",
  "password": "secret123"
}
```

```json
{
  "phoneNumber": "+919999999999",
  "otp": "1234"
}
```

### 5) Protected profile route

`GET /users/me`

Headers:

`Authorization: Bearer <access_token>`

## Response Envelope

Every JSON route responds as `{ "message": "...", "data": { ... } }`. The
Flutter client unwraps `data` before parsing, so list endpoints that the client
reads as objects return a keyed collection (`{ "chats": [...] }`) rather than a
bare array.

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/refresh-token` | `{ refreshToken }`; also aliased at `/users/refresh` |
| POST | `/auth/logout` | Revokes the supplied refresh token |
| POST | `/auth/forgot-password` | `{ email }`; emails a reset OTP |
| POST | `/auth/reset-password` | `{ email, otp, newPassword }` |
| POST | `/auth/change-password` | Authenticated; `{ currentPassword, newPassword }` |

`/auth/register` and `/auth/login` mirror the `/users` equivalents. Every
`/users/*` counterpart of the above also exists.

## User & Account

| Method | Path | Notes |
|--------|------|-------|
| GET / PUT | `/profile` | Current user; `PUT` accepts `firstName`/`lastName` and maps them to `name` |
| GET / PUT / DELETE | `/users/:id` | Writes and deletes are self-only (403 otherwise) |
| POST | `/users/upload-photo` | Multipart; field name `file`, `files`, `photo`, `photos`, or `media` |
| POST | `/users/verify-selfie` | Multipart live selfie in `selfie`/`file`; compares against uploaded profile photos and sets `isVerified` |
| DELETE | `/users/delete-photo/:photoId` | |
| GET / PUT | `/users/preferences` | Age range, distance, `lookingFor`, `preferredGenders` |
| POST | `/users/:id/block` | `{ blockedUserId }` |
| DELETE | `/users/:id/unblock/:blockedUserId` | |
| GET | `/users/blocked` | |
| GET | `/media/:mediaId` | Serves an uploaded image; public |

Uploads are stored in the `media` collection and returned as absolute URLs, so
no object storage is required. Swap `media.service.ts` for S3/Cloudinary when
image volume justifies it.

Selfie verification requires the private OpenCV face service in
`./face_service` or a compatible service that exposes `POST /v1/embeddings`.
Without `FACE_RECOGNITION_SERVICE_URL`, the endpoint returns `503` and does not
mark users as verified. Deploy `./face_service` as a separate Railway service
and set the generated Railway URL as `FACE_RECOGNITION_SERVICE_URL`.

## Discovery, Swipes & Matches

| Method | Path | Notes |
|--------|------|-------|
| GET | `/profiles` | Excludes already-swiped and blocked users; honours saved preferences |
| GET | `/profiles/nearby` | Geo query against the user's stored point; `?distance=` in km |
| GET | `/profiles/:id` | |
| POST | `/profiles/like` \| `/super-like` \| `/pass` \| `/unlike` | `{ userId }` aliases over the swipe endpoints |
| GET | `/users/suggestions` | Same result set as `/profiles` |
| POST | `/swipes/right/:userId`, `/swipes/left/:userId` | Returns `{ isMatch, match }` |
| GET | `/swipes/matches`, `/swipes/likes`, `/swipes/dislikes` | |
| GET | `/swipes/liked-you` | Users who liked you and have not been swiped back |
| GET | `/matches`, `/matches/top`, `/matches/:id` | |
| POST | `/matches/:id/accept`, `/matches/:id/reject` | |
| DELETE | `/matches/:id/unmatch` | |

## Chat

Conversations live in their own collection; each `Chat` document is one message
belonging to a `conversationId`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/chats` | `{ chats: [...] }` with per-user unread counts |
| POST | `/chats` | `{ recipientId, message? }`; idempotent per participant pair |
| GET / PUT / DELETE | `/chats/:chatId` | `DELETE` is a soft delete for the caller only |
| GET / POST | `/chats/:chatId/messages` | |
| DELETE | `/chats/:chatId/messages/:messageId` | Sender only |
| POST | `/chats/:chatId/read` | Clears the caller's unread count |
| POST | `/chats/:chatId/upload` | Multipart; returns `{ mediaUrl }` |
| POST | `/chats/:chatId/typing` | |
| POST | `/chats/messages/report` | `{ messageId, reason, details? }` |
| GET | `/chats/recipient/:recipientId`, `/chat-history/:userId`, `/chat-users` | |

## Notifications

Stored in the `notifications` collection and pushed live over the WebSocket
(below). Unread chat notifications collapse into one per conversation (`count`
says how many messages it covers) and are marked read when the chat is read.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/notifications` | `?page=&limit=` (default 30, max 100) → `{ notifications, unreadCount, page, limit, total, hasMore }` |
| GET | `/notifications/unread-count` | `{ unreadCount }` |
| PATCH | `/notifications/:id/read` | |
| PATCH | `/notifications/read-all` | |
| DELETE | `/notifications/:id` | |
| DELETE | `/notifications` | Clears the caller's list |
| POST | `/notifications` | `{ type, title, body, metadata? }`; creates one for the caller |

Types and what creates them:

| `type` | Sent when | `metadata` |
|--------|-----------|------------|
| `match` | A like completes a match (both people) | `matchId` (the recipient's own), `userId`, `name`, `photo`, `matchedAt`, `initiatedByYou` |
| `like` / `super_like` | Someone likes you (not when they are hidden or incognito, and only once per person) | `userId`, `name`, `photo`, `swipeId` |
| `chat` | New message (not if you blocked the sender) | `conversationId`, `senderId`, `senderName`, `senderPhoto`, `messageId` |
| `profile` | Verified by selfie or by an admin | `action: "verified"` |
| `system` | An admin resolved or dismissed your report | `reportId`, `status` |

Super Likes: `POST /swipes/right/:userId` with `{ "superLike": true }` or
`POST /profiles/super-like`. `GET /swipes/liked-you` returns `isSuperLike`.

## Realtime WebSocket

`wss://<host>/ws?token=<access token>` on the API's own port (an
`Authorization: Bearer` header also works). Frames are JSON
`{ "event": string, "data": object }` both ways.

Close codes: `4001` the token is invalid or expired (refresh it and
reconnect); `4003` the account is banned or deleted (sign out).

Server → client:

| Event | Data |
|-------|------|
| `connected` | `{ userId, serverTime }` |
| `notification` | `{ notification, unreadCount }` |
| `notification_count` | `{ unreadCount }` (sent on connect and whenever it changes) |
| `new_message` | the message, as in `GET /chats/:id/messages` |
| `conversation_updated` | `{ conversationId, lastMessage, lastMessageAt, message, senderId, senderName, unreadDelta }`, or `{ conversationId, readerId, unreadCountForReader }` after a read |
| `typing` | `{ conversationId, userId }` |
| `messages_delivered` | `{ conversationId, userId, messageIds }` |
| `messages_read` | `{ conversationId, userId, unreadCount }` |
| `presence` | `{ userId, isOnline, lastActive }`, sent to chat partners (not when `showOnline` is off) |
| `match_removed` | `{ userId }`, the person who unmatched or rejected |
| `account_suspended` | `{ message }`, sent right before a `4003` close |
| `pong` | reply to `ping` |

Client → server: `ping`, and `typing` with `{ conversationId }`.

Presence is real: `isOnline` is true while the user has at least one socket
open, and messages to them are marked delivered as soon as they connect.
Sockets are tracked in memory, so run a single instance (or add a shared
pub/sub such as Redis before scaling out).

## Admin Panel

Backs the admin panel in `datingapp-landingpage` (`/admin`). Admins are separate accounts (`admins` collection),
not app users. `POST /admin/auth/login` returns `data.accessToken`; send it as `Authorization: Bearer <token>` on
every other `/admin` route. Admin tokens are signed with their own key, so they do not work on app routes and app
tokens do not work here. Ten wrong passwords in a row pause sign-in for that admin for 15 minutes.

List endpoints take `?page=` and `?limit=` (default 50, max 200) and return `{ data, pagination: { page, limit, total, pages } }`.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/admin/auth/login` | `{ username, password }` |
| POST | `/admin/auth/logout` | Records the logout in the activity log |
| GET | `/admin/auth/me` | |
| PUT | `/admin/auth/password` | `{ currentPassword, newPassword, confirmPassword }`; new password min 8 characters |
| GET | `/admin/stats` | `totalUsers`, `verifiedUsers`, `bannedUsers`, `premiumUsers`, `totalMatches`, `pendingReports` |
| GET | `/admin/dashboard` | `stats` plus the 5 latest users and reports |
| GET | `/admin/activity` | Admin audit log, newest first |
| GET | `/admin/users` | `?q=` searches name, email and phone; `?status=all\|verified\|banned\|premium` |
| GET | `/admin/users/:id` | `user`, their `matches`, and `reports` filed against them |
| POST | `/admin/users/:id/ban`, `/unban` | See below |
| POST | `/admin/users/:id/verify` | Marks the profile verified without a selfie check |
| DELETE | `/admin/users/:id` | Also removes their swipes (matches), sessions and reports against them |
| GET | `/admin/reports` | `?status=pending\|resolved\|dismissed\|all` (default `pending`) |
| POST | `/admin/reports/:id/resolve`, `/dismiss` | |
| GET | `/admin/matches` | One row per matched pair |

- **Banning** sets `isBanned` on the user. A banned user is hidden from discovery, suggestions, profile lookups and
  swipes, cannot sign in or refresh their session (`403 This account has been suspended`), and has their refresh
  tokens revoked. The access token they already hold keeps working until it expires (`ACCESS_TOKEN_TTL`).
- **Plans**: the app has no paid plans yet, so every user reports `plan: "free"`, `premiumUsers` is `0` and
  `?status=premium` returns nothing.
- **Reports**: `open` and `reviewing` both show as `pending`.

## Notes

- Replace OTP response with real SMS gateway integration (Twilio/Fast2SMS/etc.) in production.
- Keep secrets strong and never commit `.env`.
- Refresh tokens are rotated and old token is revoked on refresh.
