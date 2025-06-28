import { createLogger } from '../utils/logger';
import { getIO } from '../websocket/socketServer';
import { MessageModel, IMessage } from '../models/messageModel';
import { ChannelModel, IChannel } from '../models/channelModel';
import { UserModel } from '../models/userModel';
import { messagesSent, messagesReceived, messageProcessingTime, channelMembers } from '../middleware/metrics';

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
      
      // Initialize channel metrics
      await this.initializeChannelMetrics();
      
      logger.info('Message flow handler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize message flow handler:', error);
      throw error;
    }
  }
  
  /**
   * Initialize channel metrics by loading current channel member counts
   */
  private async initializeChannelMetrics(): Promise<void> {
    try {
      const channels = await ChannelModel.find({});
      
      for (const channel of channels) {
        channelMembers.set({ channel_id: channel._id.toString() }, channel.participants.length);
      }
      
      logger.debug(`Initialized metrics for ${channels.length} channels`);
    } catch (error) {
      logger.warn('Failed to initialize channel metrics:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Process an incoming message from WebSocket
   * This is the main entry point for the message flow
   */
  async processIncomingMessage(message: IncomingMessage): Promise<ProcessedMessage> {
    const startTime = performance.now();
    
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
      
      // Increment messages received counter (successfully processed)
      messagesReceived.inc({ channel_id: message.channelId });
      
      // Record processing time
      const processingTime = (performance.now() - startTime) / 1000; // Convert to seconds
      messageProcessingTime.observe({ operation: 'process' }, processingTime);
      
      logger.debug('Message processed successfully', { messageUUID });
      return processedMessage;

    } catch (error) {
      logger.error('Failed to process incoming message:', error);
      
      // Record processing time for failed messages too
      const processingTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'process_failed' }, processingTime);
      
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
    const startTime = performance.now();
    
    try {
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
      // Since we're now using userUUID as the senderId, we need to find the user in the participants
      // First, check if the senderId is a valid UUID format
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUUID = uuidPattern.test(message.senderId);
      
      // For UUID-based identification, we need to check against the userUUID field
      if (isUUID) {
        // Find the user in the channel participants
        const user = await UserModel.findOne({ userUUID: message.senderId });
        if (!user) {
          throw new Error(`User with UUID ${message.senderId} not found`);
        }
        
        // Check if the user is a participant in the channel
        const isParticipant = channel.participants.some(participantId => {
          // Convert both to strings for comparison
          const participantIdStr = participantId.toString();
          const userIdStr = user._id ? user._id.toString() : '';
          return participantIdStr === userIdStr || participantIdStr === message.senderId;
        });
        
        if (!isParticipant) {
          throw new Error(`User ${message.senderId} is not a member of channel ${message.channelId}`);
        }
      } else {
        // Fallback for legacy random IDs (temporary during migration)
      const senderIdStr = message.senderId.toString();
      const participantStrings = channel.participants.map(p => p.toString());
      
      if (!participantStrings.includes(senderIdStr)) {
        throw new Error(`User ${message.senderId} is not a member of channel ${message.channelId}`);
        }
      }

      // Validate content length (prevent spam)
      if (message.content.length > 4096) { // 4KB limit
        throw new Error('Message content too long');
      }

      logger.debug('Message validation passed', { 
        channelId: message.channelId, 
        senderId: message.senderId 
      });
      
      // Record validation time
      const validationTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'validate' }, validationTime);
    } catch (error) {
      // Record validation time for failures too
      const validationTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'validate_failed' }, validationTime);
      throw error;
    }
  }

  /**
   * Store message in MongoDB
   */
  private async storeInDatabase(message: ProcessedMessage): Promise<void> {
    const startTime = performance.now();
    
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
      
      // Record database storage time
      const dbTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'db_store' }, dbTime);

    } catch (error) {
      // Record database failure time
      const dbTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'db_store_failed' }, dbTime);
      
      logger.error('Failed to store message in database:', error);
      throw new Error(`Database storage failed: ${error}`);
    }
  }

  /**
   * Broadcast message to channel subscribers via WebSocket
   */
  private async broadcastToChannel(message: ProcessedMessage): Promise<void> {
    const startTime = performance.now();
    
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
      
      // Increment messages sent counter for broadcasting
      messagesSent.inc({
        channel_id: message.channelId,
        encrypted: message.encryptedContent ? 'true' : 'false'
      });

      logger.debug('Message broadcast to channel', { 
        messageUUID: message.messageUUID,
        channelRoom,
        channelId: message.channelId 
      });
      
      // Record broadcast time
      const broadcastTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'broadcast' }, broadcastTime);

    } catch (error) {
      // Record broadcast failure time
      const broadcastTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'broadcast_failed' }, broadcastTime);
      
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
      
      // Check all sockets for a matching userId (which is now the userUUID)
      const senderSocket = sockets.find(socket => {
        // Direct match with UUID
        if (socket.data.userId === message.senderId) {
          return true;
        }
        
        // No match found
        return false;
      });

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
    const startTime = performance.now();
    
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
      
      // Record status update time
      const updateTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'status_update' }, updateTime);

    } catch (error) {
      // Record status update failure time
      const updateTime = (performance.now() - startTime) / 1000;
      messageProcessingTime.observe({ operation: 'status_update_failed' }, updateTime);
      
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