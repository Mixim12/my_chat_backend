import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { E2EEController } from '../controllers/e2eeController';

const e2eeRouter = new Hono();

// All E2EE routes require authentication
e2eeRouter.use('/*', authMiddleware);

// Key management
e2eeRouter.post('/keys/init', E2EEController.initializeKeys);
e2eeRouter.get('/keys/bundle/:userUUID', E2EEController.getPreKeyBundle);
e2eeRouter.post('/keys/rotate-signed', E2EEController.rotateSignedPreKey);
e2eeRouter.get('/keys/pool-status/:userUUID', E2EEController.getPreKeyPoolStatus);
e2eeRouter.post('/keys/replenish', E2EEController.replenishPreKeys);

// Session management
e2eeRouter.post('/session/establish', E2EEController.establishSession);
e2eeRouter.get('/session/status/:userUUID/:recipientUUID', E2EEController.getSessionStatus);

export default e2eeRouter;
