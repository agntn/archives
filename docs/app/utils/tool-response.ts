export type ResponseTokenKind = "plain" | "label" | "url" | "date" | "hash" | "status" | "number";

export interface ResponseToken {
  readonly text: string;
  readonly kind: ResponseTokenKind;
}

const kinds = ["label", "url", "date", "hash", "status", "number"] as const;
const pattern =
  /(?<url>https?:\/\/[^\s]+)|(?<label>^[\t ]*[a-z][a-z0-9 _/.-]*:(?=[\t ]|$))|(?<date>\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?\b)|(?<hash>\b(?:0x)?[a-f0-9]{32,130}\b)|(?<status>\b(?:next|end|unsupported|unknown|truncated)\b)|(?<number>\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gim;

/**
 * Tokenize the tool's plain text without changing whitespace or generating HTML.
 *
 * @param {string} text - The original tool response.
 * @returns {ResponseToken[]} Ordered tokens that concatenate to the original text.
 */
export function tokenizeToolResponse(text: string): ResponseToken[] {
  const tokens: ResponseToken[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) tokens.push({ text: text.slice(offset, match.index), kind: "plain" });
    const kind = kinds.find((candidate) => match.groups?.[candidate] !== undefined) ?? "plain";
    tokens.push({ text: match[0], kind });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) tokens.push({ text: text.slice(offset), kind: "plain" });
  return tokens;
}
