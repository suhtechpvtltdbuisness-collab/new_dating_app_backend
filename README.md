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
- `SMTP_HOST`: SMTP host for email OTP
- `SMTP_PORT`: SMTP port, usually `587`
- `SMTP_USER`: SMTP username
- `SMTP_PASS`: SMTP password
- `SMTP_FROM`: sender display/address used for OTP emails
- `FACE_RECOGNITION_SERVICE_URL`: optional OpenCV face service base URL for selfie verification
- `FACE_RECOGNITION_SERVICE_KEY`: shared secret sent to the face service
- `FACE_MATCH_THRESHOLD`: cosine distance threshold; default `0.42`

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

## Notes

- Replace OTP response with real SMS gateway integration (Twilio/Fast2SMS/etc.) in production.
- Keep secrets strong and never commit `.env`.
- Refresh tokens are rotated and old token is revoked on refresh.
