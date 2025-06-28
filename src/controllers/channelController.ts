import { Context } from "hono";
import { ChannelModel } from "../models/channelModel";
import { MessageModel } from "../models/messageModel";
import { discoveryCodeToUUID } from "../utils/dicoveryCode";
import { decodeJwt } from "../utils/jwt";
import { Schema, Types } from "mongoose";
import { z } from "zod";
import { UserModel } from "../models/userModel";
import { getCookie } from "hono/cookie";

// Validation schemas
const createChannelSchema = z.object({
  type: z.enum(["group", "private"]),
  participantsDiscoveryCodes: z.array(z.string()).optional(),
  groupName: z.string().optional(),
  groupDescription: z.string().optional(),
  recipientUUID: z.string().optional(), // For direct channels with UUID
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

    const token = getCookie(ctx, "token");
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
    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Check if we should include archived channels
    const includeArchived = ctx.req.query("includeArchived") === "true";
    
    // Build the query
    const query: any = {
      participants: userUUID as unknown as Schema.Types.UUID
    };
    
    // By default, only show active channels
    if (!includeArchived) {
      query.status = "active";
    }

    // Get channels without populate first
    const channels = await ChannelModel.find(query).sort({ updatedAt: -1 });

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

    const token = getCookie(ctx, "token");
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

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Find the channel and check if user has permission
    const channel = await ChannelModel.findOne({
      _id: channelId,
      participants: userUUID as unknown as Schema.Types.UUID
    });

    if (!channel) {
      return ctx.json({ error: "Channel not found or access denied" }, 404);
    }

    // For group channels, only admins can update
    if (channel.type === "group") {
      const userUUIDString = userUUID.toString();
      const isAdmin = channel.groupInfo?.groupAdmins.some(
        admin => admin.toString() === userUUIDString
      );
      
      if (!isAdmin) {
        return ctx.json({ error: "Only admins can update the channel" }, 403);
      }
    } else {
      // For private channels, we don't allow updates to name/description
      return ctx.json({ error: "Private channels cannot be updated" }, 400);
    }

    // Validate the request body
    const body = await ctx.req.json();
    const validatedData = updateChannelSchema.parse(body);

    // Update the channel - we already know it's a group channel from the check above
    if (channel.type === "group" && channel.groupInfo) {
      if (validatedData.groupName) {
        channel.groupInfo.groupName = validatedData.groupName;
      }
      
      if (validatedData.groupDescription) {
        channel.groupInfo.groupDescription = validatedData.groupDescription;
      }

      await channel.save();
    } else {
      return ctx.json({ error: "Cannot update channel: missing group info" }, 400);
    }

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

    return ctx.json({ message: "Channel updated successfully", channel: populatedChannel });
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

    const token = getCookie(ctx, "token");
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

export async function archiveChannel(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    if (!channelId) {
      return ctx.json({ error: "Channel ID is required" }, 400);
    }

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Find the channel and check if user has permission
    const channel = await ChannelModel.findOne({
      _id: channelId,
      participants: userUUID as unknown as Schema.Types.UUID
    });

    if (!channel) {
      return ctx.json({ error: "Channel not found or access denied" }, 404);
    }

    // For group channels, only admins can archive
    if (channel.type === "group") {
      const userUUIDString = userUUID.toString();
      const isAdmin = channel.groupInfo?.groupAdmins.some(
        admin => admin.toString() === userUUIDString
      );
      
      if (!isAdmin) {
        return ctx.json({ error: "Only admins can archive the channel" }, 403);
      }
    } else {
      // For private channels, any participant can archive
      // This only affects their view, as private channels are user-specific
    }

    // Update the channel status to archived
    channel.status = "archived";
    await channel.save();

    return ctx.json({ message: "Channel archived successfully" });
  } catch (error) {
    console.error("Error archiving channel:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

/**
 * Add a member to a channel using discovery code
 */
export async function addMemberToChannel(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    if (!channelId) {
      return ctx.json({ error: "Channel ID is required" }, 400);
    }

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Validate request body
    const addMemberSchema = z.object({
      discoveryCode: z.string()
    });

    const result = addMemberSchema.safeParse(await ctx.req.json());
    if (!result.success) {
      return ctx.json({ error: "Invalid request body", details: result.error.format() }, 400);
    }

    const { discoveryCode } = result.data;

    // Convert discovery code to UUID
    let memberUUID;
    try {
      memberUUID = await discoveryCodeToUUID(discoveryCode);
      if (!memberUUID) {
        return ctx.json({ error: "Invalid discovery code" }, 400);
      }
    } catch (error) {
      return ctx.json({ error: "Failed to resolve discovery code" }, 400);
    }

    // Find the channel
    const channel = await ChannelModel.findById(channelId);
    if (!channel) {
      return ctx.json({ error: "Channel not found" }, 404);
    }

    // Check if user is authorized to add members
    if (channel.type === "group") {
      // For group channels, check if the user is an admin
      const isAdmin = channel.groupInfo?.groupAdmins.some(
        admin => admin.toString() === userUUID.toString()
      );

      if (!isAdmin) {
        return ctx.json({ error: "Only group admins can add members" }, 403);
      }
    } else {
      // For private channels, only participants can add members
      const isParticipant = channel.participants.some(
        participant => participant.toString() === userUUID.toString()
      );

      if (!isParticipant) {
        return ctx.json({ error: "You are not a member of this channel" }, 403);
      }
    }

    // Check if user is already a member
    const isAlreadyMember = channel.participants.some(
      participant => participant.toString() === memberUUID.toString()
    );

    if (isAlreadyMember) {
      return ctx.json({ error: "User is already a member of this channel" }, 400);
    }

    // Add the user to the channel
    channel.participants.push(memberUUID as unknown as any);
    await channel.save();

    // Return success with updated channel
    const updatedChannel = await ChannelModel.findById(channelId)
      .populate("participants", "username discoveryCode")
      .populate("groupInfo.groupAdmins", "username discoveryCode");

    return ctx.json({
      message: "Member added successfully",
      channel: updatedChannel
    });
  } catch (error) {
    console.error("Error adding member to channel:", error);
    return ctx.json({ error: "Failed to add member to channel" }, 500);
  }
}

/**
 * Remove a member from a channel
 */
export async function removeMemberFromChannel(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    const memberId = ctx.req.param("memberId");
    
    if (!channelId || !memberId) {
      return ctx.json({ error: "Channel ID and Member ID are required" }, 400);
    }

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Find the channel
    const channel = await ChannelModel.findById(channelId);
    if (!channel) {
      return ctx.json({ error: "Channel not found" }, 404);
    }

    // Check if the target member is in the channel
    const isMember = channel.participants.some(
      participant => participant.toString() === memberId
    );

    if (!isMember) {
      return ctx.json({ error: "User is not a member of this channel" }, 400);
    }

    // Check authorization
    if (channel.type === "group") {
      // For group channels, check if the user is an admin or removing themselves
      const isAdmin = channel.groupInfo?.groupAdmins.some(
        admin => admin.toString() === userUUID.toString()
      );
      const isSelfRemoval = userUUID.toString() === memberId;

      if (!isAdmin && !isSelfRemoval) {
        return ctx.json({ error: "Only group admins can remove members" }, 403);
      }

      // Check if trying to remove the last admin
      if (isAdmin && memberId === userUUID.toString()) {
        const adminCount = channel.groupInfo?.groupAdmins.length || 0;
        if (adminCount <= 1) {
          return ctx.json({ error: "Cannot remove the last admin from the group" }, 400);
        }
      }
    } else {
      // For private channels, only the user themselves can leave
      if (userUUID.toString() !== memberId) {
        return ctx.json({ error: "You can only remove yourself from private channels" }, 403);
      }
    }

    // Remove the member from participants
    channel.participants = channel.participants.filter(
      participant => participant.toString() !== memberId
    );

    // If it's a group channel and the member is an admin, remove from admins too
    if (channel.type === "group" && channel.groupInfo) {
      channel.groupInfo.groupAdmins = channel.groupInfo.groupAdmins.filter(
        admin => admin.toString() !== memberId
      );
    }

    // If no participants left, delete the channel
    if (channel.participants.length === 0) {
      await ChannelModel.findByIdAndDelete(channelId);
      return ctx.json({ message: "Channel deleted as it has no members left" });
    }

    // Save the updated channel
    await channel.save();

    // Return success with updated channel
    const updatedChannel = await ChannelModel.findById(channelId)
      .populate("participants", "username discoveryCode")
      .populate("groupInfo.groupAdmins", "username discoveryCode");

    return ctx.json({
      message: "Member removed successfully",
      channel: updatedChannel
    });
  } catch (error) {
    console.error("Error removing member from channel:", error);
    return ctx.json({ error: "Failed to remove member from channel" }, 500);
  }
}

/**
 * Promote a member to admin in a group channel
 */
export async function promoteToAdmin(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    const memberId = ctx.req.param("memberId");
    
    if (!channelId || !memberId) {
      return ctx.json({ error: "Channel ID and Member ID are required" }, 400);
    }

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Find the channel
    const channel = await ChannelModel.findById(channelId);
    if (!channel) {
      return ctx.json({ error: "Channel not found" }, 404);
    }

    // Check if this is a group channel
    if (channel.type !== "group") {
      return ctx.json({ error: "Admin roles only exist in group channels" }, 400);
    }

    // Check if the requesting user is an admin
    const isAdmin = channel.groupInfo?.groupAdmins.some(
      admin => admin.toString() === userUUID.toString()
    );

    if (!isAdmin) {
      return ctx.json({ error: "Only admins can promote members to admin" }, 403);
    }

    // Check if the target member is in the channel
    const isMember = channel.participants.some(
      participant => participant.toString() === memberId
    );

    if (!isMember) {
      return ctx.json({ error: "User is not a member of this channel" }, 400);
    }

    // Check if the member is already an admin
    const isAlreadyAdmin = channel.groupInfo?.groupAdmins.some(
      admin => admin.toString() === memberId
    );

    if (isAlreadyAdmin) {
      return ctx.json({ error: "User is already an admin" }, 400);
    }

    // Add the member to admins
    if (channel.groupInfo) {
      channel.groupInfo.groupAdmins.push(memberId as any);
    }

    // Save the updated channel
    await channel.save();

    // Return success with updated channel
    const updatedChannel = await ChannelModel.findById(channelId)
      .populate("participants", "username discoveryCode")
      .populate("groupInfo.groupAdmins", "username discoveryCode");

    return ctx.json({
      message: "Member promoted to admin successfully",
      channel: updatedChannel
    });
  } catch (error) {
    console.error("Error promoting member to admin:", error);
    return ctx.json({ error: "Failed to promote member to admin" }, 500);
  }
}

/**
 * Demote an admin to a regular member in a group channel
 */
export async function demoteFromAdmin(ctx: Context) {
  try {
    const channelId = ctx.req.param("channelId");
    const memberId = ctx.req.param("memberId");
    
    if (!channelId || !memberId) {
      return ctx.json({ error: "Channel ID and Member ID are required" }, 400);
    }

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Find the channel
    const channel = await ChannelModel.findById(channelId);
    if (!channel) {
      return ctx.json({ error: "Channel not found" }, 404);
    }

    // Check if this is a group channel
    if (channel.type !== "group") {
      return ctx.json({ error: "Admin roles only exist in group channels" }, 400);
    }

    // Check if the requesting user is an admin
    const isAdmin = channel.groupInfo?.groupAdmins.some(
      admin => admin.toString() === userUUID.toString()
    );

    if (!isAdmin) {
      return ctx.json({ error: "Only admins can demote other admins" }, 403);
    }

    // Check if the target member is an admin
    const isTargetAdmin = channel.groupInfo?.groupAdmins.some(
      admin => admin.toString() === memberId
    );

    if (!isTargetAdmin) {
      return ctx.json({ error: "User is not an admin" }, 400);
    }

    // Check if trying to demote the last admin
    if (channel.groupInfo?.groupAdmins.length === 1) {
      return ctx.json({ error: "Cannot demote the last admin of the group" }, 400);
    }

    // Remove the member from admins
    if (channel.groupInfo) {
      channel.groupInfo.groupAdmins = channel.groupInfo.groupAdmins.filter(
        admin => admin.toString() !== memberId
      );
    }

    // Save the updated channel
    await channel.save();

    // Return success with updated channel
    const updatedChannel = await ChannelModel.findById(channelId)
      .populate("participants", "username discoveryCode")
      .populate("groupInfo.groupAdmins", "username discoveryCode");

    return ctx.json({
      message: "Admin demoted to member successfully",
      channel: updatedChannel
    });
  } catch (error) {
    console.error("Error demoting admin to member:", error);
    return ctx.json({ error: "Failed to demote admin to member" }, 500);
  }
}
