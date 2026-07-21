import type { PasswordProvider } from "./types"

/** Email + password, backed by Bun's built-in Argon2id (salt + params live in
 *  the hash string, so verify needs no extra config). */
export const passwordProvider: PasswordProvider = {
  id: "password",
  kind: "password",
  hash: (password) => Bun.password.hash(password, { algorithm: "argon2id" }),
  verify: (password, hash) => Bun.password.verify(password, hash),
}
