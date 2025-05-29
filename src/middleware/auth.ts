import { Context } from 'hono';
import { Schema } from 'mongoose';
import { E2EEError, ErrorCodes } from '../utils/errors';
import { verifyJwt } from '../utils/jwt';
import { getTokenFromRequest } from '../utils/auth';
import { getCookie, deleteCookie } from 'hono/cookie';
import { UserModel } from '../models/userModel';

export const authMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  try {
    let token = getTokenFromRequest(ctx);
    
    if (!token) {
      throw new E2EEError(
        'Authentication required',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const payload = verifyJwt(token);
    
    if (!payload || typeof payload !== 'object' || !('userUUID' in payload)) {
      deleteCookie(ctx, "token");
      throw new E2EEError(
        'Invalid or expired token',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    // Verify user exists (additional security check)
    const user = await UserModel.findOne({ userUUID: payload.userUUID });
    if (!user) {
      deleteCookie(ctx, "token");
      throw new E2EEError(
        'User not found',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    ctx.set('userUUID', new Schema.Types.UUID(payload.userUUID as string));
    ctx.set('user', user); // Also set the full user object for convenience
    await next();
  } catch (error) {
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 401);
    }
    console.error('Auth middleware error:', error);
    return ctx.json({ error: 'Authentication failed' }, 401);
  }
};

// Middleware that only checks authentication without requiring it
export const optionalAuthMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  try {
    const token = getTokenFromRequest(ctx);
    
    if (token) {
      const payload = verifyJwt(token);
      if (payload && typeof payload === 'object' && 'userUUID' in payload) {
        // Verify user exists
        const user = await UserModel.findOne({ userUUID: payload.userUUID });
        if (user) {
          ctx.set('userUUID', new Schema.Types.UUID(payload.userUUID as string));
          ctx.set('user', user);
          ctx.set('isAuthenticated', true);
        }
      }
    }
    
    if (!ctx.get('isAuthenticated')) {
      ctx.set('isAuthenticated', false);
    }
    
    await next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    ctx.set('isAuthenticated', false);
    await next();
  }
};

