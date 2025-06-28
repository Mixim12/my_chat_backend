import { Context } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { MessageModel } from '../models/messageModel';
import { getIO } from '../websocket/socketServer';
import { HTTP_STATUS } from '../utils/httpStatusCodes';
import { UserModel } from '../models/userModel';
import { ChannelModel } from '../models/channelModel';

// Zod schema for message creation
const sendMessageSchema = z.object({
  channelId: z.string(),  // Accept any string format for MongoDB ObjectId
  content: z.string().min(1),
  encryptedContent: z.boolean().default(true),
});

// Zod schema for message status update
const updateStatusSchema = z.object({
  status: z.enum(['delivered', 'read']),
});

// Zod schema for message pagination
const getMessagesSchema = z.object({
  limit: z.string().transform(Number).default('50'),
  before: z.string().optional(),
  after: z.string().optional(),
});

/**
 * Send a new message
 */
export async function sendMessage(ctx: Context): Promise<Response> {
  try {
    // Get user ID from JWT
    const userUUID = ctx.get('userUUID');
    
    // Parse and validate request body
    const body = await ctx.req.json();
    const { channelId, content, encryptedContent } = sendMessageSchema.parse(body);
    
    // Check if the channel exists
    const channel = await ChannelModel.findOne({ 
      $or: [
        { _id: channelId }
      ]
    });
    
    if (!channel) {
      return ctx.json({ error: 'Channel not found' }, HTTP_STATUS.NOT_FOUND);
    }
    
    // Check if user is a member of the channel
    const isParticipant = channel.participants.includes(userUUID);
    if (!isParticipant) {
      return ctx.json({ error: 'Not a member of this channel' }, HTTP_STATUS.FORBIDDEN);
    }
    
    // Create message with encrypted content
    const messageUUID = uuidv4();
    const message = await MessageModel.create({
      messageUUID,
      senderUUID: userUUID,
      channelId: channel._id,
      ciphertext: Buffer.from(content), // Already encrypted by client
      status: 'sent',
    });
    
    // Use the channel ID as string for the channel identifier
    const channelIdentifier = channel._id.toString();
    
    // Broadcast message to channel via Socket.IO
    const io = getIO();
    io.to(`channel:${channelIdentifier}`).emit('message', {
      id: messageUUID,
      messageUUID,
      channelId: channelIdentifier,
      senderId: userUUID,
      content,
      encryptedContent,
      timestamp: message.createdAt,
      status: 'sent'
    });
    
    return ctx.json({ 
      success: true, 
      message: 'Message sent successfully',
      data: {
        messageId: messageUUID,
        timestamp: message.createdAt,
      }
    }, HTTP_STATUS.CREATED);
    
  } catch (error) {
    console.error('Error sending message:', error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid message data', details: error.issues }, HTTP_STATUS.BAD_REQUEST);
    }
    return ctx.json({ error: 'Failed to send message' }, HTTP_STATUS.SERVER_ERROR);
  }
}

/**
 * Get messages for a channel with pagination
 */
