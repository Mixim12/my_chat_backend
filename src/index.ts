import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import { registerMetrics, printMetrics } from "./middleware/metrics";

import authRouter from "./routes/authRoutes";
import userRouter from "./routes/userRoutes";
import channelRouter from "./routes/channelRoutes";
import messageRouter from "./routes/messageRoutes";
import powRouter from "./routes/powRoutes";

import { connectDB } from "./utils/db";
import config from "./utils/config";
import { createSocketIOServer, startSocketIOServer } from "./websocket/socketIOServer";
import { createLogger } from "./utils/logger";



// Connect to MongoDB
connectDB(config.mongo.mongoURI)
  .then(() => console.log("[MongoDB] Connected to MongoDB"))
  .catch((err) => console.error("[MongoDB] Connection error:", err));

// Create Hono app
const app = new Hono().basePath("/api");

// Apply middlewares
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use("*", cors({
  origin: config.cors.origins,
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

// Register Prometheus metrics middleware
app.use("*", registerMetrics);

// Register routes
app.route("", authRouter);
app.route("", userRouter);
app.route("", channelRouter);
app.route("", messageRouter);
app.route("", powRouter);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get("/metrics", printMetrics);

// Create and start Socket.IO server
const io = createSocketIOServer();
startSocketIOServer(io, 3001);

// Start Hono server
console.log(`[Hono] Server running on http://localhost:${config.server.port}`);
export default {
  port: config.server.port,
  fetch: app.fetch,
};
