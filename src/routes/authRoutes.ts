import { Hono } from "hono";
import { register, login } from "../controllers/authController";

const authRouter = new Hono();

authRouter.post("/register", register);
authRouter.post("/login", login);

export default authRouter;
