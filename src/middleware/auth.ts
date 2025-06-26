import { Context } from 'hono';
import { verifyJwt } from '../utils/jwt';
import { getCookie, deleteCookie } from 'hono/cookie';
import { UserModel } from '../models/userModel';
import { HTTP_STATUS } from '../utils/httpStatusCodes';

export const authMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  try {
    const token = getCookie(ctx, "token");
    
    // If no token, user is not authenticated
    if (!token) {
      ctx.set('isAuthenticated', false);
      ctx.set('userUUID', null);
      ctx.set('user', null);
      await next();
      return;
    }

    // Verify the JWT token
    const payload = verifyJwt(token);
    
    if (!payload || typeof payload !== 'object' || !('userUUID' in payload)) {
      // Invalid token - clear it and mark as unauthenticated
      deleteCookie(ctx, "token");
      ctx.set('isAuthenticated', false);
      ctx.set('userUUID', null);
      ctx.set('user', null);
      await next();
      return;
    }

    // Verify user still exists in database
    const user = await UserModel.findOne({ userUUID: payload.userUUID });
    if (!user) {
      // User doesn't exist - clear token and mark as unauthenticated
      deleteCookie(ctx, "token");
      ctx.set('isAuthenticated', false);
      ctx.set('userUUID', null);
      ctx.set('user', null);
      await next();
      return;
    }

    // User is authenticated - set context
    ctx.set('isAuthenticated', true);
    ctx.set('userUUID', user.userUUID);
    ctx.set('user', user);
    
    await next();
  } catch (error) {
    // On any error, mark as unauthenticated and continue
    console.error('Auth middleware error:', error);
    ctx.set('isAuthenticated', false);
    ctx.set('userUUID', null);
    ctx.set('user', null);
    await next();
  }
};

