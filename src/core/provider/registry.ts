import type { ProviderDescriptor } from "~/core/provider/descriptor"
import { UnknownProviderError } from "~/core/provider/descriptor"

export interface Registry<TDescriptor extends ProviderDescriptor> {
  register(descriptor: TDescriptor): void
  get(id: string): TDescriptor
  find(id: string): TDescriptor | null
  list(): readonly TDescriptor[]
}

/**
 * Registration order is the display order, so the options page needs no separate
 * ordering table.
 */
export function createRegistry<TDescriptor extends ProviderDescriptor>(
  kind: string
): Registry<TDescriptor> {
  const descriptors = new Map<string, TDescriptor>()

  return {
    register(descriptor) {
      if (descriptors.has(descriptor.id)) {
        throw new Error(`Duplicate ${kind} provider id "${descriptor.id}".`)
      }
      descriptors.set(descriptor.id, descriptor)
    },
    get(id) {
      const descriptor = descriptors.get(id)
      if (descriptor === undefined) {
        throw new UnknownProviderError(kind, id, [...descriptors.keys()])
      }
      return descriptor
    },
    find(id) {
      return descriptors.get(id) ?? null
    },
    list() {
      return [...descriptors.values()]
    }
  }
}
