import { Context } from "hono";
import { UserModel } from "../models/userModel";
import { ChannelModel } from "../models/channelModel";
import { decodeJwt } from "../utils/jwt";
import { getCookie } from "hono/cookie";
import { Types } from "mongoose";
import { z } from "zod";
import * as bcrypt from "bcrypt-ts";

// Validation schemas
const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  oldPassword: z.string().min(6).max(50).optional(),
  newPassword: z.string().min(6).max(50).optional(), 
  status: z.enum(["online", "offline", "away", "busy"]).optional(),
  password: z.string().min(6).max(50).optional(),
});

export async function getAllUsersGroup(ctx: Context) {
  const channelId = ctx.req.param("channelId");

  if (!channelId) {
    return ctx.json({ error: "Channel ID is required" }, 400);
  }
  const usersData = await ChannelModel.find({ channelId: channelId });

  if (!usersData || usersData.length === 0) {
    return ctx.json({ error: "No users found for this channel" }, 404);
  }

  return ctx.json(usersData);
}

export async function getUserByDiscoveryCode(ctx: Context) {
  try {
    const discoveryCode = ctx.req.param("discoveryCode");

    if (!discoveryCode) {
      return ctx.json({ error: "Discovery code is required" }, 400);
    }

    const userData = await UserModel.findOne({ discoveryCode: discoveryCode })
      .select('userUUID username discoveryCode status lastSeen createdAt');

    if (!userData) {
      return ctx.json({ error: "User not found" }, 404);
    }

    return ctx.json({ user: userData });
  } catch (error) {
    console.error("Error getting user by discovery code:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function getCurrentUser(ctx: Context) {
  try {
    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    const user = await UserModel.findOne({ userUUID })
      .select('userUUID username email discoveryCode status lastSeen createdAt updatedAt');

    if (!user) {
      return ctx.json({ error: "User not found" }, 404);
    }

    return ctx.json({ user });
  } catch (error) {
    console.error("Error getting current user:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}



export async function updateUser(ctx: Context) {
  try {
    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    const body = await ctx.req.json();
    const validatedData = updateUserSchema.parse(body);

  
    if(validatedData.newPassword && validatedData.oldPassword){
      const user = await UserModel.findOne({ userUUID });
      if(!user){
        return ctx.json({ error: "User not found" }, 404);
      }
      const isPasswordValid = await bcrypt.compare(validatedData.oldPassword, user.password);
      if(!isPasswordValid){
        return ctx.json({ error: "Invalid password" }, 400);
      }
      const hashedPassword = await bcrypt.hash(validatedData.newPassword, 10);
      validatedData.password = hashedPassword;
    }

    // Check if email is already taken (if updating email)
    if (validatedData.email) {
      const existingUser = await UserModel.findOne({ 
        email: validatedData.email,
        userUUID: { $ne: userUUID }
      });

      if (existingUser) {
        return ctx.json({ error: "Email already taken" }, 400);
      }
    }

    const updatedUser = await UserModel.findOneAndUpdate(
      { userUUID },
      { 
        $set: {
          ...validatedData,
          updatedAt: new Date()
        }
      },
      { new: true }
    ).select('userUUID username email discoveryCode status lastSeen createdAt updatedAt');

    if (!updatedUser) {
      return ctx.json({ error: "User not found" }, 404);
    }

    return ctx.json({ 
      message: "User updated successfully", 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Error updating user:", error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: "Invalid request data", details: error.issues }, 400);
    }
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function searchUsers(ctx: Context) {
  try {
    const query = ctx.req.param("query");
    if (!query || query.length < 2) {
      return ctx.json({ error: "Search query must be at least 2 characters" }, 400);
    }

    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }

    const payload = decodeJwt(token) as { userUUID: string };
    const currentUserUUID = new Types.UUID(payload.userUUID);

    // Search by username or discovery code
    const users = await UserModel.find({
      $and: [
        { userUUID: { $ne: currentUserUUID } }, // Exclude current user
        {
          $or: [
            { username: { $regex: query, $options: 'i' } },
            { discoveryCode: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    })
    .select('userUUID username discoveryCode status lastSeen')
    .limit(20)
    .sort({ username: 1 });

    return ctx.json({ users });
  } catch (error) {
    console.error("Error searching users:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

export async function deleteUser(ctx: Context) {
  try {
    const token = getCookie(ctx, "token");
    if (!token) {
      return ctx.json({ error: "Not authenticated" }, 401);
    }
    const payload = decodeJwt(token) as { userUUID: string };
    const userUUID = new Types.UUID(payload.userUUID);

    const user = await UserModel.findOne({ userUUID });
    if(!user){
      return ctx.json({ error: "User not found" }, 404);
    }
    await UserModel.deleteOne({ userUUID });
    return ctx.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

