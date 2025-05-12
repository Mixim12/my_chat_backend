import { Schema, model } from 'mongoose';

interface IKey {
  userId: Schema.Types.UUID;
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  preKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
  lastUpdated: Date;
}

const keySchema = new Schema<IKey>({
  userId: { type: Schema.Types.UUID, required: true, unique: true },
  identityKey: { type: String, required: true },
  signedPreKey: {
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true },
    signature: { type: String, required: true },
  },
  preKeys: [{
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true },
  }],
  lastUpdated: { type: Date, default: Date.now },
});

export const KeyModel = model<IKey>('Key', keySchema); 