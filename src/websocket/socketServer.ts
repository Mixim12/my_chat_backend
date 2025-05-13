import http from "http";
import { Server, ExtendedError, Socket } from "socket.io";
import { sendMessage } from "../services/rabbitMQ/chatPublisher";
import { getAmqpChannel, createExclusiveQueue } from "../services/rabbitMQ/rabbitmqService";
import { verifyJwt } from "../utils/jwt";
import { IMessage, MessageModel } from "../models/messageModel";
import { ChannelModel } from "../models/channelModel";
import { UserModel } from "../models/userModel";
import config from "../utils/config";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { Schema } from "mongoose";
import { Channel } from "amqplib";

// Message validation schema
const messageSchema = z.object({
  channelId: z.string(),
  ciphertext: z.string()
});

interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      uuid: string;
      username: string;
    };
  };
}

interface JwtPayload {
  sub: string;  // This will be the userUUID
  username: string;
  iat?: number;
  exp?: number;
}

export async function initSocketServer(app: http.Server) {
  const io = new Server(app, {
    cors: {
      origin: config.cors.origins,
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Initialize RabbitMQ connection
  let rabbitChannel: Channel;
  try {
    rabbitChannel = await getAmqpChannel();
    const queue = await createExclusiveQueue();
    await rabbitChannel.bindQueue(queue, "ws.broadcast", "");
    
    rabbitChannel.consume(queue, (message) => {
      if (!message) return;
      try {
        const data = JSON.parse(message.content.toString());
        io.to(data.channelId).emit("msg", data);
        rabbitChannel.ack(message);
      } catch (error) {
        console.error("Error processing message:", error);
        rabbitChannel.nack(message);
      }
    });
  } catch (error) {
    console.error("Failed to initialize RabbitMQ:", error);
    process.exit(1);
  }

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const payload = await verifyJwt(token) as unknown as JwtPayload;
      if (!payload) {
        return next(new Error("Invalid token"));
      }

      socket.data.user = {
        uuid: payload.sub,
        username: payload.username
      };

      // Update user status to online
      await UserModel.findOneAndUpdate(
        { userUUID: payload.sub as unknown as Schema.Types.UUID },
        { $set: { status: "online" } }
      );

      next();
    } catch (err) {
      console.error("Authentication error:", err);
      next(err as ExtendedError);
    }
  });

  // Connection handling
  io.on("connection", (socket: AuthenticatedSocket) => {
    const userUUID = socket.data.user.uuid;
    console.log(`User connected: ${socket.data.user.username}`);

    // Handle disconnection
    socket.on("disconnect", async () => {
      try {
        await UserModel.findOneAndUpdate(
          { userUUID: userUUID as unknown as Schema.Types.UUID },
          { 
            $set: { 
              status: "offline",
              lastSeen: new Date()
            }
          }
        );
        console.log(`User disconnected: ${socket.data.user.username}`);
      } catch (error) {
        console.error("Error updating user status:", error);
      }
    });

    // Join channel
    socket.on("join", async (channelId: string) => {
      try {
        const channel = await ChannelModel.findById(channelId);
        if (!channel) {
          socket.emit("error", "Channel not found");
          return;
        }

        // Check if user is a participant
        if (!channel.participants.includes(userUUID as unknown as Schema.Types.UUID)) {
          socket.emit("error", "Not authorized to join this channel");
          return;
        }

        socket.join(channelId);
        socket.emit("joined", { channelId, participants: channel.participants });
        
        // Notify others
        socket.to(channelId).emit("user_joined", {
          userUUID,
          username: socket.data.user.username
        });
      } catch (error) {
        console.error("Error joining channel:", error);
        socket.emit("error", "Failed to join channel");
      }
    });

    // Leave channel
    socket.on("leave", (channelId: string) => {
      socket.leave(channelId);
      socket.to(channelId).emit("user_left", {
        userUUID,
        username: socket.data.user.username
      });
    });

    // Handle messages
    socket.on("msg", async (payload) => {
      try {
        // Validate message format
        const validatedPayload = messageSchema.parse(payload);
        
        // Create message object
        const messageData = {
          messageUUID: uuidv4() as unknown as Schema.Types.UUID,
          senderUUID: userUUID as unknown as Schema.Types.UUID,
          channelId: new Schema.Types.ObjectId(validatedPayload.channelId),
          ciphertext: validatedPayload.ciphertext,
          createdAt: new Date()
        };

        const message = await MessageModel.create(messageData);

        // Send message through RabbitMQ
        await sendMessage(message);

        // Emit success
        socket.emit("msg_sent", { messageId: message.messageUUID });
      } catch (error) {
        console.error("Error sending message:", error);
        if (error instanceof z.ZodError) {
          socket.emit("error", "Invalid message format");
        } else {
          socket.emit("error", "Failed to send message");
        }
      }
    });

    // Handle typing indicator
    socket.on("typing", (channelId: string) => {
      socket.to(channelId).emit("user_typing", {
        userUUID,
        username: socket.data.user.username
      });
    });

    // Handle read receipts
    socket.on("read", (data: { channelId: string; messageId: string }) => {
      socket.to(data.channelId).emit("message_read", {
        userUUID,
        messageId: data.messageId
      });
    });
  });

  // Error handling
  io.on("error", (error) => {
    console.error("Socket.IO error:", error);
  });

  return io;
}
