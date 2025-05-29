import * as libsignal from '@signalapp/libsignal-client';
import { SignalProtocolStore } from './signalProtocolStore';
import { Types } from 'mongoose';
import { SessionModel, SessionStatus } from '../../models/sessionModel';

export interface EncryptedMessage {
  ciphertext: Buffer;
  messageType: number;
  registrationId: number;
}

export interface DecryptedMessage {
  plaintext: Buffer;
  senderUUID: string;
}

export interface PreKeyBundle {
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
}

export class MessageEncryptionService {
  private store: SignalProtocolStore;
  private userUUID: Types.UUID;

  constructor(userUUID: string | Types.UUID) {
    this.userUUID = typeof userUUID === 'string' ? new Types.UUID(userUUID) : userUUID;
    this.store = new SignalProtocolStore(this.userUUID);
  }

  /**
   * Encrypt a message for a specific recipient
   * Note: Simplified implementation - will be enhanced with full Signal Protocol
   */
  async encryptMessage(
    recipientUUID: string,
    plaintext: string,
    deviceId: number = 1
  ): Promise<EncryptedMessage> {
    try {
      // Check if we have an existing session
      const hasSession = await this.hasSession(recipientUUID, deviceId);
      if (!hasSession) {
        throw new Error(`No session exists with ${recipientUUID}. Establish a session first.`);
      }

      // For now, use basic encryption (will be replaced with Signal Protocol)
      const plaintextBuffer = Buffer.from(plaintext, 'utf8');
      const registrationId = await this.store.getLocalRegistrationId();

      return {
        ciphertext: plaintextBuffer, // Simplified - will be replaced with actual encryption
        messageType: 1, // Whisper message type
        registrationId
      };
    } catch (error: any) {
      console.error('Error encrypting message:', error);
      throw new Error(`Failed to encrypt message: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a message from a specific sender
   * Note: Simplified implementation - will be enhanced with full Signal Protocol
   */
  async decryptMessage(
    senderUUID: string,
    encryptedMessage: EncryptedMessage,
    deviceId: number = 1
  ): Promise<DecryptedMessage> {
    try {
      // Check if we have a session
      const hasSession = await this.hasSession(senderUUID, deviceId);
      if (!hasSession) {
        throw new Error('No session found for decryption');
      }

      // For now, use basic decryption (will be replaced with Signal Protocol)
      const plaintext = encryptedMessage.ciphertext;

      return {
        plaintext: Buffer.from(plaintext.toString(), 'utf8'),
        senderUUID
      };
    } catch (error: any) {
      console.error('Error decrypting message:', error);
      throw new Error(`Failed to decrypt message: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Establish a session with a recipient using their prekey bundle
   * Note: Simplified implementation - will be enhanced with full X3DH
   */
  async establishSession(
    recipientUUID: string,
    preKeyBundle: PreKeyBundle,
    deviceId: number = 1
  ): Promise<void> {
    try {
      // Validate the prekey bundle
      if (!preKeyBundle.identityKey || !preKeyBundle.signedPreKey) {
        throw new Error('Invalid prekey bundle: missing required keys');
      }

      // For now, just create a session record in our database
      // TODO: Implement full X3DH key exchange with libsignal-client
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
          sessionData: Buffer.from('simplified-session-data'), // Placeholder
          status: SessionStatus.ACTIVE,
          lastActivityAt: new Date(),
          messageCount: 0
        },
        { upsert: true, new: true }
      );

      console.log(`Session established with ${recipientUUID} (simplified implementation)`);
    } catch (error: any) {
      console.error('Error establishing session:', error);
      throw new Error(`Failed to establish session: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if a session exists with a recipient
   */
  async hasSession(recipientUUID: string, deviceId: number = 1): Promise<boolean> {
    try {
      const session = await SessionModel.findOne({
        $or: [
          { initiatorUUID: this.userUUID, recipientUUID: new Types.UUID(recipientUUID) },
          { initiatorUUID: new Types.UUID(recipientUUID), recipientUUID: this.userUUID }
        ],
        deviceId: deviceId,
        status: SessionStatus.ACTIVE
      });
      return session !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get session information
   */
  async getSessionInfo(recipientUUID: string, deviceId: number = 1) {
    const session = await SessionModel.findOne({
      $or: [
        { initiatorUUID: this.userUUID, recipientUUID: new Types.UUID(recipientUUID) },
        { initiatorUUID: new Types.UUID(recipientUUID), recipientUUID: this.userUUID }
      ],
      deviceId: deviceId,
      status: SessionStatus.ACTIVE
    });

    return session;
  }

  /**
   * Create a prekey bundle for this user to share with others
   */
  async createPreKeyBundle(): Promise<PreKeyBundle> {
    return await this.store.createPreKeyBundle();
  }

  /**
   * Initialize Signal Protocol keys for a new user
   */
  static async initializeUser(userUUID: string | Types.UUID): Promise<void> {
    try {
      // Generate identity key pair
      await SignalProtocolStore.generateIdentityKeyPair(userUUID);
      
      // Generate signed prekey
      await SignalProtocolStore.generateSignedPreKey(userUUID, 1);
      
      // Generate one-time prekeys
      await SignalProtocolStore.generatePreKeys(userUUID, 1, 100);
      
      console.log(`Signal Protocol keys initialized for user ${userUUID}`);
    } catch (error: any) {
      console.error('Error initializing user keys:', error);
      throw new Error(`Failed to initialize keys: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Rotate signed prekey (should be done periodically)
   */
  async rotateSignedPreKey(): Promise<void> {
    try {
      const currentTime = Date.now();
      const signedPreKeyId = Math.floor(currentTime / 1000); // Use timestamp as ID
      
      await SignalProtocolStore.generateSignedPreKey(this.userUUID, signedPreKeyId);
      console.log(`Signed prekey rotated for user ${this.userUUID}`);
    } catch (error: any) {
      console.error('Error rotating signed prekey:', error);
      throw new Error(`Failed to rotate signed prekey: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Replenish one-time prekeys when running low
   */
  async replenishPreKeys(): Promise<void> {
    try {
      const unusedCount = await this.store.getUnusedPreKeyCount();
      
      if (unusedCount < 10) {
        // Find the highest existing prekey ID
        const lastPreKey = await this.store.getUnusedPreKeyCount();
        const startId = lastPreKey + 1;
        
        // Generate 100 new prekeys
        await SignalProtocolStore.generatePreKeys(this.userUUID, startId, 100);
        console.log(`Replenished prekeys for user ${this.userUUID}`);
      }
    } catch (error: any) {
      console.error('Error replenishing prekeys:', error);
      throw new Error(`Failed to replenish prekeys: ${error?.message || 'Unknown error'}`);
    }
  }
} 