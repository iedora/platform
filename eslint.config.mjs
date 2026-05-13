// TODO: enable feature/shared boundary rules. The migration to features/ + shared/
// is complete; flip these on in a follow-up by adding eslint-plugin-boundaries to
// the imports below and registering the elements + rules inline here. Reference
// config in commit history before .eslintrc-boundaries.json was removed.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
