import { Hono } from "hono";
import { register, login, logout, revokeToken, verifyAuth } from "../controllers/authController";

const authRouter = new Hono();

// Public routes
authRouter.post("/register", (c) => register(c));
authRouter.post("/login", (c) => login(c));

// Token management routes
authRouter.post("/revoke-token", (c) => revokeToken(c));
authRouter.get("/verify", (c) => verifyAuth(c));
authRouter.post("/logout", (c) => logout(c));

export default authRouter;
