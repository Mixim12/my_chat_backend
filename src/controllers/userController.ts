import { Context } from "hono";
import { UserModel } from "../models/userModel";
import { ChannelModel } from "../models/channelModel";

export async function getAllUsersGroup(ctx: Context) {
  const channelId = ctx.req.param("channelId");

  if (!channelId) {
    return ctx.json({ error: "Channel ID is required" }, 400);
  }
  const usersData = await ChannelModel.find({ channelId: channelId });

  if (!usersData || usersData.length === 0) {
    return ctx.json({ error: "No users found for this channel" }, 404);
  }

  return ctx.json(usersData);
}

export async function getUserByDiscoveryCode(ctx: Context) {
  const discoveryCode = ctx.req.param("discoveryCode");

  if (!discoveryCode) {
    return ctx.json({ error: "Discovery code is required" }, 400);
  }

  const userData = await UserModel.findOne({ discoveryCode: discoveryCode });

  if (!userData) {
    return ctx.json({ error: "User not found" }, 404);
  }

  return ctx.json(userData);
}
