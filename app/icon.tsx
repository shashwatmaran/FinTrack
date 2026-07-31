import { ImageResponse } from "next/og";
import { BRAND_INK, BRAND_SKY, MARK_PATH, MARK_VIEWBOX } from "@/lib/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The browser-tab icon, drawn from the same path as the sidebar logo.
 *
 * Generated rather than a checked-in binary so it cannot drift from the mark
 * in `components/brand/logo.tsx` — the usual failure is someone exporting a
 * favicon once and the brand moving on without it.
 *
 * At 32px the border is 2px and the shadow is dropped: the neobrutalist offset
 * shadow reads as mud at this size, and the shape has to survive being a
 * sixteenth of its usual height.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_SKY,
          border: `2px solid ${BRAND_INK}`,
          borderRadius: 7,
        }}
      >
        <svg
          width={20}
          height={20}
          viewBox={MARK_VIEWBOX}
          fill="none"
          stroke={BRAND_INK}
          strokeWidth={3}
          strokeLinecap="round"
        >
          <path d={MARK_PATH} />
        </svg>
      </div>
    ),
    size
  );
}
