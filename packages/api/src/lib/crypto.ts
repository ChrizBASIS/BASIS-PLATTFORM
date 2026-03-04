/**
 * AES-256-GCM Encryption for CRM Credentials
 *
 * Security rules:
 * - Key is 32 bytes, stored ONLY in ENV (CRM_ENCRYPTION_KEY)
 * - Each encryption uses a unique random IV (12 bytes)
 * - Auth tag (16 bytes) ensures integrity
 * - Credentials are NEVER logged, returned in errors, or sent to LLMs
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.CRM_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('CRM_ENCRYPTION_KEY must be set (min 32 chars). Generate with: openssl rand -hex 32');
  }
  // Use first 32 bytes of hex-decoded key, or raw string padded
  return Buffer.from(key, 'hex').length === 32
    ? Buffer.from(key, 'hex')
    : Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf-8');
}

export interface EncryptedData {
  encrypted: string;  // base64
  iv: string;         // base64
  tag: string;        // base64
}

/**
 * Encrypts plaintext credentials using AES-256-GCM.
 * Returns base64-encoded encrypted data, IV, and auth tag.
 */
export function encryptCredentials(plaintext: string): EncryptedData {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypts AES-256-GCM encrypted credentials.
 * Throws on tampered data (auth tag mismatch).
 */
export function decryptCredentials(data: EncryptedData): string {
  const key = getKey();
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Safely parse decrypted credentials JSON.
 * Never throws credential content in errors.
 */
export function parseCredentials<T = Record<string, string>>(data: EncryptedData): T {
  try {
    const json = decryptCredentials(data);
    return JSON.parse(json) as T;
  } catch {
    throw new Error('Credential decryption failed — key may have rotated or data is corrupted');
  }
}
