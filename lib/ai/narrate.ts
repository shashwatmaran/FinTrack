import "server-only";

import { createHash } from "node:crypto";
import { AiUnavailableError, complete, isAiConfigured } from "./client";
import type { Insight } from "@/lib/insights";

/**
 * Writes a short narrative over insights that were already computed.
 *
 * The model never does arithmetic. Every figure is calculated deterministically
 * in `lib/insights.ts` and handed over as text; the model's only job is to turn
 * those facts into a couple of readable sentences. That split is what makes it
 * safe to run a small open-weight model against financial data.
 */

/**
 * The facts are already on screen as cards. A narrative that walks through them
 * in order adds nothing but length — it is the "AI summary" that reads like
 * filler because it *is* filler. What the reader cannot get from the cards is
 * which of six numbers matters and how two of them relate, so that is the only
 * job given here: pick a through-line, connect at least two facts, say what the
 * month was actually like. Enumeration is explicitly forbidden.
 */
const SYSTEM_PROMPT = [
  "You write one short paragraph about a person's month of shared spending.",
  "",
  "The reader can already see every fact as a separate card. Restating them is",
  "worthless — and so is making one point three times in different words. Your",
  "job is to say what they add up to.",
  "",
  "Cover two or three DIFFERENT things, never one thing twice:",
  "  1. What shaped the spending. If a single expense explains it, say so.",
  "  2. How the month reads once that expense is set aside, if a fact says.",
  "  3. Where they stand with the other people, if a fact says.",
  "",
  "Rules:",
  "- Name the expense that explains the month. Write 'the Goa homestay', never",
  "  'your largest expense' — the specific thing is the point.",
  "- Start with the substance. No 'You see', 'It looks like', 'Overall'.",
  "- Never repeat a figure. Each number appears at most once.",
  "- Mention at most three figures. Fewer reads better than more.",
  "- Where a fact already states a comparison in words — above, below, in line",
  "  with — reuse that exact word. Never substitute a judgement of your own,",
  "  and never call something normal, high or low unless a fact says so.",
  "- Use ONLY the facts given. Never invent, infer, or recalculate any number.",
  "- Do not introduce any figure that is not present verbatim in the facts.",
  "- 2 to 3 sentences, under 55 words. Plain prose — no headings, lists, markdown.",
  "- Address the reader as 'you'. Be factual and neutral; give no financial advice.",
  "- Amounts are Indian rupees and already formatted. Reproduce them exactly.",
  "",
  "Bad — one point, three times:",
  "  'The Goa homestay drove your month. Your share of ₹12,000.00 was the",
  "  largest part of it. This one trip dominated your total.'",
  "Good — two points, no repetition, no invented judgement:",
  "  'Almost your whole month was the Goa trip, at ₹12,000.00 of your share.",
  "  What is left sits above your three-month median, and you are still owed",
  "  ₹31,186.66 across three people.'",
].join("\n");

export interface Narrative {
  text: string;
  model: string;
  generatedAt: string;
  /** Hash of the facts used, so a cached narrative can be invalidated. */
  inputHash: string;
}

/** Stable fingerprint of the insight set the narrative was written from. */
export function insightsHash(insights: Insight[]): string {
  const canonical = insights.map((i) => `${i.id}|${i.title}|${i.delta}|${i.body}`).join("\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function factSheet(insights: Insight[]): string {
  return insights.map((i) => `- ${i.title} (${i.delta}): ${i.body}`).join("\n");
}

/**
 * Extracts whole numeric values, normalised so formatting can't hide a change.
 *
 * Matching complete tokens matters: splitting on bare digit runs would let
 * "12" from ₹12,400.00 and "500" from ₹10,500.00 combine into a fabricated
 * ₹12,500.00 that every individual fragment appears to justify. Values are
 * compared numerically so ₹12,400 and ₹12,400.00 count as the same figure.
 */
function numericValues(source: string): number[] {
  const tokens = source.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return tokens.map((t) => Number(t.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

/**
 * Rejects a narrative containing a figure absent from the source facts.
 *
 * Small open-weight models will occasionally "helpfully" restate a total they
 * derived themselves. In a money app a plausible-looking wrong number is worse
 * than no narrative at all, so anything unverifiable is discarded rather than
 * shown.
 */
export function containsUnsupportedNumbers(text: string, facts: string): boolean {
  const permitted = new Set(numericValues(facts));
  return numericValues(text).some((n) => !permitted.has(n));
}

function tidy(text: string): string {
  return text
    .replace(/^\s*(?:#+\s*|[-*]\s+)/gm, "") // strip stray headings / bullets
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns null rather than throwing whenever a narrative can't be produced —
 * the deterministic insights are the product, and this layer is additive.
 */
export async function generateNarrative(insights: Insight[]): Promise<Narrative | null> {
  if (!isAiConfigured() || insights.length === 0) return null;

  const facts = factSheet(insights);

  try {
    const { text, model } = await complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Facts about this month:\n${facts}\n\nWrite the paragraph.` },
      ],
    });

    const cleaned = tidy(text);
    if (cleaned.length < 20) {
      console.warn("[fintrack] discarding narrative: too short to be useful");
      return null;
    }
    if (containsUnsupportedNumbers(cleaned, facts)) {
      console.warn("[fintrack] discarding narrative: contained an unverifiable figure");
      return null;
    }

    return {
      text: cleaned,
      model,
      generatedAt: new Date().toISOString(),
      inputHash: insightsHash(insights),
    };
  } catch (error) {
    // A model server being down must never break the insights page.
    console.warn(
      "[fintrack] narrative generation failed:",
      error instanceof AiUnavailableError ? error.message : error
    );
    return null;
  }
}
