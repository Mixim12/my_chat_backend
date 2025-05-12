import { Schema } from 'mongoose';

export interface KeyPairType {
  pubKey: ArrayBuffer;
  privKey: ArrayBuffer;
}

export interface PreKeyPairType {
  keyId: number;
  keyPair: KeyPairType;
}

export interface SignedPreKeyPairType extends PreKeyPairType {
  signature: ArrayBuffer;
}

export interface SessionStore {
  session: any; // TODO: Replace with proper SessionCipher type when available
  lastUsed: Date;
  expiresAt: Date;
}

export interface E2EEMessage {
  recipientId: Schema.Types.UUID;
  message: string;
  timestamp?: number;
} 