import { Hono } from "hono";
import { getChallenge } from "../controllers/powController";

const powRouter = new Hono();

powRouter.get("/v1/pow/get-challenge", getChallenge);

export default powRouter;
