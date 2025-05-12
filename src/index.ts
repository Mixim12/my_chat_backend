import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";

import { authMiddleware } from "./middleware/authMiddleware";

import e2ee from "./routes/e2ee";
import authRouter from "./routes/authRoutes";
import userRouter from "./routes/userRoutes";
import channelRouter from "./routes/channelRoutes";
import messageRouter from "./routes/messageRoutes";
import powRouter from "./routes/powRoutes";

import { registerMetrics, metricsMiddleware, rateLimitMiddleware } from "./utils/metrics";
import { connectDB } from "./utils/db";
import config from "./utils/config";

const port = config.server.port;
const app = new Hono().basePath("/api");

async function main() {
  await connectDB(config.mongo.mongoURI);

  // Middleware
  app.use(logger());
  app.use(prettyJSON());
  app.use(cors());
  app.use(compress());
  app.use(secureHeaders());
  app.use("*", metricsMiddleware);
  app.use("*", rateLimitMiddleware);

  // Public routes
  app.route("/pow", powRouter);
  app.route("/auth", authRouter);

  // Protected routes
  app.use("/users", authMiddleware);
  app.use("/message", authMiddleware);
  app.use("/channels", authMiddleware);
  app.use("/e2ee", authMiddleware);

  app.route("/users", userRouter);
  app.route("/message", messageRouter);
  app.route("/channels", channelRouter);
  app.route("/e2ee", e2ee);

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Metrics
  app.use('/metrics', registerMetrics);

  console.log(`App initializing complete!`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export default { port: port, fetch: app.fetch };
