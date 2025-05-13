import { Hono } from "hono";
import { createChannel } from "../controllers/channelController";


const channelRouter = new Hono();

channelRouter.post("/create-channel", (c) => createChannel(c));

export default channelRouter;
