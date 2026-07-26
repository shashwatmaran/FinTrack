import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { queryKeys } from "@/lib/query-keys";

/**
 * Guards a silent performance regression.
 *
 * `queryKeys` has to be importable from server components, because the shell
 * layout prefetches with it and dehydrates the result into the RSC payload.
 * Exporting it from the hooks file looks equivalent but is not: that module is
 * `"use client"`, so a server component receives a client reference proxy.
 * It still works by identity inside one server render, which is why nothing
 * appears broken — but it serialises to `null`, the browser cannot match the
 * dehydrated entry, and every page refetches what the prefetch already paid
 * for. The page works. It is just quietly slower.
 */
describe("query keys", () => {
  it("live in a module with no directive that would trap them on one side", () => {
    // A directive only counts as the first statement, so comments mentioning
    // one — including the explanation in that very file — must not trip this.
    const firstStatement =
      readFileSync("lib/query-keys.ts", "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "";

    expect(firstStatement).not.toMatch(/^["'](use client|server-only)["']/);
    expect(firstStatement).not.toMatch(/^import ["']server-only["']/);
  });

  it("are plain serialisable arrays", () => {
    for (const key of Object.values(queryKeys)) {
      expect(Array.isArray(key)).toBe(true);
      // A client-reference proxy survives neither of these.
      expect(JSON.parse(JSON.stringify(key))).toEqual([...key]);
    }
  });

  it("keeps one key behind the whole shell", () => {
    // Splitting this back into per-resource keys reintroduces one request per
    // resource, which on serverless is one function invocation per resource.
    expect(queryKeys.bootstrap).toEqual(["bootstrap"]);
  });

  it("does not fold in data only one page reads", () => {
    // Activity stays separate so it is not fetched on every page load.
    expect(queryKeys.activity).not.toEqual(queryKeys.bootstrap);
  });
});
