import { Context } from "hono";
import { ChannelModel } from "../models/channelModel";
import { discoveryCodeToUUID } from "../utils/dicoveryCode";
import { decodeJwt } from "../utils/jwt";
import { Schema } from "mongoose";
import { getCookie } from "hono/cookie";

export async function createChannel(ctx: Context) {
  const body = await ctx.req.json();

  const { type } = body;

  const token = await getCookie(ctx, "token");

  if (!token) {
    return ctx.json({ status: "Not authenticated" }, 401);
  }

  const payload = decodeJwt(token) as { userUUID: string };
  const userUUID = new Schema.Types.UUID(payload.userUUID);

  if (type !== "group" && type !== "private") {
    return ctx.json({ error: "Type must be either 'group' or 'private'" }, 400);
  }
  
  let participants: Schema.Types.UUID[] = [];

  const participantsDiscoveryCodes = body.participantsDiscoveryCodes;
  
  participants.push(userUUID);

  participants.push(...(await Promise.all(participantsDiscoveryCodes.map(async (code: string) => await discoveryCodeToUUID(code)))));


  if (type === "group") {
    const { groupName, groupDescription } = body;

    const groupInfo = {
      groupName: groupName,
      groupDescription: groupDescription,
      groupAdmins: [userUUID],
    };

    if (!groupName || !groupDescription ) {
      return ctx.json({ error: "Name and description are required" }, 400);
    }

    const channel = await ChannelModel.create({
      type,
      participants,
      groupInfo,
    });

    return ctx.json({ message: "Channel created successfully", channel }, 201);
  }

  const channel = await ChannelModel.create({
    type,
    participants,
  });

  return ctx.json({ message: "Channel created successfully", channel }, 201);
}
