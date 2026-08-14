import { describe, expect, it } from "vitest"

import type { PromptPreset } from "~/core/settings/types"
import {
  addPreset,
  movePreset,
  normalizeOrder,
  removePreset,
  updatePreset
} from "~/ui/logic/prompts"

function preset(id: string, order: number): PromptPreset {
  return { id, label: id, template: `{{text}} ${id}`, order }
}

const presets: readonly PromptPreset[] = [preset("a", 0), preset("b", 1), preset("c", 2)]

describe("normalizeOrder", () => {
  it("sorts by order and renumbers it to the index, so gaps cannot survive a save", () => {
    const messy = [preset("c", 40), preset("a", 5), preset("b", 9)]
    expect(normalizeOrder(messy).map((p) => [p.id, p.order])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2]
    ])
  })
})

describe("movePreset", () => {
  it("swaps with the previous preset and keeps order contiguous", () => {
    const moved = movePreset(presets, "c", "up")
    expect(moved.map((p) => p.id)).toEqual(["a", "c", "b"])
    expect(moved.map((p) => p.order)).toEqual([0, 1, 2])
  })

  it("swaps with the next preset", () => {
    expect(movePreset(presets, "a", "down").map((p) => p.id)).toEqual(["b", "a", "c"])
  })

  it("is a no-op at the edges and for an unknown id", () => {
    expect(movePreset(presets, "a", "up").map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(movePreset(presets, "c", "down").map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(movePreset(presets, "zz", "up").map((p) => p.id)).toEqual(["a", "b", "c"])
  })

  it("does not mutate the input", () => {
    const copy = [...presets]
    movePreset(presets, "b", "down")
    expect(presets).toEqual(copy)
  })
})

describe("addPreset / removePreset / updatePreset", () => {
  it("appends a new preset last with an editable placeholder template", () => {
    const added = addPreset(presets, "d")
    expect(added.at(-1)?.id).toBe("d")
    expect(added.at(-1)?.order).toBe(3)
    expect(added.at(-1)?.template).toContain("{{text}}")
  })

  it("closes the order gap left by a removal", () => {
    expect(removePreset(presets, "a").map((p) => [p.id, p.order])).toEqual([
      ["b", 0],
      ["c", 1]
    ])
  })

  it("patches only the addressed preset", () => {
    const updated = updatePreset(presets, "b", { label: "new title" })
    expect(updated.map((p) => p.label)).toEqual(["a", "new title", "c"])
    expect(updated[1]?.template).toBe(presets[1]?.template)
  })
})
