import type { NextFunction, Request, Response } from "express";
import { createSupportTicket, type SupportUpload } from "../services/support.service";
import { requireUserId } from "../utils/context";

export async function createSupportTicketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(res);
    const files = (Array.isArray(req.files) ? req.files : []) as SupportUpload[];
    const data = await createSupportTicket(userId, req.body ?? {}, files);
    res.status(201).json({ message: "Your request has been sent", data });
  } catch (error) {
    next(error);
  }
}
