import { describe, it, expect } from "vitest";
import { hashIp, hashPassword, comparePassword, generateSecureToken } from "./crypto";

describe("Crypto Utilities", () => {
  describe("hashIp", () => {
    it("should consistently hash the same IP address", () => {
      const ip = "192.168.1.1";
      const hash1 = hashIp(ip);
      const hash2 = hashIp(ip);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
    });

    it("should produce different hashes for different IP addresses", () => {
      const hashA = hashIp("192.168.1.1");
      const hashB = hashIp("192.168.1.2");
      
      expect(hashA).not.toBe(hashB);
    });
  });

  describe("Password Hashing", () => {
    it("should hash a password and verify it successfully", async () => {
      const password = "my-super-secret-password-123";
      const hash = await hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(await comparePassword(password, hash)).toBe(true);
    });

    it("should reject incorrect passwords", async () => {
      const password = "correct-password";
      const wrongPassword = "wrong-password";
      const hash = await hashPassword(password);
      
      expect(await comparePassword(wrongPassword, hash)).toBe(false);
    });
  });

  describe("generateSecureToken", () => {
    it("should generate a 64-character secure hex token", () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      
      expect(token1).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });
  });
});
