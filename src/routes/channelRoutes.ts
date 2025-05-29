import { Hono } from "hono";
import { createChannel, getChannels, getChannelById, updateChannel, deleteChannel } from "../controllers/channelController";
import { authMiddleware } from "../middleware/auth";

const channelRouter = new Hono();

// Create a new channel
channelRouter.post("/", authMiddleware, createChannel);

// Get all channels for the authenticated user
channelRouter.get("/", authMiddleware, getChannels);

// Get a specific channel by ID
channelRouter.get("/:channelId", authMiddleware, getChannelById);

// Update a channel
channelRouter.put("/:channelId", authMiddleware, updateChannel);

// Delete a channel
channelRouter.delete("/:channelId", authMiddleware, deleteChannel);

export default channelRouter;
