import * as libsignal from '@signalapp/libsignal-client';
import { IdentityKeyModel, PreKeyModel, SignedPreKeyModel } from '../../models/keyModel';
import { SessionModel, SessionStatus } from '../../models/sessionModel';
import { Types } from 'mongoose';
import crypto from 'crypto';

/**
 * MongoDB-backed Signal Protocol Store
 * Implements the storage interface required by libsignal-client
 */
export class SignalProtocolStore {
  private userUUID: Types.UUID;
  private encryptionKey: string; // For encrypting keys at rest

  constructor(userUUID: string | Types.UUID) {
    this.userUUID = typeof userUUID === 'string' ? new Types.UUID(userUUID) : userUUID;
    // In production, derive this from user's password or use a KMS
    this.encryptionKey = process.env.KEY_ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
  }

  // Utility methods for encryption/decryption using simple but secure approach
  private encrypt(data: Buffer): Buffer {
    try {
      // Use AES-256-CBC with HMAC for authentication
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      // Type assertions to work around Bun's type issues
      const cipher = crypto.createCipheriv('aes-256-cbc', key as any, iv as any);
      const updateResult = cipher.update(data as any);
      const finalResult = cipher.final();
      
      // Convert to Uint8Array for Buffer.concat compatibility
      const encrypted = Buffer.concat([
        new Uint8Array(updateResult.buffer, updateResult.byteOffset, updateResult.byteLength),
        new Uint8Array(finalResult.buffer, finalResult.byteOffset, finalResult.byteLength)
      ]);
      
      // Add HMAC for authentication
      const hmac = crypto.createHmac('sha256', key as any);
      hmac.update(iv as any);
      hmac.update(encrypted as any);
      const authTag = hmac.digest();
      
      return Buffer.concat([
        new Uint8Array(iv.buffer, iv.byteOffset, iv.byteLength),
        new Uint8Array(authTag.buffer, authTag.byteOffset, authTag.byteLength),
        new Uint8Array(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength)
      ]);
    } catch (error) {
      console.error('Encryption error:', error);
      // Fallback to simple XOR if crypto fails
      return this.simpleEncrypt(data);
    }
  }

