import dns from "node:dns";
import http from "node:http";
import app from "./app";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import { resetPresence, socketHooks } from "./services/presence.service";
import {
  SOCKET_PATH,
  attachSocketServer,
  closeSocketServer,
} from "./services/socket.service";
import { backfillPublicUserIds } from "./utils/publicUserId";

if (env.mail.provider === "smtp" && env.mail.forceIpv4) {
  dns.setDefaultResultOrder("ipv4first");
}

async function bootstrap(): Promise<void> {
  await connectDatabase(env.mongoUri);
  await resetPresence().catch((error: unknown) => {
    console.error("Failed to reset presence", error);
  });
  await backfillPublicUserIds()
    .then((assigned) => {
      if (assigned > 0) {
        console.log(`Assigned publicUserId to ${assigned} existing user(s)`);
      }
    })
    .catch((error: unknown) => {
      console.error("Failed to backfill publicUserId", error);
    });

  const server = http.createServer(app);
  attachSocketServer(server, socketHooks);

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `Server running on port ${env.port} (WebSocket at ${SOCKET_PATH})`,
    );
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, closing connections`);
    void closeSocketServer().finally(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
