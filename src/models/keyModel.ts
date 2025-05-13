import { Schema, model } from 'mongoose';
import { SerializedKeyPair } from '../types/signal';

interface IKey {
  userUUID: Schema.Types.UUID;
  identityKey: SerializedKeyPair;
  signedPreKey: {
    keyId: number;
    keyPair: SerializedKeyPair;
    signature: number[];
  };
  preKeys: Array<{
    keyId: number;
    keyPair: SerializedKeyPair;
  }>;
  lastUpdated: Date;
}

const keySchema = new Schema<IKey>({
  userUUID: { type: Schema.Types.UUID, required: true, unique: true },
  identityKey: {
    pubKey: [Number],
    privKey: [Number]
  },
  signedPreKey: {
    keyId: Number,
    keyPair: {
      pubKey: [Number],
      privKey: [Number]
    },
    signature: [Number]
  },
  preKeys: [{
    keyId: Number,
    keyPair: {
      pubKey: [Number],
      privKey: [Number]
    }
  }],
  lastUpdated: { type: Date, default: Date.now }
});

export const KeyModel = model<IKey>('Key', keySchema); 