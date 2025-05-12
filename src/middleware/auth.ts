import { Context, Next } from 'hono';
import { jwt } from 'hono/jwt';
import { Schema } from 'mongoose';
import { getCookie } from 'hono/cookie';

interface JWTPayload {
  userUUID: Schema.Types.UUID;
}

declare module 'hono' {
  interface ContextVariableMap {
    userUUID: Schema.Types.UUID;
  }
}

const jwtMiddleware = jwt({
  secret: process.env.JWT_SECRET || 'your-secret-key',
});

export const verifyToken = jwtMiddleware;

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const token = getCookie(c, 'token');
    if (!token) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    await jwtMiddleware(c, next);
    const payload = c.get('jwtPayload') as JWTPayload;
    if (!payload || !payload.userUUID) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    c.set('userUUID', payload.userUUID);
  } catch (error) {
    return c.json({ error: 'Authentication failed' }, 401);
  }
}; 