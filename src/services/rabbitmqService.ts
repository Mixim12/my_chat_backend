import amqplib from "amqplib";

export async function getRabbitMQChannel(rabbitUrl: string) {
  const conn = await amqplib.connect(rabbitUrl);
  const channel = await conn.createChannel();
  return channel;
}
