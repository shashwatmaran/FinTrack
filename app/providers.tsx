"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per browser session. Defaults live in makeQueryClient so the
  // server's per-request client cannot drift out of step with this one.
  const [client] = React.useState(makeQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
