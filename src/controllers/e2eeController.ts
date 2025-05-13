import { Context } from 'hono';
import { z } from 'zod';
import { Schema } from 'mongoose';
import { generateIdentityKeyPair, generatePreKeys, generateSignedPreKey, uploadKeys, getPreKeyBundle } from '../crypto/keys';
import { establishSession } from '../crypto/session';
import { encryptMessage, decryptMessage } from '../crypto/ratchet';
import { E2EEError } from '../utils/errors';

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

// Schema for message
const messageSchema = z.object({
  recipientUUID: z.string().uuid(),
  message: z.string(),
  timestamp: z.number().optional(),
});

export const generateKeys = async (ctx: Context) => {
  try {
    const identityKey = await generateIdentityKeyPair();
    const preKeys = await generatePreKeys();
    const signedPreKey = await generateSignedPreKey(identityKey);

    return ctx.json({
      identityKey,
      signedPreKey,
      preKeys,
    });
  } catch (error) {
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 400);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
};

export const uploadUserKeys = async (ctx: Context) => {
  try {
    const body = await ctx.req.json();
    const validatedKeys = keyUploadSchema.parse(body);
    const userUUID = body.userUUID;
    
    await uploadKeys(userUUID, validatedKeys);
    return ctx.json({ message: 'Keys uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid key format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 400);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
};

export const getPreKeyBundleForUser = async (ctx: Context) => {
  try {
    const uuidParam = ctx.req.param('userUUID');
   
    
    // Create UUID from string
    const userUUID = new Schema.Types.UUID(uuidParam);
    
    
    const preKeyBundle = await getPreKeyBundle(userUUID);
    return ctx.json(preKeyBundle);
  } catch (error) {
    console.error('PreKey bundle error:', error);
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 400);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
};

export const establishUserSession = async (ctx: Context) => {
  try {
    const body = await ctx.req.json();
    const { recipientUUID } = z.object({ recipientUUID: z.string().uuid() }).parse(body);
    const userUUID = ctx.get('userUUID') as Schema.Types.UUID;
    
    const session = await establishSession(userUUID, new Schema.Types.UUID(recipientUUID), null);
    return ctx.json({ message: 'Session established successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid request format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 400);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
};

export const encryptUserMessage = async (ctx: Context) => {
  try {
    const body = await ctx.req.json();
    const validatedMessage = messageSchema.parse(body);
    const session = ctx.get('session');

    const ciphertext = await encryptMessage(session, validatedMessage.message);
    return ctx.json({ ciphertext });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid message format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 400);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
};

export const decryptUserMessage = async (ctx: Context) => {
  try {
    const body = await ctx.req.json();
    const { ciphertext } = z.object({ ciphertext: z.string() }).parse(body);
    const session = ctx.get('session');

    const plaintext = await decryptMessage(session, ciphertext);
    return ctx.json({ plaintext });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ctx.json({ error: 'Invalid message format', details: error.issues }, 400);
    }
    if (error instanceof E2EEError) {
      return ctx.json({ error: error.message, code: error.code }, 400);
    }
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
}; 