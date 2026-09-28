import type { FetchOptions, ResponseType } from "ofetch";

function timeoutMilliseconds(timeout: number | undefined): number | undefined {
  if (timeout === undefined || timeout === 0) return undefined;
  if (!Number.isFinite(timeout) || timeout < 0 || timeout > 2_147_483_647) {
    throw new RangeError("timeout must be between 0 and 2147483647 milliseconds");
  }
  return Math.ceil(timeout);
}

/**
 * ofetch skips its timer with a caller signal and reuses that signal on retries.
 * @param options - Fetch options before any attempt has started.
 * @returns {FetchOptions} Options that give each attempt its own deadline.
 */
export function withRequestTimeout<R extends ResponseType>(
  options: FetchOptions<R>,
): FetchOptions<R> {
  const callerSignal = options.signal;
  timeoutMilliseconds(options.timeout);
  return {
    ...options,
    onRequest: [
      ({ options: request }) => {
        callerSignal?.throwIfAborted();
        request.signal = callerSignal;
      },
      ...[options.onRequest ?? []].flat(),
      ({ options: request }) => {
        const milliseconds = timeoutMilliseconds(request.timeout);
        if (milliseconds === undefined) return;
        const deadline = AbortSignal.timeout(milliseconds);
        request.signal = request.signal ? AbortSignal.any([request.signal, deadline]) : deadline;
      },
    ],
    onRequestError: [
      ...[options.onRequestError ?? []].flat(),
      ({ options: request }) => {
        if (callerSignal?.aborted) request.retry = false;
      },
    ],
  };
}
