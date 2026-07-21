import { hash, verify } from "@node-rs/argon2"

import type { PasswordProvider } from "./types.ts"

/** Email + password, backed by Argon2id via @node-rs/argon2 (a native addon that
 *  runs on Node and Bun alike). @node-rs/argon2 defaults to the Argon2id variant;
 *  salt + params live in the hash string, so verify needs no extra config. Note
 *  the arg order: verify(hash, password). */
export const passwordProvider: PasswordProvider = {
  id: "password",
  kind: "password",
  hash: (password) => hash(password),
  verify: (password, digest) => verify(digest, password),
}
