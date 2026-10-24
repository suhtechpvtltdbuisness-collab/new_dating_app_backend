const BASE = process.env.BASE ?? "http://127.0.0.1:5055";

let pass = 0;
let fail = 0;

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label} :: ${JSON.stringify(detail)?.slice(0, 400)}`);
  }
}

function suffix() {
  return Math.floor(Math.random() * 1e9).toString().padStart(9, "0");
}

async function register(name, gender, interestedIn, coords) {
  const tag = suffix();
  const payload = {
    name,
    phoneNumber: `+9198${tag}`,
    dob: "1996-04-12T00:00:00.000Z",
    gender,
    interestedIn,
    profile: "Testing the API surface",
    email: `${name.toLowerCase()}.${tag}@example.com`,
    password: "secret123",
    location: { coordinates: coords },
  };
  const res = await call("POST", "/users/register", { body: payload });
  return { res, payload };
}

async function main() {
  console.log("AUTH");
  const alice = await register("Alice", "female", "male", [77.59, 12.97]);
  const bob = await register("Bob", "male", "female", [77.6, 12.98]);
  check("POST /users/register", alice.res.status === 201, alice.res.body);
  check(
    "register returns tokens + userId",
    Boolean(alice.res.body?.data?.accessToken && alice.res.body?.data?.userId),
    alice.res.body,
  );

  let aliceToken = alice.res.body.data.accessToken;
  const aliceRefresh = alice.res.body.data.refreshToken;
  const aliceId = alice.res.body.data.userId;
  const bobToken = bob.res.body.data.accessToken;
  const bobId = bob.res.body.data.userId;

  const login = await call("POST", "/users/login", {
    body: { email: alice.payload.email, password: "secret123" },
  });
  check("POST /users/login", login.status === 200 && !!login.body?.data?.accessToken, login.body);

  const refreshed = await call("POST", "/auth/refresh-token", {
    body: { refreshToken: aliceRefresh },
  });
  check(
    "POST /auth/refresh-token",
    refreshed.status === 200 && !!refreshed.body?.data?.accessToken,
    refreshed.body,
  );

  console.log("PROFILE");
  const profile = await call("GET", "/profile", { token: aliceToken });
  check("GET /profile", profile.status === 200 && profile.body?.data?.name === "Alice", profile.body);

  const updated = await call("PUT", "/profile", {
    token: aliceToken,
    body: {
      bio: "Coffee and code",
      firstName: "Alice",
      lastName: "Nguyen",
      city: "Bengaluru",
      interests: ["coffee", "hiking"],
    },
  });
  check(
    "PUT /profile maps firstName/lastName -> name",
    updated.status === 200 && updated.body?.data?.name === "Alice Nguyen",
    updated.body,
  );
  check(
    "PUT /profile persists bio/city/interests",
    updated.body?.data?.bio === "Coffee and code" &&
      updated.body?.data?.city === "Bengaluru" &&
      updated.body?.data?.interests?.length === 2,
    updated.body,
  );

  const byId = await call("GET", `/users/${bobId}`, { token: aliceToken });
  check("GET /users/:id", byId.status === 200 && byId.body?.data?.name === "Bob", byId.body);

  const forbidden = await call("PUT", `/users/${bobId}`, {
    token: aliceToken,
    body: { bio: "hacked" },
  });
  check("PUT /users/:id rejects other users", forbidden.status === 403, forbidden.body);

  console.log("PHOTOS");
  const form = new FormData();
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
    "hex",
  );
  form.append("file", new Blob([png], { type: "image/png" }), "avatar.png");
  const upload = await call("POST", "/users/upload-photo", { token: aliceToken, form });
  check(
    "POST /users/upload-photo returns photoUrls",
    upload.status === 201 && Array.isArray(upload.body?.data?.photoUrls) && upload.body.data.photoUrls.length === 1,
    upload.body,
  );

  const photoUrl = upload.body?.data?.photoUrls?.[0] ?? "";
  const mediaId = photoUrl.split("/").pop();
  const media = await fetch(photoUrl);
  check(
    "GET /media/:id serves the image",
    media.status === 200 && media.headers.get("content-type") === "image/png",
    { status: media.status, type: media.headers.get("content-type") },
  );

  const delPhoto = await call("DELETE", `/users/delete-photo/${mediaId}`, { token: aliceToken });
  check(
    "DELETE /users/delete-photo/:photoId",
    delPhoto.status === 200 && delPhoto.body?.data?.photoUrls?.length === 0,
    delPhoto.body,
  );

  console.log("PREFERENCES");
  const prefs = await call("GET", "/users/preferences", { token: aliceToken });
  check(
    "GET /users/preferences defaults",
    prefs.status === 200 && prefs.body?.data?.minAge === 18 && Array.isArray(prefs.body?.data?.lookingFor),
    prefs.body,
  );

  const prefsUpdate = await call("PUT", "/users/preferences", {
    token: aliceToken,
    body: { minAge: 25, maxAge: 35, maxDistance: 20, lookingFor: ["relationship"], preferredGenders: ["male"] },
  });
  check(
    "PUT /users/preferences",
    prefsUpdate.status === 200 && prefsUpdate.body?.data?.minAge === 25 && prefsUpdate.body?.data?.lookingFor[0] === "relationship",
    prefsUpdate.body,
  );

  const badPrefs = await call("PUT", "/users/preferences", {
    token: aliceToken,
    body: { lookingFor: ["marriage"] },
  });
  check("PUT /users/preferences rejects unknown enum", badPrefs.status === 400, badPrefs.body);

  // Widen the age window again so discovery can see Bob.
  await call("PUT", "/users/preferences", { token: aliceToken, body: { minAge: 18, maxAge: 70 } });

  console.log("DISCOVERY");
  const suggestions = await call("GET", "/users/suggestions?limit=10", { token: aliceToken });
  check(
    "GET /users/suggestions includes Bob",
    suggestions.status === 200 && suggestions.body?.data?.some((u) => u.id === bobId),
    suggestions.body,
  );

  const profiles = await call("GET", "/profiles?limit=5", { token: aliceToken });
  check("GET /profiles", profiles.status === 200 && Array.isArray(profiles.body?.data), profiles.body);

  const nearby = await call("GET", "/profiles/nearby?distance=50", { token: aliceToken });
  check(
    "GET /profiles/nearby",
    nearby.status === 200 && nearby.body?.data?.some((u) => u.id === bobId),
    nearby.body,
  );

  const detail = await call("GET", `/profiles/${bobId}`, { token: aliceToken });
  check("GET /profiles/:id", detail.status === 200 && detail.body?.data?.id === bobId, detail.body);

  console.log("SWIPES + MATCHES");
  const like = await call("POST", `/swipes/right/${bobId}`, { token: aliceToken });
  check(
    "POST /swipes/right (no reciprocal like yet)",
    like.status === 200 && like.body?.data?.isMatch === false && like.body?.data?.match === null,
    like.body,
  );

  const back = await call("POST", `/swipes/right/${aliceId}`, { token: bobToken });
  check(
    "POST /swipes/right (reciprocal) reports a match",
    back.status === 200 && back.body?.data?.isMatch === true && !!back.body?.data?.match?.id,
    back.body,
  );

  const matches = await call("GET", "/swipes/matches", { token: aliceToken });
  check(
    "GET /swipes/matches",
    matches.status === 200 && matches.body?.data?.length === 1 && matches.body.data[0].status === "accepted",
    matches.body,
  );
  const matchId = matches.body?.data?.[0]?.id;

  const likedYou = await call("GET", "/swipes/liked-you", { token: aliceToken });
  check("GET /swipes/liked-you", likedYou.status === 200 && Array.isArray(likedYou.body?.data?.likes), likedYou.body);

  const matchList = await call("GET", "/matches", { token: aliceToken });
  check("GET /matches", matchList.status === 200 && matchList.body?.data?.length === 1, matchList.body);

  const top = await call("GET", "/matches/top?limit=5", { token: aliceToken });
  check(
    "GET /matches/top returns users",
    top.status === 200 && top.body?.data?.[0]?.id === bobId,
    top.body,
  );

  const matchDetail = await call("GET", `/matches/${matchId}`, { token: aliceToken });
  check("GET /matches/:id", matchDetail.status === 200 && matchDetail.body?.data?.id === matchId, matchDetail.body);

  const accept = await call("POST", `/matches/${matchId}/accept`, { token: aliceToken });
  check("POST /matches/:id/accept", accept.status === 200 && accept.body?.data?.status === "accepted", accept.body);

  console.log("CHAT");
  const chat = await call("POST", "/chats", {
    token: aliceToken,
    body: { recipientId: bobId, message: "Hey Bob!" },
  });
  check(
    "POST /chats returns a conversation",
    chat.status === 201 && !!chat.body?.data?.id && chat.body?.data?.otherUserId === bobId,
    chat.body,
  );
  const chatId = chat.body?.data?.id;
  check(
    "POST /chats seeds the initial message",
    chat.body?.data?.messages?.length === 1 && chat.body.data.messages[0].message === "Hey Bob!",
    chat.body?.data?.messages,
  );

  const send = await call("POST", `/chats/${chatId}/messages`, {
    token: bobToken,
    body: { message: "Hi Alice" },
  });
  check(
    "POST /chats/:chatId/messages",
    send.status === 201 && send.body?.data?.message === "Hi Alice" && send.body?.data?.status === "sent",
    send.body,
  );
  const messageId = send.body?.data?.id;

  const list = await call("GET", `/chats/${chatId}/messages`, { token: aliceToken });
  check("GET /chats/:chatId/messages", list.status === 200 && list.body?.data?.messages?.length === 2, list.body);

  const inbox = await call("GET", "/chats", { token: aliceToken });
  check(
    "GET /chats shows unread + last message",
    inbox.status === 200 && inbox.body?.data?.chats?.[0]?.unreadCount === 1 && inbox.body.data.chats[0].lastMessage === "Hi Alice",
    inbox.body,
  );

  const read = await call("POST", `/chats/${chatId}/read`, { token: aliceToken });
  check("POST /chats/:chatId/read", read.status === 200, read.body);

  const inboxAfter = await call("GET", "/chats", { token: aliceToken });
  check(
    "unread resets after read",
    inboxAfter.body?.data?.chats?.[0]?.unreadCount === 0,
    inboxAfter.body,
  );

  const single = await call("GET", `/chats/${chatId}`, { token: aliceToken });
  check(
    "GET /chats/:chatId embeds messages",
    single.status === 200 && single.body?.data?.messages?.length === 2,
    single.body?.data?.messages?.length,
  );

  const outsider = await register("Carol", "female", "male", [77.6, 12.98]);
  const carolToken = outsider.res.body.data.accessToken;
  const denied = await call("GET", `/chats/${chatId}`, { token: carolToken });
  check("GET /chats/:chatId blocks non-participants", denied.status === 404, denied.body);

  const byRecipient = await call("GET", `/chats/recipient/${bobId}`, { token: aliceToken });
  check(
    "GET /chats/recipient/:recipientId",
    byRecipient.status === 200 && byRecipient.body?.data?.chats?.[0]?.id === chatId,
    byRecipient.body,
  );

  const history = await call("GET", `/chat-history/${bobId}`, { token: aliceToken });
  check("GET /chat-history/:userId", history.status === 200 && history.body?.data?.history?.length === 1, history.body);

  const chatUsers = await call("GET", "/chat-users", { token: aliceToken });
  check("GET /chat-users", chatUsers.status === 200 && chatUsers.body?.data?.users?.length === 1, chatUsers.body);

  const mediaForm = new FormData();
  mediaForm.append("media", new Blob([png], { type: "image/png" }), "pic.png");
  const chatUpload = await call("POST", `/chats/${chatId}/upload`, { token: aliceToken, form: mediaForm });
  check(
    "POST /chats/:chatId/upload returns mediaUrl",
    chatUpload.status === 201 && typeof chatUpload.body?.data?.mediaUrl === "string",
    chatUpload.body,
  );

  const typing = await call("POST", `/chats/${chatId}/typing`, { token: aliceToken });
  check("POST /chats/:chatId/typing", typing.status === 202, typing.body);

  const report = await call("POST", "/chats/messages/report", {
    token: aliceToken,
    body: { messageId, reason: "spam" },
  });
  check("POST /chats/messages/report", report.status === 201 && report.body?.data?.reported === true, report.body);

  const delMsg = await call("DELETE", `/chats/${chatId}/messages/${messageId}`, { token: bobToken });
  check("DELETE /chats/:chatId/messages/:messageId", delMsg.status === 200, delMsg.body);

  const delMsgWrongUser = await call("DELETE", `/chats/${chatId}/messages/${messageId}`, { token: aliceToken });
  check("delete only allowed for the sender", delMsgWrongUser.status === 404, delMsgWrongUser.body);

  console.log("BLOCKING");
  const block = await call("POST", `/users/${aliceId}/block`, {
    token: aliceToken,
    body: { blockedUserId: bobId },
  });
  check("POST /users/:id/block", block.status === 200 && block.body?.data?.blockedUsers?.includes(bobId), block.body);

  const blocked = await call("GET", "/users/blocked", { token: aliceToken });
  check(
    "GET /users/blocked",
    blocked.status === 200 && blocked.body?.data?.blockedUsers?.includes(bobId),
    blocked.body,
  );

  const unblock = await call("DELETE", `/users/${aliceId}/unblock/${bobId}`, { token: aliceToken });
  check(
    "DELETE /users/:id/unblock/:blockedUserId",
    unblock.status === 200 && unblock.body?.data?.blockedUsers?.length === 0,
    unblock.body,
  );

  console.log("MATCH TEARDOWN");
  const unmatched = await call("DELETE", `/matches/${matchId}/unmatch`, { token: aliceToken });
  check("DELETE /matches/:id/unmatch", unmatched.status === 200, unmatched.body);

  const matchesAfter = await call("GET", "/matches", { token: aliceToken });
  check("matches empty after unmatch", matchesAfter.body?.data?.length === 0, matchesAfter.body);

  console.log("PASSWORD + LOGOUT");
  const changed = await call("POST", "/users/change-password", {
    token: aliceToken,
    body: { currentPassword: "secret123", newPassword: "secret456" },
  });
  check("POST /users/change-password", changed.status === 200, changed.body);

  const oldLogin = await call("POST", "/users/login", {
    body: { email: alice.payload.email, password: "secret123" },
  });
  check("old password rejected", oldLogin.status === 401, oldLogin.body);

  const newLogin = await call("POST", "/users/login", {
    body: { email: alice.payload.email, password: "secret456" },
  });
  check("new password accepted", newLogin.status === 200, newLogin.body);
  aliceToken = newLogin.body.data.accessToken;
  const newRefresh = newLogin.body.data.refreshToken;

  const loggedOut = await call("POST", "/auth/logout", { body: { refreshToken: newRefresh } });
  check("POST /auth/logout", loggedOut.status === 200, loggedOut.body);

  const refreshAfterLogout = await call("POST", "/auth/refresh-token", {
    body: { refreshToken: newRefresh },
  });
  check("refresh token revoked after logout", refreshAfterLogout.status === 401, refreshAfterLogout.body);

  console.log("AUTHZ");
  const noToken = await call("GET", "/chats");
  check("GET /chats requires auth", noToken.status === 401, noToken.body);

  const deleted = await call("DELETE", `/users/${bobId}`, { token: bobToken });
  check("DELETE /users/:id", deleted.status === 200, deleted.body);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
