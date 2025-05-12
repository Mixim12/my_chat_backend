import { Context } from "hono";
import { verifyJwt } from "../utils/jwt";
import { getCookie } from "hono/cookie";

export async function authMiddleware(ctx: Context, next: () => Promise<void>) {
  try {
    const token = await getCookie(ctx, "token");

    if (!token) {
      return ctx.json({ status: "Not authenticated" }, 401);
    }

    const payload = verifyJwt(token);

    if (!payload) {
      return ctx.json({ status: "Not authenticated" }, 401);
    }

    await next();
  } catch (err: any) {
    return ctx.json({ error: err }, 401);
  }
}
