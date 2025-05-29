import { Context } from 'hono';
import { z } from 'zod';
import { Types } from 'mongoose';
import { MessageModel } from '../models/messageModel';
import { ChannelModel } from '../models/channelModel';
import { MessageEncryptionService } from '../services/signal/messageEncryption';
import { sendMessage as publishToRabbitMQ } from '../services/rabbitMQ/chatPublisher';
import { decodeJwt } from '../utils/jwt';
import { getTokenFromRequest } from '../utils/auth';
import { v4 as uuidv4 } from 'uuid';

// Validation schemas
const sendMessageSchema = z.object({
  channelId: z.string(),
  plaintext: z.string().min(1).max(4096), // Max message length
  recipientUUID: z.string().uuid()
});

const getMessagesSchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 50),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0)
});

/**
 * Send an encrypted message
 */
export async function sendMessage(ctx: Context) {
  try {
    const body = await ctx.req.json();
    const { channelId, plaintext, recipientUUID } = sendMessageSchema.parse(body);

    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: 'Not authenticated' }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const senderUUID = new Types.UUID(payload.userUUID);

    // Verify channel exists and user is a participant
    const channel = await ChannelModel.findById(channelId);
    if (!channel) {
      return ctx.json({ error: 'Channel not found' }, 404);
    }

    if (!channel.participants.includes(senderUUID)) {
      return ctx.json({ error: 'Not authorized to send messages in this channel' }, 403);
    }

    // Verify recipient is in the channel
    const recipientUUIDTyped = new Types.UUID(recipientUUID);
    if (!channel.participants.includes(recipientUUIDTyped)) {
      return ctx.json({ error: 'Recipient is not in this channel' }, 403);
    }

    // Initialize encryption service
    const encryptionService = new MessageEncryptionService(senderUUID);

    // Check if session exists
    const hasSession = await encryptionService.hasSession(recipientUUID);
    if (!hasSession) {
      return ctx.json({ 
        error: 'No E2EE session found. Please establish a session first.',
        code: 'SESSION_NOT_FOUND'
      }, 400);
    }

    // Encrypt the message
    const encryptedMessage = await encryptionService.encryptMessage(
      recipientUUID,
      plaintext
    );

    // Create message record
    const messageData = {
      messageUUID: uuidv4() as unknown as Types.UUID,
      senderUUID,
      channelId: new Types.ObjectId(channelId),
      ciphertext: encryptedMessage.ciphertext,
      messageType: encryptedMessage.messageType,
      registrationId: encryptedMessage.registrationId,
      deviceId: 1, // Default device
      status: 'sent' as const
    };

    const savedMessage = await MessageModel.create(messageData);

    // Publish to RabbitMQ for real-time delivery
    await publishToRabbitMQ(savedMessage);

    return ctx.json({
      message: 'Message sent successfully',
      messageId: savedMessage._id,
      timestamp: savedMessage.createdAt
    }, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid request data', details: error.issues }, 400);
    }
    return ctx.json({ 
      error: 'Failed to send message',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

/**
 * Get messages for a channel (encrypted)
 */
export async function getMessages(ctx: Context) {
  try {
    const channelId = ctx.req.param('channelId');
    const query = getMessagesSchema.parse(ctx.req.query());

    const token = getTokenFromRequest(ctx);
    if (!token) {
      return ctx.json({ error: 'Not authenticated' }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    // Verify channel exists and user is a participant
    const channel = await ChannelModel.findById(channelId);
    if (!channel) {
      return ctx.json({ error: 'Channel not found' }, 404);
    }

    if (!channel.participants.includes(userUUID)) {
      return ctx.json({ error: 'Not authorized to access this channel' }, 403);
    }

    // Get messages (encrypted)
    const messages = await MessageModel.find({ 
      channelId: new Types.ObjectId(channelId)
    })
      .sort({ createdAt: 1 }) // Chronological order is critical for Signal Protocol
      .skip(query.offset)
      .limit(Math.min(query.limit, 100)) // Max 100 messages per request
      .lean();

    // Return encrypted messages - decryption happens on client side
    const formattedMessages = messages.map(message => ({
      id: message._id,
      messageUUID: message.messageUUID,
      senderUUID: message.senderUUID,
      channelId: message.channelId,
      ciphertext: message.ciphertext.toString('base64'), // Base64 encode for JSON
      messageType: message.messageType,
      registrationId: message.registrationId,
      deviceId: message.deviceId,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt
    }));

    return ctx.json({
      messages: formattedMessages,
      count: formattedMessages.length,
      hasMore: formattedMessages.length === query.limit
    }, 200);
  } catch (error) {
    console.error('Error getting messages:', error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid request data', details: error.issues }, 400);
    }
    return ctx.json({ error: 'Failed to get messages' }, 500);
  }
} 