import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    /**
     * Node by default — the store contract talks to a real mongod and the
     * route tests exercise server code. Component tests opt into jsdom with a
     * `@vitest-environment jsdom` docblock, so the DOM is only paid for by the
     * files that need it.
     */
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup-dom.ts"],
    // The MongoDB contract suite starts a real mongod on first run, which
    // includes a one-time binary download.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/mock-data.ts", "lib/db/**", "lib/api/client.ts"],
    },
  },
  resolve: {
    alias: [
      // `server-only` throws unless it's loaded under React's react-server
      // condition. The modules under test are server modules by design, so it
      // is stubbed rather than worked around.
      { find: /^server-only$/, replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${path.resolve(__dirname)}/` },
    ],
  },
});
