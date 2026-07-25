import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

/**
 * Request-level tests for the wrapper every API route goes through.
 *
 * This is the layer that decides whether a caller is authenticated and how a
 * thrown store error becomes an HTTP status. Both were previously verified
 * only by driving a browser, which isn't repeatable.
 *
 * `auth()` and `getStore()` are mocked so these stay fast and don't need a
 * database — the behaviour under test is the wrapper's, not the store's.
 */
const authMock = vi.fn();
const storeMock = { marker: "store" };

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/server/get-store", () => ({ getStore: async () => storeMock }));

const {
  withAuth,
  withAuthBody,
  withAuthParams,
  withAuthParamsBody,
} = await import("@/lib/server/route-helpers");
const { ForbiddenError, NotFoundError, ValidationError } = await import(
  "@/lib/server/store-types"
);

const signedIn = () => authMock.mockResolvedValue({ user: { id: "u1" } });
const signedOut = () => authMock.mockResolvedValue(null);

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  authMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("withAuth", () => {
  it("401s when there is no session", async () => {
    signedOut();
    const handler = withAuth(async () => ({ ok: true }));
    const response = await handler();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in" });
  });

  it("401s when a session exists but carries no user id", async () => {
    authMock.mockResolvedValue({ user: {} });
    const handler = withAuth(async () => ({ ok: true }));
    expect((await handler()).status).toBe(401);
  });

  it("never runs the handler for an unauthenticated caller", async () => {
    signedOut();
    const body = vi.fn().mockResolvedValue({});
    await withAuth(body)();
    expect(body).not.toHaveBeenCalled();
  });

  it("passes the resolved userId and store to the handler", async () => {
    signedIn();
    const handler = withAuth(async ({ userId, store }) => ({ userId, store }));
    const payload = await (await handler()).json();

    expect(payload.userId).toBe("u1");
    expect(payload.store).toEqual(storeMock);
  });

  it("returns the handler's value as JSON with a 200", async () => {
    signedIn();
    const response = await withAuth(async () => [{ id: "g1" }])();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "g1" }]);
  });
});

describe("error mapping", () => {
  const cases = [
    { error: new ValidationError("bad input"), status: 400, message: "bad input" },
    { error: new ForbiddenError("nope"), status: 403, message: "nope" },
    { error: new NotFoundError("missing"), status: 404, message: "missing" },
  ];

  for (const { error, status, message } of cases) {
    it(`maps ${error.name} to ${status}`, async () => {
      signedIn();
      const response = await withAuth(async () => {
        throw error;
      })();

      expect(response.status).toBe(status);
      expect((await response.json()).error).toBe(message);
    });
  }

  it("maps an unexpected error to a generic 500", async () => {
    signedIn();
    const response = await withAuth(async () => {
      throw new Error("connection string mongodb+srv://user:hunter2@host failed");
    })();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong" });
  });

  it("never leaks the underlying error text to the client", async () => {
    signedIn();
    const response = await withAuth(async () => {
      throw new Error("mongodb+srv://user:hunter2@cluster.mongodb.net");
    })();

    expect(JSON.stringify(await response.json())).not.toContain("hunter2");
  });
});

describe("withAuthBody", () => {
  const schema = z.object({ name: z.string().min(2) });

  it("401s before parsing the body", async () => {
    signedOut();
    const response = await withAuthBody(schema, async () => ({ ok: true }))(
      jsonRequest({ name: "x" }) // would fail validation if it got that far
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Not signed in");
  });

  it("400s and surfaces the schema's own message on invalid input", async () => {
    signedIn();
    const response = await withAuthBody(schema, async () => ({ ok: true }))(
      jsonRequest({ name: "x" })
    );
    expect(response.status).toBe(400);
    // The specific wording is Zod's; what matters is that the field-level
    // message reaches the client instead of a generic "invalid request".
    expect((await response.json()).error).toMatch(/too small|>=2/i);
  });

  it("uses a custom schema message verbatim when one is provided", async () => {
    signedIn();
    const custom = z.object({ name: z.string().min(2, "Give the group a name") });
    const response = await withAuthBody(custom, async () => ({ ok: true }))(
      jsonRequest({ name: "x" })
    );
    expect((await response.json()).error).toBe("Give the group a name");
  });

  it("400s on a malformed JSON body rather than throwing", async () => {
    signedIn();
    const response = await withAuthBody(schema, async () => ({ ok: true }))(
      new Request("http://localhost/api/x", { method: "POST", body: "{not json" })
    );
    expect(response.status).toBe(400);
  });

  it("hands the parsed body to the handler", async () => {
    signedIn();
    const response = await withAuthBody(schema, async (body) => body)(
      jsonRequest({ name: "Goa Trip" })
    );
    expect(await response.json()).toEqual({ name: "Goa Trip" });
  });

  it("strips unknown fields the client tried to smuggle in", async () => {
    signedIn();
    const response = await withAuthBody(schema, async (body) => body)(
      jsonRequest({ name: "Goa Trip", isAdmin: true })
    );
    expect(await response.json()).not.toHaveProperty("isAdmin");
  });
});

describe("withAuthParams", () => {
  const segment = (params: { id: string }) => ({ params: Promise.resolve(params) });

  it("401s when signed out", async () => {
    signedOut();
    const handler = withAuthParams<{ id: string }, unknown>(async () => ({ ok: true }));
    const response = await handler(new Request("http://localhost/api/x"), segment({ id: "e1" }));
    expect(response.status).toBe(401);
  });

  it("awaits and forwards the dynamic segment", async () => {
    signedIn();
    const handler = withAuthParams<{ id: string }, unknown>(async (params, { userId }) => ({
      ...params,
      userId,
    }));
    const response = await handler(new Request("http://localhost/api/x"), segment({ id: "e1" }));
    expect(await response.json()).toEqual({ id: "e1", userId: "u1" });
  });

  it("maps store errors the same way as withAuth", async () => {
    signedIn();
    const handler = withAuthParams<{ id: string }, unknown>(async () => {
      throw new ForbiddenError();
    });
    const response = await handler(new Request("http://localhost/api/x"), segment({ id: "e1" }));
    expect(response.status).toBe(403);
  });
});

describe("withAuthParamsBody", () => {
  const schema = z.object({ status: z.enum(["confirmed", "declined"]) });
  const segment = { params: Promise.resolve({ id: "s1" }) };

  it("401s when signed out", async () => {
    signedOut();
    const handler = withAuthParamsBody<{ id: string }, typeof schema, unknown>(
      schema,
      async () => ({ ok: true })
    );
    expect((await handler(jsonRequest({ status: "confirmed" }), segment)).status).toBe(401);
  });

  it("rejects a status outside the enum", async () => {
    signedIn();
    const handler = withAuthParamsBody<{ id: string }, typeof schema, unknown>(
      schema,
      async () => ({ ok: true })
    );
    expect((await handler(jsonRequest({ status: "pending" }), segment)).status).toBe(400);
  });

  it("forwards both the params and the parsed body", async () => {
    signedIn();
    const handler = withAuthParamsBody<{ id: string }, typeof schema, unknown>(
      schema,
      async (params, body, { userId }) => ({ ...params, ...body, userId })
    );
    const response = await handler(jsonRequest({ status: "declined" }), segment);
    expect(await response.json()).toEqual({ id: "s1", status: "declined", userId: "u1" });
  });
});
