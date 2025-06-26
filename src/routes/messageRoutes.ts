import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { 
  sendMessage, 
  getMessages, 
  updateMessageStatus 
} from '../controllers/messageController';

const messageRouter = new Hono();

// Apply JWT middleware to all routes
messageRouter.use('*', authMiddleware);

// Send a new message
messageRouter.post('/v1/messages', sendMessage);

// Get messages for a channel with pagination
messageRouter.get('/v1/messages/:channelId', getMessages);

// Update message status (delivered, read)
messageRouter.patch('/v1/messages/:messageId/status', updateMessageStatus);

export default messageRouter; 