export async function getMessages(ctx: Context): Promise<Response> {
  try {
    // Get user ID from JWT
    const userUUID = ctx.get('userUUID');
    
    // Get channel ID from URL params
    const channelId = ctx.req.param('channelId');
    
    // Parse and validate query parameters
    const query = getMessagesSchema.parse(ctx.req.query());
    const { limit, before, after } = query;
    
    // Check if the channel exists
    const channel = await ChannelModel.findOne({ 
      $or: [
        { _id: channelId }
      ]
    });
    
    if (!channel) {
      return ctx.json({ error: 'Channel not found' }, HTTP_STATUS.NOT_FOUND);
    }
    
    // Check if user is a member of the channel
    const isParticipant = channel.participants.includes(userUUID);
    if (!isParticipant) {
      return ctx.json({ error: 'Not a member of this channel' }, HTTP_STATUS.FORBIDDEN);
    }
    
    // Build query for pagination
    const queryConditions: any = { channelId: channel._id };
    
    // Apply cursor-based pagination
    if (before) {
      const beforeMessage = await MessageModel.findOne({ messageUUID: before });
      if (beforeMessage) {
        queryConditions.createdAt = { $lt: beforeMessage.createdAt };
      }
    } else if (after) {
      const afterMessage = await MessageModel.findOne({ messageUUID: after });
      if (afterMessage) {
        queryConditions.createdAt = { $gt: afterMessage.createdAt };
      }
    }
    
    // Get messages with pagination
    const messages = await MessageModel.find(queryConditions)
      .sort({ createdAt: after ? 1 : -1 }) // Sort by timestamp (desc by default, asc if using 'after')
      .limit(limit)
      .lean();
    
    // If using 'after', reverse the results to maintain chronological order
    if (after) {
      messages.reverse();
    }
    
    // Get sender information for all messages
    const senderUUIDs = [...new Set(messages.map(msg => msg.senderUUID))];
    const senders = await UserModel.find({ userUUID: { $in: senderUUIDs } })
      .select('userUUID username')
      .lean();
    
    // Create a map of sender UUIDs to sender info for quick lookup
    const senderMap = new Map();
    senders.forEach(sender => {
      senderMap.set(sender.userUUID, {
        username: sender.username,
        userUUID: sender.userUUID
      });
    });
    
    // Format messages for response
    const formattedMessages = messages.map(msg => {
      const senderInfo = senderMap.get(msg.senderUUID) || { username: 'Unknown', userUUID: msg.senderUUID };
      return {
        id: msg.messageUUID,
        messageUUID: msg.messageUUID,
        senderUUID: msg.senderUUID,
        channelId: channelId,
        plaintext: msg.ciphertext.toString('base64'), // Frontend expects 'plaintext' field
        messageType: 'encrypted',
        encrypted: true,
        deviceId: 1,
        status: msg.status,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt || msg.createdAt
      };
    });
    
    // Get pagination info
    const hasMore = messages.length === limit;
    const count = formattedMessages.length;
    
    return ctx.json({
      success: true,
      data: {
        messages: formattedMessages,
        count: count,
        hasMore: hasMore,
        encrypted: true
      }
    });
    
  } catch (error) {
    console.error('Error getting messages:', error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid query parameters', details: error.issues }, HTTP_STATUS.BAD_REQUEST);
    }
    return ctx.json({ error: 'Failed to retrieve messages' }, HTTP_STATUS.SERVER_ERROR);
  }
}

/**
 * Update message status (delivered, read)
 */
export async function updateMessageStatus(ctx: Context): Promise<Response> {
  try {
    // Get user ID from JWT
    const userUUID = ctx.get('userUUID');
    
    // Get message ID from URL params
    const messageId = ctx.req.param('messageId');
    
    // Parse and validate request body
    const body = await ctx.req.json();
    const { status } = updateStatusSchema.parse(body);
    
    // Find the message
    const message = await MessageModel.findOne({ messageUUID: messageId });
    
    if (!message) {
      return ctx.json({ error: 'Message not found' }, HTTP_STATUS.NOT_FOUND);
    }
    
    // Check if the channel exists
    const channel = await ChannelModel.findById(message.channelId);
    
    if (!channel) {
      return ctx.json({ error: 'Channel not found' }, HTTP_STATUS.NOT_FOUND);
    }
    
    // Check if user is a member of the channel
    const isParticipant = channel.participants.includes(userUUID);
    if (!isParticipant) {
      return ctx.json({ error: 'Not a member of this channel' }, HTTP_STATUS.FORBIDDEN);
    }
    
    // Only the recipient can update the status
    if (message.senderUUID === userUUID) {
      return ctx.json({ error: 'Cannot update status of your own message' }, HTTP_STATUS.FORBIDDEN);
    }
    
    // Update message status
    message.status = status;
    await message.save();
    
    // Use the channel ID as string for the channel identifier
    const channelIdentifier = channel._id.toString();
    
    // Notify sender about status update via Socket.IO
    const io = getIO();
    io.to(`channel:${channelIdentifier}`).emit('messageStatus', {
      messageId: message.messageUUID.toString(),
      status: status,
      updatedBy: userUUID,
      timestamp: Date.now()
    });
    
    return ctx.json({ 
      success: true, 
      message: `Message status updated to ${status}`,
    });
    
  } catch (error) {
    console.error('Error updating message status:', error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid status data', details: error.issues }, HTTP_STATUS.BAD_REQUEST);
    }
    return ctx.json({ error: 'Failed to update message status' }, HTTP_STATUS.SERVER_ERROR);
  }
}