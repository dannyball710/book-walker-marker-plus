import { t } from "~/core/i18n"
import type { MarkerStoreDescriptor } from "~/storage/provider"
import { IdbMarkerStore } from "~/storage/providers/idb/marker-store"

const ID = "idb"

export const idbMarkerStoreDescriptor: MarkerStoreDescriptor = {
  id: ID,
  label: t("storageIdbLabel"),
  fields: [],
  validate: () => [],
  // entirely local; it never leaves the browser
  hostsFor: () => [],
  create: () => new IdbMarkerStore(ID)
}
