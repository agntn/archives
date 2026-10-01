import { setTimeout as delay } from "node:timers/promises";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createArchive, providers } from "../src/index";
import { createMcpServer } from "../src/mcp";
import { createFetchOptions, fetchBody, isNoCaptureError, USER_AGENT } from "../src/utils";
import { FetchError, fetchData, fetchResponse, type FetchOptions } from "../src/utils/_fetch";

function readText(path: string, options: Readonly<FetchOptions>): Promise<string> {
  return fetchData<string>(path, { ...options, responseType: "text" });
}

const connections: Array<{ close(): Promise<void> }> = [];

function fixtureResponse(url: string, status: number): Response {
  if (url.includes("/timemap/json/")) {
    return Response.json(
      { original_uri: "https://example.com/", mementos: { list: [] } },
      { status },
    );
  }
  if (url.includes("/timemap/")) return new Response("", { status });
  if (url.includes("/cdx/")) {
    return Response.json(
      [
        ["original", "timestamp", "statuscode"],
        ["https://example.com/", "20200101000000", "200"],
      ],
      { status },
    );
  }
  return new Response("ARCHIVE_CONTROL", { status });
}

function stubFetch(delays: readonly number[], statuses: readonly number[] = []) {
  const signals: Array<AbortSignal | null | undefined> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, options) => {
    const index = signals.length;
    signals.push(options?.signal);
    await delay(delays[index] ?? 0, undefined, { signal: options?.signal ?? undefined });
    const url = input instanceof Request ? input.url : String(input);
    return fixtureResponse(url, statuses[index] ?? 200);
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, signals };
}

