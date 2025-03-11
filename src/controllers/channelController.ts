import { Context } from "hono";
import { Channel } from "../models/channelModel";

export async function createChannel(ctx: Context) {
  const { name, description } = await ctx.req.json();
  const channel = await Channel.create({ name, description });
  return ctx.json({ message: "Channel created", channel }, 201);
}

export async function getAllChannels(ctx: Context) {
  const channels = await Channel.find({});
  return ctx.json(channels);
}
