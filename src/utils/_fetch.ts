import { withBase, withQuery, type QueryObject } from "ufo";

/** How a successful body is handed back: parsed JSON, text, or the unread stream. */
export type ResponseType = "json" | "text" | "stream";

/** Request options shared by every archive call; everything else in a spread is ignored. */
export interface FetchOptions {
  method?: string;
  baseURL?: string;
  params?: Readonly<Record<string, unknown>>;
  headers?: Readonly<Record<string, string>>;
  /** Further attempts after the first one; `0` sends the request once. */
  retry?: number;
  retryDelay?: number;
  retryStatusCodes?: readonly number[];
  /** Deadline in ms for each attempt, body read included; `0` or unset means none. */
  timeout?: number;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
  responseType?: ResponseType;
  /** Called for every 4xx/5xx answer, retried ones included. */
  onResponseError?: (failure: Readonly<{ method: string; url: string; status: number }>) => void;
}

const DEFAULT_RETRY_STATUS_CODES: readonly number[] = [408, 409, 425, 429, 500, 502, 503, 504];
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
/** Bytes of an error body kept on the error; enough for an archive's "no captures" note. */
const MAX_ERROR_BODY = 64 * 1024;

/** No response or a 4xx/5xx one, in the `[GET] "url": 404 Not Found` shape callers read. */
export class FetchError extends Error {
  readonly request: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly statusText?: string;
  /** Text of the first 64 KiB of the error body. */
  readonly data?: string;
  readonly response?: Response;

  constructor(
    method: string,
    request: string,
    failure: Readonly<{ response: Response; data: string }> | Readonly<{ cause: unknown }>,
  ) {
    const detail =
      "response" in failure
        ? `${failure.response.status} ${failure.response.statusText}`.trimEnd()
        : `<no response>${failure.cause instanceof Error ? ` ${failure.cause.message}` : ""}`;
    super(
      `[${method}] ${JSON.stringify(request)}: ${detail}`,
      "cause" in failure ? failure : undefined,
    );
    this.name = "FetchError";
    this.request = request;
    if ("response" in failure) {
      this.status = failure.response.status;
      this.statusCode = failure.response.status;
      this.statusText = failure.response.statusText;
      this.data = failure.data;
      this.response = failure.response;
    }
  }
}

/**
 * Checks a timeout before any request goes out.
 *
 * @param timeout - Deadline in ms, `0` or unset for none.
 * @returns {number | undefined} The deadline rounded up to a whole millisecond.
 */
export function timeoutMilliseconds(timeout: number | undefined): number | undefined {
  if (timeout === undefined || timeout === 0) return undefined;
  if (!Number.isFinite(timeout) || timeout < 0 || timeout > 2_147_483_647) {
    throw new RangeError("timeout must be between 0 and 2147483647 milliseconds");
  }
  return Math.ceil(timeout);
}

function requestURL(request: string, options: Readonly<FetchOptions>): string {
  const url = options.baseURL ? withBase(request, options.baseURL) : request;
  return options.params ? withQuery(url, options.params as QueryObject) : url;
}

/* A deadline per attempt, so a retry never inherits a signal its predecessor already spent. */
function attemptSignal(
  callerSignal: AbortSignal | undefined,
  milliseconds: number | undefined,
): AbortSignal | undefined {
  if (milliseconds === undefined) return callerSignal;
  const deadline = AbortSignal.timeout(milliseconds);
  return callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
}

/* Keeps the start of an error body, also when the read breaks off; the status says what failed. */
async function errorBody(response: Readonly<Response>): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    while (total < MAX_ERROR_BODY) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      const chunk = value.subarray(0, MAX_ERROR_BODY - total);
      total += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text + decoder.decode();
}

/* One attempt: a response below 400 or the failure to retry. A caller abort throws at once. */
async function attempt(
  url: string,
  method: string,
  options: Readonly<FetchOptions>,
  milliseconds: number | undefined,
): Promise<Response | FetchError> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: options.headers,
      redirect: options.redirect,
      signal: attemptSignal(options.signal, milliseconds),
    });
  } catch (error) {
    options.signal?.throwIfAborted();
    return new FetchError(method, url, { cause: error });
  }
  if (response.status < 400 || response.status >= 600) return response;

  options.onResponseError?.({ method, url, status: response.status });
  return new FetchError(method, url, { response, data: await errorBody(response) });
}

async function pause(milliseconds: number | undefined): Promise<void> {
  if (!milliseconds || milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * GETs one archive URL, retrying network failures and listed statuses with a fresh deadline each.
 * A caller abort is never retried, and `redirect: "manual"` hands a 3xx back.
 *
 * @param request - Path under `baseURL`, or a full URL.
 * @param options - Request options.
 * @returns {Promise<Response>} A response below 400 with its body unread.
 */
export async function fetchResponse(
  request: string,
  options: Readonly<FetchOptions> = {},
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const url = requestURL(request, options);
  const milliseconds = timeoutMilliseconds(options.timeout);

  for (let retries = options.retry ?? 1; ; retries--) {
    options.signal?.throwIfAborted();
    const outcome = await attempt(url, method, options, milliseconds);
    if (outcome instanceof Response) return outcome;
    if (!shouldRetry(outcome, retries, options.retryStatusCodes)) throw outcome;
    await pause(options.retryDelay);
  }
}

/* A request that got no response is retried like a 500. */
function shouldRetry(
  failure: Readonly<FetchError>,
  retries: number,
  statuses: readonly number[] = DEFAULT_RETRY_STATUS_CODES,
): boolean {
  return retries > 0 && statuses.includes(failure.status ?? 500);
}

function parseJSON(text: string, source: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} did not answer with JSON`, { cause: error });
  }
}

/**
 * Reads the body of {@link fetchResponse} as `responseType` asks. JSON ignores `Content-Type`,
 * so an HTML page answered with 200 fails instead of reading as no captures.
 *
 * @param request - Path under `baseURL`, or a full URL.
 * @param options - Request options; `responseType` defaults to `"json"`.
 * @returns {Promise<T>} The parsed body, its text, or its stream.
 */
export async function fetchData<T = unknown>(
  request: string,
  options: Readonly<FetchOptions> = {},
): Promise<T> {
  const response = await fetchResponse(request, options);
  const body = NULL_BODY_STATUSES.has(response.status) ? null : response.body;
  if (options.responseType === "stream") return (body ?? undefined) as T;

  const text = body ? await response.text() : "";
  if (options.responseType === "text") return text as T;
  return parseJSON(text, response.url || requestURL(request, options)) as T;
}
