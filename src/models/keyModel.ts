import { Schema, model, Document, Types } from 'mongoose';

export interface IIdentityKey extends Document {
  userUUID: Schema.Types.UUID;
  publicKey: Buffer;
  privateKey: Buffer; // Encrypted at rest
  registrationId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPreKey extends Document {
  userUUID: Schema.Types.UUID;
  keyId: number;
  publicKey: Buffer;
  privateKey: Buffer; // Encrypted at rest
  used: boolean;
  createdAt: Date;
  consumedAt?: Date;
}

export interface ISignedPreKey extends Document {
  userUUID: Schema.Types.UUID;
  keyId: number;
  publicKey: Buffer;
  privateKey: Buffer; // Encrypted at rest
  signature: Buffer;
  timestamp: number;
  active: boolean;
  createdAt: Date;
  rotatedAt?: Date;
}

// Identity Key Schema
const IdentityKeySchema = new Schema<IIdentityKey>({
  userUUID: { type: Schema.Types.UUID, required: true, unique: true, index: true },
  publicKey: { type: Buffer, required: true },
  privateKey: { type: Buffer, required: true }, // Should be encrypted before storage
  registrationId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// PreKey Schema
const PreKeySchema = new Schema<IPreKey>({
  userUUID: { type: Schema.Types.UUID, required: true, index: true },
  keyId: { type: Number, required: true },
  publicKey: { type: Buffer, required: true },
  privateKey: { type: Buffer, required: true }, // Should be encrypted before storage
  used: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
  consumedAt: { type: Date }
}, { timestamps: true });

// Compound index for efficient lookup
PreKeySchema.index({ userUUID: 1, keyId: 1 }, { unique: true });
PreKeySchema.index({ userUUID: 1, used: 1 }); // For finding unused prekeys

// Signed PreKey Schema
const SignedPreKeySchema = new Schema<ISignedPreKey>({
  userUUID: { type: Schema.Types.UUID, required: true, index: true },
  keyId: { type: Number, required: true },
  publicKey: { type: Buffer, required: true },
  privateKey: { type: Buffer, required: true }, // Should be encrypted before storage
  signature: { type: Buffer, required: true },
  timestamp: { type: Number, required: true },
  active: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  rotatedAt: { type: Date }
}, { timestamps: true });

// Compound index for efficient lookup
SignedPreKeySchema.index({ userUUID: 1, keyId: 1 }, { unique: true });
SignedPreKeySchema.index({ userUUID: 1, active: 1 });

// TTL index to auto-delete old signed prekeys after 60 days
SignedPreKeySchema.index({ rotatedAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export const IdentityKeyModel = model<IIdentityKey>('IdentityKey', IdentityKeySchema);
export const PreKeyModel = model<IPreKey>('PreKey', PreKeySchema);
export const SignedPreKeyModel = model<ISignedPreKey>('SignedPreKey', SignedPreKeySchema);
