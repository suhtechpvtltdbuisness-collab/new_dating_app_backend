import type { NextFunction, Request, Response } from "express";
import {
  getProfileById,
  listNearbyProfiles,
  listProfiles,
} from "../services/discovery.service";
import { swipeUser } from "../services/swipe.service";
import { numericQuery, param, requireUserId } from "../utils/context";

function discoveryQuery(req: Request) {
  return {
    page: numericQuery(req, "page"),
    limit: numericQuery(req, "limit"),
    distance: numericQuery(req, "distance"),
    minAge: numericQuery(req, "minAge"),
    maxAge: numericQuery(req, "maxAge"),
    gender: typeof req.query.gender === "string" ? req.query.gender : undefined,
  };
}

export async function listProfilesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const profiles = await listProfiles(userId, discoveryQuery(req));
    res.status(200).json({ data: profiles });
  } catch (error) {
    next(error);
  }
}

export async function nearbyProfilesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const profiles = await listNearbyProfiles(userId, discoveryQuery(req));
    res.status(200).json({ data: profiles });
  } catch (error) {
    next(error);
  }
}

export async function getProfileDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const profile = await getProfileById(userId, param(req, "id"));
    res.status(200).json({ data: profile });
  } catch (error) {
    next(error);
  }
}

function targetIdFrom(req: Request): string {
  return (
    param(req, "userId") ||
    (req.body?.userId as string) ||
    (req.body?.targetUserId as string) ||
    (req.body?.profileId as string) ||
    ""
  );
}

export async function likeProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await swipeUser(userId, targetIdFrom(req), "like", {
      superLike: req.body?.superLike === true,
    });
    res
      .status(200)
      .json({ message: result.isMatch ? "Match created" : "Liked", data: result });
  } catch (error) {
    next(error);
  }
}

export async function superLikeProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await swipeUser(userId, targetIdFrom(req), "like", {
      superLike: true,
    });
    res.status(200).json({
      message: result.isMatch ? "Match created" : "Super liked",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function passProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const result = await swipeUser(userId, targetIdFrom(req), "dislike");
    res.status(200).json({ message: "Passed", data: result });
  } catch (error) {
    next(error);
  }
}
