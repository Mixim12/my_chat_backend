import { SessionCipher, MessageType } from 'libsignal-protocol-typescript';
import { Context } from 'hono';
import { z } from 'zod';
import { getSession } from './session';
import { Schema } from 'mongoose';
import { getCookie } from 'hono/cookie';
import { jwt } from 'hono/jwt';
import { E2EEError, ErrorCodes } from '../utils/errors';
import { E2EEMessage } from '../types/signal';

// Constants
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

// # 4.1 Message Schema
const messageSchema = z.object({
  recipientId: z.string().uuid(),
  message: z.string().max(MAX_MESSAGE_SIZE),
  timestamp: z.number().optional(),
});

// # 4.2 Message Encryption
export const encryptMessage = async (
  session: SessionCipher,
  message: string
): Promise<string> => {
  if (message.length > MAX_MESSAGE_SIZE) {
    throw new E2EEError(
      'Message too large',
      ErrorCodes.MESSAGE_TOO_LARGE,
      { maxSize: MAX_MESSAGE_SIZE }
    );
  }

  try {
    const encoder = new TextEncoder();
    const messageBuffer = encoder.encode(message);
    const arrayBuffer = new ArrayBuffer(messageBuffer.length);
    new Uint8Array(arrayBuffer).set(messageBuffer);
    const ciphertext = await session.encrypt(arrayBuffer);
    return ciphertext.body || '';
  } catch (error) {
    throw new E2EEError(
      'Failed to encrypt message',
      ErrorCodes.INVALID_MESSAGE,
      error
    );
  }
};

// # 4.3 Message Decryption
export const decryptMessage = async (
  session: SessionCipher,
  ciphertext: string
): Promise<string> => {
  try {
    const message: MessageType = {
      type: 1,
      body: ciphertext
    };
    const plaintext = await session.decryptPreKeyWhisperMessage(ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    throw new E2EEError(
      'Failed to decrypt message',
      ErrorCodes.INVALID_MESSAGE,
      error
    );
  }
};

// # 4.4 Hono Middleware for E2EE
export const e2eeMiddleware = async (c: Context, next: () => Promise<void>) => {
  try {
    const body = await c.req.json();
    const validatedMessage = messageSchema.parse(body);

    const token = getCookie(c, 'token');
    if (!token) {
      throw new E2EEError(
        'Authentication required',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const jwtMiddleware = jwt({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    });

    await jwtMiddleware(c, next);
    const payload = c.get('jwtPayload') as { userUUID: Schema.Types.UUID };
    if (!payload) {
      throw new E2EEError(
        'Invalid token',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const session = getSession(payload.userUUID, new Schema.Types.UUID(validatedMessage.recipientId));
    if (!session) {
      throw new E2EEError(
        'No session found',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    c.set('session', session);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new E2EEError(
        'Invalid message format',
        ErrorCodes.INVALID_MESSAGE,
        err.issues
      );
    }
    if (err instanceof E2EEError) {
      throw err;
    }
    throw new E2EEError(
      'Internal Server Error',
      ErrorCodes.INVALID_MESSAGE,
      err
    );
  }
}; 