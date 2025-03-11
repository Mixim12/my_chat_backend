import { Hono } from "hono";
import authRouter from "./routes/authRoutes";
import userRouter from "./routes/userRoutes";
import channelRouter from "./routes/channelRoutes";
import { logger } from "hono/logger";

import { connectDB } from "./utils/db";
import { getRabbitMQChannel } from "./services/rabbitmqService";
import { config } from "dotenv";

config();

const port = parseInt(process.env.PORT || "3000");
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/my-chat-db";
const rabbitUrl = process.env.RABBITMQ_URL || "amqp://localhost";

let app = new Hono();

async function main() {
  // Connect to MongoDB
  await connectDB(mongoUri);

  app.use(logger());
  // Mount sub-routes
  app.route("/auth", authRouter);
  app.route("/users", userRouter);
  app.route("/channels", channelRouter);

  const channel = await getRabbitMQChannel(rabbitUrl);

  console.info("Connected to RabbitMQ");

  console.info(`Server running on http://localhost:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export default { port: port, fetch: app.fetch };
