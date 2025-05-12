import { getAmqpChannel } from "./rabbitmqService";
import { IMessage } from "../../models/messageModel";
import config from "../../utils/config";

export async function sendMessage(newMessage: IMessage) {
  try {
  const ch = await getAmqpChannel();
    const routingKey = `channel.${newMessage.channelId}`;
    const message = {
      ...newMessage,
      ts: Date.now()
    };

    const success = ch.publish(
      config.amqp.exchangeName,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { 
        persistent: true,
        contentType: "application/json",
        contentEncoding: "utf-8"
      }
    );

    if (!success) {
      throw new Error("Failed to publish message to RabbitMQ");
    }
  } catch (error) {
    console.error("Error publishing message:", error);
    throw error;
  }
}
