import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Hashes an IP address using SHA-256 with a salt (to prevent simple dictionary attacks).
 * @param ip Client IP address
 * @returns 64-character hex hash
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_SALT || "ephemeral-salt-12345";
  return crypto
    .createHash("sha256")
    .update(ip + salt)
    .digest("hex");
}

/**
 * Hashes a plaintext password using bcrypt.
 * @param password Plaintext password
 * @returns bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 * @param password Plaintext password
 * @param hash bcrypt hash string
 * @returns boolean match status
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically secure random token (e.g. for delete tokens, session tokens).
 * @returns 64-character hex token
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
