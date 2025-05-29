import { Schema, model, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  messageUUID: Schema.Types.UUID;
  senderUUID: Schema.Types.UUID;
  channelId: Types.ObjectId;
  sessionId?: Types.ObjectId; // Reference to E2EE session
  ciphertext: Buffer; // Encrypted message content
  messageType?: number; // Signal Protocol message type
  registrationId?: number; // Sender's registration ID
  deviceId?: number; // Sender's device ID
  status: 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  messageUUID: { type: Schema.Types.UUID, required: true, unique: true, index: true },
  senderUUID: { type: Schema.Types.UUID, required: true, index: true },
  channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'Session', index: true },
  ciphertext: { type: Buffer, required: true }, // Always encrypted
  messageType: { type: Number }, // Signal Protocol message type
  registrationId: { type: Number }, // For verification
  deviceId: { type: Number, default: 1 }, // Multi-device support
  status: { 
    type: String, 
    enum: ['sent', 'delivered', 'read', 'failed'], 
    default: 'sent',
    index: true 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound indexes for efficient queries
MessageSchema.index({ channelId: 1, createdAt: 1 }); // For message history
MessageSchema.index({ senderUUID: 1, createdAt: 1 }); // For user's messages
MessageSchema.index({ sessionId: 1, createdAt: 1 }); // For session-specific messages

// TTL index to auto-delete old messages after 90 days (configurable)
MessageSchema.index(
  { createdAt: 1 }, 
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
);

export const MessageModel = model<IMessage>('Message', MessageSchema);
