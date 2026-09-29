/**
 * Copies text to the clipboard and remembers which key was copied for a moment, so a
 * button can flip to a check mark. A blocked clipboard leaves the state untouched.
 *
 * @returns {{ copied: Ref<string | null>; copy: (key: string, value: string) => Promise<void> }} The copied key and the copier.
 */
export function useCopied() {
  const copied = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    clearTimeout(timer);
    copied.value = key;
    timer = setTimeout(() => {
      copied.value = null;
    }, 1200);
  }

  return { copied, copy };
}
