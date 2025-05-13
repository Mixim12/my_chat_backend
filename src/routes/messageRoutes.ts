import { Hono } from "hono";
import { createMessage, getMessages } from "../controllers/messageController";
import { authMiddleware } from "../middleware/auth";

const messageRouter = new Hono();

messageRouter.post("/send", authMiddleware, (c) => createMessage(c));
messageRouter.get("/get", authMiddleware, (c) => getMessages(c));
export default messageRouter;
