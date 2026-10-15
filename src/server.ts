import dns from "node:dns";
import app from "./app";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";

if (env.mail.forceIpv4) {
  dns.setDefaultResultOrder("ipv4first");
}

async function bootstrap(): Promise<void> {
  await connectDatabase(env.mongoUri);
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${env.port}`);
  });
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
  
});
