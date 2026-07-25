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
    // Frozen reference copy of the pre-Next.js prototype — kept for design
    // parity while porting screens, deliberately not held to app lint rules.
    "legacy-prototype/**",
  ]),
  {
    files: ["components/modals/**/*.tsx", "components/auth/**/*.tsx"],
    rules: {
      // react-hook-form's watch() can't be memoized by React Compiler. These
      // forms are small and re-render cheaply, so opting them out is fine.
      "react-hooks/incompatible-library": "off",
    },
  },
]);

export default eslintConfig;
