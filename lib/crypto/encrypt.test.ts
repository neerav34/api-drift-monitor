import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptAuthHeader, encryptAuthHeader } from "./encrypt";

beforeAll(() => {
  process.env.AUTH_HEADER_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("encryptAuthHeader / decryptAuthHeader", () => {
  it("round-trips a plaintext auth header", () => {
    const plaintext = "Bearer sk_live_abc123";
    const stored = encryptAuthHeader(plaintext);
    expect(decryptAuthHeader(stored)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptAuthHeader("same-value");
    const b = encryptAuthHeader("same-value");
    expect(a.equals(b)).toBe(false);
  });

  it("throws instead of returning tampered plaintext", () => {
    const stored = encryptAuthHeader("Bearer sk_live_abc123");
    stored[stored.length - 1] ^= 0xff; // flip a byte in the ciphertext
    expect(() => decryptAuthHeader(stored)).toThrow();
  });
});
