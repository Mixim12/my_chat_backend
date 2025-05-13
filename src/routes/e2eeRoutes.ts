import { Hono } from 'hono';
import { Schema } from 'mongoose';
import { authMiddleware } from '../middleware/auth';
import { e2eeMiddleware } from '../middleware/e2ee';
import * as SignalProtocol from 'libsignal-protocol-typescript';
import {
  generateKeys,
  uploadUserKeys,
  getPreKeyBundleForUser,
  establishUserSession,
  encryptUserMessage,
  decryptUserMessage
} from '../controllers/e2eeController';

// Extend Hono's types
declare module 'hono' {
  interface ContextVariableMap {
    userUUID: Schema.Types.UUID;
    session: SignalProtocol.SessionCipher;
  }
}

const e2ee = new Hono();

// # 5.1 Key Generation
e2ee.post('/keys/generate', authMiddleware, generateKeys);

// # 5.2 Key Upload
e2ee.post('/keys/upload', authMiddleware, uploadUserKeys);

// # 5.3 Pre-Key Bundle Retrieval
e2ee.get('/keys/:userUUID', authMiddleware, getPreKeyBundleForUser);

// # 5.4 Session Establishment
e2ee.post('/session', authMiddleware, establishUserSession);

// # 5.5 Message Encryption
e2ee.post('/encrypt', authMiddleware, e2eeMiddleware, encryptUserMessage);

// # 5.6 Message Decryption
e2ee.post('/decrypt', authMiddleware, e2eeMiddleware, decryptUserMessage);

export default e2ee; 