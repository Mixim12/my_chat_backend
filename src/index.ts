import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import { registerMetrics, printMetrics } from "./middleware/metrics";

import authRouter from "./routes/authRoutes";
import userRouter from "./routes/userRoutes";
import channelRouter from "./routes/channelRoutes";
// import messageRouter from "./routes/messageRoutes";
import powRouter from "./routes/powRoutes";

import { connectDB } from "./utils/db";
import config from "./utils/config";
// import { initSocketServer } from "./websocket/socketServer";


// Connect to MongoDB
connectDB(config.mongo.mongoURI).catch(console.error);

const app = new Hono().basePath("/api");

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use("*", cors({
  origin: config.cors.origins,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
  maxAge: 600,
  credentials: true,
}));
app.use("*", registerMetrics);

// Routes
app.route("", authRouter);
app.route("", userRouter);
app.route("", channelRouter);
// app.route("", messageRouter);
// app.route("", e2eeRouter);
app.route("", powRouter);

// Metrics endpoint
app.get("/metrics", printMetrics);

// initSocketServer(app);

export default {
  port: config.server.port,
  fetch: app.fetch,
};
