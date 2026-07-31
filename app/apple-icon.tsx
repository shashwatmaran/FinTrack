import { ImageResponse } from "next/og";
import { BRAND_INK, BRAND_SKY, MARK_PATH, MARK_VIEWBOX } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The iOS home-screen icon. PNG because Safari ignores SVG here.
 *
 * iOS applies its own rounded mask and drops the icon straight onto the home
 * screen, so this one keeps the full-bleed lime and skips the rounded border —
 * a border would be clipped unevenly by the mask.
 */
export default function AppleIcon() {
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
        }}
      >
        <svg
          width={112}
          height={112}
          viewBox={MARK_VIEWBOX}
          fill="none"
          stroke={BRAND_INK}
          strokeWidth={2.6}
          strokeLinecap="round"
        >
          <path d={MARK_PATH} />
        </svg>
      </div>
    ),
    size
  );
}
