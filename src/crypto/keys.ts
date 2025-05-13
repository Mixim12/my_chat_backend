import { KeyHelper } from 'libsignal-protocol-typescript';
import { KeyPairType, PreKeyPairType, SignedPreKeyPairType, SerializedKeyPair } from '../types/signal';
import { KeyModel } from '../models/keyModel';
import { UserModel } from '../models/userModel';
import { Schema } from 'mongoose';
import { z } from 'zod';
import { E2EEError, ErrorCodes } from '../utils/errors';

// Helper function to serialize key pair
const serializeKeyPair = (keyPair: any) => {
  return {
    pubKey: Array.from(new Uint8Array(keyPair.pubKey)),
    privKey: Array.from(new Uint8Array(keyPair.privKey))
  };
};

// Helper function to serialize signature
const serializeSignature = (signature: ArrayBuffer) => {
  return Array.from(new Uint8Array(signature));
};

// Helper function to deserialize key pair
const deserializeKeyPair = (keyPair: SerializedKeyPair) => {
  return {
    pubKey: new Uint8Array(keyPair.pubKey).buffer,
    privKey: new Uint8Array(keyPair.privKey).buffer
  };
};

// # 2.1 Key Generation
export const generateIdentityKeyPair = async (): Promise<KeyPairType> => {
  try {
    const keyPair = await KeyHelper.generateIdentityKeyPair();
    return serializeKeyPair(keyPair);
  } catch (error) {
    throw new E2EEError(
      'Failed to generate identity key pair',
      ErrorCodes.INVALID_KEY,
      error
    );
  }
};

// # 2.2 Pre-Key Generation
export const generatePreKeys = async (count: number = 100): Promise<PreKeyPairType[]> => {
  try {
    const preKeys: PreKeyPairType[] = [];
    for (let i = 0; i < count; i++) {
      const preKey = await KeyHelper.generatePreKey(i);
      preKeys.push({
        keyId: preKey.keyId,
        keyPair: serializeKeyPair(preKey.keyPair)
      });
    }
    return preKeys;
  } catch (error) {
    throw new E2EEError(
      'Failed to generate pre-keys',
      ErrorCodes.INVALID_KEY,
      error
    );
  }
};

// # 2.3 Signed Pre-Key Generation
export const generateSignedPreKey = async (identityKey: KeyPairType): Promise<SignedPreKeyPairType> => {
  try {
    const keyId = Math.floor(Math.random() * 1000000);
    const deserializedKey = deserializeKeyPair(identityKey);
    const signedPreKey = await KeyHelper.generateSignedPreKey(deserializedKey, keyId);
    return {
      keyId: signedPreKey.keyId,
      keyPair: serializeKeyPair(signedPreKey.keyPair),
      signature: serializeSignature(signedPreKey.signature)
    };
  } catch (error) {
    throw new E2EEError(
      'Failed to generate signed pre-key',
      ErrorCodes.INVALID_KEY,
      error
    );
  }
};

// Schema for key upload
const keyUploadSchema = z.object({
  identityKey: z.object({
    pubKey: z.array(z.number()),
    privKey: z.array(z.number())
  }),
  signedPreKey: z.object({
    keyId: z.number(),
    keyPair: z.object({
      pubKey: z.array(z.number()),
      privKey: z.array(z.number())
    }),
    signature: z.array(z.number())
  }),
  preKeys: z.array(z.object({
    keyId: z.number(),
    keyPair: z.object({
      pubKey: z.array(z.number()),
      privKey: z.array(z.number())
    })
  }))
});

// # 2.4 Key Upload
export const uploadKeys = async (userUUID: Schema.Types.UUID, keys: z.infer<typeof keyUploadSchema>) => {
  try {
    const validatedKeys = keyUploadSchema.parse(keys);
    const uuidString = (userUUID as any).path;
    
    await KeyModel.findOneAndUpdate(
      { userUUID: uuidString },
      {
        userUUID: uuidString,
        identityKey: validatedKeys.identityKey,
        signedPreKey: validatedKeys.signedPreKey,
        preKeys: validatedKeys.preKeys,
        lastUpdated: new Date(),
      },
      { upsert: true }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new E2EEError(
        'Invalid key format',
        ErrorCodes.INVALID_KEY,
        error.issues
      );
    }
    throw new E2EEError(
      'Failed to upload keys',
      ErrorCodes.INVALID_KEY,
      error
    );
  }
};

// # 2.5 Key Retrieval
export const getPreKeyBundle = async (userUUID: Schema.Types.UUID): Promise<any> => {
  try {
    // Extract the actual UUID string from the Schema.Types.UUID object
    const uuidString = (userUUID as any).path;
    
    
    const user = await UserModel.findOne({ userUUID: uuidString });
    if (!user) {
      throw new E2EEError(
        'User not found',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const keyBundle = await KeyModel.findOne({ userUUID: uuidString });
    if (!keyBundle) {
      throw new E2EEError(
        'No keys found for user',
        ErrorCodes.NO_PRE_KEYS
      );
    }

    // Get the first available pre-key
    const preKey = keyBundle.preKeys[0];
    if (!preKey) {
      throw new E2EEError(
        'No pre-keys available',
        ErrorCodes.NO_PRE_KEYS
      );
    }

    // Remove the used pre-key
    await KeyModel.updateOne(
      { userUUID: uuidString },
      { $pull: { preKeys: { keyId: preKey.keyId } } }
    );

    return {
      identityKey: keyBundle.identityKey,
      signedPreKey: {
        keyId: keyBundle.signedPreKey.keyId,
        publicKey: keyBundle.signedPreKey.keyPair.pubKey,
        signature: keyBundle.signedPreKey.signature,
      },
      preKey: {
        keyId: preKey.keyId,
        publicKey: preKey.keyPair.pubKey,
      },
    };
  } catch (error) {
    console.error('PreKey bundle error details:', error);
    if (error instanceof E2EEError) {
      throw error;
    }
    throw new E2EEError(
      'Failed to get pre-key bundle',
      ErrorCodes.NO_PRE_KEYS,
      error
    );
  }
}; 