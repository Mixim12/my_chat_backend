import * as SignalProtocol from 'libsignal-protocol-typescript';
import { getPreKeyBundle } from './keys';
import { Schema } from 'mongoose';
import { z } from 'zod';
import { SessionStore } from '../types/signal';
import { E2EEError, ErrorCodes } from '../utils/errors';

// Constants
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// # 3.1 Session Schema
const sessionSchema = z.object({
  userId: z.string(),
  recipientId: z.string(),
  sessionData: z.string(),
});

// # 3.2 Session Store
const sessionStore = new Map<string, SessionStore>();

// # 3.3 Session Cleanup
const cleanupExpiredSessions = () => {
  const now = new Date();
  for (const [key, store] of sessionStore.entries()) {
    if (store.expiresAt < now) {
      sessionStore.delete(key);
    }
  }
};

// Start cleanup interval
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL);

// # 3.4 X3DH Handshake
export const establishSession = async (
  userId: Schema.Types.UUID,
  recipientId: Schema.Types.UUID,
  identityKey: any // TODO: Replace with proper KeyPairType when available
): Promise<any> => {
  const sessionKey = `${userId}-${recipientId}`;
  
  // Check if session exists and is valid
  const existingSession = sessionStore.get(sessionKey);
  if (existingSession && existingSession.expiresAt > new Date()) {
    existingSession.lastUsed = new Date();
    return existingSession.session;
  }

  try {
    // Get recipient's pre-key bundle
    const preKeyBundle = await getPreKeyBundle(recipientId);

    // Create session builder
    const address = new SignalProtocol.SignalProtocolAddress(recipientId.toString(), 1);
    const sessionBuilder = new SignalProtocol.SessionBuilder(identityKey, address);
    
    // Process pre-key bundle
    await sessionBuilder.processPreKey(preKeyBundle);

    // Create session cipher
    const sessionCipher = new SignalProtocol.SessionCipher(identityKey, address);
    
    // Store session with expiration
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT);
    sessionStore.set(sessionKey, {
      session: sessionCipher,
      lastUsed: new Date(),
      expiresAt,
    });

    return sessionCipher;
  } catch (error) {
    throw new E2EEError(
      'Failed to establish session',
      ErrorCodes.SESSION_NOT_FOUND,
      error
    );
  }
};

// # 3.5 Session Retrieval
export const getSession = (
  userId: Schema.Types.UUID,
  recipientId: Schema.Types.UUID
): any | undefined => {
  const sessionKey = `${userId}-${recipientId}`;
  const store = sessionStore.get(sessionKey);
  
  if (!store) {
    return undefined;
  }

  if (store.expiresAt < new Date()) {
    sessionStore.delete(sessionKey);
    return undefined;
  }

  store.lastUsed = new Date();
  return store.session;
};

// # 3.6 Session Cleanup
export const cleanupSession = (
  userId: Schema.Types.UUID,
  recipientId: Schema.Types.UUID
): void => {
  const sessionKey = `${userId}-${recipientId}`;
  sessionStore.delete(sessionKey);
}; 