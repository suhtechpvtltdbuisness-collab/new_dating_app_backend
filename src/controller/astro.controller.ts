import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/AuthError";
import { getAstroMatch, getMyAstro } from "../services/astro/astro.service";
import { listBestAstroMatches } from "../services/astro/bestMatches.service";
import { discoveryQuery } from "./discovery.controller";
import { computeCompatibility } from "../services/astro/compatibility";
import { SIGNS, isSign } from "../services/astro/zodiac";
import { numericQuery, param, requireUserId } from "../utils/context";

export async function myAstroHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const data = await getMyAstro(userId);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function astroMatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const data = await getAstroMatch(userId, param(req, "userId"));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

/** GET /astro/compatibility?signA=aries&signB=leo — sign-pair score, no users involved. */
export async function signCompatibilityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireUserId(res);
    const a = String(req.query.signA ?? "").trim().toLowerCase();
    const b = String(req.query.signB ?? "").trim().toLowerCase();
    if (!isSign(a) || !isSign(b)) {
      throw new AuthError(`signA and signB must be one of: ${SIGNS.join(", ")}`, 400);
    }
    res.status(200).json({ data: computeCompatibility(a, b) });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /astro/best-matches (B8)
 * Query: page, limit (max 50), minScore (0-100), plus every discovery filter
 * (gender, minAge, maxAge, interests, religion, ...).
 */
export async function bestAstroMatchesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const { items, meta } = await listBestAstroMatches(userId, {
      ...discoveryQuery(req),
      minScore: numericQuery(req, "minScore"),
    });
    res.status(200).json({ data: items, meta });
  } catch (error) {
    next(error);
  }
}
