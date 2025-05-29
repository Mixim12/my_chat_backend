import { Hono } from "hono";
import { getUserByDiscoveryCode, getCurrentUser, updateUser, searchUsers, getUserProfile } from "../controllers/userController";
import { authMiddleware } from "../middleware/auth";

const userRouter = new Hono();

// Get current user profile
userRouter.get("/me", authMiddleware, getCurrentUser);

// Get user by discovery code
userRouter.get("/discovery/:discoveryCode", authMiddleware, getUserByDiscoveryCode);

// Get user profile by UUID
userRouter.get("/:userUUID", authMiddleware, getUserProfile);

// Update current user profile
userRouter.put("/me", authMiddleware, updateUser);

// Search users
userRouter.get("/search/:query", authMiddleware, searchUsers);

export default userRouter;
