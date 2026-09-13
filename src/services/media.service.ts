import type { Request } from "express";
import { del, get, put } from "@vercel/blob";
import { AuthError } from "../errors/AuthError";
import { env } from "../config/env";
import { MediaModel } from "../models/Media";
import { validateObjectId } from "../validation/chat.validation";

function baseUrlOf(req: Request): string {
  if (env.publicBaseUrl) {
    return env.publicBaseUrl.replace(/\/$/, "");
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]
      : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo.jpg";
}

export function extractBlobPathname(photoRef: string): string | null {
  const value = photoRef?.trim();
  if (!value) return null;

  try {
    const asUrl = new URL(value);
    const fromQuery = asUrl.searchParams.get("pathname");
    if (fromQuery) return fromQuery;
    if (asUrl.hostname.includes("blob.vercel-storage.com")) {
      return decodeURIComponent(asUrl.pathname.replace(/^\//, ""));
    }
  } catch {
    // Not a URL — treat as pathname if it looks like one.
  }

  if (value.includes("/") && !value.startsWith("http")) {
    return value;
  }

  return null;
}

export function toViewablePhotoUrl(stored: string, baseUrl: string): string {
  const pathname = extractBlobPathname(stored);
  if (
    pathname &&
    (stored.includes("blob.vercel-storage.com") ||
      stored.includes("/media/view"))
  ) {
    return `${baseUrl.replace(/\/$/, "")}/media/view?pathname=${encodeURIComponent(pathname)}`;
  }
  return stored;
}

async function storeInVercelBlob(
  req: Request,
  ownerId: string,
  files: Express.Multer.File[],
): Promise<string[]> {
  const urls: string[] = [];

  for (const file of files) {
    const filename = safeFilename(file.originalname || "photo.jpg");
    const pathname = `profiles/${ownerId}/${Date.now()}-${filename}`;

    const blob = await put(pathname, file.buffer, {
      access: "private",
      contentType: file.mimetype || "application/octet-stream",
      token: env.blobReadWriteToken,
      addRandomSuffix: true,
    });

    // Persist the blob URL string in MongoDB; clients load via /media/view.
    urls.push(blob.url);
  }

  return urls;
}

async function storeInMongo(
  req: Request,
  ownerId: string,
  files: Express.Multer.File[],
): Promise<string[]> {
  const created = await MediaModel.insertMany(
    files.map((file) => ({
      ownerId,
      contentType: file.mimetype,
      size: file.size,
      data: file.buffer,
    })),
  );

  return created.map((media) => `${baseUrlOf(req)}/media/${media._id}`);
}

export async function storeUploads(
  req: Request,
  ownerId: string,
): Promise<string[]> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) {
    throw new AuthError("No file uploaded", 400);
  }

  if (env.blobReadWriteToken) {
    return storeInVercelBlob(req, ownerId, files);
  }

  return storeInMongo(req, ownerId, files);
}

export async function readMedia(mediaId: string) {
  const media = await MediaModel.findById(
    validateObjectId(mediaId, "mediaId"),
  ).lean();
  if (!media) {
    throw new AuthError("Media not found", 404);
  }
  return media;
}

export async function readPrivateBlob(pathname: string) {
  const clean = pathname?.trim();
  if (!clean) {
    throw new AuthError("Missing pathname", 400);
  }
  if (!env.blobReadWriteToken) {
    throw new AuthError("Blob storage is not configured", 503);
  }

  const result = await get(clean, {
    access: "private",
    token: env.blobReadWriteToken,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new AuthError("Not found", 404);
  }

  return result;
}

export async function deleteBlobIfPresent(photoRef: string): Promise<void> {
  if (!env.blobReadWriteToken) return;

  const pathname = extractBlobPathname(photoRef);
  const target = pathname || photoRef;
  if (!target) return;

  try {
    await del(target, { token: env.blobReadWriteToken });
  } catch (error) {
    console.warn("Failed to delete blob", target, error);
  }
}
