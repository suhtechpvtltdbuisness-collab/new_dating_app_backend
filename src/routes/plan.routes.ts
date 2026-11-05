import { Router } from "express";
import { getActivePlansHandler } from "../controller/plan.controller";

const planRouter = Router();

// Public endpoint for mobile clients to get active plans
planRouter.get("/", getActivePlansHandler);

export default planRouter;

