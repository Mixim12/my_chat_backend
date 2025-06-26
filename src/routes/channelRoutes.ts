import { Hono } from "hono";
import { createChannel, getChannels, getChannelById, deleteChannel, updateChannel, archiveChannel, addMemberToChannel, removeMemberFromChannel, promoteToAdmin, demoteFromAdmin } from "../controllers/channelController";
import { authMiddleware } from "../middleware/auth";

const channelRouter = new Hono();

// Create a new channel
channelRouter.post("/v1/channels", authMiddleware, createChannel);

// Get all channels for the authenticated user
channelRouter.get("/v1/channels", authMiddleware, getChannels);

// Get a specific channel by ID
channelRouter.get("/v1/channels/:channelId", authMiddleware, getChannelById);

// Update a channel
channelRouter.put("/v1/channels/:channelId", authMiddleware, updateChannel);

// Archive a channel (soft delete)
channelRouter.patch("/v1/channels/:channelId/archive", authMiddleware, archiveChannel);

// Delete a channel
channelRouter.delete("/v1/channels/:channelId", authMiddleware, deleteChannel);

// Member management
channelRouter.post("/v1/channels/:channelId/members", authMiddleware, addMemberToChannel);
channelRouter.delete("/v1/channels/:channelId/members/:memberId", authMiddleware, removeMemberFromChannel);
channelRouter.post("/v1/channels/:channelId/admins/:memberId", authMiddleware, promoteToAdmin);
channelRouter.delete("/v1/channels/:channelId/admins/:memberId", authMiddleware, demoteFromAdmin);

export default channelRouter;
