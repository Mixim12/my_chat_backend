import pow from "../services/proofOfWork/proofOfWork";
import { Context } from "hono";

export async function getChallenge(ctx: Context) {
  try {
    const userIdentifier: string = ctx.req.header("User-Agent") + "|" + ctx.req.header("X-Real-IP") + "|" + ctx.req.header("X-Forwarded-For");

    const challenge = await pow.generateChallenge(userIdentifier);

    if (!challenge) {
      return ctx.json({ error: "Failed to generate challenge." }, 500);
    }

    return ctx.json(challenge, 200);
  } catch (err: any) {
    return ctx.json({ error: err }, 400);
  }
}
