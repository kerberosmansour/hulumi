// Polling helper for AWS readiness probes — sanctioned escape hatch for
// the M3 contract's "no sleep between sub-resources" rule. Every use of
// setTimeout in @hulumi/baseline lives in this file (and only here);
// component composition code stays free of inline waits.

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PollUntilOpts<T> {
  /** Predicate function — returns the resolved value when ready; null/undefined to keep polling. */
  attempt(): Promise<T | null | undefined>;
  /** Maximum total wall-clock time to poll, in milliseconds. */
  timeoutMs: number;
  /** Sleep between attempts, in milliseconds. */
  intervalMs?: number;
  /** Operation label for the timeout error message. */
  label: string;
}

/**
 * Repeatedly invoke `attempt` until it returns a non-null/undefined value or
 * the deadline is reached. Used inside dynamic provider create() handlers.
 */
export async function pollUntil<T>(opts: PollUntilOpts<T>): Promise<T> {
  const interval = opts.intervalMs ?? 5000;
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const result = await opts.attempt();
    if (result !== null && result !== undefined) return result;
    await sleep(interval);
  }
  throw new Error(
    `pollUntil timed out: ${opts.label} did not become ready within ${opts.timeoutMs}ms`,
  );
}
