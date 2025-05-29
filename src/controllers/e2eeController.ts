import { Context } from 'hono';
import { MessageEncryptionService } from '../services/signal/messageEncryption';
import { SignalProtocolStore } from '../services/signal/signalProtocolStore';
import { Types } from 'mongoose';

export class E2EEController {
  /**
   * Initialize Signal Protocol keys for a user
   */
  static async initializeKeys(ctx: Context): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const { userUUID } = body;
      
      if (!userUUID) {
        return ctx.json({ error: 'userUUID is required' }, 400);
      }

      // Initialize Signal Protocol keys
      await MessageEncryptionService.initializeUser(userUUID);

      return ctx.json({ 
        message: 'Signal Protocol keys initialized successfully',
        userUUID 
      }, 200);
    } catch (error: any) {
      console.error('Error initializing keys:', error);
      return ctx.json({ 
        error: 'Failed to initialize keys',
        details: error.message 
      }, 500);
    }
  }

  /**
   * Get prekey bundle for a user
   */
  static async getPreKeyBundle(ctx: Context): Promise<Response> {
    try {
      const userUUID = ctx.req.param('userUUID');
      
      if (!userUUID) {
        return ctx.json({ error: 'userUUID is required' }, 400);
      }

      const encryptionService = new MessageEncryptionService(userUUID);
      const preKeyBundle = await encryptionService.createPreKeyBundle();

      return ctx.json({ 
        preKeyBundle: {
          registrationId: preKeyBundle.registrationId,
          identityKey: preKeyBundle.identityKey.toString('base64'),
          signedPreKey: {
            keyId: preKeyBundle.signedPreKey.keyId,
            publicKey: preKeyBundle.signedPreKey.publicKey.toString('base64'),
            signature: preKeyBundle.signedPreKey.signature.toString('base64')
          },
          preKey: preKeyBundle.preKey ? {
            keyId: preKeyBundle.preKey.keyId,
            publicKey: preKeyBundle.preKey.publicKey.toString('base64')
          } : undefined
        }
      }, 200);
    } catch (error: any) {
      console.error('Error getting prekey bundle:', error);
      return ctx.json({ 
        error: 'Failed to get prekey bundle',
        details: error.message 
      }, 500);
    }
  }

  /**
   * Establish a session with another user
   */
  static async establishSession(ctx: Context): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const { userUUID, recipientUUID, preKeyBundle, deviceId = 1 } = body;
      
      if (!userUUID || !recipientUUID || !preKeyBundle) {
        return ctx.json({ 
          error: 'userUUID, recipientUUID, and preKeyBundle are required' 
        }, 400);
      }

      // Convert base64 strings back to Buffers
      const bundle = {
        registrationId: preKeyBundle.registrationId,
        identityKey: Buffer.from(preKeyBundle.identityKey, 'base64'),
        signedPreKey: {
          keyId: preKeyBundle.signedPreKey.keyId,
          publicKey: Buffer.from(preKeyBundle.signedPreKey.publicKey, 'base64'),
          signature: Buffer.from(preKeyBundle.signedPreKey.signature, 'base64')
        },
        preKey: preKeyBundle.preKey ? {
          keyId: preKeyBundle.preKey.keyId,
          publicKey: Buffer.from(preKeyBundle.preKey.publicKey, 'base64')
        } : undefined
      };

      const encryptionService = new MessageEncryptionService(userUUID);
      await encryptionService.establishSession(recipientUUID, bundle, deviceId);

      return ctx.json({ 
        message: 'Session established successfully',
        userUUID,
        recipientUUID,
        deviceId
      }, 200);
    } catch (error: any) {
      console.error('Error establishing session:', error);
      return ctx.json({ 
        error: 'Failed to establish session',
        details: error.message 
      }, 500);
    }
  }

  /**
   * Check session status
   */
  static async getSessionStatus(ctx: Context): Promise<Response> {
    try {
      const userUUID = ctx.req.param('userUUID');
      const recipientUUID = ctx.req.param('recipientUUID');
      const deviceId = ctx.req.query('deviceId') || '1';
      
      if (!userUUID || !recipientUUID) {
        return ctx.json({ error: 'userUUID and recipientUUID are required' }, 400);
      }

      const encryptionService = new MessageEncryptionService(userUUID);
      const hasSession = await encryptionService.hasSession(recipientUUID, Number(deviceId));
      const sessionInfo = await encryptionService.getSessionInfo(recipientUUID, Number(deviceId));

      return ctx.json({ 
        hasSession,
        sessionInfo: sessionInfo ? {
          sessionId: sessionInfo.sessionId,
          status: sessionInfo.status,
          lastActivityAt: sessionInfo.lastActivityAt,
          messageCount: sessionInfo.messageCount
        } : null
      }, 200);
    } catch (error: any) {
      console.error('Error getting session status:', error);
      return ctx.json({ 
        error: 'Failed to get session status',
        details: error.message 
      }, 500);
    }
  }

  /**
   * Rotate signed prekey
   */
  static async rotateSignedPreKey(ctx: Context): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const { userUUID } = body;
      
      if (!userUUID) {
        return ctx.json({ error: 'userUUID is required' }, 400);
      }

      const encryptionService = new MessageEncryptionService(userUUID);
      await encryptionService.rotateSignedPreKey();

      return ctx.json({ 
        message: 'Signed prekey rotated successfully',
        userUUID 
      }, 200);
    } catch (error: any) {
      console.error('Error rotating signed prekey:', error);
      return ctx.json({ 
        error: 'Failed to rotate signed prekey',
        details: error.message 
      }, 500);
    }
  }

  /**
   * Get prekey pool status
   */
  static async getPreKeyPoolStatus(ctx: Context): Promise<Response> {
    try {
      const userUUID = ctx.req.param('userUUID');
      
      if (!userUUID) {
        return ctx.json({ error: 'userUUID is required' }, 400);
      }

      const store = new SignalProtocolStore(userUUID);
      const unusedCount = await store.getUnusedPreKeyCount();

      return ctx.json({ 
        unusedPreKeyCount: unusedCount,
        needsReplenishment: unusedCount < 10
      }, 200);
    } catch (error: any) {
      console.error('Error getting prekey pool status:', error);
      return ctx.json({ 
        error: 'Failed to get prekey pool status',
        details: error.message 
      }, 500);
    }
  }

  /**
   * Replenish prekey pool
   */
  static async replenishPreKeys(ctx: Context): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const { userUUID } = body;
      
      if (!userUUID) {
        return ctx.json({ error: 'userUUID is required' }, 400);
      }

      const encryptionService = new MessageEncryptionService(userUUID);
      await encryptionService.replenishPreKeys();

      return ctx.json({ 
        message: 'Prekey pool replenished successfully',
        userUUID 
      }, 200);
    } catch (error: any) {
      console.error('Error replenishing prekeys:', error);
      return ctx.json({ 
        error: 'Failed to replenish prekeys',
        details: error.message 
      }, 500);
    }
  }
}
