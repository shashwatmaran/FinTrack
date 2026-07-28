import { loadMobileBootstrap, type MobileBootstrapData } from "@/lib/server/mobile-bootstrap";
import { MIN_SUPPORTED_BUILD } from "@/lib/server/mobile-token";
import { withAuth } from "@/lib/server/route-helpers";

interface MobileBootstrapResponse extends MobileBootstrapData {
  minSupportedBuild: number;
}

/**
 * Everything the app needs to launch, in one request — the same argument as
 * `/api/bootstrap` (see `lib/server/bootstrap.ts`), only sharper: five round
 * trips on a phone network is a visibly slower launch, not just five cold
 * starts.
 *
 * Separate from `/api/bootstrap` rather than an extra field on it because the
 * web client would pay for a `derived` block it computes itself, and because
 * `/api/mobile/v1` is versioned independently. You ship the web client with its
 * server; an Android build lives on a phone for months, so within `v1` changes
 * here must stay additive — and `minSupportedBuild` is how a build that can no
 * longer be served finds out, instead of rendering nonsense.
 *
 * Activity stays out, exactly as it does on the web: one screen reads it, and
 * bundling it would make every launch fetch a feed nobody is looking at.
 */
export const GET = withAuth<MobileBootstrapResponse>(async ({ userId, store }) => ({
  ...(await loadMobileBootstrap(store, userId)),
  minSupportedBuild: MIN_SUPPORTED_BUILD,
}));
