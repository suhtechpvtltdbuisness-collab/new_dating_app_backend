import dotenv from "dotenv";
import fs from "fs";
import path from "path";

function loadDotenv(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
  ];

  const envPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (envPath) {
    dotenv.config({ path: envPath, override: true });
    return;
  }

  dotenv.config({ override: true });
}

loadDotenv();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGODB_URI ?? required("MONGO_URI"),
  accessSecret: required("JWT_ACCESS_SECRET"),
  refreshSecret: required("JWT_REFRESH_SECRET"),
  accessTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, ""),
  blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  mail: {
    host: required("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? 587),
    user: required("SMTP_USER"),
    pass: required("SMTP_PASS"),
    from: process.env.SMTP_FROM ?? "Dating App <no-reply@dating-app.local>",
  },
};
