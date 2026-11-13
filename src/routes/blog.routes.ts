import { Router } from "express";
import {
  addBlogCommentHandler,
  getBlogBySlugHandler,
  listPublishedBlogsHandler,
} from "../controller/blog.controller";

const blogRouter = Router();

// Public endpoints
blogRouter.get("/", listPublishedBlogsHandler);
blogRouter.get("/:slug", getBlogBySlugHandler);
blogRouter.post("/:slug/comments", addBlogCommentHandler);

export default blogRouter;
