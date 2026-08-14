import type { MessageName, PlasmoMessaging } from "@plasmohq/messaging"

import type { BgResult } from "~/background/message-types"

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function requireBody<T>(body: T | undefined): T {
  if (body === undefined) {
    throw new Error("message was sent without a request body")
  }
  return body
}

export function handle<Req, Res>(
  run: (request: PlasmoMessaging.Request<MessageName, Req>) => Promise<Res>
): PlasmoMessaging.MessageHandler<Req, BgResult<Res>> {
  return async (request, response) => {
    try {
      response.send({ ok: true, data: await run(request) })
    } catch (error) {
      console.error("[bwm] background message failed", request.name, error)
      response.send({ ok: false, error: describeError(error) })
    }
  }
}
