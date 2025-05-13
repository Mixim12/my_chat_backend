import { Context } from "hono";
import * as bcrypt from "bcrypt-ts";
import { z } from "zod";
import { UserModel } from "../models/userModel";
import pow from "../services/proofOfWork/proofOfWork";
import { signJwt } from "../utils/jwt";
import { setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { v4 as uuidv4 } from "uuid";
import { generateDiscoveryCode } from "../utils/dicoveryCode";
import { HTTP_STATUS } from "../utils/httpStatusCodes";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 24 * 60 * 60, // 1 day
};

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  email: z.string().email(),
  challengeToken: z.string().optional(),
  nonces: z.array(z.number()).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
  challengeToken: z.string(),
  nonces: z.array(z.number()),
});

async function validateProofOfWork(userIdentifier: string, challengeToken?: string, nonces?: number[]): Promise<boolean> {
  if (challengeToken && nonces) {
    return await pow.checkSolution(userIdentifier, challengeToken, nonces);
  }

  return true;
}

function handleError(ctx: Context, error: unknown): Response {
  console.error("Error:", error);
  if (error instanceof z.ZodError) {
    return ctx.json({ error: "Validation error", details: error.issues }, HTTP_STATUS.BAD_REQUEST);
  }
  const message = process.env.NODE_ENV === "production" ? "Server error" : (error as Error)?.message || "Server error";
  return ctx.json({ error: message }, HTTP_STATUS.SERVER_ERROR);
}

function setAuthToken(ctx: Context, token: string): void {
  setCookie(ctx, "token", token, cookieOptions);
}

export async function register(ctx: Context): Promise<Response> {
  try {
    const body = await ctx.req.json();
    const { username, password, email, challengeToken, nonces } = registerSchema.parse(body);

    const userIdentifier: string = ctx.req.header("User-Agent") + "|" + ctx.req.header("X-Real-IP") + "|" + ctx.req.header("X-Forwarded-For");

    if (!(await validateProofOfWork(userIdentifier, challengeToken, nonces))) {
      return ctx.json({ success: false, message: "Proof of work failed" }, HTTP_STATUS.BAD_REQUEST);
    }

    const existingUser = await UserModel.findOne({ username });
    if (existingUser) {
      return ctx.json({ success: false, message: "Username already taken" }, HTTP_STATUS.BAD_REQUEST);
    }

    const saltRounds = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const discoveryCode = generateDiscoveryCode();

    const user = await UserModel.create({
      username,
      password: hashedPassword,
      email,
      userUUID: uuidv4(),
      discoveryCode,
    });

    const token = signJwt({ userUUID: user.userUUID.toString() });
    if (!token) {
      return ctx.json({ status: "Token generation failed" }, HTTP_STATUS.SERVER_ERROR);
    }

    setAuthToken(ctx, token);

    return ctx.json(
      {
        success: true,
        status: "Registered successfully",
        data: { username: user.username, email: user.email },
      },
      HTTP_STATUS.CREATED
    );
  } catch (error: unknown) {
    return handleError(ctx, error);
  }
}

export async function login(ctx: Context): Promise<Response> {
  try {
    const body = await ctx.req.json();
    const { username, password, challengeToken, nonces } = loginSchema.parse(body);

    const userIdentifier: string = ctx.req.header("User-Agent") + "|" + ctx.req.header("X-Real-IP") + "|" + ctx.req.header("X-Forwarded-For");
    
    if (!(await validateProofOfWork(userIdentifier, challengeToken, nonces))) {
      return ctx.json({ error: "Proof of work failed" }, HTTP_STATUS.BAD_REQUEST);
    }

    const user = await UserModel.findOne({ username });
    if (!user) {
      return ctx.json({ error: "Invalid credentials" }, HTTP_STATUS.UNAUTHORIZED);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return ctx.json({ error: "Invalid credentials" }, HTTP_STATUS.UNAUTHORIZED);
    }

    const token = signJwt({ userUUID: user.userUUID.toString() });
    if (!token) {
      return ctx.json({ status: "Token generation failed" }, HTTP_STATUS.SERVER_ERROR);
    }

    setAuthToken(ctx, token);

    return ctx.json(
      {
        success: true,
        status: "Login successful",
        data: { username: user.username, email: user.email },
      },
      HTTP_STATUS.OK
    );
  } catch (error: unknown) {
    return handleError(ctx, error);
  }
}
