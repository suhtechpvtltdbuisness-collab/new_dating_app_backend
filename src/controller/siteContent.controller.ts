import type { NextFunction, Request, Response } from "express";
import {
  getOrCreateSiteContent,
  updateSiteContent,
} from "../services/siteContent.service";

export async function getSiteContentHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getOrCreateSiteContent();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateSiteContentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body ?? {};
    // Strip non-editable root fields like _id, key, createdAt
    const { _id, key, createdAt, updatedAt, ...updates } = body;
    const data = await updateSiteContent(updates);
    res.json({
      success: true,
      data,
      message: "Website content updated successfully.",
    });
  } catch (error) {
    next(error);
  }
}
