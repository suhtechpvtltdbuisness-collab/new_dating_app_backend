import type { NextFunction, Request, Response } from "express";
import {
  getDislikes,
  getIncomingLikes,
  getLikes,
  getMatches,
  swipeUser,
} from "../services/swipe.service";
import { param, requireUserId } from "../utils/context";

export async function rightSwipeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await swipeUser(userId, param(req, "userId"), "like");
    res.status(200).json({
      message: result.isMatch ? "Match created" : "Liked",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function leftSwipeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await swipeUser(userId, param(req, "userId"), "dislike");
    res.status(200).json({ message: "Disliked", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMatchesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getMatches(requireUserId(res));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getLikesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getLikes(requireUserId(res));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getDislikesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getDislikes(requireUserId(res));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getIncomingLikesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filter = String(req.query.filter ?? "all");
    const data = await getIncomingLikes(requireUserId(res), filter);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}
