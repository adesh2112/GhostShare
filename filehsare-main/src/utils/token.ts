import crypto from "crypto";

const SECRET = process.env.CRON_SECRET || "ephemeral-jwt-secret-987654";

/**
 * Creates a short-lived, signed download authorization token.
 * @param publicId File public_id
 * @returns Base64 encoded signed token
 */
export function signDownloadToken(publicId: string): string {
  const payload = {
    publicId,
    expiresAt: Date.now() + 2 * 60 * 1000, // Valid for 2 minutes
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64");
  
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(payloadB64);
  const signature = hmac.digest("hex");

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies if a download token is valid for a given publicId.
 * @param publicId File public_id
 * @param token Token to verify
 * @returns boolean validation result
 */
export function verifyDownloadToken(publicId: string, token: string): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadB64, signature] = parts;

  // Validate signature
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(payloadB64);
  const expectedSignature = hmac.digest("hex");

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return false;
  }

  // Validate payload contents
  try {
    const payloadStr = Buffer.from(payloadB64, "base64").toString("utf8");
    const payload = JSON.parse(payloadStr);

    if (payload.publicId !== publicId) return false;
    if (Date.now() > payload.expiresAt) return false;

    return true;
  } catch {
    return false;
  }
}
