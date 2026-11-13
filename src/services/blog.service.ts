import { Types } from "mongoose";
import BlogPost, { type BlogPostDocument } from "../models/BlogPost";
import BlogComment, { type BlogCommentDocument } from "../models/BlogComment";

/** Generates a URL-friendly slug from a string */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}

/** Ensure unique slug in database */
export async function makeUniqueSlug(
  title: string,
  excludeId?: string,
): Promise<string> {
  const baseSlug = slugify(title) || "post";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query: Record<string, unknown> = { slug };
    if (excludeId && Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new Types.ObjectId(excludeId) };
    }
    const existing = await BlogPost.findOne(query).select("_id").lean();
    if (!existing) {
      return slug;
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// ==========================================
// Public Services
// ==========================================

export interface ListPublishedBlogsOptions {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
}

export async function listPublishedBlogs(opts: ListPublishedBlogsOptions = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 10));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isPublished: true };

  if (opts.category && opts.category.toLowerCase() !== "all") {
    filter.category = new RegExp(`^${opts.category.trim()}$`, "i");
  }

  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim();
    filter.$or = [
      { title: { $regex: s, $options: "i" } },
      { summary: { $regex: s, $options: "i" } },
      { tags: { $in: [new RegExp(s, "i")] } },
    ];
  }

  const [total, posts] = await Promise.all([
    BlogPost.countDocuments(filter),
    BlogPost.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  // Aggregate approved comment count for each post
  const postIds = posts.map((p) => p._id);
  const commentCounts = await BlogComment.aggregate([
    { $match: { postId: { $in: postIds }, status: "approved" } },
    { $group: { _id: "$postId", count: { $sum: 1 } } },
  ]);

  const countMap = new Map<string, number>();
  for (const c of commentCounts) {
    countMap.set(String(c._id), c.count);
  }

  const items = posts.map((p) => ({
    ...p,
    id: String(p._id),
    commentsCount: countMap.get(String(p._id)) || 0,
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getBlogBySlug(slug: string) {
  const post = await BlogPost.findOne({ slug: slug.toLowerCase().trim() });
  if (!post) {
    return null;
  }

  // Increment views in background
  BlogPost.findByIdAndUpdate(post._id, { $inc: { views: 1 } }).exec();

  // Fetch approved comments
  const comments = await BlogComment.find({
    postId: post._id,
    status: "approved",
  })
    .sort({ createdAt: -1 })
    .lean();

  return {
    post: {
      ...post.toObject(),
      id: String(post._id),
    },
    comments: comments.map((c) => ({
      ...c,
      id: String(c._id),
    })),
  };
}

export async function addBlogComment(data: {
  slug: string;
  authorName: string;
  authorEmail: string;
  content: string;
}) {
  const post = await BlogPost.findOne({ slug: data.slug.toLowerCase().trim() });
  if (!post) {
    throw new Error("Blog post not found");
  }

  const comment = await BlogComment.create({
    postId: post._id,
    authorName: data.authorName.trim(),
    authorEmail: data.authorEmail.trim().toLowerCase(),
    content: data.content.trim(),
    status: "pending", // ALWAYS pending initially
  });

  return {
    id: String(comment._id),
    status: comment.status,
    message: "Comment submitted successfully and is awaiting moderation.",
  };
}

// ==========================================
// Admin Services
// ==========================================

export interface AdminListBlogsOptions {
  page?: number;
  limit?: number;
  search?: string;
  isPublished?: boolean;
}

export async function adminListBlogs(opts: AdminListBlogsOptions = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};

  if (opts.isPublished !== undefined) {
    filter.isPublished = opts.isPublished;
  }

  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim();
    filter.$or = [
      { title: { $regex: s, $options: "i" } },
      { summary: { $regex: s, $options: "i" } },
      { category: { $regex: s, $options: "i" } },
    ];
  }

  const [total, posts] = await Promise.all([
    BlogPost.countDocuments(filter),
    BlogPost.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const postIds = posts.map((p) => p._id);

  // Group comments by post and status
  const commentStats = await BlogComment.aggregate([
    { $match: { postId: { $in: postIds } } },
    {
      $group: {
        _id: { postId: "$postId", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ]);

  const statsMap = new Map<
    string,
    { total: number; approved: number; pending: number; rejected: number }
  >();

  for (const s of commentStats) {
    const pid = String(s._id.postId);
    const existing = statsMap.get(pid) || {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    const count = Number(s.count) || 0;
    existing.total += count;
    if (s._id.status === "approved") existing.approved += count;
    else if (s._id.status === "pending") existing.pending += count;
    else if (s._id.status === "rejected") existing.rejected += count;
    statsMap.set(pid, existing);
  }

  const items = posts.map((p) => {
    const stats = statsMap.get(String(p._id)) || {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    return {
      ...p,
      id: String(p._id),
      commentCount: stats.total,
      approvedCommentCount: stats.approved,
      pendingCommentCount: stats.pending,
      rejectedCommentCount: stats.rejected,
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function adminCreateBlog(data: {
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  coverImage?: string;
  category?: string;
  author?: string;
  tags?: string[] | string;
  readTime?: string;
  isPublished?: boolean;
}) {
  const slug = data.slug?.trim()
    ? await makeUniqueSlug(data.slug)
    : await makeUniqueSlug(data.title);

  let formattedTags: string[] = [];
  if (Array.isArray(data.tags)) {
    formattedTags = data.tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof data.tags === "string") {
    formattedTags = data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const post = await BlogPost.create({
    title: data.title.trim(),
    slug,
    summary: data.summary?.trim() || "",
    content: data.content,
    coverImage: data.coverImage?.trim() || "",
    category: data.category?.trim() || "Dating Tips",
    author: data.author?.trim() || "Vellora Team",
    tags: formattedTags,
    readTime: data.readTime?.trim() || "3 min read",
    isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : true,
  });

  return {
    ...post.toObject(),
    id: String(post._id),
  };
}

export async function adminGetBlogById(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  const post = await BlogPost.findById(id).lean();
  if (!post) return null;
  return {
    ...post,
    id: String(post._id),
  };
}

export async function adminUpdateBlog(
  id: string,
  data: Partial<{
    title: string;
    slug: string;
    summary: string;
    content: string;
    coverImage: string;
    category: string;
    author: string;
    tags: string[] | string;
    readTime: string;
    isPublished: boolean;
  }>,
) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid blog ID");

  const update: Record<string, unknown> = {};

  if (data.title !== undefined) update.title = data.title.trim();
  if (data.slug !== undefined && data.slug.trim()) {
    update.slug = await makeUniqueSlug(data.slug, id);
  } else if (data.title && !data.slug) {
    // If slug not provided, keep current or regenerate if title changed
  }
  if (data.summary !== undefined) update.summary = data.summary.trim();
  if (data.content !== undefined) update.content = data.content;
  if (data.coverImage !== undefined) update.coverImage = data.coverImage.trim();
  if (data.category !== undefined) update.category = data.category.trim();
  if (data.author !== undefined) update.author = data.author.trim();
  if (data.readTime !== undefined) update.readTime = data.readTime.trim();
  if (data.isPublished !== undefined) update.isPublished = Boolean(data.isPublished);

  if (data.tags !== undefined) {
    if (Array.isArray(data.tags)) {
      update.tags = data.tags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof data.tags === "string") {
      update.tags = data.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  const updated = await BlogPost.findByIdAndUpdate(id, update, {
    new: true,
  }).lean();
  if (!updated) throw new Error("Blog post not found");

  return {
    ...updated,
    id: String(updated._id),
  };
}

export async function adminDeleteBlog(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid blog ID");
  const deleted = await BlogPost.findByIdAndDelete(id);
  if (!deleted) throw new Error("Blog post not found");

  // Cascade delete comments
  await BlogComment.deleteMany({ postId: id });
  return true;
}

export async function adminToggleBlogPublish(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid blog ID");
  const post = await BlogPost.findById(id);
  if (!post) throw new Error("Blog post not found");

  post.isPublished = !post.isPublished;
  await post.save();

  return {
    id: String(post._id),
    isPublished: post.isPublished,
  };
}

export interface AdminListCommentsOptions {
  page?: number;
  limit?: number;
  status?: "pending" | "approved" | "rejected" | "all";
  postId?: string;
}

export async function adminListComments(opts: AdminListCommentsOptions = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};

  if (opts.status && opts.status !== "all") {
    filter.status = opts.status;
  }

  if (opts.postId && Types.ObjectId.isValid(opts.postId)) {
    filter.postId = new Types.ObjectId(opts.postId);
  }

  const [total, comments, pendingCount] = await Promise.all([
    BlogComment.countDocuments(filter),
    BlogComment.find(filter)
      .populate<{ postId: BlogPostDocument }>("postId", "title slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BlogComment.countDocuments({ status: "pending" }),
  ]);

  const items = comments.map((c) => ({
    id: String(c._id),
    postId: c.postId ? String((c.postId as unknown as BlogPostDocument)._id) : "",
    postTitle: (c.postId as unknown as BlogPostDocument)?.title || "Deleted Post",
    postSlug: (c.postId as unknown as BlogPostDocument)?.slug || "",
    authorName: c.authorName,
    authorEmail: c.authorEmail,
    content: c.content,
    status: c.status,
    createdAt: c.createdAt,
  }));

  return {
    items,
    pendingCount,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function adminUpdateCommentStatus(
  commentId: string,
  status: "approved" | "rejected",
) {
  if (!Types.ObjectId.isValid(commentId)) throw new Error("Invalid comment ID");
  const updated = await BlogComment.findByIdAndUpdate(
    commentId,
    { status },
    { new: true },
  ).lean();

  if (!updated) throw new Error("Comment not found");
  return {
    id: String(updated._id),
    status: updated.status,
  };
}

export async function adminDeleteComment(commentId: string) {
  if (!Types.ObjectId.isValid(commentId)) throw new Error("Invalid comment ID");
  const deleted = await BlogComment.findByIdAndDelete(commentId);
  if (!deleted) throw new Error("Comment not found");
  return true;
}
