import { Context } from "hono";
import { User } from "../models/userModel";

export async function getAllUsers(ctx: Context) {
  const users = await User.find({});
  return ctx.json(users);
}

export async function getUserById(ctx: Context) {
  const userId = ctx.req.param("id");
  const user = await User.findById(userId);
  if (!user) {
    return ctx.json({ error: "User not found" }, 404);
  }
  return ctx.json(user);
}
