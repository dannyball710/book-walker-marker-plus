/** Returns the memo content before its second line break (at most two lines). */
export function tooltipText(memo: string): string {
  return memo.split(/\r\n|\n|\r/).slice(0, 2).join("\n")
}
