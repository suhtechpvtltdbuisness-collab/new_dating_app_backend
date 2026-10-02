import express, { Router } from "express";
import { Readable } from "stream";
import { AuthError } from "../errors/AuthError";
import { env } from "../config/env";
import { readMedia, readPrivateBlob } from "../services/media.service";

const mediaRouter = Router();

mediaRouter.get("/view", async (req, res, next) => {
  try {
    const pathname = String(req.query.pathname ?? "").trim();
    if (!pathname) {
      throw new AuthError("Missing pathname", 400);
    }

    const result = await readPrivateBlob(pathname);
    const contentType =
      ("blob" in result && result.blob?.contentType) ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");

    if ("fromVolume" in result && result.fromVolume) {
      (result.stream as NodeJS.ReadableStream).pipe(res);
      return;
    }

    const nodeStream = Readable.fromWeb(
      result.stream as import("stream/web").ReadableStream,
    );
    nodeStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/** Serve files stored on the Railway volume when UPLOAD_DIR is configured. */
if (env.uploadDir) {
  mediaRouter.use(
    "/file",
    express.static(env.uploadDir, {
      fallthrough: false,
      maxAge: "1d",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
}

mediaRouter.get("/:mediaId", async (req, res, next) => {
  try {
    const media = await readMedia(req.params.mediaId ?? "");
    const bytes = Buffer.isBuffer(media.data)
      ? media.data
      : Buffer.from((media.data as { buffer: Uint8Array }).buffer);

    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(bytes);
  } catch (error) {
    next(error);
  }
});

export default mediaRouter;
