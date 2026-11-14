import type { NextFunction, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { env } from "../config/env";
import { MediaModel } from "../models/Media";
import { baseUrlOf, ensureUploadRoot } from "../services/media.service";
import {
  addBlogComment,
  adminCreateBlog,
  adminDeleteBlog,
  adminDeleteComment,
  adminGetBlogById,
  adminListBlogs,
  adminListComments,
  adminToggleBlogPublish,
  adminUpdateBlog,
  adminUpdateCommentStatus,
  getBlogBySlug,
  listPublishedBlogs,
} from "../services/blog.service";

// ==========================================
// Public Endpoints
// ==========================================

export async function listPublishedBlogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, category, search } = req.query;
    const data = await listPublishedBlogs({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      category: typeof category === "string" ? category : undefined,
      search: typeof search === "string" ? search : undefined,
    });
    res.json({ success: true, data: data.items, pagination: data.pagination });
  } catch (error) {
    next(error);
  }
}

export async function getBlogBySlugHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = String(req.params.slug ?? "");
    if (!slug) {
      res.status(400).json({ success: false, message: "Blog slug is required" });
      return;
    }
    const data = await getBlogBySlug(slug);
    if (!data) {
      res.status(404).json({ success: false, message: "Blog not found" });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function addBlogCommentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = String(req.params.slug ?? "");
    const { authorName, authorEmail, content } = req.body ?? {};

    if (!authorName || !authorEmail || !content) {
      res.status(400).json({
        success: false,
        message: "Name, email and comment content are required",
      });
      return;
    }

    const data = await addBlogComment({
      slug,
      authorName: String(authorName),
      authorEmail: String(authorEmail),
      content: String(content),
    });

    res.status(201).json({
      success: true,
      data,
      message:
        "Thank you! Your comment has been submitted and will appear once approved by our team.",
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// Admin Endpoints
// ==========================================

export async function adminListBlogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, search, isPublished } = req.query;
    const data = await adminListBlogs({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: typeof search === "string" ? search : undefined,
      isPublished:
        isPublished !== undefined ? isPublished === "true" || isPublished === "1" : undefined,
    });
    res.json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminCreateBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      title,
      slug,
      summary,
      content,
      coverImage,
      category,
      author,
      tags,
      readTime,
      isPublished,
    } = req.body ?? {};

    if (!title || !content) {
      res.status(400).json({ success: false, message: "Title and content are required" });
      return;
    }

    const data = await adminCreateBlog({
      title: String(title),
      slug: slug ? String(slug) : undefined,
      summary: summary ? String(summary) : undefined,
      content: String(content),
      coverImage: coverImage ? String(coverImage) : undefined,
      category: category ? String(category) : undefined,
      author: author ? String(author) : undefined,
      tags,
      readTime: readTime ? String(readTime) : undefined,
      isPublished,
    });

    res.status(201).json({
      success: true,
      data,
      message: "Blog post published successfully.",
    });
  } catch (error) {
    next(error);
  }
}

export async function adminGetBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const data = await adminGetBlogById(id);
    if (!data) {
      res.status(404).json({ success: false, message: "Blog not found" });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const data = await adminUpdateBlog(id, req.body ?? {});
    res.json({ success: true, data, message: "Blog post updated successfully." });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    await adminDeleteBlog(id);
    res.json({ success: true, message: "Blog post and comments deleted." });
  } catch (error) {
    next(error);
  }
}

export async function adminToggleBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const data = await adminToggleBlogPublish(id);
    res.json({
      success: true,
      data,
      message: `Blog is now ${data.isPublished ? "published" : "draft / hidden"}.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminListCommentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, status, postId } = req.query;
    const data = await adminListComments({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status:
        typeof status === "string" && ["pending", "approved", "rejected", "all"].includes(status)
          ? (status as "pending" | "approved" | "rejected" | "all")
          : undefined,
      postId: typeof postId === "string" ? postId : undefined,
    });
    res.json({
      success: true,
      data: data.items,
      pendingCount: data.pendingCount,
      pagination: data.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminApproveCommentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const commentId = String(req.params.commentId ?? "");
    const data = await adminUpdateCommentStatus(commentId, "approved");
    res.json({ success: true, data, message: "Comment approved and is now publicly visible." });
  } catch (error) {
    next(error);
  }
}

export async function adminRejectCommentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const commentId = String(req.params.commentId ?? "");
    const data = await adminUpdateCommentStatus(commentId, "rejected");
    res.json({ success: true, data, message: "Comment rejected." });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteCommentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const commentId = String(req.params.commentId ?? "");
    await adminDeleteComment(commentId);
    res.json({ success: true, message: "Comment deleted." });
  } catch (error) {
    next(error);
  }
}

export async function adminUploadBlogCoverHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const file =
      files.find((f) => ["file", "cover", "image", "photo"].includes(f.fieldname)) ??
      files[0];

    if (!file) {
      res.status(400).json({ success: false, message: "No image file provided" });
      return;
    }

    let imageUrl = "";
    const baseUrl = baseUrlOf(req);

    // 1. Try saving to disk (UPLOAD_DIR or local ./uploads fallback)
    try {
      const root = ensureUploadRoot();
      const cleanName =
        file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) ||
        "cover.jpg";
      const relativePath = path.posix.join(
        "uploads",
        "blogs",
        `${Date.now()}-${cleanName}`,
      );
      const absolutePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, file.buffer);
      imageUrl = `${baseUrl}/media/file/${relativePath}`;
    } catch (diskErr) {
      console.warn(
        "[BlogCoverUpload] Disk write failed, attempting fallback:",
        diskErr,
      );
    }

    // 2. Try Vercel Blob if available
    if (!imageUrl && env.blobReadWriteToken) {
      try {
        const cleanName =
          file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) ||
          "cover.jpg";
        const pathname = `blogs/${Date.now()}-${cleanName}`;
        const blob = await put(pathname, file.buffer, {
          access: "public",
          contentType: file.mimetype || "image/jpeg",
          token: env.blobReadWriteToken,
        });
        imageUrl = blob.url;
      } catch (blobErr) {
        console.warn(
          "[BlogCoverUpload] Blob storage failed, attempting MediaModel:",
          blobErr,
        );
      }
    }

    // 3. Guaranteed reliable fallback: MongoDB MediaModel
    if (!imageUrl) {
      const media = await MediaModel.create({
        contentType: file.mimetype || "image/jpeg",
        size: file.size,
        data: file.buffer,
      });
      imageUrl = `${baseUrl}/media/${media._id}`;
    }

    res.status(201).json({
      success: true,
      data: { url: imageUrl },
      message: "Cover image uploaded successfully.",
    });
  } catch (error) {
    next(error);
  }
}

