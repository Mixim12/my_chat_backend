import { Hono } from "hono";
import { createChannel } from "../controllers/channelController";
import { authMiddleware } from "../middleware/authMiddleware";

const channelRouter = new Hono();

channelRouter.post("/create-channel", (c) => createChannel(c));

export default channelRouter;
