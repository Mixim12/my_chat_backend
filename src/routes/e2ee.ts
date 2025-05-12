import { Hono } from 'hono';
import { z } from 'zod';
import { Schema } from 'mongoose';
import { generateIdentityKeyPair, generatePreKeys, generateSignedPreKey, uploadKeys, getPreKeyBundle } from '../crypto/keys';
import { establishSession, getSession } from '../crypto/session';
import { encryptMessage, decryptMessage, e2eeMiddleware } from '../crypto/ratchet';
import { E2EEError, ErrorCodes } from '../utils/errors';
import { authMiddleware } from '../middleware/authMiddleware';
import * as SignalProtocol from 'libsignal-protocol-typescript';

// Extend Hono's types
declare module 'hono' {
  interface ContextVariableMap {
    userUUID: Schema.Types.UUID;
    session: SignalProtocol.SessionCipher;
  }
}

const e2ee = new Hono();

// Schema for key upload
const keyUploadSchema = z.object({
  identityKey: z.string(),
  signedPreKey: z.object({
    keyId: z.number(),
    publicKey: z.string(),
    signature: z.string(),
  }),
  preKeys: z.array(z.object({
    keyId: z.number(),
    publicKey: z.string(),
  })),
});

// Schema for message
const messageSchema = z.object({
  recipientId: z.string().uuid(),
  message: z.string(),
  timestamp: z.number().optional(),
});

// # 5.1 Key Generation
e2ee.post('/keys/generate', authMiddleware, async (c) => {
  try {
    const identityKey = await generateIdentityKeyPair();
    const preKeys = await generatePreKeys();
    const signedPreKey = await generateSignedPreKey(identityKey);

    return c.json({
      identityKey,
      signedPreKey,
      preKeys,
    });
  } catch (error) {
    if (error instanceof E2EEError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// # 5.2 Key Upload
e2ee.post('/keys/upload', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedKeys = keyUploadSchema.parse(body);
    const userId = c.get('userUUID') as Schema.Types.UUID;

    await uploadKeys(userId, validatedKeys);
    return c.json({ message: 'Keys uploaded successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid key format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// # 5.3 Pre-Key Bundle Retrieval
e2ee.get('/keys/:userId', authMiddleware, async (c) => {
  try {
    const userId = new Schema.Types.UUID(c.req.param('userId'));
    const preKeyBundle = await getPreKeyBundle(userId);
    return c.json(preKeyBundle);
  } catch (error) {
    if (error instanceof E2EEError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// # 5.4 Session Establishment
e2ee.post('/session', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { recipientId } = z.object({ recipientId: z.string().uuid() }).parse(body);
    const userId = c.get('userUUID') as Schema.Types.UUID;

    const session = await establishSession(userId, new Schema.Types.UUID(recipientId), null);
    return c.json({ message: 'Session established successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// # 5.5 Message Encryption
e2ee.post('/encrypt', authMiddleware, e2eeMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedMessage = messageSchema.parse(body);
    const session = c.get('session');

    const ciphertext = await encryptMessage(session, validatedMessage.message);
    return c.json({ ciphertext });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid message format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// # 5.6 Message Decryption
e2ee.post('/decrypt', authMiddleware, e2eeMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { ciphertext } = z.object({ ciphertext: z.string() }).parse(body);
    const session = c.get('session');

    const plaintext = await decryptMessage(session, ciphertext);
    return c.json({ plaintext });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid message format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default e2ee; 