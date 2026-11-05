import type { NextFunction, Request, Response } from "express";
import {
  createPlan,
  deletePlan,
  getActivePlans,
  getAllPlans,
  togglePlanActive,
  updatePlan,
} from "../services/plan.service";

/** Public endpoint for the Flutter mobile app */
export async function getActivePlansHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getActivePlans();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/** Admin endpoints */
export async function adminListPlansHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getAllPlans();
    res.status(200).json({
      data,
      pagination: { page: 1, limit: data.length, total: data.length, pages: 1 },
    });
  } catch (error) {
    next(error);
  }
}

export async function adminCreatePlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { title, price, period, subtitle, isBest, badge, features, sortOrder, isActive } =
      req.body ?? {};
    if (!title || !price) {
      res.status(400).json({ success: false, message: "Title and price are required" });
      return;
    }
    const data = await createPlan({
      title,
      price,
      period,
      subtitle,
      isBest,
      badge,
      features: typeof features === "string" ? features.split(",").map((s: string) => s.trim()) : features,
      sortOrder: Number(sortOrder ?? 0),
      isActive: isActive !== false,
    });
    res.status(201).json({ success: true, message: "Plan created successfully", data });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdatePlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id);
    const { title, price, period, subtitle, isBest, badge, features, sortOrder, isActive } =
      req.body ?? {};
    const data = await updatePlan(id, {
      ...(title !== undefined && { title }),
      ...(price !== undefined && { price }),
      ...(period !== undefined && { period }),
      ...(subtitle !== undefined && { subtitle }),
      ...(isBest !== undefined && { isBest: Boolean(isBest) }),
      ...(badge !== undefined && { badge }),
      ...(features !== undefined && {
        features: typeof features === "string" ? features.split(",").map((s: string) => s.trim()) : features,
      }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    });
    res.json({ success: true, message: "Plan updated successfully", data });
  } catch (error) {
    next(error);
  }
}

export async function adminTogglePlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id);
    const data = await togglePlanActive(id);
    res.json({
      success: true,
      message: data ? `Plan is now ${data.isActive ? "active" : "inactive"}` : "Toggled",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminDeletePlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id);
    const data = await deletePlan(id);
    res.json({ success: true, message: "Plan deleted successfully", data });
  } catch (error) {
    next(error);
  }
}
