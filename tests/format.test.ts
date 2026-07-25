import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateLong,
  formatRelativeTime,
  initials,
} from "@/lib/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatCurrency", () => {
  it("formats a plain amount with two decimals", () => {
    expect(formatCurrency(62.4)).toBe("$62.40");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("puts the minus sign before the currency symbol", () => {
    expect(formatCurrency(-25.5)).toBe("-$25.50");
  });

  it("does not render -0 as negative", () => {
    expect(formatCurrency(-0)).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatCurrency(1234567.89)).toBe("$1,234,567.89");
  });

  it("always shows cents, even for whole amounts", () => {
    expect(formatCurrency(40)).toBe("$40.00");
  });

  it("honours a different currency", () => {
    expect(formatCurrency(10, "EUR")).toBe("€10.00");
  });

  it("rounds to the nearest cent rather than truncating", () => {
    expect(formatCurrency(0.005)).toBe("$0.01");
    expect(formatCurrency(0.004)).toBe("$0.00");
  });
});

describe("formatRelativeTime", () => {
  it("describes the very recent past as 'just now'", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-25T12:00:00Z"));
    expect(formatRelativeTime("2026-07-25T11:59:40Z")).toBe("just now");
  });

  it("uses minutes, then hours, then days", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-25T12:00:00Z"));
    expect(formatRelativeTime("2026-07-25T11:30:00Z")).toBe("30m ago");
    expect(formatRelativeTime("2026-07-25T09:00:00Z")).toBe("3h ago");
    expect(formatRelativeTime("2026-07-23T12:00:00Z")).toBe("2d ago");
  });

  it("falls back to an absolute date beyond a week", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-25T12:00:00Z"));
    expect(formatRelativeTime("2026-07-01T12:00:00Z")).toBe("Jul 1");
  });
});

describe("formatDate", () => {
  it("renders a short month and day", () => {
    expect(formatDate("2026-07-25T12:00:00Z")).toBe("Jul 25");
  });

  it("renders a long form with the year", () => {
    expect(formatDateLong("2026-07-25T12:00:00Z")).toBe("July 25, 2026");
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Maya Alvarez")).toBe("MA");
    expect(initials("Jordan Lee Smith")).toBe("JL");
  });

  it("handles a single name", () => {
    expect(initials("Cher")).toBe("C");
  });

  it("uppercases regardless of input casing", () => {
    expect(initials("maya alvarez")).toBe("MA");
  });

  it("ignores extra whitespace instead of producing undefined", () => {
    expect(initials("  Maya   Alvarez  ")).toBe("MA");
  });

  it("returns an empty string for an empty name", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });
});
