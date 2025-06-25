import { Hono } from "hono";
import { register, login, logout } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";

const authRouter = new Hono();

// Public routes
authRouter.post("/v1/auth/register",authMiddleware, register);
authRouter.post("/v1/auth/login", authMiddleware, login);
authRouter.post("/v1/auth/logout", logout);

export default authRouter;
