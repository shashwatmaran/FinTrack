import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Digital Asset Links, checked because nothing else will.
 *
 * This file is how Android decides whether `app.fintrack` may open fintrack
 * links. It is fetched by Google's verifier, not by our code, so a typo here
 * produces no error anywhere in this repo — App Links simply stop working, and
 * links open in the browser instead of the app. That failure looks exactly like
 * "we never implemented it", which is why it deserves assertions rather than a
 * careful read.
 *
 * The fingerprint must match the release keystore. When that key is rotated or
 * a second one is added, this test does not know — but it does guarantee that
 * whatever is here is *shaped* like a fingerprint Android will accept.
 */
describe("assetlinks.json", () => {
  const raw = readFileSync(
    join(process.cwd(), "public", ".well-known", "assetlinks.json"),
    "utf8"
  );

  it("is valid JSON in the array form the spec requires", () => {
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  const statements = JSON.parse(raw);

  it("delegates URL handling to the Android app", () => {
    for (const statement of statements) {
      expect(statement.relation).toContain(
        "delegate_permission/common.handle_all_urls"
      );
      expect(statement.target.namespace).toBe("android_app");
    }
  });

  it("names the package the app actually ships as", () => {
    // Must equal `applicationId` in app/build.gradle.kts. A mismatch here is
    // invisible: verification just fails.
    expect(statements[0].target.package_name).toBe("app.fintrack");
  });

  it("carries fingerprints Android can parse", () => {
    /**
     * 32 uppercase hex pairs, colon separated — the form `keytool` and
     * `apksigner` emit. Android is strict about this; a lowercase or
     * space-separated digest is silently rejected rather than normalised.
     */
    const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

    for (const statement of statements) {
      const prints = statement.target.sha256_cert_fingerprints;
      expect(Array.isArray(prints)).toBe(true);
      expect(prints.length).toBeGreaterThan(0);

      for (const print of prints) {
        expect(print, `${print} is not a SHA-256 fingerprint`).toMatch(SHA256);
      }
    }
  });

  it("has no duplicate fingerprints", () => {
    // Harmless to Android, but a duplicate is the visible symptom of pasting a
    // new key in without removing the old one it was meant to replace.
    const prints = statements.flatMap(
      (s: { target: { sha256_cert_fingerprints: string[] } }) =>
        s.target.sha256_cert_fingerprints
    );
    expect(new Set(prints).size).toBe(prints.length);
  });
});
