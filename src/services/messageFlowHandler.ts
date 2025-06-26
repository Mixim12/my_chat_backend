import { createLogger } from '../utils/logger';
import { getIO } from '../websocket/socketServer';
import { MessageModel, IMessage } from '../models/messageModel';
import { ChannelModel, IChannel } from '../models/channelModel';
import { UserModel } from '../models/userModel';

const logger = createLogger('MessageFlow:Handler');

export interface IncomingMessage {
  channelId: string;
  senderId: string;
  content: string;
  messageUUID?: string;
  encryptedContent?: boolean;
}

export interface ProcessedMessage {
  id: string;
  messageUUID: string;
  channelId: string;
  senderId: string;
  content: string;
  encryptedContent: boolean;
  timestamp: number;
  status: 'sent' | 'delivered' | 'failed';
}

/**
 * Message Flow Handler Service
 * Orchestrates the complete message pipeline:
 * WebSocket → Validation → Database → Broadcast (using Socket.IO directly)
 */
class MessageFlowHandler {
  private initialized = false;

  /**
   * Initialize the message flow handler
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('Message flow handler already initialized');
      return;
    }

    try {
      // No RabbitMQ initialization needed - using Socket.IO adapter
      this.initialized = true;
      logger.info('Message flow handler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize message flow handler:', error);
      throw error;
    }
  }

  /**
   * Process an incoming message from WebSocket
   * This is the main entry point for the message flow
   */
  async processIncomingMessage(message: IncomingMessage): Promise<ProcessedMessage> {
    try {
      logger.debug('Processing incoming message', { 
        channelId: message.channelId, 
        senderId: message.senderId,
        messageUUID: message.messageUUID 
      });

      // Step 1: Validate the message
      await this.validateMessage(message);

      // Step 2: Generate message UUID if not provided
      const messageUUID = message.messageUUID || crypto.randomUUID();

      // Step 3: Create standardized message object
      const processedMessage: ProcessedMessage = {
        id: messageUUID,
        messageUUID,
        channelId: message.channelId,
        senderId: message.senderId,
        content: message.content,
        encryptedContent: message.encryptedContent ?? true,
        timestamp: Date.now(),
        status: 'sent'
      };

      // Step 4: Store in database
      await this.storeInDatabase(processedMessage);

      // Step 5: Broadcast to channel subscribers
      await this.broadcastToChannel(processedMessage);

      // Update status to delivered
      processedMessage.status = 'delivered';
      
      logger.debug('Message processed successfully', { messageUUID });
      return processedMessage;

    } catch (error) {
      logger.error('Failed to process incoming message:', error);
      
      // Create failed message object for error handling
      const failedMessage: ProcessedMessage = {
        id: message.messageUUID || crypto.randomUUID(),
        messageUUID: message.messageUUID || crypto.randomUUID(),
        channelId: message.channelId,
        senderId: message.senderId,
        content: message.content,
        encryptedContent: message.encryptedContent ?? true,
        timestamp: Date.now(),
        status: 'failed'
      };

      // Try to notify sender of failure
      try {
        await this.notifyMessageFailure(failedMessage, error as Error);
      } catch (notifyError) {
        logger.error('Failed to notify message failure:', notifyError);
      }

      throw error;
    }
  }

  /**
   * Validate incoming message
   */
  private async validateMessage(message: IncomingMessage): Promise<void> {
    // Check required fields
    if (!message.channelId || !message.senderId || !message.content) {
      throw new Error('Missing required message fields');
    }

    // Validate channel exists and user is a member
    const channel = await ChannelModel.findById(message.channelId);
    if (!channel) {
      throw new Error(`Channel ${message.channelId} not found`);
    }

    // Check if user is a participant in the channel
    // Convert senderId to string for comparison since participants array contains strings
    const senderIdStr = message.senderId.toString();
    const participantStrings = channel.participants.map(p => p.toString());
    
    if (!participantStrings.includes(senderIdStr)) {
      throw new Error(`User ${message.senderId} is not a member of channel ${message.channelId}`);
    }

    // Validate content length (prevent spam)
    if (message.content.length > 4096) { // 4KB limit
      throw new Error('Message content too long');
    }

    logger.debug('Message validation passed', { 
      channelId: message.channelId, 
      senderId: message.senderId 
    });
  }

