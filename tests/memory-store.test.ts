import { memoryStore } from "@/lib/server/memory-store";
import { runStoreContract } from "./store-contract";

runStoreContract({
  name: "memory-store",
  async create() {
    // The store seeds itself lazily from globalThis; clearing the cache is
    // what gives each test a pristine dataset.
    globalThis.__fintrackMemory = undefined;
    return memoryStore;
  },
});
