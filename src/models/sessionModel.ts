import { Schema, model, Document, Types } from 'mongoose';

export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked'
}

export interface ISession extends Document {
  sessionId: string; // Unique session identifier
  channelId: Types.ObjectId;
  initiatorUUID: Schema.Types.UUID;
  recipientUUID: Schema.Types.UUID;
  sessionData: Buffer; // Encrypted Signal Protocol session state
  deviceId: number; // Device ID for multi-device support
  status: SessionStatus;
  messageCount: number; // Track messages for ratcheting
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>({
  sessionId: { type: String, required: true, unique: true, index: true },
  channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
  initiatorUUID: { type: Schema.Types.UUID, required: true, index: true },
  recipientUUID: { type: Schema.Types.UUID, required: true, index: true },
  sessionData: { type: Buffer, required: true }, // Encrypted session state
  deviceId: { type: Number, default: 1 }, // Default to device 1
  status: { 
    type: String, 
    enum: Object.values(SessionStatus), 
    default: SessionStatus.PENDING,
    index: true 
  },
  messageCount: { type: Number, default: 0 },
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound indexes for efficient queries
SessionSchema.index({ initiatorUUID: 1, recipientUUID: 1, deviceId: 1 });
SessionSchema.index({ channelId: 1, status: 1 });
SessionSchema.index({ lastActivityAt: 1 }); // For cleanup of inactive sessions

// TTL index to auto-delete expired sessions after 30 days of inactivity
SessionSchema.index(
  { lastActivityAt: 1 }, 
  { 
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { status: SessionStatus.EXPIRED }
  }
);

export const SessionModel = model<ISession>('Session', SessionSchema);
