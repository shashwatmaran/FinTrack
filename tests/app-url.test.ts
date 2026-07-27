import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Links that go in an email.
 *
 * The bug this guards shipped: invite and reset URLs were built from the
 * incoming request's origin, so an invite sent while testing locally arrived
 * as `http://localhost:3000/invite?...` — a link only the sender's machine can
 * open. The origin of the request has nothing to do with where a *recipient*
 * should be sent.
 */
const envMock = { APP_URL: undefined as string | undefined };

vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
  features: {},
}));

const { appOrigin, appLink, isLocalOrigin } = await import("@/lib/server/app-url");

const req = (url = "http://localhost:3000/api/password/forgot") => new Request(url);

beforeEach(() => {
  envMock.APP_URL = undefined;
  vi.unstubAllEnvs();
  // restore, not just re-spy: vi.spyOn returns the existing spy for a method
  // already spied on, and its call log carries over into the next test.
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("precedence", () => {
  it("uses APP_URL above everything else", () => {
    envMock.APP_URL = "https://fintrack.example.com";
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ignored.vercel.app");

    expect(appOrigin(req())).toBe("https://fintrack.example.com");
  });

  it("tolerates a trailing slash on APP_URL", () => {
    // Otherwise every link comes out with a double slash.
    envMock.APP_URL = "https://fintrack.example.com/";
    expect(appLink("/invite?token=abc", req())).toBe("https://fintrack.example.com/invite?token=abc");
  });

  it("falls back to the Vercel production domain", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fin-track.vercel.app");
    expect(appOrigin(req())).toBe("https://fin-track.vercel.app");
  });

  it("prefers the production domain over the request that triggered it", () => {
    // A reset requested from a preview deployment should still land on prod;
    // previews are torn down and the link would 404 later.
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fin-track.vercel.app");
    expect(appOrigin(req("https://fin-track-abc123.vercel.app/api/x"))).toBe(
      "https://fin-track.vercel.app"
    );
  });

  it("uses the request origin only when nothing else is configured", () => {
    expect(appOrigin(req("http://localhost:3000/api/x"))).toBe("http://localhost:3000");
  });

  it("has a usable default with no request at all", () => {
    expect(appOrigin()).toBe("http://localhost:3000");
  });
});

describe("recognising a link nobody else can open", () => {
  it.each([
    "http://localhost:3000",
    "https://localhost",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("flags %s", (origin) => {
    expect(isLocalOrigin(origin)).toBe(true);
  });

  it.each(["https://fintrack.example.com", "https://fin-track.vercel.app"])(
    "does not flag %s",
    (origin) => {
      expect(isLocalOrigin(origin)).toBe(false);
    }
  );

  it("does not mistake a hostname that merely contains localhost", () => {
    expect(isLocalOrigin("https://localhost.evil.com")).toBe(false);
  });

  it("warns when a production build would email a localhost link", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");

    appLink("/invite?token=abc", req("http://localhost:3000/api/x"));
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/APP_URL/);
  });

  it("stays quiet in development, where localhost is correct", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");

    appLink("/invite?token=abc", req("http://localhost:3000/api/x"));
    expect(warn).not.toHaveBeenCalled();
  });
});
