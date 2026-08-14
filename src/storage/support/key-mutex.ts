/**
 * Serialises tasks that share a key while letting different keys run concurrently.
 * Remote stores without transactions need this so a read-then-write on one record
 * cannot interleave with another write to the same record.
 */
export interface KeyMutex {
  run<T>(key: string, task: () => Promise<T>): Promise<T>
}

export function createKeyMutex(): KeyMutex {
  const chains = new Map<string, Promise<void>>()

  return {
    run(key, task) {
      const previous = chains.get(key) ?? Promise.resolve()
      const result = previous.then(task)
      // A rejected task must not block later writes to the same key.
      const gate = result.then(
        () => undefined,
        () => undefined
      )
      chains.set(key, gate)
      void gate.then(() => {
        // Only the last waiter clears the entry, so the map stays bounded.
        if (chains.get(key) === gate) {
          chains.delete(key)
        }
      })
      return result
    }
  }
}
