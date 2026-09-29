/**
 * Slides a roster's rows from their old place to the new one when the sort changes. The table
 * keys its rows, so Vue moves the same `tr` elements: their top is read before the update and
 * each one is played back from there with a transform. Reduced motion skips it.
 *
 * @param {() => HTMLElement | null} root - Reads the roster element around the table.
 * @param {() => unknown} sorting - Reads the table's sorting state.
 */
export function useRosterFlip(root: () => HTMLElement | null, sorting: () => unknown): void {
  let before = new Map<Element, number>();

  const rows = (): Element[] => [...(root()?.querySelectorAll("tbody > tr") ?? [])];

  watch(
    sorting,
    () => {
      before = new Map(rows().map((row) => [row, row.getBoundingClientRect().top]));
    },
    { deep: true, flush: "pre" },
  );

  watch(
    sorting,
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      for (const row of rows()) {
        const top = before.get(row);
        if (top === undefined) continue;
        const shift = top - row.getBoundingClientRect().top;
        if (Math.abs(shift) < 1) continue;
        row.animate([{ transform: `translateY(${shift}px)` }, { transform: "none" }], {
          duration: 320,
          easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
        });
      }
    },
    { deep: true, flush: "post" },
  );
}
