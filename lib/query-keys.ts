/**
 * Query keys, in a module with no `"use client"` and no `server-only`.
 *
 * They must be importable from both sides. Exporting them from the hooks file
 * looks equivalent but is not: that module is `"use client"`, so a server
 * component importing from it receives a client reference proxy rather than the
 * array. It still works by identity inside a single server render — prefetch
 * and getQueryData agree — but it serialises to `null` crossing into the RSC
 * payload, so the browser cannot match the dehydrated entry and refetches
 * everything the prefetch just paid for.
 *
 * That failure is silent: the page works, it is just slower, which is exactly
 * the kind of regression nobody notices.
 */
export const queryKeys = {
  /**
   * One key behind every shell read. The hooks are `select`s over this single
   * query, so five components asking for five different slices still produce
   * one request.
   */
  bootstrap: ["bootstrap"] as const,
  activity: ["activity"] as const,
  narrative: ["insight-narrative"] as const,
};
