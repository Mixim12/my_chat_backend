import { Schema } from 'mongoose';
import { SessionCipher } from 'libsignal-protocol-typescript';

export interface SerializedKeyPair {
  pubKey: number[];
  privKey: number[];
}

export interface KeyPairType extends SerializedKeyPair {}

export interface PreKeyPairType {
  keyId: number;
  keyPair: SerializedKeyPair;
}

export interface SignedPreKeyPairType {
  keyId: number;
  keyPair: SerializedKeyPair;
  signature: number[];
}

export interface PreKeyBundle {
  identityKey: SerializedKeyPair;
  signedPreKey: {
    keyId: number;
    publicKey: number[];
    signature: number[];
  };
  preKey: {
    keyId: number;
    publicKey: number[];
  };
}

export interface SessionStore {
  session: SessionCipher;
  lastUsed: Date;
  expiresAt: Date;
}

export interface E2EEMessage {
  recipientUUID: Schema.Types.UUID;
  message: string;
  timestamp?: number;
} 