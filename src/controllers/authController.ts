import { Context } from "hono";
import { User } from "../models/userModel";
import { checkSolution } from "../services/proofOfWork/hash";

export async function register(ctx: Context) {
  // Optionally apply PoW check if needed
  // proofOfWorkCheck(...);

  const { username, password, email } = await ctx.req.json();
  // Simple example; in a real app, you'd hash the password, validate data, etc.
  const user = await User.create({ username, password, email });
  return ctx.json({ message: "User registered", user }, 201);
}

export async function login(ctx: Context) {
  // proofOfWorkCheck(...);

  const { username, password } = await ctx.req.json();
  const user = await User.findOne({ username, password });
  if (!user) {
    return ctx.json({ error: "Invalid credentials" }, 401);
  }

  // Generate JWT or session token here
  return ctx.json({ message: "Login successful", user });
}
