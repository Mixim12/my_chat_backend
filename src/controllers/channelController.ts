import { Context } from "hono";
import { ChannelModel } from "../models/channelModel";
import { MessageModel } from "../models/messageModel";
import { discoveryCodeToUUID } from "../utils/dicoveryCode";
import { decodeJwt } from "../utils/jwt";
import { Schema, Types } from "mongoose";
import { z } from "zod";
import { UserModel } from "../models/userModel";
import { getTokenFromRequest } from "../utils/auth";

// Validation schemas
const createChannelSchema = z.object({
  type: z.enum(["group", "private"]),
  participantsDiscoveryCodes: z.array(z.string()).optional(),
  groupName: z.string().optional(),
  groupDescription: z.string().optional(),
  recipientUUID: z.string().uuid().optional(), // For direct channels with UUID
  recipientDiscoveryCode: z.string().optional() // For direct channels with discovery code
});

const updateChannelSchema = z.object({
  groupName: z.string().optional(),
  groupDescription: z.string().optional()
});

export async function createChannel(ctx: Context) {
  try {
    const body = await ctx.req.json();
    const validatedData = createChannelSchema.parse(body);

    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    let participants: Schema.Types.UUID[] = [userUUID as unknown as Schema.Types.UUID];

    if (validatedData.type === "private") {
      // For direct/private channels, add the recipient
      if (validatedData.recipientUUID) {
        participants.push(new Types.UUID(validatedData.recipientUUID) as unknown as Schema.Types.UUID);
      } else if (validatedData.recipientDiscoveryCode) {
        // Transform discovery code to UUID
        const recipientUUID = await discoveryCodeToUUID(validatedData.recipientDiscoveryCode);
        participants.push(recipientUUID);
      } else if (validatedData.participantsDiscoveryCodes && validatedData.participantsDiscoveryCodes.length > 0) {
        const recipientUUIDs = await Promise.all(
          validatedData.participantsDiscoveryCodes.map(code => discoveryCodeToUUID(code))
        );
        participants.push(...recipientUUIDs);
      } else {
        return ctx.json({ error: "Recipient is required for private channels (provide recipientUUID, recipientDiscoveryCode, or participantsDiscoveryCodes)" }, 400);
      }

      // Check if private channel already exists
      const existingChannel = await ChannelModel.findOne({
        type: "private",
        participants: { $all: participants, $size: participants.length }
      });

      if (existingChannel) {
        // Populate the existing channel with user details before returning
        const participantDetails = await Promise.all(
          existingChannel.participants.map(async (participantUUID) => {
            const user = await UserModel.findOne({ userUUID: participantUUID })
              .select('username discoveryCode userUUID');
            return user;
          })
        );

        // Filter out any null users
        const validParticipants = participantDetails.filter(user => user !== null);
        
        const populatedExistingChannel = {
          ...existingChannel.toObject(),
          participants: validParticipants
        };

        return ctx.json({ 
          message: "Channel already exists", 
          channel: populatedExistingChannel 
        }, 200);
      }
    } else if (validatedData.type === "group") {
      if (!validatedData.groupName || !validatedData.groupDescription) {
        return ctx.json({ error: "Group name and description are required" }, 400);
      }

      if (validatedData.participantsDiscoveryCodes) {
        const participantUUIDs = await Promise.all(
          validatedData.participantsDiscoveryCodes.map(code => discoveryCodeToUUID(code))
        );
        participants.push(...participantUUIDs);
      }
    }

    const channelData: any = {
      type: validatedData.type,
      participants,
    };

    if (validatedData.type === "group") {
      channelData.groupInfo = {
        groupName: validatedData.groupName,
        groupDescription: validatedData.groupDescription,
        groupAdmins: [userUUID as unknown as Schema.Types.UUID],
      };
    }

    const channel = await ChannelModel.create(channelData);
    
    // Populate the channel with user details before returning
    const participantDetails = await Promise.all(
      channel.participants.map(async (participantUUID) => {
        const user = await UserModel.findOne({ userUUID: participantUUID })
          .select('username discoveryCode userUUID');
        return user;
      })
    );

    // Filter out any null users
    const validParticipants = participantDetails.filter(user => user !== null);
    
    const populatedChannel = {
      ...channel.toObject(),
      participants: validParticipants
    };

    return ctx.json({ message: "Channel created successfully", channel: populatedChannel }, 201);
  } catch (error) {
    console.error("Error creating channel:", error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: "Invalid request data", details: error.issues }, 400);
    }
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function getChannels(ctx: Context) {
  try {
    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Get channels without populate first
    const channels = await ChannelModel.find({
      participants: userUUID as unknown as Schema.Types.UUID
    }).sort({ updatedAt: -1 });

    // Manually populate participants by finding users with matching userUUIDs
    const populatedChannels = await Promise.all(
      channels.map(async (channel) => {
        // Get user details for each participant UUID
        const participantDetails = await Promise.all(
          channel.participants.map(async (participantUUID) => {
            const user = await UserModel.findOne({ userUUID: participantUUID })
              .select('username discoveryCode userUUID');
            return user;
          })
        );

        // Filter out any null users and convert to plain object
        const validParticipants = participantDetails.filter(user => user !== null);
        
        // Get the latest message for this channel
        const latestMessage = await MessageModel.findOne({ 
          channelId: channel._id 
        })
          .sort({ createdAt: -1 })
          .select('senderUUID ciphertext createdAt status')
          .lean();

        // Get sender details for the latest message
        let latestMessageWithSender = null;
        if (latestMessage) {
          const sender = await UserModel.findOne({ userUUID: latestMessage.senderUUID })
            .select('username userUUID')
            .lean();
          
          latestMessageWithSender = {
            id: latestMessage._id,
            senderUUID: latestMessage.senderUUID,
            senderUsername: sender?.username || 'Unknown User',
            ciphertext: latestMessage.ciphertext,
            timestamp: latestMessage.createdAt,
            status: latestMessage.status,
            // Note: We don't decrypt here for performance and security reasons
            // The frontend will handle decryption when needed
          };
        }
        
        return {
          ...channel.toObject(),
          participants: validParticipants,
          lastMessage: latestMessageWithSender,
          // Add a sortKey for proper ordering
          lastActivityTime: latestMessage ? latestMessage.createdAt : channel.createdAt
        };
      })
    );

    // Sort channels by most recent activity (latest message or channel creation)
    populatedChannels.sort((a, b) => {
      const timeA = a.lastActivityTime ? new Date(a.lastActivityTime).getTime() : 0;
      const timeB = b.lastActivityTime ? new Date(b.lastActivityTime).getTime() : 0;
      return timeB - timeA; // Most recent first
    });

    // Remove the temporary sortKey before returning
    const finalChannels = populatedChannels.map(channel => {
      const { lastActivityTime, ...channelWithoutSortKey } = channel;
      return channelWithoutSortKey;
    });

    return ctx.json({ channels: finalChannels });
  } catch (error) {
    console.error("Error getting channels:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function getChannelById(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    if (!channelId) {
      return ctx.json({ error: "Channel ID is required" }, 400);
    }

    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    const channel = await ChannelModel.findOne({
      _id: channelId,
      participants: userUUID as unknown as Schema.Types.UUID
    });

    if (!channel) {
      return ctx.json({ error: "Channel not found or access denied" }, 404);
    }

    // Manually populate participants
    const participantDetails = await Promise.all(
      channel.participants.map(async (participantUUID) => {
        const user = await UserModel.findOne({ userUUID: participantUUID })
          .select('username discoveryCode userUUID');
        return user;
      })
    );

    // Filter out any null users
    const validParticipants = participantDetails.filter(user => user !== null);
    
    const populatedChannel = {
      ...channel.toObject(),
      participants: validParticipants
    };

    return ctx.json({ channel: populatedChannel });
  } catch (error) {
    console.error("Error getting channel:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function updateChannel(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    if (!channelId) {
      return ctx.json({ error: "Channel ID is required" }, 400);
    }

    const body = await ctx.req.json();
    const validatedData = updateChannelSchema.parse(body);

    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    const channel = await ChannelModel.findOne({
      _id: channelId,
      participants: userUUID as unknown as Schema.Types.UUID
    });

    if (!channel) {
      return ctx.json({ error: "Channel not found or access denied" }, 404);
    }

    // Only allow updates to group channels
    if (channel.type !== "group") {
      return ctx.json({ error: "Only group channels can be updated" }, 400);
    }

    // Check if user is admin (convert to string for comparison)
    const userUUIDString = userUUID.toString();
    const isAdmin = channel.groupInfo?.groupAdmins.some(admin => admin.toString() === userUUIDString);
    
    if (!isAdmin) {
      return ctx.json({ error: "Only admins can update the channel" }, 403);
    }

    // Update channel
    if (validatedData.groupName && channel.groupInfo) {
      channel.groupInfo.groupName = validatedData.groupName;
    }
    if (validatedData.groupDescription && channel.groupInfo) {
      channel.groupInfo.groupDescription = validatedData.groupDescription;
    }

    await channel.save();

    return ctx.json({ message: "Channel updated successfully", channel });
  } catch (error) {
    console.error("Error updating channel:", error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: "Invalid request data", details: error.issues }, 400);
    }
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function deleteChannel(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    if (!channelId) {
      return ctx.json({ error: "Channel ID is required" }, 400);
    }

    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    const channel = await ChannelModel.findOne({
      _id: channelId,
      participants: userUUID as unknown as Schema.Types.UUID
    });

    if (!channel) {
      return ctx.json({ error: "Channel not found or access denied" }, 404);
    }

    // Only allow deletion of group channels by admins
    if (channel.type === "group") {
      const userUUIDString = userUUID.toString();
      const isAdmin = channel.groupInfo?.groupAdmins.some(admin => admin.toString() === userUUIDString);
      
      if (!isAdmin) {
        return ctx.json({ error: "Only admins can delete the channel" }, 403);
      }
    }

    await ChannelModel.findByIdAndDelete(channelId);

    return ctx.json({ message: "Channel deleted successfully" });
  } catch (error) {
    console.error("Error deleting channel:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}
