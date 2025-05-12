import { Hono } from "hono";
import { getChallenge } from "../controllers/powController";

const powRouter = new Hono();

powRouter.get("/get-challenge", (c) => getChallenge(c));

export default powRouter;
