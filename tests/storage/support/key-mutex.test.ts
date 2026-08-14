import { describe, expect, it } from "vitest"

import { createKeyMutex } from "~/storage/support/key-mutex"

function deferred(): {
  readonly promise: Promise<void>
  readonly resolve: () => void
} {
  let resolve = (): void => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve: () => resolve() }
}

describe("createKeyMutex", () => {
  it("serialises tasks sharing a key, so read-then-write cannot interleave", async () => {
    const mutex = createKeyMutex()
    const events: string[] = []
    const first = deferred()

    const a = mutex.run("marker-1", async () => {
      events.push("a:start")
      await first.promise
      events.push("a:end")
    })
    const b = mutex.run("marker-1", async () => {
      events.push("b:start")
      events.push("b:end")
    })

    await Promise.resolve()
    expect(events).toEqual(["a:start"])
    first.resolve()
    await Promise.all([a, b])

    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"])
  })

  it("lets different keys run concurrently", async () => {
    const mutex = createKeyMutex()
    const events: string[] = []
    const blocked = deferred()

    const a = mutex.run("marker-1", async () => {
      events.push("a:start")
      await blocked.promise
      events.push("a:end")
    })
    const b = mutex.run("marker-2", async () => {
      events.push("b:start")
      events.push("b:end")
    })

    await Promise.resolve()
    expect(events).toEqual(["a:start", "b:start", "b:end"])

    blocked.resolve()
    await Promise.all([a, b])
  })

  it("does not let a rejected task block later writes to the same key", async () => {
    const mutex = createKeyMutex()

    const failing = mutex.run("marker-1", async () => {
      throw new Error("write failed")
    })
    const following = mutex.run("marker-1", async () => "second")

    await expect(failing).rejects.toThrow("write failed")
    await expect(following).resolves.toBe("second")
  })

  it("propagates the task's own rejection rather than swallowing it", async () => {
    const mutex = createKeyMutex()

    await expect(
      mutex.run("marker-1", async () => {
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")
  })
})
