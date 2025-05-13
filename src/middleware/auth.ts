import { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { Schema } from 'mongoose';
import { E2EEError, ErrorCodes } from '../utils/errors';
import { verifyJwt } from '../utils/jwt';

export const authMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  try {
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

    ctx.set('userUUID', new Schema.Types.UUID(payload.userUUID as string));
    await next();
  } catch (error) {
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 401);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
}; 