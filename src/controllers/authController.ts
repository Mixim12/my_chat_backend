import { Context } from "hono";
import * as bcrypt from "bcrypt-ts";
import { z } from "zod";
import { UserModel } from "../models/userModel";
import pow from "../services/proofOfWork/proofOfWork";
import { signJwt, verifyJwt } from "../utils/jwt";
import { deleteCookie, setCookie, getCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { v4 as uuidv4 } from "uuid";
import { generateDiscoveryCode } from "../utils/dicoveryCode";
import { HTTP_STATUS } from "../utils/httpStatusCodes";
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 24 * 60 * 60, // 1 day - single token approach
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

function setAuthToken(ctx: Context, accessToken: string): void {
  setCookie(ctx, "token", accessToken, cookieOptions);
}

function clearAuthToken(ctx: Context): void {
  deleteCookie(ctx, "token");
}

function generateToken(userUUID: string): string | null {
  return signJwt({ userUUID }, "24h"); // Single token with 24h expiry
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

    const accessToken = generateToken(user.userUUID.toString());
    
    if (!accessToken) {
      return ctx.json({ status: "Token generation failed" }, HTTP_STATUS.SERVER_ERROR);
    }

    setAuthToken(ctx, accessToken);

    return ctx.json(
      {
        success: true,
        status: "Registered successfully",
        user: {
          id: (user._id as any).toString(),
          username: user.username,
          email: user.email,
          userUUID: user.userUUID.toString(),
          discoveryCode: user.discoveryCode
        },
        token: accessToken,
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

    const accessToken = generateToken(user.userUUID.toString());
    
    if (!accessToken) {
      return ctx.json({ status: "Token generation failed" }, HTTP_STATUS.SERVER_ERROR);
    }

    setAuthToken(ctx, accessToken);

    return ctx.json(
      {
        success: true,
        status: "Login successful",
        user: {
          id: (user._id as any).toString(),
          username: user.username,
          email: user.email,
          userUUID: user.userUUID.toString(),
          discoveryCode: user.discoveryCode
        },
        token: accessToken,
        data: { username: user.username, email: user.email },
      },
      HTTP_STATUS.OK
    );
  } catch (error: unknown) {
    return handleError(ctx, error);
  }
}

// Refresh token functionality removed - using single token approach

export async function revokeToken(ctx: Context): Promise<Response> {
  try {
    // Clear the single token cookie
    clearAuthToken(ctx);
    return ctx.json({ success: true, message: "Token revoked successfully" }, HTTP_STATUS.OK);
  } catch (error: unknown) {
    return handleError(ctx, error);
  }
}

export async function verifyAuth(ctx: Context): Promise<Response> {
  try {
    const token = getCookie(ctx, "token");
    
    if (!token) {
      return ctx.json({ 
        isAuthenticated: false, 
        error: "No token provided" 
      }, HTTP_STATUS.UNAUTHORIZED);
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
      clearAuthToken(ctx);
      return ctx.json({ 
        isAuthenticated: false, 
        error: "Invalid or expired token" 
      }, HTTP_STATUS.UNAUTHORIZED);
    }

    // Verify user still exists
    const user = await UserModel.findOne({ userUUID: decoded.userUUID });
    if (!user) {
      clearAuthToken(ctx);
      return ctx.json({ 
        isAuthenticated: false, 
        error: "User not found" 
      }, HTTP_STATUS.UNAUTHORIZED);
    }

    return ctx.json({
      isAuthenticated: true,
      user: {
        id: (user._id as any).toString(),
        username: user.username,
        email: user.email,
        userUUID: user.userUUID.toString(),
        discoveryCode: user.discoveryCode
      }
    }, HTTP_STATUS.OK);
  } catch (error: unknown) {
    return handleError(ctx, error);
  }
}

export async function logout(ctx: Context): Promise<Response> {
  try {
    clearAuthToken(ctx);
    return ctx.json({ success: true, message: "Logged out successfully" }, HTTP_STATUS.OK);
  } catch (error: unknown) {
    return handleError(ctx, error);
  }
}
