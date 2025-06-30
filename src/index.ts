import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import { registerMetrics, printMetrics, printCustomMetrics, updateMemoryMetrics, apiLatency } from "./middleware/metrics";

import authRouter from "./routes/authRoutes";
import userRouter from "./routes/userRoutes";
import channelRouter from "./routes/channelRoutes";
import messageRouter from "./routes/messageRoutes";
import powRouter from "./routes/powRoutes";

import { connectDB } from "./utils/db";
import config from "./utils/config";
import { createSocketIOServer, startSocketIOServer } from "./websocket/socketIOServer";
import { createLogger } from "./utils/logger";

// Create logger
const log = createLogger("App");

// Connect to MongoDB
connectDB(config.mongo.mongoURI)
  .then(() => {
    log.info('[MongoDB] Connected to MongoDB');
  })
  .catch((error) => {
    log.error('[MongoDB] Error connecting to MongoDB:', error);
  });

// Create Hono app
const app = new Hono().basePath("/api");

// Register Prometheus metrics middleware first
app.use("*", registerMetrics);

// Apply other middlewares
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

// API latency middleware
app.use("*", async (c, next) => {
  const startTime = Date.now();
  await next();
  const endTime = Date.now();
  const latency = (endTime - startTime) / 1000; // Convert to seconds
  
  apiLatency.observe(
    { 
      method: c.req.method, 
      path: c.req.path.split("/").slice(0, 3).join("/"), // Normalize path
      status: c.res.status.toString()
    }, 
    latency
  );
});

// Register routes
app.route("", authRouter);
app.route("", userRouter);
app.route("", channelRouter);
app.route("", messageRouter);
app.route("", powRouter);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoints
app.get("/metrics", printMetrics);
app.get("/custom-metrics", async (c) => {
  const metrics = await printCustomMetrics();
  return c.text(metrics);
});

// Create and start Socket.IO server
const io = createSocketIOServer();
startSocketIOServer(io, config.server.socketIoPort)
.then(() => {
  log.info(`[Socket.IO] Server running on http://localhost:${config.server.socketIoPort}`);
})
.catch((error) => {
  log.error('[Socket.IO] Error starting Socket.IO server:', error);
});

// Start Hono server
log.info(`Server running on http://localhost:${config.server.port}`);

// Update memory metrics every 30 seconds
setInterval(() => {
  updateMemoryMetrics();
}, 30000);

export default {
  port: config.server.port,
  fetch: app.fetch,
};
