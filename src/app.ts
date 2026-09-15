import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import morgan from "morgan";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import authRouter from "./routes/auth.routes";
import chatHistoryRouter from "./routes/chat-history.routes";
import chatUsersRouter from "./routes/chat-users.routes";
import chatRouter from "./routes/chat.routes";
import matchRouter from "./routes/match.routes";
import mediaRouter from "./routes/media.routes";
import notificationRouter from "./routes/notification.routes";
import profileRouter from "./routes/profile.routes";
import profilesRouter from "./routes/profiles.routes";
import swipeRouter from "./routes/swipe.routes";
import userRouter from "./routes/user.routes";

const app = express();

app.use(helmet());

const allowedOrigins = [
  env.clientOrigin,
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Mobile / Flutter clients often send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function getDbStatus(): string {
  const stateMap: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  return stateMap[mongoose.connection.readyState] ?? "unknown";
}

function healthResponse() {
  const dbStatus = getDbStatus();
  return {
    status: dbStatus === "connected" ? "ok" : "degraded",
    db: {
      status: dbStatus,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

async function ensureDbConnection(): Promise<void> {
  if (
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  ) {
    return;
  }
  await connectDatabase(env.mongoUri);
}

app.get("/", async (_req, res) => {
  try {
    await ensureDbConnection();
  } catch (error) {
    console.error("Health check DB connection failed", error);
  }

  const payload = healthResponse();
  const isHealthy = payload.db.status === "connected";
  res.status(isHealthy ? 200 : 503).json(payload);
});

app.get("/health", async (_req, res) => {
  try {
    await ensureDbConnection();
  } catch (error) {
    console.error("Health check DB connection failed", error);
  }

  const payload = healthResponse();
  const isHealthy = payload.db.status === "connected";
  res.status(isHealthy ? 200 : 503).json(payload);
});

app.use(
  [
    "/auth",
    "/users",
    "/chats",
    "/profile",
    "/profiles",
    "/matches",
    "/media",
    "/notifications",
    "/chat-users",
    "/chat-history",
    "/swipes",
  ],
  async (_req, _res, next) => {
    try {
      await ensureDbConnection();
      next();
    } catch (error) {
      next(error);
    }
  },
);

app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/chats", chatRouter);
app.use("/profile", profileRouter);
app.use("/profiles", profilesRouter);
app.use("/matches", matchRouter);
app.use("/media", mediaRouter);
app.use("/notifications", notificationRouter);
app.use("/chat-users", chatUsersRouter);
app.use("/chat-history", chatHistoryRouter);
app.use("/swipes", swipeRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
