import { configFingerprint } from "~/core/provider/config"
import { ProviderConfigError } from "~/core/provider/descriptor"
import { createRegistry } from "~/core/provider/registry"
import type { AppSettings } from "~/core/settings/types"
import { findProviderConfig } from "~/core/settings/types"
import type { MarkerStore, MarkerStoreDescriptor } from "~/storage/provider"
import { idbMarkerStoreDescriptor } from "~/storage/providers/idb"
import { notionMarkerStoreDescriptor } from "~/storage/providers/notion"
import { getSettings } from "~/storage/settings"

/**
 * Adding a marker store is a new directory under `providers/` plus one `register` line
 * here. Nothing else — not the settings schema, not the options page, not a message
 * handler. A provider that talks to a new origin declares it from `hostsFor()`; the
 * options page requests that permission at configuration time, so the manifest does
 * not need editing either.
 */
export const markerStoreRegistry =
  createRegistry<MarkerStoreDescriptor>("storage")

markerStoreRegistry.register(idbMarkerStoreDescriptor)
markerStoreRegistry.register(notionMarkerStoreDescriptor)

/**
 * One live instance per provider, replaced when its credentials change. Instances are
 * cached because a remote store carries a rate-limit queue and per-marker locks that
 * only work if every call shares them.
 */
const instances = new Map<
  string,
  { readonly fingerprint: string; readonly store: MarkerStore }
>()

export function resolveMarkerStore(settings: AppSettings): MarkerStore {
  const descriptor = markerStoreRegistry.get(settings.storage.active)
  const values = findProviderConfig(settings.storage, descriptor.id)

  const issues = descriptor.validate(values)
  if (issues.length > 0) {
    throw new ProviderConfigError(descriptor.label, issues)
  }

  const fingerprint = configFingerprint(descriptor.id, values)
  const cached = instances.get(descriptor.id)
  if (cached !== undefined && cached.fingerprint === fingerprint) {
    return cached.store
  }

  const store = descriptor.create(values)
  instances.set(descriptor.id, { fingerprint, store })
  return store
}

export async function getMarkerStore(): Promise<MarkerStore> {
  return resolveMarkerStore(await getSettings())
}
