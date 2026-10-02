import type { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { AuthError } from "../errors/AuthError";
import { env } from "../config/env";
import { MediaModel } from "../models/Media";
import { UserModel } from "../models/User";
import { presentUser } from "../presenters";
import {
  extractBlobPathname,
  readPrivateBlob,
  readVolumeFile,
} from "./media.service";

type ImagePayload = {
  bytes: Buffer;
  contentType: string;
};

type EmbeddingResponse = {
  embedding?: unknown;
  model?: unknown;
};

type FaceServiceError = {
  detail?: {
    message?: string;
    code?: string;
  };
  message?: string;
};

function requireFaceService(): void {
  if (!env.faceRecognitionServiceUrl) {
    throw new AuthError("Face verification service is not configured", 503);
  }
  if (!Number.isFinite(env.faceMatchThreshold) || env.faceMatchThreshold <= 0) {
    throw new AuthError("Face match threshold is invalid", 500);
  }
}

function toDataUrl({ bytes, contentType }: ImagePayload): string {
  const type = contentType || "image/jpeg";
  return `data:${type};base64,${bytes.toString("base64")}`;
}

async function streamToBuffer(
  stream: WebReadableStream | Readable | NodeJS.ReadableStream,
): Promise<Buffer> {
  // Node fs createReadStream
  if ("read" in stream && typeof (stream as Readable).on === "function") {
    const nodeStream = stream as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of nodeStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const reader = (stream as WebReadableStream).getReader();
  const chunks: Uint8Array[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks);
}

function mediaIdFromPhotoRef(photoRef: string): string | null {
  try {
    const parsed = new URL(photoRef);
    const match = parsed.pathname.match(/\/media\/([a-fA-F0-9]{24})$/);
    return match?.[1] ?? null;
  } catch {
    const match = photoRef.match(/\/media\/([a-fA-F0-9]{24})$/);
    return match?.[1] ?? null;
  }
}

async function loadPhoto(photoRef: string): Promise<ImagePayload> {
  const pathname = extractBlobPathname(photoRef);

  // Railway volume files — read directly from disk (don't HTTP round-trip).
  if (pathname && env.uploadDir) {
    try {
      const file = await readVolumeFile(pathname);
      return {
        bytes: await streamToBuffer(file.stream),
        contentType: file.contentType,
      };
    } catch (error) {
      // Fall through to other loaders for legacy blob / mongo / http refs.
      console.warn("Volume photo load failed, trying other sources", pathname, error);
    }
  }

  if (pathname && env.blobReadWriteToken) {
    const result = await readPrivateBlob(pathname);
    return {
      bytes: await streamToBuffer(
        result.stream as unknown as WebReadableStream | Readable,
      ),
      contentType:
        ("blob" in result && result.blob?.contentType) || "image/jpeg",
    };
  }

  const mediaId = mediaIdFromPhotoRef(photoRef);
  if (mediaId) {
    const media = await MediaModel.findById(mediaId).lean();
    if (!media) {
      throw new AuthError("Profile photo could not be loaded", 422);
    }
    return {
      bytes: Buffer.isBuffer(media.data)
        ? media.data
        : Buffer.from((media.data as { buffer: Uint8Array }).buffer),
      contentType: media.contentType,
    };
  }

  if (/^https?:\/\//i.test(photoRef)) {
    const response = await fetch(photoRef);
    if (!response.ok) {
      throw new AuthError(
        `Profile photo could not be loaded (${response.status})`,
        422,
      );
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/jpeg",
    };
  }

  throw new AuthError("Profile photo could not be loaded", 422);
}

function parseEmbedding(payload: EmbeddingResponse): number[] {
  if (!Array.isArray(payload.embedding)) {
    throw new AuthError("Face service returned an invalid embedding", 502);
  }

  const embedding = payload.embedding.map((value) => Number(value));
  if (
    !embedding.length ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new AuthError("Face service returned an invalid embedding", 502);
  }

  return embedding;
}

function faceServiceMessage(payload: FaceServiceError): string {
  return (
    payload.detail?.message ||
    payload.message ||
    "Face verification failed"
  );
}

async function createEmbedding(image: ImagePayload): Promise<number[]> {
  let response: Response;
  try {
    response = await fetch(
      `${env.faceRecognitionServiceUrl}/v1/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.faceRecognitionServiceKey
            ? { "X-Face-Service-Key": env.faceRecognitionServiceKey }
            : {}),
        },
        body: JSON.stringify({ image: toDataUrl(image) }),
      },
    );
  } catch {
    throw new AuthError("Face verification service is unavailable", 503);
  }

  const payload = (await response.json().catch(() => ({}))) as
    | EmbeddingResponse
    | FaceServiceError;

  if (!response.ok) {
    throw new AuthError(faceServiceMessage(payload as FaceServiceError), 422);
  }

  return parseEmbedding(payload as EmbeddingResponse);
}

function cosineDistance(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return Number.POSITIVE_INFINITY;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (!normA || !normB) return Number.POSITIVE_INFINITY;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function verifySelfieAgainstProfilePhotos(
  userId: string,
  selfie?: Express.Multer.File,
) {
  requireFaceService();

  if (!selfie) {
    throw new AuthError("A live selfie is required", 400);
  }
  if (!selfie.mimetype.startsWith("image/")) {
    throw new AuthError("Selfie must be an image", 400);
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AuthError("User not found", 404);
  }

  const photos = (user.photos ?? []).filter((photo) => photo.trim().length > 0);
  if (!photos.length) {
    throw new AuthError("Upload at least one profile photo before verification", 400);
  }

  const selfieEmbedding = await createEmbedding({
    bytes: selfie.buffer,
    contentType: selfie.mimetype,
  });

  let bestScore = Number.POSITIVE_INFINITY;
  let bestPhoto = "";
  let compared = 0;
  let loadFailures = 0;
  let faceFailures = 0;

  for (const photo of photos) {
    try {
      const image = await loadPhoto(photo);
      try {
        const photoEmbedding = await createEmbedding(image);
        const score = cosineDistance(selfieEmbedding, photoEmbedding);
        compared += 1;

        if (score < bestScore) {
          bestScore = score;
          bestPhoto = photo;
        }
      } catch (error) {
        faceFailures += 1;
        if (
          error instanceof AuthError &&
          (error.status === 502 || error.status === 503)
        ) {
          throw error;
        }
        console.warn("Profile photo had no usable face", photo, error);
      }
    } catch (error) {
      loadFailures += 1;
      if (
        error instanceof AuthError &&
        (error.status === 502 || error.status === 503)
      ) {
        throw error;
      }
      console.warn("Skipping profile photo during selfie verification", photo, error);
    }
  }

  if (!compared || !Number.isFinite(bestScore)) {
    if (loadFailures === photos.length) {
      throw new AuthError(
        "Your profile photos could not be loaded for face comparison. Re-upload a clear face photo and try again.",
        422,
      );
    }
    throw new AuthError(
      "No profile photo had a usable face for comparison. Use a clear, front-facing photo with exactly one face.",
      422,
    );
  }

  const verified = bestScore <= env.faceMatchThreshold;
  const now = new Date();
  user.isVerified = verified;
  user.selfieVerification = {
    status: verified ? "verified" : "failed",
    score: bestScore,
    threshold: env.faceMatchThreshold,
    matchedPhotoUrl: bestPhoto,
    provider: "opencv_sface",
    reason: verified
      ? "Selfie matched an uploaded profile photo"
      : "Selfie did not match the uploaded profile photos",
    verifiedAt: verified ? now : user.selfieVerification?.verifiedAt,
    lastAttemptAt: now,
  };

  await user.save();

  return {
    isVerified: verified,
    status: user.selfieVerification.status,
    score: bestScore,
    threshold: env.faceMatchThreshold,
    matchedPhotoUrl: bestPhoto,
    reason: user.selfieVerification.reason,
    user: presentUser(user),
  };
}