  /**
   * Store message in MongoDB
   */
  private async storeInDatabase(message: ProcessedMessage): Promise<void> {
    try {
      const messageDoc = await MessageModel.create({
        messageUUID: message.messageUUID,
        senderUUID: message.senderId,
        channelId: message.channelId,
        ciphertext: Buffer.from(message.content), // Content is already encrypted by client
        status: message.status,
        deviceId: 1, // Default device ID
        createdAt: new Date(message.timestamp),
        updatedAt: new Date(message.timestamp)
      });

      logger.debug('Message stored in database', { 
        messageUUID: message.messageUUID,
        documentId: messageDoc._id 
      });

    } catch (error) {
      logger.error('Failed to store message in database:', error);
      throw new Error(`Database storage failed: ${error}`);
    }
  }

  /**
   * Broadcast message to channel subscribers via WebSocket
   */
  private async broadcastToChannel(message: ProcessedMessage): Promise<void> {
    try {
      const io = getIO();
      const channelRoom = `channel:${message.channelId}`;

      // Prepare message for broadcast
      const broadcastMessage = {
        id: message.messageUUID,
        messageUUID: message.messageUUID,
        channelId: message.channelId,
        senderId: message.senderId,
        content: message.content,
        encryptedContent: message.encryptedContent,
        timestamp: message.timestamp,
        status: message.status
      };

      // Broadcast to all clients in the channel room
      io.to(channelRoom).emit('message', broadcastMessage);

      logger.debug('Message broadcast to channel', { 
        messageUUID: message.messageUUID,
        channelRoom,
        channelId: message.channelId 
      });

    } catch (error) {
      logger.error('Failed to broadcast message:', error);
      throw new Error(`Broadcast failed: ${error}`);
    }
  }

  /**
   * Notify sender of message failure
   */
  private async notifyMessageFailure(message: ProcessedMessage, error: Error): Promise<void> {
    try {
      const io = getIO();
      
      // Find the sender's socket connection
      const sockets = await io.fetchSockets();
      const senderSocket = sockets.find(socket => socket.data.userId === message.senderId);

      if (senderSocket) {
        senderSocket.emit('error', `Message failed: ${error.message}`);

        logger.debug('Notified sender of message failure', { 
          senderId: message.senderId,
          messageUUID: message.messageUUID,
          error: error.message 
        });
      }

    } catch (notifyError) {
      logger.error('Failed to notify message failure:', notifyError);
    }
  }

  /**
   * Handle message status updates (read receipts, delivery confirmations)
   */
  async updateMessageStatus(
    messageUUID: string, 
    status: 'delivered' | 'read', 
    userId: string
  ): Promise<void> {
    try {
      // Update in database
      await MessageModel.updateOne(
        { messageUUID },
        { 
          status,
          updatedAt: new Date()
        }
      );

      // Find the message to get the channel ID
      const message = await MessageModel.findOne({ messageUUID });
      if (message) {
        // Broadcast status update to channel via Socket.IO
        const io = getIO();
        io.to(`channel:${message.channelId}`).emit('messageStatus', {
          messageId: messageUUID,
          status,
          updatedBy: userId,
          timestamp: Date.now()
        });
      }

      logger.debug('Message status updated', { 
        messageUUID, 
        status, 
        userId 
      });

    } catch (error) {
      logger.error('Failed to update message status:', error);
      throw error;
    }
  }

  /**
   * Get handler initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Create singleton instance
const messageFlowHandler = new MessageFlowHandler();

export default messageFlowHandler; 