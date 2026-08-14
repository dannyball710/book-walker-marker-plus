/** Shared by the HTTP client and the property mapper, so neither has to import the other. */
export class NotionStoreError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = "NotionStoreError"
    this.status = status
  }
}
