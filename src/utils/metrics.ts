import { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { jwt } from 'hono/jwt';
import { Schema } from 'mongoose';
import { E2EEError, ErrorCodes } from './errors';
import { prometheus } from '@hono/prometheus';

// Constants
const MAX_REQUESTS_PER_MINUTE = 60;
const WINDOW_SIZE = 60 * 1000; // 1 minute in milliseconds

// Request tracking
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// # 7.1 Request Rate Limiting
export const rateLimitMiddleware = async (c: Context, next: () => Promise<void>) => {
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

  const userId = payload.userUUID.toString();
  const now = Date.now();
  const userRequests = requestCounts.get(userId);

  if (!userRequests || now > userRequests.resetTime) {
    requestCounts.set(userId, { count: 1, resetTime: now + WINDOW_SIZE });
  } else if (userRequests.count >= MAX_REQUESTS_PER_MINUTE) {
    throw new E2EEError(
      'Rate limit exceeded',
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      { retryAfter: Math.ceil((userRequests.resetTime - now) / 1000) }
    );
  } else {
    userRequests.count++;
  }
};

// # 7.2 Request Metrics
export const metricsMiddleware = async (c: Context, next: () => Promise<void>) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  // Add metrics headers
  c.header('X-Response-Time', `${duration}ms`);
  c.header('X-Request-ID', crypto.randomUUID());
};

// # 7.3 Prometheus Metrics
export const { registerMetrics } = prometheus(); 