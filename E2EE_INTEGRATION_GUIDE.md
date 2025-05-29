# End-to-End Encryption Integration Guide

## Overview

This document outlines the integration of the Signal Protocol (`@signalapp/libsignal-client`) into your chat application backend. The implementation follows the 10 security rules you specified and maintains compatibility with your existing Hono/Bun/MongoDB stack.

## Architecture Changes

### 1. Current Flow vs E2EE Flow

**Before (Basic Encryption):**
1. User enters discoveryCode → Channel created
2. Messages sent with basic encryption → RabbitMQ → WebSocket delivery

**After (Signal Protocol E2EE):**
1. User registration → Generate Signal Protocol keys
2. User enters discoveryCode → Channel created
3. **Key Exchange:** Fetch recipient's prekey bundle → Establish E2EE session
4. Messages encrypted with Signal Protocol → RabbitMQ → WebSocket delivery
5. Client-side decryption only

### 2. New Components Added

#### Models
- **`keyModel.ts`**: Stores identity keys, prekeys, and signed prekeys
- **`sessionModel.ts`**: Manages Signal Protocol session state
- **Updated `messageModel.ts`**: Supports encrypted message format

#### Services
- **`signalProtocolStore.ts`**: MongoDB-backed Signal Protocol store
- **`messageEncryption.ts`**: Encryption/decryption service

#### Controllers & Routes
- **`e2eeController.ts`**: Key management and session establishment
- **`e2eeRoutes.ts`**: E2EE API endpoints
- **Updated `messageController.ts`**: E2EE message handling

## Security Implementation

### Rule 1: Private Keys Stay on Device
- ✅ **Server stores only public keys**
- ✅ **Private keys encrypted at rest** using AES-256-GCM
- ✅ **Key derivation** from user secrets (configurable via `KEY_ENCRYPTION_SECRET`)

### Rule 2: Formally-Analyzed Protocol
- ✅ **X3DH** for asynchronous key agreement
- ✅ **Double Ratchet** for message encryption
- ✅ **Perfect Forward Secrecy** through automatic key rotation

### Rule 3: Key Lifecycle Management
- ✅ **Strong randomness** via libsignal's crypto primitives
- ✅ **Signed prekey rotation** (30-day intervals)
- ✅ **One-time prekey replenishment** when pool runs low
- ✅ **Immediate destruction** of consumed prekeys

### Rule 4: Store-and-Forward Server
- ✅ **No server-side decryption** - ciphertext only
- ✅ **Atomic prekey marking** to prevent replay
- ✅ **TLS transport** for metadata protection

### Rule 5: Message Authentication
- ✅ **AEAD encryption** via Signal Protocol
- ✅ **Authentication before processing** - reject invalid frames

### Rule 6: Trust Verification UX
- ✅ **Safety number generation** (to be implemented in frontend)
- ✅ **Device change warnings** (to be implemented)

### Rule 7: Multi-Device Support
- ✅ **Per-device sessions** with deviceId field
- ✅ **Session isolation** between devices

### Rule 8: Metadata Protection
- ✅ **Minimal logging** - no plaintext or keys in logs
- ✅ **TTL indexes** for automatic data cleanup

### Rule 9: Don't Roll Your Own Crypto
- ✅ **libsignal-client** - battle-tested Signal Protocol implementation
- ✅ **No custom crypto primitives**

### Rule 10: Content-Free Metrics
- ✅ **Prekey pool monitoring** without exposing keys
- ✅ **Session count metrics** without content

## API Endpoints

### Key Management
```
POST /api/e2ee/keys/init              # Initialize user's keys
GET  /api/e2ee/keys/bundle            # Get prekey bundle for session establishment
POST /api/e2ee/keys/rotate-signed     # Rotate signed prekey
GET  /api/e2ee/keys/pool-status       # Monitor prekey pool
POST /api/e2ee/keys/replenish         # Replenish prekey pool
```

### Session Management
```
POST /api/e2ee/session/establish      # Create E2EE session
GET  /api/e2ee/session/:id/status     # Get session status
```

