import type { Request } from "express";
import fs from "fs/promises";
import path from "path";
import { createReadStream, existsSync, mkdirSync } from "fs";
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

function contentTypeFromName(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

function ensureUploadRoot(): string {
  const root = env.uploadDir;
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  return root;
}

function isVolumePath(value: string): boolean {
  return (
    value.includes("/media/file/") ||
    value.startsWith("profiles/") ||
    value.startsWith("chat/") ||
    value.startsWith("uploads/")
  );
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
    const fileMatch = asUrl.pathname.match(/\/media\/file\/(.+)$/);
    if (fileMatch?.[1]) {
      return decodeURIComponent(fileMatch[1]);
    }
  } catch {
    // Not a URL — treat as pathname if it looks like one.
  }

  const relativeFile = value.match(/(?:^|\/)media\/file\/(.+)$/);
  if (relativeFile?.[1]) {
    return decodeURIComponent(relativeFile[1]);
  }

  if (value.includes("/") && !value.startsWith("http")) {
    return value.replace(/^\//, "");
  }

  return null;
}

export function toViewablePhotoUrl(stored: string, baseUrl: string): string {
  const pathname = extractBlobPathname(stored);
  const root = baseUrl.replace(/\/$/, "");

  if (
    pathname &&
    (stored.includes("blob.vercel-storage.com") ||
      stored.includes("/media/view"))
  ) {
    return `${root}/media/view?pathname=${encodeURIComponent(pathname)}`;
  }

  if (pathname && isVolumePath(stored)) {
    return `${root}/media/file/${pathname.split("/").map(encodeURIComponent).join("/")}`;
  }

  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    // Rewrite legacy deployment hosts to the current public base (same /media path).
    try {
      const asUrl = new URL(stored);
      if (root && asUrl.pathname.startsWith("/media")) {
        const currentHost = new URL(`${root}/`).hostname;
        if (asUrl.hostname !== currentHost) {
          return `${root}${asUrl.pathname}${asUrl.search}`;
        }
      }
    } catch {
      // keep original
    }
    return stored;
  }

  return stored;
}

async function storeOnVolume(
  req: Request,
  ownerId: string,
  files: Express.Multer.File[],
): Promise<string[]> {
  const root = ensureUploadRoot();
  const urls: string[] = [];

  for (const file of files) {
    const filename = safeFilename(file.originalname || "photo.jpg");
    const relativePath = path.posix.join(
      "profiles",
      ownerId,
      `${Date.now()}-${filename}`,
    );
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);
    urls.push(`${baseUrlOf(req)}/media/file/${relativePath}`);
  }

  return urls;
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

  // Railway (and similar hosts) mount a persistent volume — prefer that.
  if (env.uploadDir) {
    return storeOnVolume(req, ownerId, files);
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

export async function readVolumeFile(relativePath: string) {
  const clean = relativePath?.trim().replace(/^\/+/, "");
  if (!clean || clean.includes("..")) {
    throw new AuthError("Invalid media path", 400);
  }

  const absolutePath = path.join(ensureUploadRoot(), clean);
  const root = path.resolve(ensureUploadRoot());
  if (!path.resolve(absolutePath).startsWith(root)) {
    throw new AuthError("Invalid media path", 400);
  }

  try {
    await fs.access(absolutePath);
  } catch {
    throw new AuthError("Not found", 404);
  }

  return {
    stream: createReadStream(absolutePath),
    contentType: contentTypeFromName(clean),
  };
}

export async function readPrivateBlob(pathname: string) {
  const clean = pathname?.trim();
  if (!clean) {
    throw new AuthError("Missing pathname", 400);
  }

  // Volume-backed files can also be requested via /media/view?pathname=
  if (env.uploadDir) {
    try {
      const volumeFile = await readVolumeFile(clean);
      return {
        statusCode: 200,
        stream: volumeFile.stream,
        blob: { contentType: volumeFile.contentType },
        fromVolume: true as const,
      };
    } catch (error) {
      if (!env.blobReadWriteToken) throw error;
    }
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
  const pathname = extractBlobPathname(photoRef);
  if (!pathname) return;

  if (env.uploadDir && isVolumePath(photoRef)) {
    try {
      const absolutePath = path.join(ensureUploadRoot(), pathname);
      await fs.unlink(absolutePath);
    } catch (error) {
      console.warn("Failed to delete volume file", pathname, error);
    }
    return;
  }

  if (!env.blobReadWriteToken) return;

  const target = pathname || photoRef;
  if (!target) return;

  try {
    await del(target, { token: env.blobReadWriteToken });
  } catch (error) {
    console.warn("Failed to delete blob", target, error);
  }
}
