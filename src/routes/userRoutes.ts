import { Hono } from "hono";
import { getUserByDiscoveryCode } from "../controllers/userController";

const userRouter = new Hono();

userRouter.get("/");
userRouter.get("/:id", getUserByDiscoveryCode);

export default userRouter;
