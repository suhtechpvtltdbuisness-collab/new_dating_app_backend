import { Router } from "express";
import {
  astroMatchHandler,
  bestAstroMatchesHandler,
  myAstroHandler,
  signCompatibilityHandler,
} from "../controller/astro.controller";
import { authenticateAccessToken } from "../middlewares/authenticate";

const astroRouter = Router();

astroRouter.use(authenticateAccessToken);

astroRouter.get("/me", myAstroHandler);
astroRouter.get("/compatibility", signCompatibilityHandler);
astroRouter.get("/match/:userId", astroMatchHandler);
astroRouter.get("/best-matches", bestAstroMatchesHandler);

export default astroRouter;
