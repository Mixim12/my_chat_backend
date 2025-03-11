import { Hono } from "hono";
import { getAllUsers, getUserById } from "../controllers/userController";

const userRouter = new Hono();

userRouter.get("/", getAllUsers);
userRouter.get("/:id", getUserById);

export default userRouter;
