"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, which
 * `app/error.tsx` sits inside of and therefore cannot catch.
 *
 * It replaces the root layout, so it has to render its own <html> and <body>,
 * and it deliberately imports nothing from the design system. Anything it
 * depended on would be another component that could be the very thing that
 * failed — a boundary that can throw is not a boundary. Plain elements and
 * inline styles only, so it renders even if the stylesheet never loads.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reporting is wrapped because this is the last boundary standing: if
    // Sentry itself is what failed to load, throwing here would replace the
    // error screen with a blank page. The console line always runs.
    try {
      Sentry.captureException(error);
    } catch {
      // Nothing useful to do — the screen below is the fallback.
    }
    console.error("[fintrack] root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "24px",
          background: "#fffdf7",
          color: "#1a1a1a",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            border: "2.5px solid #1a1a1a",
            borderRadius: "12px",
            background: "#ffffff",
            boxShadow: "7px 7px 0 0 #1a1a1a",
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2.5px solid #1a1a1a",
              borderRadius: "12px",
              background: "#ff6b6b",
              boxShadow: "3px 3px 0 0 #1a1a1a",
              fontSize: "30px",
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            !
          </div>

          <h1 style={{ fontSize: "26px", margin: 0, fontWeight: 700 }}>FinTrack couldn&apos;t start</h1>
          <p style={{ marginTop: "8px", fontSize: "14px", color: "#55554f", fontWeight: 500 }}>
            Something failed before the app could render. Your data is safe — nothing was saved or
            changed by this error.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: "16px",
                padding: "8px 12px",
                border: "2px solid #edeae0",
                borderRadius: "8px",
                background: "#f4f1e8",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "11.5px",
                color: "#55554f",
                wordBreak: "break-all",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              cursor: "pointer",
              border: "2.5px solid #1a1a1a",
              borderRadius: "9px",
              background: "#beff6c",
              boxShadow: "3px 3px 0 0 #1a1a1a",
              padding: "14px 20px",
              fontSize: "15.5px",
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            Reload FinTrack
          </button>
        </div>
      </body>
    </html>
  );
}
