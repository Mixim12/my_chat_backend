import { getAmqpChannel } from "./rabbitmqService";
import { MessageModel } from "../../models/messageModel";

(async () => {
  const ch = await getAmqpChannel();
  const q = await ch.assertQueue("chat.store", { durable: true });
  await ch.bindQueue(q.queue, "chat.msg", "channel.*");

  ch.consume(q.queue, async (m) => {
    if (!m) return;
    const data = JSON.parse(m.content.toString());

    // Mongo write with idempotency
    await MessageModel.updateOne(
      { _id: data.messageId }, // requires unique _id in payload
      { $setOnInsert: data },
      { upsert: true }
    );

    // broadcast to gateways
    ch.publish("ws.broadcast", "", m.content, { persistent: false });
    ch.ack(m);
  });
})();
