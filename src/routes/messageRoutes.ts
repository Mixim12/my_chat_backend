import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { sendMessage, getMessages } from '../controllers/messageController';

const messageRouter = new Hono();

// All message routes require authentication
messageRouter.use('/*', authMiddleware);

// Message operations
messageRouter.post('/send', sendMessage);
messageRouter.get('/channel/:channelId', getMessages);

export default messageRouter;
