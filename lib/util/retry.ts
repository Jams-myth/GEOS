export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 30_000, jitter = 0.2 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;

      const base = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const spread = base * jitter;
      const delay = base + spread * (Math.random() * 2 - 1);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
    }
  }

  throw lastError;
}
