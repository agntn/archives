import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMcpServer } from "../src/mcp";
import { createFetchOptions } from "../src/utils";
import { fetchResponse } from "../src/utils/_fetch";

const STAMP = "20180304011626";

/** Query spellings an archive keys its captures by, so each one has to reach it byte for byte. */
const ORIGINALS = [
  "http://theterminal.sh:80/repl?command=mem%20D15EA5E",
  "https://example.com/search?q=a+b",
  "https://example.com/files?path=a%2Fb",
  "https://example.com/echo?q=%2520",
  "https://example.com/list?tag=a&tag=b",
] as const;

const connections: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* Serves one CDX capture of `original` and a marker for any replay; returns every URL asked for. */
function stubReplay(original: string): string[] {
  const urls: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    if (url.includes("/cdx/")) {
      return Response.json([
        ["original", "timestamp", "statuscode"],
        [original, STAMP, "200"],
      ]);
    }
    return new Response("<p>REPLAYED</p>", { headers: { "content-type": "text/html" } });
  });
  vi.stubGlobal("fetch", fetch);
  return urls;
}

async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "archives-replay-query-test", version: "1.0.0" });
  const server = createMcpServer();
  connections.push(client, server);
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("replay query encoding", () => {
  it.each(ORIGINALS)("sends a path without params as written: %s", async (original) => {
    const requested = stubReplay(original);
    const path = `/web/${STAMP}id_/${original}`;
    await fetchResponse(path, await createFetchOptions("https://web.archive.org", {}));
    expect(requested).toEqual([`https://web.archive.org${path}`]);
  });

  it("still lets params replace a key the path already carries", async () => {
    const requested = stubReplay(ORIGINALS[0]);
    await fetchResponse(
      "/cdx?limit=1",
      await createFetchOptions("https://web.archive.org", { limit: 100 }),
    );
    expect(requested).toEqual(["https://web.archive.org/cdx?limit=100"]);
  });

  describe.each(["text", "raw"] as const)("archives_content with format=%s", (format) => {
    it.each(ORIGINALS)("replays the capture CDX named: %s", async (original) => {
      const client = await connectClient();
      const targets = [
        { target: `https://web.archive.org/web/${STAMP}/${original}` },
        { target: original, timestamp: STAMP },
      ];
      for (const args of targets) {
        const requested = stubReplay(original);
        const result = await client.callTool({
          name: "archives_content",
          arguments: { ...args, provider: "wayback", format, cache: false, retries: 0 },
        });
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result)).toContain("REPLAYED");
        expect(requested.at(-1)).toBe(`https://web.archive.org/web/${STAMP}id_/${original}`);
      }
    });
  });
});
