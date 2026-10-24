import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Native WebSocket gateway served on the API's own port at `/ws`.
 *
 * Clients connect with `?token=<access token>` (or an `Authorization: Bearer`
 * header). Every frame in either direction is JSON `{ event, data }`.
 * Sockets are tracked per user so any service can push to a user with
 * `emitToUser` — one user may have several devices connected.
 */

export const SOCKET_PATH = "/ws";

/** Close codes the client acts on (4000-4999 is the application range). */
export const CloseCode = {
  unauthorized: 4001,
  suspended: 4003,
} as const;

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_INBOUND_BYTES = 16 * 1024;

type ClientMessage = { event: string; data: Record<string, unknown> };

export interface SocketHooks {
  /** Runs after a socket authenticates. Return false to reject the user. */
  authorize?: (userId: string) => Promise<boolean>;
  /** First socket for this user opened. */
  onUserOnline?: (userId: string) => void;
  /** Every socket open, including additional devices. */
  onSocketOpen?: (userId: string, socket: WebSocket) => void;
  /** Last socket for this user closed. */
  onUserOffline?: (userId: string) => void;
  onMessage?: (userId: string, message: ClientMessage) => void;
}

interface TrackedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const socketsByUser = new Map<string, Set<TrackedSocket>>();
let wss: WebSocketServer | null = null;

function tokenFrom(request: IncomingMessage): string {
  const url = new URL(request.url ?? "", "http://localhost");
  const fromQuery = url.searchParams.get("token")?.trim();
  if (fromQuery) return fromQuery;

  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function send(socket: WebSocket, event: string, data: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ event, data }));
  } catch (error) {
    console.error("Socket send failed", error);
  }
}

function parseClientMessage(raw: RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw.toString());
    if (!parsed || typeof parsed.event !== "string") return null;
    const data =
      parsed.data && typeof parsed.data === "object" ? parsed.data : {};
    return { event: parsed.event, data };
  } catch {
    return null;
  }
}

function track(userId: string, socket: TrackedSocket): boolean {
  let set = socketsByUser.get(userId);
  const firstSocket = !set || set.size === 0;
  if (!set) {
    set = new Set();
    socketsByUser.set(userId, set);
  }
  set.add(socket);
  return firstSocket;
}

function untrack(userId: string, socket: TrackedSocket): boolean {
  const set = socketsByUser.get(userId);
  if (!set) return false;
  set.delete(socket);
  if (set.size > 0) return false;
  socketsByUser.delete(userId);
  return true;
}

export function attachSocketServer(
  server: HttpServer,
  hooks: SocketHooks = {},
): WebSocketServer {
  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_INBOUND_BYTES });

  server.on(
    "upgrade",
    (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const { pathname } = new URL(request.url ?? "", "http://localhost");
      if (pathname !== SOCKET_PATH) {
        socket.destroy();
        return;
      }
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    },
  );

  wss.on("connection", async (ws: TrackedSocket, request: IncomingMessage) => {
    // The handshake is always accepted so the client can read the close
    // code: 4001 means "refresh your access token and reconnect".
    let userId: string;
    try {
      userId = verifyAccessToken(tokenFrom(request)).sub;
      if (!userId) throw new Error("Token has no subject");
    } catch {
      ws.close(CloseCode.unauthorized, "unauthorized");
      return;
    }

    try {
      if (hooks.authorize && !(await hooks.authorize(userId))) {
        ws.close(CloseCode.suspended, "account unavailable");
        return;
      }
    } catch (error) {
      console.error("Socket authorization failed", error);
      ws.close(1011, "server error");
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) return;

    ws.userId = userId;
    ws.isAlive = true;
    const cameOnline = track(userId, ws);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      ws.isAlive = true;
      const message = parseClientMessage(raw);
      if (!message) return;
      if (message.event === "ping") {
        send(ws, "pong", { serverTime: new Date().toISOString() });
        return;
      }
      try {
        hooks.onMessage?.(userId, message);
      } catch (error) {
        console.error("Socket message handler failed", error);
      }
    });

    ws.on("close", () => {
      if (untrack(userId, ws)) hooks.onUserOffline?.(userId);
    });

    ws.on("error", (error) => {
      console.error("Socket error", error);
    });

    send(ws, "connected", {
      userId,
      serverTime: new Date().toISOString(),
    });
    if (cameOnline) hooks.onUserOnline?.(userId);
    hooks.onSocketOpen?.(userId, ws);
  });

  const heartbeat = setInterval(() => {
    for (const client of wss?.clients ?? []) {
      const tracked = client as TrackedSocket;
      if (tracked.isAlive === false) {
        tracked.terminate();
        continue;
      }
      tracked.isAlive = false;
      tracked.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

export function emitToSocket(
  socket: WebSocket,
  event: string,
  data: unknown,
): void {
  send(socket, event, data);
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  const set = socketsByUser.get(String(userId));
  if (!set) return;
  for (const socket of set) send(socket, event, data);
}

export function emitToUsers(
  userIds: Iterable<string>,
  event: string,
  data: unknown,
): void {
  for (const userId of new Set(userIds)) emitToUser(userId, event, data);
}

export function isUserConnected(userId: string): boolean {
  return (socketsByUser.get(String(userId))?.size ?? 0) > 0;
}

/** Closes every socket a user holds, e.g. after a ban or account deletion. */
export function disconnectUser(
  userId: string,
  code: number = CloseCode.unauthorized,
  reason = "session ended",
): void {
  const set = socketsByUser.get(String(userId));
  if (!set) return;
  for (const socket of [...set]) socket.close(code, reason);
}

export function closeSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) return resolve();
    for (const client of wss.clients) client.close(1001, "server shutting down");
    wss.close(() => resolve());
  });
}
