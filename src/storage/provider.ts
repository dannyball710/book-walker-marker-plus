import type { BwMarker, MarkerQuery } from "~/core/marker/types"
import type {
  ConfigValues,
  ProviderDescriptor
} from "~/core/provider/descriptor"

/**
 * A sidx range is measured inside one font profile, so narrowing to a chapter without
 * naming that profile cannot be answered correctly. Callers get an error rather than a
 * plausible-looking wrong subset.
 */
export function assertProfiledQuery(query: MarkerQuery): void {
  if (query.file !== undefined && query.profile === undefined) {
    throw new Error(
      "MarkerQuery.file requires MarkerQuery.profile: region indexes only mean something within the profile they were measured in."
    )
  }
}

export interface MarkerStore {
  /** The provider id it was created from. */
  readonly kind: string
  list(query: MarkerQuery): Promise<readonly BwMarker[]>
  get(id: string): Promise<BwMarker | null>
  put(marker: BwMarker): Promise<void>
  remove(id: string): Promise<void>
  /** for /gm injection: every marker of one book (a book holds a few hundred at most) */
  listByBook(bookId: string): Promise<readonly BwMarker[]>
}

export interface MarkerStoreDescriptor extends ProviderDescriptor {
  create(values: ConfigValues): MarkerStore
}
