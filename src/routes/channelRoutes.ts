import { Hono } from "hono";
import { createChannel, getAllChannels } from "../controllers/channelController";

const channelRouter = new Hono();

channelRouter.post("/", createChannel);
channelRouter.get("/", getAllChannels);

export default channelRouter;
