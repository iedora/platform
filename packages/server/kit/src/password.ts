import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP 2025 / RFC 9106 parameters (64 MiB, 3 iterations,
// parallelism 2, 32-byte key, 16-byte salt). The PHC string encodes the params,
// so verify is self-describing and previously stored hashes verify unchanged.
const OPTIONS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 2,
  outputLen: 32,
  saltLength: 16,
} as const;

/** Hashes a password to a PHC string. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Verifies a password against a stored PHC hash. */
export function verifyPassword(phc: string, password: string): Promise<boolean> {
  return verify(phc, password);
}
