/*
 * Where a cell of a list in the explorer answer lands once the table is narrower than 52rem and its rows stack
 * (`ROSTER_TABLE_UI`): the id and the amount share the first line, the rest follow in order.
 * Literal strings, because Tailwind reads the source text and a joined class never gets built.
 */
export const STACK = {
  /** Second on the first line, on the right. */
  end: "@max-[52rem]/roster:order-1 @max-[52rem]/roster:col-span-1! @max-[52rem]/roster:justify-self-end",
  /** A whole line of its own, after the first. */
  line: "@max-[52rem]/roster:order-2 @max-[52rem]/roster:justify-self-start!",
  /** Left half of the last line. */
  lastStart: "@max-[52rem]/roster:order-3 @max-[52rem]/roster:col-span-1! @max-[52rem]/roster:justify-self-start!",
  /** Right half of the last line. */
  lastEnd: "@max-[52rem]/roster:order-3 @max-[52rem]/roster:col-span-1! @max-[52rem]/roster:justify-self-end",
} as const;
