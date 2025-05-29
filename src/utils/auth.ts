import { Context } from "hono";
import { getCookie } from "hono/cookie";

/**
 * Helper function to get JWT token from either cookie or Authorization header
 * @param ctx Hono context
 * @returns JWT token string or undefined if not found
 */
export function getTokenFromRequest(ctx: Context): string | undefined {
  // Try cookie first
  let token = getCookie(ctx, "token");
  
  // If no cookie, try Authorization header
  if (!token) {
    const authHeader = ctx.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
  }
  
  return token;
} 