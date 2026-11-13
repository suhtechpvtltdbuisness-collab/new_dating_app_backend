import { Router } from "express";
import { getSiteContentHandler } from "../controller/siteContent.controller";

const siteContentRouter = Router();

siteContentRouter.get("/", getSiteContentHandler);

export default siteContentRouter;
