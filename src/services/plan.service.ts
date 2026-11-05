import { PlanModel } from "../models/Plan";
import { validateObjectId } from "../validation/chat.validation";

export function presentPlan(plan: any) {
  if (!plan) return null;
  return {
    id: String(plan._id),
    title: plan.title,
    price: plan.price,
    period: plan.period || "PER WEEK",
    subtitle: plan.subtitle || "",
    isBest: Boolean(plan.isBest),
    badge: plan.badge || (plan.isBest ? "BEST VALUE" : ""),
    features: Array.isArray(plan.features) ? plan.features : [],
    sortOrder: typeof plan.sortOrder === "number" ? plan.sortOrder : 0,
    isActive: plan.isActive !== false,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export const DEFAULT_PLANS = [
  {
    title: "3 Months",
    price: "₹99.99",
    period: "PER WEEK",
    subtitle: "Save 65% compared to monthly",
    isBest: true,
    badge: "BEST VALUE",
    features: [
      "See who liked you",
      "Unlimited Likes",
      "Incognito Mode",
      "Priority Matching",
    ],
    sortOrder: 0,
    isActive: true,
  },
  {
    title: "1 Month",
    price: "₹119.99",
    period: "PER WEEK",
    subtitle: "Save 40%",
    isBest: false,
    badge: "",
    features: [
      "See who liked you",
      "Unlimited Likes",
      "Incognito Mode",
    ],
    sortOrder: 1,
    isActive: true,
  },
  {
    title: "1 Week",
    price: "₹149.99",
    period: "PER WEEK",
    subtitle: "Flexibility first",
    isBest: false,
    badge: "",
    features: [
      "See who liked you",
      "Unlimited Likes",
    ],
    sortOrder: 2,
    isActive: true,
  },
];

export async function seedDefaultPlans(): Promise<void> {
  const count = await PlanModel.countDocuments();
  if (count === 0) {
    await PlanModel.insertMany(DEFAULT_PLANS);
  }
}

/** Public endpoint for mobile app: returns only active plans */
export async function getActivePlans() {
  await seedDefaultPlans();
  const plans = await PlanModel.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  return plans.map(presentPlan);
}

/** Admin endpoint: returns all plans */
export async function getAllPlans() {
  await seedDefaultPlans();
  const plans = await PlanModel.find({})
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  return plans.map(presentPlan);
}

export async function createPlan(data: {
  title: string;
  price: string;
  period?: string;
  subtitle?: string;
  isBest?: boolean;
  badge?: string;
  features?: string[];
  sortOrder?: number;
  isActive?: boolean;
}) {
  const plan = await PlanModel.create({
    title: data.title.trim(),
    price: data.price.trim(),
    period: (data.period || "PER WEEK").trim(),
    subtitle: (data.subtitle || "").trim(),
    isBest: Boolean(data.isBest),
    badge: (data.badge || "").trim(),
    features: Array.isArray(data.features) ? data.features : [],
    sortOrder: Number(data.sortOrder ?? 0),
    isActive: data.isActive !== false,
  });
  return presentPlan(plan);
}

export async function updatePlan(
  id: string,
  data: Partial<{
    title: string;
    price: string;
    period: string;
    subtitle: string;
    isBest: boolean;
    badge: string;
    features: string[];
    sortOrder: number;
    isActive: boolean;
  }>,
) {
  const validId = validateObjectId(id, "planId");
  const plan = await PlanModel.findByIdAndUpdate(
    validId,
    { $set: data },
    { new: true },
  ).lean();
  if (!plan) throw new Error("Plan not found");
  return presentPlan(plan);
}

export async function togglePlanActive(id: string) {
  const validId = validateObjectId(id, "planId");
  const existing = await PlanModel.findById(validId).lean();
  if (!existing) throw new Error("Plan not found");
  const plan = await PlanModel.findByIdAndUpdate(
    validId,
    { $set: { isActive: !existing.isActive } },
    { new: true },
  ).lean();
  return presentPlan(plan);
}

export async function deletePlan(id: string) {
  const validId = validateObjectId(id, "planId");
  const result = await PlanModel.findByIdAndDelete(validId);
  if (!result) throw new Error("Plan not found");
  return { deleted: true, id: validId };
}

