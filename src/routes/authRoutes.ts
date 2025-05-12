import { Hono } from "hono";
import { register, login } from "../controllers/authController";

const authRouter = new Hono();

authRouter.post("/register", (c) => register(c));
authRouter.post("/login", (c) => login(c));

export default authRouter;
