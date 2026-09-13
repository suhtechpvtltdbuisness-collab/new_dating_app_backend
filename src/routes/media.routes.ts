import { Readable } from "stream";
import { Router } from "express";
import { AuthError } from "../errors/AuthError";
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
      result.blob.contentType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");

    const nodeStream = Readable.fromWeb(
      result.stream as import("stream/web").ReadableStream,
    );
    nodeStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

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
