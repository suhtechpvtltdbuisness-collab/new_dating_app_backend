import { Router } from "express";
import {
  getProfileDetailHandler,
  likeProfileHandler,
  listProfilesHandler,
  nearbyProfilesHandler,
  passProfileHandler,
  superLikeProfileHandler,
} from "../controller/discovery.controller";
import { authenticateAccessToken } from "../middlewares/authenticate";

const profilesRouter = Router();

profilesRouter.use(authenticateAccessToken);

profilesRouter.get("/", listProfilesHandler);
profilesRouter.get("/nearby", nearbyProfilesHandler);
profilesRouter.post("/like", likeProfileHandler);
profilesRouter.post("/super-like", superLikeProfileHandler);
profilesRouter.post("/pass", passProfileHandler);
profilesRouter.post("/unlike", passProfileHandler);
profilesRouter.post("/:userId/like", likeProfileHandler);
profilesRouter.post("/:userId/pass", passProfileHandler);
profilesRouter.get("/:id", getProfileDetailHandler);

export default profilesRouter;
