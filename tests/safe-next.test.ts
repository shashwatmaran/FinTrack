import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

/**
 * The `?next=` destination is attacker-supplied: it comes from a URL someone
 * can send you. The sign-in page redirects to it after a real, successful
 * login, which is exactly what makes an open redirect here worth having — the
 * victim sees a genuine FinTrack login and lands somewhere else.
 */
describe("accepts real in-app destinations", () => {
  it.each([
    "/dashboard",
    "/groups/g1",
    "/invite?token=abc123",
    "/reset-password?token=a.b-c_d",
    "/expenses?q=thai%20food",
  ])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it("keeps the query string, which is the whole point for invites", () => {
    // Dropping it was the bug: an invite followed while signed out lost its
    // token before sign-in and arrived with nothing to redeem.
    expect(safeNextPath("/invite?token=abc123")).toContain("token=abc123");
  });
});

describe("refuses anything that leaves this origin", () => {
  it.each([
    ["//evil.example.com", "protocol-relative"],
    ["//evil.example.com/path", "protocol-relative with a path"],
    ["/\\evil.example.com", "backslash form browsers normalise"],
    ["https://evil.example.com", "absolute"],
    ["http://evil.example.com", "absolute, insecure"],
    ["javascript:alert(1)", "script scheme"],
    ["data:text/html,<script>alert(1)</script>", "data scheme"],
    ["evil.example.com", "schemeless host"],
    ["dashboard", "relative without a leading slash"],
  ])("rejects %s (%s)", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("rejects a control character that could split a header", () => {
    expect(safeNextPath("/dashboard\r\nSet-Cookie: a=b")).toBeNull();
    expect(safeNextPath("/dashboard\n")).toBeNull();
  });
});

describe("absent values", () => {
  it.each([null, undefined, ""])("returns null for %s", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });
});
