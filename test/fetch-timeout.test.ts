import { setTimeout as delay } from "node:timers/promises";
import { $fetch } from "ofetch";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createArchive, providers } from "../src/index";
import { createMcpServer } from "../src/mcp";
import { createFetchOptions } from "../src/utils";

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
      await expect($fetch("/", options)).resolves.toBe("ARCHIVE_CONTROL");
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
    await expect($fetch("/", options)).rejects.toThrow(/abort/i);
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
    const pending = expect($fetch("/", options)).rejects.toThrow(/abort/i);
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
    await expect($fetch("/", options)).resolves.toBe("ARCHIVE_CONTROL");
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
    await expect($fetch("/", options)).rejects.toThrow(/abort/i);
    expect(signals[0]?.aborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(21);
  });

  it("preserves request hooks and isolates concurrent uses of the options", async () => {
    const { fetch, signals } = stubFetch([150, 0]);
    const onRequest = vi.fn();
    const onRequestError = vi.fn();
    const controller = new AbortController();
    const options = await createFetchOptions(
      "https://example.com",
      {},
      {
        timeout: 20,
        retries: 0,
        signal: controller.signal,
        onRequest: [onRequest],
        onRequestError,
      },
    );
    await Promise.all([
      expect($fetch("/slow", options)).rejects.toThrow(/abort/i),
      expect($fetch("/fast", options)).resolves.toBe("ARCHIVE_CONTROL"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onRequestError).toHaveBeenCalledTimes(1);
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
    await expect($fetch("/", options)).rejects.toThrow("body aborted");
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
        undefined,
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
