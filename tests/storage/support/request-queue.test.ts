import { describe, expect, it } from "vitest"

import {
  computeBackoffDelay,
  createRequestQueue,
  type AttemptOutcome,
  type QueueClock,
  type RetryPolicy
} from "~/storage/support/request-queue"

const policy: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  maxRetryAfterMs: 60_000
}

/** Virtual time: sleeps resolve immediately but still move the clock forward. */
function fakeClock(): QueueClock & { readonly slept: number[] } {
  const slept: number[] = []
  let current = 0
  return {
    slept,
    now: () => current,
    sleep: async (ms) => {
      slept.push(ms)
      current += ms
    }
  }
}

function done<T>(value: T): AttemptOutcome<T> {
  return { kind: "done", value }
}

describe("computeBackoffDelay", () => {
  it("doubles per retry so a rate-limited burst backs off instead of hammering", () => {
    expect(computeBackoffDelay(policy, 0)).toBe(500)
    expect(computeBackoffDelay(policy, 1)).toBe(1000)
    expect(computeBackoffDelay(policy, 2)).toBe(2000)
  })

  it("caps the exponential schedule so one retry cannot stall the queue for minutes", () => {
    expect(computeBackoffDelay(policy, 10)).toBe(8000)
  })

  it("honours Retry-After over the exponential schedule", () => {
    expect(computeBackoffDelay(policy, 0, 3)).toBe(3000)
  })

  it("lets Retry-After exceed the exponential ceiling, or we always retry too early", () => {
    // Notion answers 429 with 30s or more; clamping that to 8s guarantees another 429
    expect(computeBackoffDelay(policy, 0, 30)).toBe(30_000)
  })

  it("still bounds an absurd Retry-After", () => {
    expect(computeBackoffDelay(policy, 0, 600)).toBe(60_000)
  })

  it("ignores a non-positive Retry-After", () => {
    expect(computeBackoffDelay(policy, 1, 0)).toBe(1000)
  })
})

describe("createRequestQueue", () => {
  it("runs tasks one at a time even when they are started together", async () => {
    const clock = fakeClock()
    const queue = createRequestQueue({
      minIntervalMs: 0,
      retry: policy,
      clock
    })
    const events: string[] = []

    const task = (name: string) => async (): Promise<AttemptOutcome<string>> => {
      events.push(`start:${name}`)
      await Promise.resolve()
      events.push(`end:${name}`)
      return done(name)
    }

    await Promise.all([
      queue.run(task("a")),
      queue.run(task("b")),
      queue.run(task("c"))
    ])

    expect(events).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c"
    ])
  })

  it("spaces successive requests by the minimum interval", async () => {
    const clock = fakeClock()
    const queue = createRequestQueue({
      minIntervalMs: 350,
      retry: policy,
      clock
    })

    await queue.run(async () => done(1))
    await queue.run(async () => done(2))

    expect(clock.slept).toEqual([350])
  })

  it("retries a retry outcome with backoff and returns the eventual value", async () => {
    const clock = fakeClock()
    const queue = createRequestQueue({
      minIntervalMs: 0,
      retry: policy,
      clock
    })
    let attempts = 0

    const value = await queue.run(async (): Promise<AttemptOutcome<string>> => {
      attempts += 1
      if (attempts < 3) {
        return { kind: "retry", error: new Error("429") }
      }
      return done("ok")
    })

    expect(value).toBe("ok")
    expect(attempts).toBe(3)
    expect(clock.slept).toEqual([500, 1000])
  })

  it("prefers Retry-After when the attempt reports one", async () => {
    const clock = fakeClock()
    const queue = createRequestQueue({
      minIntervalMs: 0,
      retry: policy,
      clock
    })
    let attempts = 0

    await queue.run(async (): Promise<AttemptOutcome<string>> => {
      attempts += 1
      if (attempts === 1) {
        return { kind: "retry", error: new Error("429"), retryAfterSeconds: 2 }
      }
      return done("ok")
    })

    expect(clock.slept).toEqual([2000])
  })

  it("gives up after maxRetries and throws the last error", async () => {
    const clock = fakeClock()
    const queue = createRequestQueue({
      minIntervalMs: 0,
      retry: {
        maxRetries: 2,
        baseDelayMs: 500,
        maxDelayMs: 8000,
        maxRetryAfterMs: 60_000
      },
      clock
    })
    let attempts = 0

    await expect(
      queue.run(async (): Promise<AttemptOutcome<string>> => {
        attempts += 1
        return { kind: "retry", error: new Error(`fail ${attempts}`) }
      })
    ).rejects.toThrow("fail 3")

    expect(attempts).toBe(3)
  })

  it("keeps serving later tasks after one rejects", async () => {
    const clock = fakeClock()
    const queue = createRequestQueue({
      minIntervalMs: 0,
      retry: {
        maxRetries: 0,
        baseDelayMs: 500,
        maxDelayMs: 8000,
        maxRetryAfterMs: 60_000
      },
      clock
    })

    const failing = queue.run(async (): Promise<AttemptOutcome<string>> => {
      throw new Error("fatal")
    })
    const following = queue.run(async () => done("after"))

    await expect(failing).rejects.toThrow("fatal")
    await expect(following).resolves.toBe("after")
  })
})
