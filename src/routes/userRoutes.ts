import { Hono } from "hono";
import { getUserByDiscoveryCode, getCurrentUser, updateUser, searchUsers, deleteUser } from "../controllers/userController";
import { authMiddleware } from "../middleware/auth";

const userRouter = new Hono();

// Get current user profile
userRouter.get("/v1/users/me", authMiddleware, getCurrentUser);

// Get user by discovery code
userRouter.get("/v1/users/discovery/:discoveryCode", authMiddleware, getUserByDiscoveryCode);


// Update current user profile
userRouter.put("/v1/users/me", authMiddleware, updateUser);

// Search users
userRouter.get("/v1/users/search/:query", authMiddleware, searchUsers);

// Delete current user profile
userRouter.delete("/v1/users/me", authMiddleware, deleteUser);

export default userRouter;
