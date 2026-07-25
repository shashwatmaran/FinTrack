import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { auth } from "@/auth";
import { getStore } from "./get-store";
import { ForbiddenError, NotFoundError, ValidationError, type DataStore } from "./store-types";

export interface RouteContext {
  userId: string;
  store: DataStore;
}

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps a route handler so every endpoint gets the same three guarantees:
 * a signed-in user, a store instance, and consistent error mapping. Handlers
 * receive `userId` already resolved, which is what makes it impossible to
 * write an endpoint that forgets to scope its query.
 */
export function withAuth<T>(handler: (ctx: RouteContext) => Promise<T>) {
  return async (): Promise<NextResponse> => {
    try {
      const session = await auth();
      if (!session?.user?.id) return errorResponse(401, "Not signed in");

      const store = await getStore();
      const data = await handler({ userId: session.user.id, store });
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
      const session = await auth();
      if (!session?.user?.id) return errorResponse(401, "Not signed in");

      const json = await request.json().catch(() => null);
      const body = schema.parse(json);

      const store = await getStore();
      const data = await handler(body, { userId: session.user.id, store });
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
  return async (_request: Request, segment: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      const session = await auth();
      if (!session?.user?.id) return errorResponse(401, "Not signed in");

      const params = await segment.params;
      const store = await getStore();
      const data = await handler(params, { userId: session.user.id, store });
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
      const session = await auth();
      if (!session?.user?.id) return errorResponse(401, "Not signed in");

      const params = await segment.params;
      const json = await request.json().catch(() => null);
      const body = schema.parse(json);

      const store = await getStore();
      const data = await handler(params, body, { userId: session.user.id, store });
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
