import { Context } from "hono";
import { MessageModel, IMessage } from "../models/messageModel";
import { sendMessage } from "../services/rabbitMQ/chatPublisher";
import { Schema, Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ChannelModel } from "../models/channelModel";
import { decodeJwt } from "../utils/jwt";
import { getCookie } from "hono/cookie";

const messageSchema = z.object({
  channelId: z.string(),
  ciphertext: z.string()
});

export const createMessage = async (ctx: Context) => {
  try {
    const body = await ctx.req.json();
    const validatedData = messageSchema.parse(body);
    
    const token = await getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Authentication required" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: Schema.Types.UUID };
    if (!payload) {
      return ctx.json({ error: "Invalid token" }, 401);
    }

    const messageData = {
      messageUUID: uuidv4() as unknown as Schema.Types.UUID,
      senderUUID: payload.userUUID,
      channelId: new Types.ObjectId(validatedData.channelId),
      ciphertext: validatedData.ciphertext,
      createdAt: new Date()
    };

    const savedMessage = await MessageModel.create(messageData);
    await sendMessage(savedMessage);

    return ctx.json(
      {
        message: "Message created and published successfully",
        data: savedMessage,
      },
      201
    );
  } catch (err) {
    console.error("[createMessage] Error:", err);
    if (err instanceof z.ZodError) {
      return ctx.json({ error: "Invalid message format", details: err.issues }, 400);
    }
    return ctx.json({ error: "Internal Server Error" }, 500);
  }
};

export const getMessages = async (ctx: Context) => {
  try {
    const channelId = ctx.req.query("channelId");
    if (!channelId) {
      return ctx.json({ error: "channelId is required" }, 400);
    }

    const token = await getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Authentication required" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: Schema.Types.UUID };
    if (!payload) {
      return ctx.json({ error: "Invalid token" }, 401);
    }

    // Verify user is a participant in the channel
    const channel = await ChannelModel.findById(channelId);
    if (!channel || !channel.participants.includes(payload.userUUID)) {
      return ctx.json({ error: "Not authorized to access this channel" }, 403);
    }

    const messages = await MessageModel.find({ channelId })
      .sort({ createdAt: 1 })
      .limit(50);

    return ctx.json({ data: messages }, 200);
  } catch (err) {
    console.error("[getMessages] Error:", err);
    return ctx.json({ error: "Internal Server Error" }, 500);
  }
};
