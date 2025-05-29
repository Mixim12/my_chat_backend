import { Context } from 'hono';
import { E2EEError, ErrorCodes } from '../utils/errors';
import { verifyJwt } from '../utils/jwt';
import { getTokenFromRequest } from '../utils/auth';

// Constants
const MAX_REQUESTS_PER_MINUTE = 60;
const WINDOW_SIZE = 60 * 1000; // 1 minute in milliseconds

// Request tracking
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimitMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  const token = getTokenFromRequest(ctx);
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

  const userUUID = payload.userUUID as string;
  const now = Date.now();
  const userRequests = requestCounts.get(userUUID);

  if (!userRequests || now > userRequests.resetTime) {
    requestCounts.set(userUUID, { count: 1, resetTime: now + WINDOW_SIZE });
  } else if (userRequests.count >= MAX_REQUESTS_PER_MINUTE) {
    throw new E2EEError(
      'Rate limit exceeded',
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      { retryAfter: Math.ceil((userRequests.resetTime - now) / 1000) }
    );
  } else {
    userRequests.count++;
  }

  await next();
}; 