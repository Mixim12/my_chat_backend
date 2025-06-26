import { Server } from 'socket.io';
import { verify } from 'jsonwebtoken';
import messageFlowHandler from '../services/messageFlowHandler';
import config from '../utils/config';
import { createLogger } from '../utils/logger';

const logger = createLogger('WebSocket:Server');

// Define socket types
interface ClientToServerEvents {
  joinChannel: (channelId: string, callback: (success: boolean) => void) => void;
  leaveChannel: (channelId: string, callback: (success: boolean) => void) => void;
  sendMessage: (data: {
    channelId: string;
    content: string;
    encryptedContent?: boolean;
    messageUUID?: string;
  }, callback: (success: boolean, messageId?: string) => void) => void;
  typingStart: (channelId: string) => void;
  typingEnd: (channelId: string) => void;
  userStatus: (status: 'online' | 'offline' | 'away' | 'busy') => void;
  markMessageRead: (data: { messageId: string, channelId: string }, callback: (success: boolean) => void) => void;
  markMessageDelivered: (data: { messageId: string, channelId: string }, callback: (success: boolean) => void) => void;
  test: (callback: (response: any) => void) => void;
}

interface ServerToClientEvents {
  message: (message: any) => void;
  typing: (data: { userId: string; channelId: string; isTyping: boolean }) => void;
  userStatus: (data: { userId: string; status: string; lastSeen?: number }) => void;
  channelUpdate: (data: any) => void;
  messageStatus: (data: { messageId: string; status: string; updatedBy: string; timestamp: any }) => void;
  notification: (data: { level: string; title: string; message: string }) => void;
  error: (error: string) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  userId: string;
  username: string;
  channels: Set<string>;
}

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function initSocketServer(socketIo: Server): void {
  // Store the Socket.IO instance
  io = socketIo as Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  
  logger.info('Initializing Socket.IO server');

  // Initialize message flow handler
  messageFlowHandler.initialize().catch(error => {
    logger.error('Failed to initialize message flow handler:', error);
  });

  // Simple middleware that assigns a default user ID without authentication
  // This is a temporary solution to bypass authentication requirements
  io.use((socket, next) => {
    try {
      // Generate a random user ID for this connection
      const randomUserId = `user-${Math.floor(Math.random() * 10000)}`;
      
      // Set default user data on socket
      socket.data.userId = randomUserId;
      socket.data.username = `User-${randomUserId.substring(5)}`;
      socket.data.channels = new Set();
      
      logger.debug(`Assigned default user ID: ${socket.data.userId} (${socket.data.username})`);
      next();
    } catch (error) {
      logger.error('Socket middleware error:', error);
      next(new Error('Socket middleware error'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.data.userId} (${socket.data.username})`);
    
    // Join channel handler
    socket.on('joinChannel', async (channelId, callback) => {
      try {
        // Add channel to socket data
        socket.data.channels.add(channelId);
        
        // Join socket.io room for this channel
        socket.join(`channel:${channelId}`);
        
        logger.debug(`User ${socket.data.userId} joined channel ${channelId}`);
        callback(true);
      } catch (error) {
        logger.error(`Error joining channel ${channelId}:`, error);
        callback(false);
      }
    });
    
    // Leave channel handler
    socket.on('leaveChannel', async (channelId, callback) => {
      try {
        // Remove channel from socket data
        socket.data.channels.delete(channelId);
        
        // Leave socket.io room
        socket.leave(`channel:${channelId}`);
        
        logger.debug(`User ${socket.data.userId} left channel ${channelId}`);
        callback(true);
      } catch (error) {
        logger.error(`Error leaving channel ${channelId}:`, error);
        callback(false);
      }
    });
    
    // Send message handler - now using the message flow handler
    socket.on('sendMessage', async (data, callback) => {
      try {
        // Validate that user is in the channel
        if (!socket.data.channels.has(data.channelId)) {
          logger.warn(`User ${socket.data.userId} attempted to send message to channel ${data.channelId} without joining`);
          callback(false);
          return;
        }
        
        // Use the message flow handler for processing
        const processedMessage = await messageFlowHandler.processIncomingMessage({
          channelId: data.channelId,
          senderId: socket.data.userId,
          content: data.content,
          messageUUID: data.messageUUID,
          encryptedContent: data.encryptedContent !== false // Default to true
        });
        
        logger.debug(`User ${socket.data.userId} sent message to channel ${data.channelId}`, {
          messageUUID: processedMessage.messageUUID
        });
        
        callback(true, processedMessage.messageUUID);
        
      } catch (error) {
        logger.error('Error processing message:', error);
        callback(false);
      }
    });
    
    // Message status update handlers
    socket.on('markMessageRead', async (data, callback) => {
      try {
        if (socket.data.channels.has(data.channelId)) {
          await messageFlowHandler.updateMessageStatus(
            data.messageId,
            'read',
            socket.data.userId
          );
          
          logger.debug(`User ${socket.data.userId} marked message ${data.messageId} as read`);
          callback(true);
        } else {
          logger.warn(`User ${socket.data.userId} attempted to mark message as read in channel ${data.channelId} without joining`);
          callback(false);
        }
      } catch (error) {
        logger.error('Error marking message as read:', error);
        callback(false);
      }
    });
    
    socket.on('markMessageDelivered', async (data, callback) => {
      try {
        if (socket.data.channels.has(data.channelId)) {
          await messageFlowHandler.updateMessageStatus(
            data.messageId,
            'delivered',
            socket.data.userId
          );
          
          logger.debug(`User ${socket.data.userId} marked message ${data.messageId} as delivered`);
          callback(true);
        } else {
          logger.warn(`User ${socket.data.userId} attempted to mark message as delivered in channel ${data.channelId} without joining`);
          callback(false);
        }
      } catch (error) {
        logger.error('Error marking message as delivered:', error);
        callback(false);
      }
    });
    
    // Typing indicators
    socket.on('typingStart', async (channelId) => {
      try {
        if (socket.data.channels.has(channelId)) {
          // Use Socket.IO rooms to broadcast typing indicators
          socket.to(`channel:${channelId}`).emit('typing', {
            userId: socket.data.userId,
            channelId,
            isTyping: true
          });
          logger.debug(`User ${socket.data.userId} started typing in channel ${channelId}`);
        } else {
          logger.warn(`User ${socket.data.userId} attempted to send typing indicator to channel ${channelId} without joining`);
        }
      } catch (error) {
        logger.error('Error publishing typing indicator:', error);
      }
    });
    
    socket.on('typingEnd', async (channelId) => {
      try {
        if (socket.data.channels.has(channelId)) {
          // Use Socket.IO rooms to broadcast typing indicators
          socket.to(`channel:${channelId}`).emit('typing', {
            userId: socket.data.userId,
            channelId,
            isTyping: false
          });
          logger.debug(`User ${socket.data.userId} stopped typing in channel ${channelId}`);
        } else {
          logger.warn(`User ${socket.data.userId} attempted to send typing indicator to channel ${channelId} without joining`);
        }
      } catch (error) {
        logger.error('Error publishing typing indicator:', error);
      }
    });
    
    // User status updates
    socket.on('userStatus', async (status) => {
      try {
        // Broadcast user status to all connected clients
        socket.broadcast.emit('userStatus', {
          userId: socket.data.userId,
          status
        });
        logger.debug(`User ${socket.data.userId} status changed to ${status}`);
      } catch (error) {
        logger.error('Error publishing user status:', error);
      }
    });
    
    // Test handler for connection testing
    socket.on('test', (callback) => {
      callback({ 
        success: true, 
        message: 'Socket.IO server is working!', 
        userId: socket.data.userId,
        timestamp: Date.now()
      });
    });
    
    // Disconnect handler
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.data.userId} (${socket.data.username})`);
      
      try {
        // Update user status to offline
        socket.broadcast.emit('userStatus', {
          userId: socket.data.userId,
          status: 'offline',
          lastSeen: Date.now()
        });
      } catch (error) {
        logger.error('Error handling disconnect:', error);
      }
    });
  });
  
  logger.info('Socket.IO server initialized successfully');
}

export function getIO(): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  if (!io) {
    throw new Error('Socket.IO server not initialized');
  }
  return io;
} 