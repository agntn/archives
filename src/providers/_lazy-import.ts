/**
 * Wrap a dynamic import so concurrent callers share one in-flight module load.
 * A rejected import is forgotten, allowing a later call to retry.
 *
 * @template T - Module namespace returned by the import.
 * @param load - Dynamic import operation.
 * @returns A retryable lazy loader.
 */
export function createRetryableLazyImport<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;

  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