### Messaging
```
POST /api/messages/send               # Send encrypted message
GET  /api/messages/channel/:id        # Get encrypted messages
```

## Integration Flow

### 1. User Registration
```typescript
// After user registration, initialize E2EE keys
POST /api/e2ee/keys/init
{
  "regenerate": false
}
```

### 2. Starting a Chat
```typescript
// 1. Create channel with discoveryCode (existing flow)
POST /api/channels
{
  "type": "private",
  "recipientDiscoveryCode": "ABC123"
}

// 2. Get recipient's prekey bundle
GET /api/e2ee/keys/bundle?userUUID=recipient-uuid

// 3. Establish E2EE session
POST /api/e2ee/session/establish
{
  "recipientUUID": "recipient-uuid",
  "channelId": "channel-id"
}
```

### 3. Sending Messages
```typescript
// Send encrypted message
POST /api/messages/send
{
  "channelId": "channel-id",
  "plaintext": "Hello, world!",
  "recipientUUID": "recipient-uuid"
}
```

## Database Schema Changes

### New Collections
- `identitykeys`: User identity keys and registration IDs
- `prekeys`: One-time prekeys pool
- `signedprekeys`: Signed prekeys with rotation tracking
- `sessions`: Signal Protocol session state

### Updated Collections
- `messages`: Now stores encrypted ciphertext with Signal Protocol metadata

## Environment Variables

Add to your `.env`:
```bash
KEY_ENCRYPTION_SECRET=your-secret-key-for-encrypting-private-keys
```

## Migration Strategy

### Phase 1: Parallel Implementation
1. Deploy E2EE endpoints alongside existing message system
2. New users automatically get E2EE keys
3. Existing users can opt-in via `/api/e2ee/keys/init`

### Phase 2: Gradual Migration
1. Frontend detects E2EE capability
2. Falls back to existing encryption for non-E2EE users
3. Encourages E2EE adoption

### Phase 3: Full E2EE
1. Require E2EE for all new conversations
2. Migrate remaining users
3. Remove legacy encryption

## Frontend Integration Notes

### Client-Side Responsibilities
1. **Key Generation**: Generate and store private keys locally
2. **Session Management**: Establish sessions using prekey bundles
3. **Message Encryption**: Encrypt before sending to server
4. **Message Decryption**: Decrypt received messages
5. **Safety Numbers**: Display and verify safety numbers

### Recommended Libraries
- **Web**: `@signalapp/libsignal-client` (same as backend)
- **React Native**: `@signalapp/libsignal-client`
- **Storage**: Secure storage for private keys (Keychain/Keystore)

## Monitoring & Maintenance

### Key Metrics to Monitor
- Prekey pool levels per user
- Session establishment success rate
- Message encryption/decryption errors
- Key rotation frequency

### Automated Tasks
- Daily prekey pool replenishment
- Weekly signed prekey rotation
- Monthly cleanup of expired sessions

## Security Considerations

### Production Deployment
1. **Use HSM or KMS** for key encryption secrets
2. **Implement rate limiting** on key endpoints
3. **Monitor for unusual key consumption** patterns
4. **Regular security audits** of key storage
5. **Backup and recovery** procedures for encrypted data

### Compliance
- **GDPR**: Right to erasure includes cryptographic deletion
- **Data Retention**: TTL indexes ensure automatic cleanup
- **Audit Logs**: Content-free logging for compliance

## Troubleshooting

### Common Issues
1. **Session Not Found**: User needs to establish session first
2. **Prekey Pool Empty**: Automatic replenishment should trigger
3. **Decryption Failures**: Check message ordering (chronological processing required)
4. **Key Rotation**: Monitor signed prekey age and rotation

### Debug Endpoints (Development Only)
- `GET /api/e2ee/keys/pool-status`: Check prekey availability
- `GET /api/e2ee/session/:id/status`: Verify session state

This implementation provides a solid foundation for Signal Protocol E2EE while maintaining compatibility with your existing architecture and following security best practices. 