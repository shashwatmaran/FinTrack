import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Email is a notification channel, not a transaction.
 *
 * The settlement it announces is already recorded by the time this runs, so
 * the contract these assert is that nothing here can undo it: no path throws,
 * and a provider outage costs a message rather than a payment record.
 */
const envMock = {
  BREVO_API_KEY: "xkeysib-test-key" as string | undefined,
  EMAIL_FROM: "sender@example.com" as string | undefined,
};
const featuresMock = { email: true };

vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
  get features() {
    return featuresMock;
  },
}));

const { sendEmail, sendSettlementRequestEmail, isEmailConfigured } = await import(
  "@/lib/server/email"
);

const MESSAGE = { to: "payee@example.com", subject: "Subject", text: "Body" };
const ok = () => new Response(JSON.stringify({ id: "abc" }), { status: 200 });

beforeEach(() => {
  envMock.BREVO_API_KEY = "xkeysib-test-key";
  envMock.EMAIL_FROM = "sender@example.com";
  featuresMock.email = true;
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("configuration gate", () => {
  it("reports unconfigured when the feature flag is off", () => {
    featuresMock.email = false;
    expect(isEmailConfigured()).toBe(false);
  });

  it("sends nothing when unconfigured", async () => {
    featuresMock.email = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendEmail(MESSAGE)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sending", () => {
  it("posts to Brevo with the configured sender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendEmail(MESSAGE)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    // Brevo authenticates with an `api-key` header, not a bearer token.
    expect(init.headers["api-key"]).toBe("xkeysib-test-key");

    const body = JSON.parse(init.body);
    expect(body.sender.email).toBe("sender@example.com");
    expect(body.to).toEqual([{ email: "payee@example.com" }]);
    expect(body.textContent).toBe("Body");
  });
});

describe("failures never propagate", () => {
  it("returns false rather than throwing on a rejected send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    await expect(sendEmail(MESSAGE)).resolves.toBe(false);
  });

  it("returns false rather than throwing when the provider is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(sendEmail(MESSAGE)).resolves.toBe(false);
  });

  it("names the unverified-sender case, which is the common 400", async () => {
    // Brevo only sends from an address it has confirmed; anything else 400s,
    // and that reads as "email is broken" until you know what it means.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 400 })));

    await sendEmail(MESSAGE);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/verified sender/i);
  });

  it("does not log the provider's response body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("key xkeysib-LEAKED invalid", { status: 401 }))
    );

    await sendEmail(MESSAGE);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("xkeysib-LEAKED");
  });

  it("gives up rather than holding the request open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, reject) => {
            init.signal?.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            });
          })
      )
    );
    await expect(sendEmail(MESSAGE, 20)).resolves.toBe(false);
  });
});

describe("the settlement request email", () => {
  it("says the balance has not moved yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    await sendSettlementRequestEmail({
      to: "maya@example.com",
      payerName: "Jordan",
      amount: "₹500.00",
      groupName: "Lunch Crew",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toContain("Jordan");
    expect(body.subject).toContain("₹500.00");
    // Escrow is the whole point — the recipient must know nothing has changed.
    expect(body.textContent).toMatch(/nothing moves until you confirm/i);
    expect(body.textContent).toContain("Lunch Crew");
  });

  it("tells the recipient what declining does", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    await sendSettlementRequestEmail({
      to: "maya@example.com",
      payerName: "Jordan",
      amount: "₹500.00",
      groupName: "Lunch Crew",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).textContent).toMatch(/decline/i);
  });
});
