import { submitToGoogleIndexingApi } from "./google";
import { submitToSpeedyIndex } from "./speedyindex";
import { submitToIndexNow } from "./indexnow";
import type { IndexingAdapter } from "../db/types";

export interface IndexingResult {
  adapter: IndexingAdapter;
  jobId: string;
  status: string;
}

export async function submitToIndexer(
  adapter: IndexingAdapter,
  url: string
): Promise<IndexingResult> {
  switch (adapter) {
    case "google": {
      const result = await submitToGoogleIndexingApi(url);
      return { adapter, ...result };
    }
    case "speedyindex": {
      const result = await submitToSpeedyIndex(url);
      return { adapter, ...result };
    }
    case "indexnow": {
      const result = await submitToIndexNow(url);
      return { adapter, ...result };
    }
    default: {
      const _exhaustive: never = adapter;
      throw new Error(`Unknown indexing adapter: ${String(_exhaustive)}`);
    }
  }
}
