/*
 * The roster's parts as Tailwind utilities, shared by `ProviderRoster` on the landing and on /providers. The rows
 * stack once the table itself is narrower than 52rem (`@container/roster` on the table's root),
 * not the window: beside both sidebars at 1024px the roster is 600px wide.
 */

/** Classes for the `ui` prop of a roster's `UTable`, in place of the table's padding, text size and dividers. */
export const ROSTER_TABLE_UI = {
  root: "@container/roster overflow-visible",
  base: "w-full table-fixed @max-[52rem]/roster:block",
  thead: "@max-[52rem]/roster:sr-only",
  separator: "hidden",
  tbody: [
    "divide-y-0",
    // Opaque rows: one sliding past another during a sort covers it instead of mixing the text.
    "[&>tr]:bg-default [&>tr:hover]:bg-[color-mix(in_srgb,var(--ui-text-muted)_4%,var(--ui-bg))]",
    // Dividers are inset shadows, because a collapsed border is shared with the next row and its background covers it.
    "[&>tr+tr>td]:shadow-[inset_0_1px_0_var(--console-line)]",
    "@max-[52rem]/roster:block",
    "@max-[52rem]/roster:[&>tr]:grid @max-[52rem]/roster:[&>tr]:grid-cols-[minmax(0,1fr)_auto]",
    "@max-[52rem]/roster:[&>tr]:items-baseline @max-[52rem]/roster:[&>tr]:gap-x-4 @max-[52rem]/roster:[&>tr]:gap-y-1",
    "@max-[52rem]/roster:[&>tr]:px-5 @max-[52rem]/roster:[&>tr]:py-[9px] @max-[25rem]/roster:[&>tr]:px-3.5",
    "@max-[52rem]/roster:[&>tr+tr]:shadow-[inset_0_1px_0_var(--console-line)] @max-[52rem]/roster:[&>tr+tr>td]:shadow-none",
  ].join(" "),
  th: "px-2 pt-[7px] pb-1.5 first:pl-5 last:pr-5 last:text-end text-[10px] font-normal tracking-[0.08em] uppercase text-dimmed shadow-[inset_0_-1px_0_var(--console-line)]",
  td: [
    "px-2 py-[9px] @min-[52rem]/roster:first:pl-5 @min-[52rem]/roster:last:pr-5",
    "align-baseline text-xs text-inherit whitespace-normal",
    "@max-[52rem]/roster:block @max-[52rem]/roster:p-0",
    "@max-[52rem]/roster:nth-2:justify-self-end @max-[52rem]/roster:nth-[n+3]:col-span-full",
  ].join(" "),
} as const;

/** Classes for the parts around and inside a roster's cells. */
export const ROSTER_CLASS = {
  bar: "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 pl-5 pr-7 max-[400px]:px-3.5 text-[11px] tracking-[0.08em] uppercase text-muted bg-[color-mix(in_srgb,var(--ui-text-muted)_5%,var(--ui-bg))] [clip-path:polygon(0_0,calc(100%-15px)_0,100%_15px,100%_100%,0_100%)]",
  footer:
    "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2.5 max-[400px]:px-3.5 text-[11px] tracking-[0.04em] text-muted border-t border-(--console-line)",
  title: "text-[13px] tracking-normal normal-case text-highlighted",
  meta: "normal-case tracking-[0.04em] text-dimmed",
  name: "inline-flex min-w-0 gap-2 text-highlighted hover:text-(--console-accent)",
  id: "inline-block max-w-full truncate px-[5px] py-px text-[10px] leading-[1.4] tracking-[0.08em] text-muted shadow-[inset_0_0_0_1px_var(--console-line)]",
  about: "min-w-0 font-sans text-[13px] leading-normal text-muted",
  count: "flex items-baseline gap-2.5 text-[11px] text-dimmed [overflow-wrap:anywhere]",
  leader:
    "h-1 min-w-4 flex-1 border-b border-dotted border-(--console-line) @max-[52rem]/roster:hidden",
} as const;
