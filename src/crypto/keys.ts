import { randomBytes } from 'crypto';
import { KeyHelper } from 'libsignal-protocol-typescript';
import { KeyPairType, PreKeyPairType, SignedPreKeyPairType } from '../types/signal';
import { KeyModel } from '../models/keyModel';
import { UserModel } from '../models/userModel';
import { Schema } from 'mongoose';
import { z } from 'zod';
import { E2EEError, ErrorCodes } from '../utils/errors';

// # 2.1 Key Generation
export const generateIdentityKeyPair = async (): Promise<KeyPairType> => {
  try {
    return await KeyHelper.generateIdentityKeyPair();
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
      preKeys.push(preKey);
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
    return await KeyHelper.generateSignedPreKey(identityKey, keyId);
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
  identityKey: z.string(),
  signedPreKey: z.object({
    keyId: z.number(),
    publicKey: z.string(),
    signature: z.string(),
  }),
  preKeys: z.array(z.object({
    keyId: z.number(),
    publicKey: z.string(),
  })),
});

// # 2.4 Key Upload
export const uploadKeys = async (userId: Schema.Types.UUID, keys: z.infer<typeof keyUploadSchema>) => {
  try {
    const validatedKeys = keyUploadSchema.parse(keys);
    
    await KeyModel.findOneAndUpdate(
      { userId },
      {
        userId,
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
export const getPreKeyBundle = async (userId: Schema.Types.UUID): Promise<any> => {
  try {
    const user = await UserModel.findOne({ userUUID: userId });
    if (!user) {
      throw new E2EEError(
        'User not found',
        ErrorCodes.SESSION_NOT_FOUND
      );
    }

    const keyBundle = await KeyModel.findOne({ userId });
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
      { userId },
      { $pull: { preKeys: { keyId: preKey.keyId } } }
    );

    return {
      identityKey: keyBundle.identityKey,
      signedPreKey: {
        keyId: keyBundle.signedPreKey.keyId,
        publicKey: keyBundle.signedPreKey.publicKey,
        signature: keyBundle.signedPreKey.signature,
      },
      preKey: {
        keyId: preKey.keyId,
        publicKey: preKey.publicKey,
      },
    };
  } catch (error) {
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