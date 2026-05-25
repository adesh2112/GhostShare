import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signDownloadToken, verifyDownloadToken } from "./token";

describe("Token Utilities", () => {
  const publicId = "test-share-123";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should generate a token and verify it successfully within expiration", () => {
    const token = signDownloadToken(publicId);
    const isValid = verifyDownloadToken(publicId, token);
    
    expect(isValid).toBe(true);
  });

  it("should reject verification if publicId is different", () => {
    const token = signDownloadToken(publicId);
    const isValid = verifyDownloadToken("another-share-id", token);
    
    expect(isValid).toBe(false);
  });

  it("should reject token if expired", () => {
    const token = signDownloadToken(publicId);
    
    // Fast-forward time by 3 minutes (limit is 2 minutes)
    vi.advanceTimersByTime(3 * 60 * 1000);
    
    const isValid = verifyDownloadToken(publicId, token);
    expect(isValid).toBe(false);
  });

  it("should reject token if it is tampered with", () => {
    const token = signDownloadToken(publicId);
    
    // Modify a character in payload or signature
    const parts = token.split(".");
    const tamperedToken = parts[0] + "modified." + parts[1];
    
    const isValid = verifyDownloadToken(publicId, tamperedToken);
    expect(isValid).toBe(false);
  });

  it("should handle empty or malformed tokens safely without crashing", () => {
    expect(verifyDownloadToken(publicId, "")).toBe(false);
    expect(verifyDownloadToken(publicId, "malformed-token-string")).toBe(false);
    expect(verifyDownloadToken(publicId, "base64.signature.extra")).toBe(false);
  });
});
