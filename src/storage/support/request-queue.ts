/**
 * Serialising queue with retry/backoff for remote providers. It owns *when* to retry and
 * *how long* to wait; the caller owns *what counts as* retryable, by returning a `retry`
 * outcome instead of throwing. A backing-off attempt keeps the slot, so a rate-limited
 * provider is not hammered by the requests queued behind it.
 */

export interface RetryPolicy {
  /** Attempts after the first one. */
  readonly maxRetries: number
  readonly baseDelayMs: number
  /** Caps the exponential schedule only. */
  readonly maxDelayMs: number
  /**
   * Separate, larger cap for a server-supplied `Retry-After`. Clamping an explicit
   * "wait 30s" down to the exponential ceiling guarantees retrying too early, which
   * makes the case where the server told us exactly what to do the one that fails.
   */
  readonly maxRetryAfterMs: number
}

export interface QueueClock {
  now(): number
  sleep(ms: number): Promise<void>
}

export interface RequestQueueOptions {
  readonly minIntervalMs: number
  readonly retry: RetryPolicy
  readonly clock?: QueueClock
}

export type AttemptOutcome<T> =
  | { readonly kind: "done"; readonly value: T }
  | {
      readonly kind: "retry"
      readonly error: Error
      readonly retryAfterSeconds?: number
    }

export interface RequestQueue {
  run<T>(attempt: () => Promise<AttemptOutcome<T>>): Promise<T>
}

export function computeBackoffDelay(
  policy: RetryPolicy,
  attempt: number,
  retryAfterSeconds?: number
): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, policy.maxRetryAfterMs)
  }
  return Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs)
}

const systemClock: QueueClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}

export function createRequestQueue(
  options: RequestQueueOptions
): RequestQueue {
  const clock = options.clock ?? systemClock
  let chain: Promise<void> = Promise.resolve()
  let lastFinishedAt = Number.NEGATIVE_INFINITY

  async function attemptWithRetries<T>(
    attempt: () => Promise<AttemptOutcome<T>>
  ): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      const wait = lastFinishedAt + options.minIntervalMs - clock.now()
      if (wait > 0) {
        await clock.sleep(wait)
      }

      let outcome: AttemptOutcome<T>
      try {
        outcome = await attempt()
      } finally {
        lastFinishedAt = clock.now()
      }

      if (outcome.kind === "done") {
        return outcome.value
      }
      if (retry >= options.retry.maxRetries) {
        throw outcome.error
      }
      await clock.sleep(
        computeBackoffDelay(options.retry, retry, outcome.retryAfterSeconds)
      )
    }
  }

  return {
    run(attempt) {
      const result = chain.then(() => attemptWithRetries(attempt))
      // A rejected task must not poison the queue for everyone behind it.
      chain = result.then(
        () => undefined,
        () => undefined
      )
      return result
    }
  }
}
