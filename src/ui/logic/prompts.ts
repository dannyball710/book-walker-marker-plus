import { t } from "~/core/i18n"
import type { PromptPreset } from "~/core/settings/types"

export type MoveDirection = "up" | "down"

function renumber(presets: readonly PromptPreset[]): readonly PromptPreset[] {
  return presets.map((preset, index) => ({ ...preset, order: index }))
}

/** Sorts by `order` and rewrites it to the array index, so `order` is always 0..n-1. */
export function normalizeOrder(
  presets: readonly PromptPreset[]
): readonly PromptPreset[] {
  return renumber([...presets].sort((a, b) => a.order - b.order))
}

export function movePreset(
  presets: readonly PromptPreset[],
  id: string,
  direction: MoveDirection
): readonly PromptPreset[] {
  const sorted = normalizeOrder(presets)
  const index = sorted.findIndex((preset) => preset.id === id)
  const target = direction === "up" ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= sorted.length) {
    return sorted
  }
  const swapped = [...sorted]
  const current = swapped[index]
  const neighbour = swapped[target]
  if (current === undefined || neighbour === undefined) {
    return sorted
  }
  swapped[index] = neighbour
  swapped[target] = current
  // Renumber by position: re-sorting on the old `order` would undo the swap.
  return renumber(swapped)
}

export function addPreset(
  presets: readonly PromptPreset[],
  id: string
): readonly PromptPreset[] {
  return normalizeOrder([
    ...presets,
    { id, label: t("promptNewLabel"), template: "{{text}}", order: presets.length }
  ])
}

export function removePreset(
  presets: readonly PromptPreset[],
  id: string
): readonly PromptPreset[] {
  return normalizeOrder(presets.filter((preset) => preset.id !== id))
}

export function updatePreset(
  presets: readonly PromptPreset[],
  id: string,
  patch: Partial<Pick<PromptPreset, "label" | "template">>
): readonly PromptPreset[] {
  return presets.map((preset) =>
    preset.id === id ? { ...preset, ...patch } : preset
  )
}