async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "archives-timeout-test", version: "1.0.0" });
  const server = createMcpServer();
  connections.push(client, server);
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request timeouts with cancellation", () => {
  it.each(["wayback", "archiveToday", "memento"] as const)(
    "bounds %s listings even with a caller signal",
    async (provider) => {
      const { fetch, signals } = stubFetch([150]);
      const controller = new AbortController();
      const archive = createArchive(await providers[provider]());
      const result = await archive.snapshots("https://example.com/", {
        cache: false,
        retries: 0,
        timeout: 20,
        signal: controller.signal,
      });
      expect(result.success).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(signals[0]?.aborted).toBe(true);
      expect(controller.signal.aborted).toBe(false);
    },
  );

  it.each([false, true])(
    "gives retries a fresh timeout with caller signal=%s",
    async (withSignal) => {
      const { fetch, signals } = stubFetch([100, 0]);
      const controller = new AbortController();
      const options = await createFetchOptions(
        "https://example.com",
        {},
        {
          timeout: 20,
          retries: 1,
          retryDelay: 0,
          signal: withSignal ? controller.signal : undefined,
        },
      );
      await expect(readText("/", options)).resolves.toBe("ARCHIVE_CONTROL");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      expect(signals[1]).not.toBe(signals[0]);
    },
  );

  it("keeps the deadline on a retry after HTTP 503", async () => {
    const { fetch, signals } = stubFetch([0, 150], [503, 200]);
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 20,
        retries: 1,
        retryDelay: 0,
        signal: new AbortController().signal,
      },
    );
    await expect(readText("/", options)).rejects.toThrow(/abort/i);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(signals[1]?.aborted).toBe(true);
  });

  it("does not retry explicit cancellation of an in-flight request", async () => {
    const { fetch, signals } = stubFetch([500]);
    const controller = new AbortController();
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 1000,
        retries: 2,
        retryDelay: 0,
        signal: controller.signal,
      },
    );
    const pending = expect(readText("/", options)).rejects.toThrow(/abort/i);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    await pending;
    expect(signals[0]?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("allows timeout zero without dropping caller cancellation", async () => {
    const { signals } = stubFetch([30]);
    const controller = new AbortController();
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 0,
        retries: 0,
        signal: controller.signal,
      },
    );
    await expect(readText("/", options)).resolves.toBe("ARCHIVE_CONTROL");
    expect(signals[0]).toBe(controller.signal);
  });

  it("keeps the configured default when timeout is explicitly undefined", async () => {
    const options = await createFetchOptions("https://example.com", {}, { timeout: undefined });
    expect(options.timeout).toBe(10_000);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects invalid timeout %s before fetching",
    async (timeout) => {
      const { fetch } = stubFetch([]);
      await expect(createFetchOptions("https://example.com", {}, { timeout })).rejects.toThrow(
        RangeError,
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rounds a fractional deadline up to a millisecond", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { signals } = stubFetch([150]);
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 20.5,
        retries: 0,
        signal: new AbortController().signal,
      },
    );
    await expect(readText("/", options)).rejects.toThrow(/abort/i);
    expect(signals[0]?.aborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(21);
  });

  it("isolates concurrent uses of the options", async () => {
    const { fetch, signals } = stubFetch([150, 0]);
    const controller = new AbortController();
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 20,
        retries: 0,
        signal: controller.signal,
      },
    );
    await Promise.all([
      expect(readText("/slow", options)).rejects.toThrow(/abort/i),
      expect(readText("/fast", options)).resolves.toBe("ARCHIVE_CONTROL"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(options.signal).toBe(controller.signal);
    expect(controller.signal.aborted).toBe(false);
  });

  it("bounds a body that stalls after the response headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async (_input, options) => {
        const signal = options?.signal;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener("abort", () => controller.error(new Error("body aborted")), {
              once: true,
            });
          },
        });
        return new Response(body);
      }),
    );
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 20,
        retries: 0,
        signal: new AbortController().signal,
      },
    );
    await expect(readText("/", options)).rejects.toThrow("body aborted");
  });

  it.each([
    { phase: "index", delays: [150, 0] },
    { phase: "playback", delays: [0, 150] },
  ])("reports a $phase timeout through MCP", async ({ delays }) => {
    const { signals } = stubFetch(delays);
    const client = await connectClient();
    const result = await client.callTool({
      name: "archives_content",
      arguments: {
        target: "https://example.com/",
        provider: "wayback",
        // A full timestamp is replayed without the index, so only a year keeps
        // the index timeout in the path.
        timestamp: "2020",
        cache: false,
        retries: 0,
        timeout: 20,
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("ARCHIVE_CONTROL");
    expect(signals.at(-1)?.aborted).toBe(true);
  });

  it("propagates MCP cancellation to the active fetch without retrying", async () => {
    const { fetch, signals } = stubFetch([500]);
    const client = await connectClient();
    const controller = new AbortController();
    const pending = expect(
      client.callTool(
        {
          name: "archives_content",
          arguments: {
            target: "https://example.com/",
            provider: "wayback",
            cache: false,
            retries: 2,
            timeout: 1000,
          },
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    await pending;
    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reads the synthetic capture through MCP before its deadline", async () => {
    const { fetch } = stubFetch([0, 0]);
    const client = await connectClient();
    const result = await client.callTool({
      name: "archives_content",
      arguments: {
        target: "https://example.com/",
        provider: "wayback",
        timestamp: "20200101000000",
        cache: false,
        retries: 0,
        timeout: 1000,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain("ARCHIVE_CONTROL");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("connection failures", () => {
  function refuseConnections() {
    const cause = Object.assign(
      new Error("Connect Timeout Error (attempted address: archive.is:443, timeout: 10000ms)"),
      { code: "UND_ERR_CONNECT_TIMEOUT" },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => {
        throw new TypeError("fetch failed", { cause });
      }),
    );
  }

  const reason =
    "fetch failed: UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: archive.is:443, timeout: 10000ms)";

  it("keeps the undici cause in the library error", async () => {
    refuseConnections();
    const archive = createArchive(await providers.archiveToday());
    const { error } = await archive.snapshots("github.com", { cache: false, retries: 0 });
    expect(error).toContain(reason);
  });

  it("hands the cause to an MCP client", async () => {
    refuseConnections();
    const client = await connectClient();
    const response = await client.callTool({
      name: "archives_snapshots",
      arguments: { target: "github.com", provider: "archiveToday", cache: false },
    });
    const [first] = response.content as Array<{ text: string }>;
    expect(first?.text).toContain(reason);
  });
});

describe("native fetch client", () => {
  function answer(...responses: readonly Response[]) {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const response of responses) fetch.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("builds the URL from baseURL and params and sends the headers it was given", async () => {
    const fetch = answer(Response.json([["original"]]));
    const options = await createFetchOptions("https://web.archive.org", {
      url: "example.com/a b",
      limit: 2,
    });
    await expect(fetchData("/cdx/search/cdx", options)).resolves.toEqual([["original"]]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://web.archive.org/cdx/search/cdx?url=example.com%2Fa+b&limit=2");
    expect(init?.headers).toMatchObject({ "user-agent": USER_AGENT });
  });

  it("parses JSON served as text/plain and keeps an empty body empty", async () => {
    answer(
      new Response('[["original"]]', { headers: { "content-type": "text/plain" } }),
      new Response(""),
    );
    await expect(fetchData("https://example.com/a")).resolves.toEqual([["original"]]);
    await expect(fetchData("https://example.com/b")).resolves.toBeUndefined();
  });

  it("fails on an HTML page answered with 200 instead of reading it as no captures", async () => {
    answer(new Response("<html>maintenance</html>", { headers: { "content-type": "text/html" } }));
    await expect(fetchData("https://example.com/cdx")).rejects.toThrow(
      "https://example.com/cdx did not answer with JSON",
    );
  });

  it("returns text and the unread stream when asked", async () => {
    answer(new Response("line one\nline two"), new Response("streamed"));
    await expect(fetchData("https://example.com/t", { responseType: "text" })).resolves.toBe(
      "line one\nline two",
    );
    const stream = await fetchData<ReadableStream<Uint8Array>>("https://example.com/s", {
      responseType: "stream",
    });
    await expect(new Response(stream).text()).resolves.toBe("streamed");
  });

  it("raises an HTTP failure with its status and body, in the message shape callers read", async () => {
    answer(
      Response.json(
        { message: "No Captures found for: example.com" },
        { status: 404, statusText: "Not Found" },
      ),
    );
    const failure = await fetchData("https://index.commoncrawl.org/x", { retry: 0 }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({
      name: "FetchError",
      message: '[GET] "https://index.commoncrawl.org/x": 404 Not Found',
      status: 404,
      statusCode: 404,
    });
    expect(isNoCaptureError(failure, "No Captures found")).toBe(true);
  });

  it("retries a listed status and gives up with the last failure", async () => {
    const fetch = answer(
      new Response("busy", { status: 503 }),
      new Response("busy", { status: 503 }),
      new Response("still busy", { status: 503 }),
    );
    await expect(fetchData("https://example.com/", { retry: 2 })).rejects.toMatchObject({
      status: 503,
      data: "still busy",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a status outside the list", async () => {
    const fetch = answer(new Response("gone", { status: 410 }), new Response("[]"));
    await expect(fetchData("https://example.com/", { retry: 2 })).rejects.toMatchObject({
      status: 410,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure and names the URL when none succeeds", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchData("https://example.com/", { retry: 1 })).rejects.toThrow(
      '[GET] "https://example.com/": <no response> fetch failed',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops before any request when the caller already aborted", async () => {
    const fetch = answer(new Response("[]"));
    const controller = new AbortController();
    controller.abort(new Error("caller gave up"));
    await expect(fetchData("https://example.com/", { signal: controller.signal })).rejects.toThrow(
      "caller gave up",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hands a redirect back when asked to handle it manually", async () => {
    const fetch = answer(
      new Response(null, { status: 302, headers: { location: "https://example.org/" } }),
    );
    const response = await fetchResponse("https://example.com/", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("cancels the rest of a body once the byte cap is read", async () => {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new TextEncoder().encode("0123456789"));
      },
      cancel() {
        cancelled = true;
      },
    });
    answer(new Response(body, { headers: { "content-type": "text/plain" } }));
    const read = await fetchBody("https://example.com", "/capture", { maxBytes: 15, retries: 0 });
    expect(read).toMatchObject({ text: "012345678901234", bytes: 15, truncated: true });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(5);
  });
});

describe("listing through the native client", () => {
  it("reports an HTML page in place of the CDX answer as a failure, not as no captures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response("<html>Wayback Machine is down for maintenance</html>", {
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const archive = createArchive(await providers.wayback());
    const result = await archive.snapshots("example.com", { cache: false, retries: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("did not answer with JSON");
  });
});
