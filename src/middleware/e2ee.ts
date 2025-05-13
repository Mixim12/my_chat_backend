import { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { Schema } from 'mongoose';
import { z } from 'zod';
import { E2EEError, ErrorCodes } from '../utils/errors';
import { getSession } from '../crypto/session';
import { verifyJwt } from '../utils/jwt';

// Constants
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

// Message Schema
const messageSchema = z.object({
  recipientUUID: z.string().uuid(),
  message: z.string().max(MAX_MESSAGE_SIZE),
  timestamp: z.number().optional(),
});

export const e2eeMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  try {
    const body = await ctx.req.json();
    const validatedMessage = messageSchema.parse(body);

    const token = getCookie(ctx, 'token');
    if (!token) {
      throw new E2EEError(
        'Authentication required',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const payload = verifyJwt(token);
    if (!payload || typeof payload !== 'object' || !('userUUID' in payload)) {
      throw new E2EEError(
        'Invalid token',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const session = getSession(
      new Schema.Types.UUID(payload.userUUID as string),
      new Schema.Types.UUID(validatedMessage.recipientUUID)
    );
    
    if (!session) {
      throw new E2EEError(
        'No session found',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    ctx.set('session', session);
    await next();
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