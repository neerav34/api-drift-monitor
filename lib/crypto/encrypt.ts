import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts hosted-mode `auth_header` values at rest (AES-256-GCM). Never
 * import this into anything reachable from the browser -- it's for the
 * server-side hosted-mode checker path only. The key must never live in the
 * database itself, only in the server's env.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.AUTH_HEADER_ENCRYPTION_KEY;
  if (!hex) throw new Error("AUTH_HEADER_ENCRYPTION_KEY is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "AUTH_HEADER_ENCRYPTION_KEY must be 32 bytes (64 hex chars) -- generate with `openssl rand -hex 32`"
    );
  }
  return key;
}

/** Returns iv || authTag || ciphertext, ready to store in the `bytea` column. */
export function encryptAuthHeader(plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptAuthHeader(stored: Buffer): string {
  const iv = stored.subarray(0, IV_LENGTH);
  const authTag = stored.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = stored.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
