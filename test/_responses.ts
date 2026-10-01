/* A real `Response` with its final `url` set, which `new Response` can't do. */
export function rawResponse(
  body: string | Uint8Array | ReadableStream<Uint8Array>,
  init: Readonly<{
    url?: string;
    status?: number;
    headers?: Readonly<Record<string, string>>;
  }> = {},
): Response {
  const response = new Response(body as BodyInit, {
    status: init.status ?? 200,
    headers: { ...init.headers },
  });
  Object.defineProperty(response, "url", { value: init.url ?? "" });
  return response;
}
