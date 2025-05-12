import amqp from "amqplib";
import config from "../../utils/config";

let channel: amqp.Channel | null = null;
const EXCHANGE_NAME = config.amqp.exchangeName;
const EXCHANGE_TYPE = "topic";
const QUEUE_NAME = "chatQueue";
const ROUTING_PATTERN = "#";
const RABBIT_URL = config.amqp.rabbitURL;

// Debug log for RabbitMQ URL
console.log("[RabbitMQ] config.amqp.rabbitURL:", config.amqp?.rabbitURL);
console.log("[RabbitMQ] process.env.RABBIT_URL:", process.env.RABBIT_URL);
console.log("[RabbitMQ] Using RABBIT_URL:", RABBIT_URL);

export async function getAmqpChannel(): Promise<amqp.Channel> {
  if (channel) return channel;

  try {
    const conn = await amqp.connect(RABBIT_URL, {
      frameMax: 131072
    });
  channel = await conn.createChannel();

    // Set up main exchange for chat messages
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { 
      durable: true,
      autoDelete: false
    });

    // Set up broadcast exchange for WebSocket messages
    await channel.assertExchange("ws.broadcast", "fanout", { 
      durable: false,
      autoDelete: true
    });

    // Set up main queue for chat messages
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      autoDelete: false
    });

    // Bind main queue to exchange
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_PATTERN);

    // Handle connection errors
    conn.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
      channel = null;
    });

    conn.on("close", () => {
      console.log("RabbitMQ connection closed");
      channel = null;
    });

  return channel;
  } catch (error) {
    console.error("Failed to establish RabbitMQ connection:", error);
    throw error;
  }
}

export async function createExclusiveQueue(): Promise<string> {
  try {
    const ch = await getAmqpChannel();
    const { queue } = await ch.assertQueue("", { 
      exclusive: true,
      autoDelete: true
    });
    return queue;
  } catch (error) {
    console.error("Failed to create exclusive queue:", error);
    throw error;
  }
}
