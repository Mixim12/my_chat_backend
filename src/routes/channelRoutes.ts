import { Hono } from "hono";
import { createChannel, getChannels, getChannelById, deleteChannel } from "../controllers/channelController";
import { authMiddleware } from "../middleware/auth";

const channelRouter = new Hono();

// Create a new channel
channelRouter.post("/v1/channels", authMiddleware, createChannel);

// Get all channels for the authenticated user
channelRouter.get("/v1/channels", authMiddleware, getChannels);

// Get a specific channel by ID
channelRouter.get("/v1/channels/:channelId", authMiddleware, getChannelById);


// Delete a channel
channelRouter.delete("/v1/channels/:channelId", authMiddleware, deleteChannel);

export default channelRouter;
