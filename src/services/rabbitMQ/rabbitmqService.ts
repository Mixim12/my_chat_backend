import * as amqplib from "amqplib";
import config from "../../utils/config";

let channel: amqplib.Channel | null = null;
let connection: amqplib.Connection | null = null;
const EXCHANGE_NAME = config.amqp.exchangeName;
const EXCHANGE_TYPE = "topic";
const QUEUE_NAME = "chatQueue";
const ROUTING_PATTERN = "#";
const RABBIT_URL = config.amqp.rabbitURL;
const RECONNECT_INTERVAL = 5000; // 5 seconds

async function setupChannel(conn: amqplib.Connection): Promise<amqplib.Channel> {
  const ch = await (conn as any).createChannel();
  
  // Set up main exchange for chat messages
  await ch.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { 
    durable: true,
    autoDelete: false
  });

  // Set up broadcast exchange for WebSocket messages
  await ch.assertExchange("ws.broadcast", "fanout", { 
    durable: false,
    autoDelete: true
  });

  // Set up main queue for chat messages
  await ch.assertQueue(QUEUE_NAME, {
    durable: true,
    autoDelete: false
  });

  // Bind main queue to exchange
  await ch.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_PATTERN);

  return ch;
}

async function connect(): Promise<void> {
  try {
    connection = (await amqplib.connect(RABBIT_URL, {
      frameMax: 131072,
      heartbeat: 60
    }) as unknown) as amqplib.Connection;

    if (!connection) {
      throw new Error("Failed to establish RabbitMQ connection");
    }

    channel = await setupChannel(connection);

    connection.on("error", async (err) => {
      console.error("RabbitMQ connection error:", err);
      channel = null;
      connection = null;
      setTimeout(connect, RECONNECT_INTERVAL);
    });

    connection.on("close", () => {
      console.log("RabbitMQ connection closed");
      channel = null;
      connection = null;
      setTimeout(connect, RECONNECT_INTERVAL);
    });

  } catch (error) {
    console.error("Failed to establish RabbitMQ connection:", error);
    setTimeout(connect, RECONNECT_INTERVAL);
    throw error;
  }
}

export async function getAmqpChannel(): Promise<amqplib.Channel> {
  if (channel) return channel;

  await connect();
  if (!channel) {
    throw new Error("Failed to establish RabbitMQ channel");
  }
  return channel;
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
