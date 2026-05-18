import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
});

describe("crypto", () => {
  it("round-trips a string", () => {
    const ciphertext = encrypt("sk-test-key-12345");
    expect(ciphertext).not.toContain("sk-test-key-12345");
    expect(decrypt(ciphertext)).toBe("sk-test-key-12345");
  });

  it("produces different ciphertexts each call (random IV)", () => {
    const a = encrypt("same-plaintext");
    const b = encrypt("same-plaintext");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-plaintext");
    expect(decrypt(b)).toBe("same-plaintext");
  });

  it("throws on tampered ciphertext", () => {
    const ct = encrypt("hello");
    const tampered = ct.slice(0, -2) + "ff";
    expect(() => decrypt(tampered)).toThrow();
  });
});
