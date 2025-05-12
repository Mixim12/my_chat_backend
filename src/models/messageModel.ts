import { Schema, Document, model } from "mongoose";

export interface IMessage extends Document {
  messageUUID: Schema.Types.UUID;
  senderUUID: Schema.Types.UUID;
  channelId: Schema.Types.ObjectId;
  ciphertext: string;
  createdAt: Date;
}

const messageSchema = new Schema({
  messageUUID: { type: Schema.Types.UUID, required: true },
  senderUUID: { type: Schema.Types.UUID, required: true },
  channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
  ciphertext: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const MessageModel = model<IMessage>("Messages", messageSchema);
