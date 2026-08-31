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
    /*
     * Compiled output from the one-off scripts in package.json — each one tscs
     * itself into a .tmp-<name>/ directory and runs it from there. Linting
     * generated JavaScript reported 201 errors about minified variable names in
     * code nobody wrote, which is enough noise to make `npm run lint` useless
     * as a gate: the three real warnings in app/ were invisible under it.
     */
    ".tmp-*/**",
    // Same reason: the Capacitor shell holds a COPY of the built web bundle,
    // and supabase/.temp is CLI scratch. Both are generated, both are already
    // gitignored, neither is anybody's source.
    "android/**",
    "ios/**",
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
