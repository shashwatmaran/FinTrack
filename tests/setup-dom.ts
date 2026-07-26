export {}; // makes this a module, so the top-level awaits below are legal

/**
 * Shared setup, applied to every test file.
 *
 * Everything DOM-related is behind the `window` guard: most of the suite runs
 * in the node environment, where importing Testing Library would fail. Only
 * files carrying a `@vitest-environment jsdom` docblock take this branch.
 */
if (typeof window !== "undefined") {
  // Adds toBeInTheDocument, toBeDisabled, and friends to `expect`.
  await import("@testing-library/jest-dom/vitest");

  const { cleanup } = await import("@testing-library/react");
  const { afterEach } = await import("vitest");

  // Unmount between cases; otherwise queries match nodes left by earlier tests.
  afterEach(cleanup);
}
