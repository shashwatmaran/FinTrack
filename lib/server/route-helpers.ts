import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { auth } from "@/auth";
import { getStore } from "./get-store";
import { readMobileToken } from "./mobile-token";
import { ForbiddenError, NotFoundError, ValidationError, type DataStore } from "./store-types";

export interface RouteContext {
  userId: string;
  store: DataStore;
  /** For handlers that need the deployment's own origin, e.g. to build a link. */
  request: Request;
}

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Refuses a token issued before the account's password last changed.
 *
 * Sessions are JWTs, so a reset cannot delete anything server-side — without
 * this, whoever was already signed in on another device stays signed in until
 * the token expires, which is exactly the person a reset is usually meant to
 * remove. Auth.js cannot use database sessions alongside the Credentials
 * provider, so comparing timestamps is the mechanism available.
 *
 * Costs one indexed lookup per authenticated request. Since the shell now
 * loads through a single `/api/bootstrap` call, that is about one extra read
 * per page rather than one per resource.
 */
export async function sessionOutlivedItsPassword(
  store: DataStore,
  userId: string,
  issuedAt: number | undefined
): Promise<boolean> {
  const changedAt = await store.passwordChangedAt(userId);
  if (!changedAt) return false;

  // A token with no `iat` cannot be shown to be new enough, so it is not
  // trusted — failing closed is right when the question is "was this issued
  // before the password was changed?".
  if (typeof issuedAt !== "number") return true;

  // `iat` is seconds; the stamp is an ISO string.
  return new Date(changedAt).getTime() > issuedAt * 1000;
}

/**
 * Resolves the session and rejects one the account has since invalidated.
 *
 * Two credentials are accepted: the web's session cookie, and a Bearer token
 * from the native client. The cookie is tried first because it is by far the
 * common case and costs nothing extra.
 *
 * The fallback lives here rather than in individual handlers on purpose. This
 * function sits behind all four `withAuth*` wrappers, so putting it here makes
 * every existing endpoint Bearer-capable at once — and, more importantly, every
 * future one too. Per-handler opt-in would guarantee one eventually gets missed,
 * and the symptom would be a single screen that mysteriously 401s on mobile.
 */
async function resolveActor(
  store: DataStore,
  request: Request
): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth();
  let userId = session?.user?.id;
  let issuedAt = session?.user?.issuedAt;

  if (!userId) {
    const claims = await readMobileToken(request);
    if (claims) {
      userId = claims.userId;
      issuedAt = claims.issuedAt;
    }
  }

  if (!userId) return { error: errorResponse(401, "Not signed in") };

  // Applies to mobile tokens unchanged: `encode` stamps `iat`, so a reset
  // evicts a phone exactly the way it evicts a browser.
  if (await sessionOutlivedItsPassword(store, userId, issuedAt)) {
    return {
      error: errorResponse(401, "Your password changed. Sign in again."),
    };
  }
  return { userId };
}

/**
 * Wraps a route handler so every endpoint gets the same three guarantees:
 * a signed-in user, a store instance, and consistent error mapping. Handlers
 * receive `userId` already resolved, which is what makes it impossible to
 * write an endpoint that forgets to scope its query.
 */
export function withAuth<T>(handler: (ctx: RouteContext) => Promise<T>) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const store = await getStore();
      const actor = await resolveActor(store, request);
      if ("error" in actor) return actor.error;

      const data = await handler({ userId: actor.userId, store, request });
      return NextResponse.json(data);
    } catch (error) {
      return mapError(error);
    }
  };
}

/** Same as `withAuth`, but parses and validates a JSON body first. */
export function withAuthBody<S extends ZodType, T>(
  schema: S,
  handler: (body: S["_output"], ctx: RouteContext) => Promise<T>
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const store = await getStore();
      const actor = await resolveActor(store, request);
      if ("error" in actor) return actor.error;

      const json = await request.json().catch(() => null);
      const body = schema.parse(json);

      const data = await handler(body, { userId: actor.userId, store, request });
      return NextResponse.json(data);
    } catch (error) {
      return mapError(error);
    }
  };
}

/**
 * For dynamic segments. `params` is a promise in Next 15+, so it is awaited
 * here and handed to the handler already resolved.
 */
export function withAuthParams<P extends Record<string, string>, T>(
  handler: (params: P, ctx: RouteContext) => Promise<T>
) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      const store = await getStore();
      const actor = await resolveActor(store, request);
      if ("error" in actor) return actor.error;

      const params = await segment.params;
      const data = await handler(params, { userId: actor.userId, store, request });
      return NextResponse.json(data);
    } catch (error) {
      return mapError(error);
    }
  };
}

/** Dynamic segment plus a validated JSON body. */
export function withAuthParamsBody<P extends Record<string, string>, S extends ZodType, T>(
  schema: S,
  handler: (params: P, body: S["_output"], ctx: RouteContext) => Promise<T>
) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      const store = await getStore();
      const actor = await resolveActor(store, request);
      if ("error" in actor) return actor.error;

      const params = await segment.params;
      const json = await request.json().catch(() => null);
      const body = schema.parse(json);

      const data = await handler(params, body, { userId: actor.userId, store, request });
      return NextResponse.json(data);
    } catch (error) {
      return mapError(error);
    }
  };
}

function mapError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return errorResponse(400, error.issues[0]?.message ?? "Invalid request");
  }
  if (error instanceof ValidationError) return errorResponse(400, error.message);
  if (error instanceof ForbiddenError) return errorResponse(403, error.message);
  if (error instanceof NotFoundError) return errorResponse(404, error.message);

  // Never surface a driver error (which can contain the connection string)
  // to the client; log it server-side and return something generic.
  console.error("[fintrack] unhandled route error:", error);
  return errorResponse(500, "Something went wrong");
}

export { errorResponse };
