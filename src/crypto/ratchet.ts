import { SessionCipher, MessageType } from 'libsignal-protocol-typescript';
import { E2EEError, ErrorCodes } from '../utils/errors';

// Constants
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB


// # 4.2 Message Encryption
export const encryptMessage = async (
  session: SessionCipher,
  message: string
): Promise<string> => {
  if (message.length > MAX_MESSAGE_SIZE) {
    throw new E2EEError(
      'Message too large',
      ErrorCodes.MESSAGE_TOO_LARGE,
      { maxSize: MAX_MESSAGE_SIZE }
    );
  }

  try {
    const encoder = new TextEncoder();
    const messageBuffer = encoder.encode(message);
    const arrayBuffer = new ArrayBuffer(messageBuffer.length);
    new Uint8Array(arrayBuffer).set(messageBuffer);
    const ciphertext = await session.encrypt(arrayBuffer);
    return ciphertext.body || '';
  } catch (error) {
    throw new E2EEError(
      'Failed to encrypt message',
      ErrorCodes.INVALID_MESSAGE,
      error
    );
  }
};

// # 4.3 Message Decryption
export const decryptMessage = async (
  session: SessionCipher,
  ciphertext: string
): Promise<string> => {
  try {
    const message: MessageType = {
      type: 1,
      body: ciphertext
    };
    const plaintext = await session.decryptPreKeyWhisperMessage(ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    throw new E2EEError(
      'Failed to decrypt message',
      ErrorCodes.INVALID_MESSAGE,
      error
    );
  }
}; 