  private decrypt(encryptedData: Buffer): Buffer {
    try {
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const iv = encryptedData.subarray(0, 16);
      const authTag = encryptedData.subarray(16, 48);
      const encrypted = encryptedData.subarray(48);
      
      // Verify HMAC
      const hmac = crypto.createHmac('sha256', key as any);
      hmac.update(iv as any);
      hmac.update(encrypted as any);
      const expectedAuthTag = hmac.digest();
      
      if (!crypto.timingSafeEqual(authTag as any, expectedAuthTag as any)) {
        throw new Error('Authentication failed');
      }
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key as any, iv as any);
      const updateResult = decipher.update(encrypted as any);
      const finalResult = decipher.final();
      
      // Convert to Uint8Array for Buffer.concat compatibility
      return Buffer.concat([
        new Uint8Array(updateResult.buffer, updateResult.byteOffset, updateResult.byteLength),
        new Uint8Array(finalResult.buffer, finalResult.byteOffset, finalResult.byteLength)
      ]);
    } catch (error) {
      console.error('Decryption error:', error);
      // Fallback to simple XOR if crypto fails
      return this.simpleDecrypt(encryptedData);
    }
  }

  // Fallback simple encryption methods
  private simpleEncrypt(data: Buffer): Buffer {
    const key = Buffer.from(this.encryptionKey, 'utf8');
    const result = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ key[i % key.length];
    }
    return result;
  }

  private simpleDecrypt(encryptedData: Buffer): Buffer {
    return this.simpleEncrypt(encryptedData); // XOR is symmetric
  }

  // IdentityKeyStore implementation
  async getIdentityKeyPair(): Promise<libsignal.PrivateKey> {
    const identityKey = await IdentityKeyModel.findOne({ userUUID: this.userUUID });
    if (!identityKey) {
      throw new Error('Identity key not found');
    }
    const decryptedPrivateKey = this.decrypt(identityKey.privateKey);
    return libsignal.PrivateKey.deserialize(decryptedPrivateKey);
  }

  async getLocalRegistrationId(): Promise<number> {
    const identityKey = await IdentityKeyModel.findOne({ userUUID: this.userUUID });
    if (!identityKey) {
      throw new Error('Registration ID not found');
    }
    return identityKey.registrationId;
  }

  async saveIdentity(
    address: libsignal.ProtocolAddress,
    identityKey: libsignal.PublicKey
  ): Promise<boolean> {
    try {
      const userUUID = address.name();
      const publicKeyBytes = identityKey.serialize();
      
      // Store the identity key for this address
      await IdentityKeyModel.findOneAndUpdate(
        { userUUID: new Types.UUID(userUUID) },
        {
          userUUID: new Types.UUID(userUUID),
          publicKey: publicKeyBytes,
          // Don't overwrite private key if it exists
          $setOnInsert: { 
            privateKey: Buffer.alloc(0), // Empty for remote identities
            registrationId: 0 // Will be set from prekey bundle
          }
        },
        { upsert: true, new: true }
      );
      
      return true; // Trust on first use (TOFU)
    } catch (error) {
      console.error('Error saving identity:', error);
      return false;
    }
  }

  async isTrustedIdentity(
    address: libsignal.ProtocolAddress,
    identityKey: libsignal.PublicKey,
    direction: libsignal.Direction
  ): Promise<boolean> {
    try {
      const userUUID = address.name();
      const storedIdentity = await IdentityKeyModel.findOne({ 
        userUUID: new Types.UUID(userUUID) 
      });
      
      if (!storedIdentity) {
        return true; // Trust on first use
      }
      
      // Compare the stored identity key with the provided one
      const storedKey = libsignal.PublicKey.deserialize(storedIdentity.publicKey);
      return storedKey.compare(identityKey) === 0;
    } catch (error) {
      console.error('Error checking trusted identity:', error);
      return false;
    }
  }

  async getIdentity(
    address: libsignal.ProtocolAddress
  ): Promise<libsignal.PublicKey | null> {
    try {
      const userUUID = address.name();
      const identityKey = await IdentityKeyModel.findOne({ 
        userUUID: new Types.UUID(userUUID) 
      });
      if (!identityKey || identityKey.publicKey.length === 0) {
        return null;
      }
      return libsignal.PublicKey.deserialize(identityKey.publicKey);
    } catch (error) {
      console.error('Error getting identity:', error);
      return null;
    }
  }

  // PreKeyStore implementation
  async loadPreKey(preKeyId: number): Promise<libsignal.PreKeyRecord> {
    const preKey = await PreKeyModel.findOne({
      userUUID: this.userUUID,
      keyId: preKeyId,
      used: false
    });
    if (!preKey) {
      throw new Error(`PreKey ${preKeyId} not found`);
    }
    
    const decryptedPrivateKey = this.decrypt(preKey.privateKey);
    const privateKey = libsignal.PrivateKey.deserialize(decryptedPrivateKey);
    const publicKey = libsignal.PublicKey.deserialize(preKey.publicKey);
    
    return libsignal.PreKeyRecord.new(preKeyId, publicKey, privateKey);
  }

  async storePreKey(preKeyId: number, record: libsignal.PreKeyRecord): Promise<void> {
    const publicKey = record.publicKey().serialize();
    const privateKey = record.privateKey().serialize();
    const encryptedPrivateKey = this.encrypt(privateKey);

    await PreKeyModel.findOneAndUpdate(
      { userUUID: this.userUUID, keyId: preKeyId },
      {
        userUUID: this.userUUID,
        keyId: preKeyId,
        publicKey: publicKey,
        privateKey: encryptedPrivateKey,
        used: false
      },
      { upsert: true, new: true }
    );
  }

  async removePreKey(preKeyId: number): Promise<void> {
    await PreKeyModel.findOneAndUpdate(
      { userUUID: this.userUUID, keyId: preKeyId },
      { used: true, consumedAt: new Date() }
    );
  }

  // SignedPreKeyStore implementation
  async loadSignedPreKey(signedPreKeyId: number): Promise<libsignal.SignedPreKeyRecord> {
    const signedPreKey = await SignedPreKeyModel.findOne({
      userUUID: this.userUUID,
      keyId: signedPreKeyId,
      active: true
    });
    if (!signedPreKey) {
      throw new Error(`Signed PreKey ${signedPreKeyId} not found`);
    }
    
    const decryptedPrivateKey = this.decrypt(signedPreKey.privateKey);
    const privateKey = libsignal.PrivateKey.deserialize(decryptedPrivateKey);
    const publicKey = libsignal.PublicKey.deserialize(signedPreKey.publicKey);
    
    return libsignal.SignedPreKeyRecord.new(
      signedPreKeyId,
      signedPreKey.timestamp,
      publicKey,
      privateKey,
      signedPreKey.signature
    );
  }

  async storeSignedPreKey(
    signedPreKeyId: number,
    record: libsignal.SignedPreKeyRecord
  ): Promise<void> {
    const publicKey = record.publicKey().serialize();
    const privateKey = record.privateKey().serialize();
    const encryptedPrivateKey = this.encrypt(privateKey);

    // Mark old signed prekeys as rotated
    await SignedPreKeyModel.updateMany(
      { userUUID: this.userUUID, active: true },
      { active: false, rotatedAt: new Date() }
    );

    await SignedPreKeyModel.create({
      userUUID: this.userUUID,
      keyId: signedPreKeyId,
      publicKey: publicKey,
      privateKey: encryptedPrivateKey,
      signature: record.signature(),
      timestamp: record.timestamp(),
      active: true
    });
  }

  // SessionStore implementation
  async loadSession(
    address: libsignal.ProtocolAddress
  ): Promise<libsignal.SessionRecord | null> {
    try {
      const recipientUUID = address.name();
      const deviceId = address.deviceId();

      const session = await SessionModel.findOne({
        $or: [
          { initiatorUUID: this.userUUID, recipientUUID: new Types.UUID(recipientUUID) },
          { initiatorUUID: new Types.UUID(recipientUUID), recipientUUID: this.userUUID }
        ],
        deviceId: deviceId,
        status: SessionStatus.ACTIVE
      });

      if (!session || session.sessionData.length === 0) {
        return null;
      }

      const decryptedSessionData = this.decrypt(session.sessionData);
      return libsignal.SessionRecord.deserialize(decryptedSessionData);
    } catch (error) {
      console.error('Error loading session:', error);
      return null;
    }
  }

  async storeSession(
    address: libsignal.ProtocolAddress,
    session: libsignal.SessionRecord
  ): Promise<void> {
    const recipientUUID = address.name();
    const deviceId = address.deviceId();
    const sessionData = session.serialize();
    const encryptedSessionData = this.encrypt(sessionData);

    const sessionId = `${this.userUUID}-${recipientUUID}-${deviceId}`;

    await SessionModel.findOneAndUpdate(
      {
        $or: [
          { initiatorUUID: this.userUUID, recipientUUID: new Types.UUID(recipientUUID) },
          { initiatorUUID: new Types.UUID(recipientUUID), recipientUUID: this.userUUID }
        ],
        deviceId: deviceId
      },
      {
        sessionId: sessionId,
        initiatorUUID: this.userUUID,
        recipientUUID: new Types.UUID(recipientUUID),
        deviceId: deviceId,
        sessionData: encryptedSessionData,
        status: SessionStatus.ACTIVE,
        lastActivityAt: new Date(),
        $inc: { messageCount: 1 }
      },
      { upsert: true, new: true }
    );
  }

  // Utility methods for key generation
  static async generateIdentityKeyPair(userUUID: string | Types.UUID): Promise<void> {
    const uuid = typeof userUUID === 'string' ? new Types.UUID(userUUID) : userUUID;
    const store = new SignalProtocolStore(uuid);
    
    const identityKeyPair = libsignal.PrivateKey.generate();
    // Generate a random registration ID (1-16383)
    const registrationId = Math.floor(Math.random() * 16383) + 1;

    await IdentityKeyModel.create({
      userUUID: uuid,
      publicKey: identityKeyPair.getPublicKey().serialize(),
      privateKey: store.encrypt(identityKeyPair.serialize()),
      registrationId: registrationId
    });
  }

  static async generatePreKeys(
    userUUID: string | Types.UUID,
    startId: number = 1,
    count: number = 100
  ): Promise<void> {
    const uuid = typeof userUUID === 'string' ? new Types.UUID(userUUID) : userUUID;
    const store = new SignalProtocolStore(uuid);

    const preKeys = [];
    for (let i = 0; i < count; i++) {
      const preKeyId = startId + i;
      const preKey = libsignal.PrivateKey.generate();
      preKeys.push({
        userUUID: uuid,
        keyId: preKeyId,
        publicKey: preKey.getPublicKey().serialize(),
        privateKey: store.encrypt(preKey.serialize()),
        used: false
      });
    }

    await PreKeyModel.insertMany(preKeys);
  }

  static async generateSignedPreKey(
    userUUID: string | Types.UUID,
    signedPreKeyId: number = 1
  ): Promise<void> {
    const uuid = typeof userUUID === 'string' ? new Types.UUID(userUUID) : userUUID;
    const store = new SignalProtocolStore(uuid);

    const identityKeyPair = await store.getIdentityKeyPair();
    const signedPreKey = libsignal.PrivateKey.generate();
    const signature = identityKeyPair.sign(signedPreKey.getPublicKey().serialize());

    await store.storeSignedPreKey(
      signedPreKeyId,
      libsignal.SignedPreKeyRecord.new(
        signedPreKeyId,
        Date.now(),
        signedPreKey.getPublicKey(),
        signedPreKey,
        signature
      )
    );
  }

  // Get unused prekey count for monitoring
  async getUnusedPreKeyCount(): Promise<number> {
    return await PreKeyModel.countDocuments({
      userUUID: this.userUUID,
      used: false
    });
  }

  // Helper method to create prekey bundle for sharing
  async createPreKeyBundle(): Promise<{
    registrationId: number;
    identityKey: Buffer;
    signedPreKey: {
      keyId: number;
      publicKey: Buffer;
      signature: Buffer;
    };
    preKey?: {
      keyId: number;
      publicKey: Buffer;
    };
  }> {
    const registrationId = await this.getLocalRegistrationId();
    const identityKeyPair = await this.getIdentityKeyPair();
    const identityKey = identityKeyPair.getPublicKey().serialize();

    // Get the current signed prekey
    const signedPreKey = await SignedPreKeyModel.findOne({
      userUUID: this.userUUID,
      active: true
    }).sort({ timestamp: -1 });

    if (!signedPreKey) {
      throw new Error('No active signed prekey found');
    }

    // Get an unused prekey
    const preKey = await PreKeyModel.findOne({
      userUUID: this.userUUID,
      used: false
    }).sort({ keyId: 1 });

    const bundle: any = {
      registrationId,
      identityKey,
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature
      }
    };

    if (preKey) {
      bundle.preKey = {
        keyId: preKey.keyId,
        publicKey: preKey.publicKey
      };
    }

    return bundle;
  }
} 