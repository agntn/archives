/** A piece of one line of TypeScript and the `tok-*` class it is drawn with; empty for plain text. */
export interface Token {
  readonly text: string;
  readonly cls: string;
}

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "class",
  "extends",
  "static",
  "readonly",
  "super",
  "new",
  "await",
]);

const TOKEN =
  /(?<cm>\/\/.*$)|(?<str>"[^"]*")|(?<word>[A-Za-z_]\w*)(?<call>(?=\())?(?<key>(?=: ))?|(?<num>\b\d+\b)/gu;

/** Pieces that are not words: a comment, a string, a number. */
const LITERALS = [
  ["cm", "tok-cm"],
  ["str", "tok-str"],
  ["num", "tok-const"],
] as const;

/**
 * Picks the `tok-*` class for one match of `TOKEN`, or none for a plain name.
 *
 * @param {Readonly<Record<string, string | undefined>>} groups - The named groups of the match.
 * @returns {string} The class, empty for text that stays uncolored.
 */
function classOf(groups: Readonly<Record<string, string | undefined>>): string {
  if (groups.word === undefined) {
    return LITERALS.find(([name]) => groups[name] !== undefined)?.[1] ?? "";
  }
  if (KEYWORDS.has(groups.word)) return "tok-kw";
  if (groups.key !== undefined) return "tok-key";
  return groups.call === undefined ? "" : "tok-fn";
}

/**
 * Colors one line of the sample with the `tok-*` classes the other instruments use. The tokens
 * join back to the line, so the screen never shows a character the copy button leaves out.
 *
 * @param {string} line - One line of TypeScript from the sample.
 * @returns {Token[]} The line cut into colored and plain pieces.
 */
export function tokens(line: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const cls = classOf(match.groups ?? {});
    if (cls === "") continue;
    if (match.index > last) out.push({ text: line.slice(last, match.index), cls: "" });
    out.push({ text: match[0], cls });
    last = match.index + match[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), cls: "" });
  return out;
}

/**
 * Colors one shell command line: the program as a call, flags as keywords, quoted values as strings.
 * The tokens join back to the line.
 *
 * @param {string} line - A command line without its prompt.
 * @returns {Token[]} The line cut into colored and plain pieces.
 */
export function shellTokens(line: string): Token[] {
  const out: Token[] = [];
  const pattern = /(?<str>'[^']*'|"[^"]*")|(?<flag>--?[\w-]+)|(?<word>[^\s'"]+)|(?<space>\s+)/gu;
  let first = true;
  for (const match of line.matchAll(pattern)) {
    const groups = match.groups ?? {};
    if (groups.space !== undefined) out.push({ text: match[0], cls: "" });
    else if (groups.str !== undefined) out.push({ text: match[0], cls: "tok-str" });
    else if (groups.flag !== undefined) out.push({ text: match[0], cls: "tok-kw" });
    else {
      out.push({ text: match[0], cls: first ? "tok-fn" : "" });
      first = false;
    }
  }
  return out;
}

/**
 * Colors JSON the way the snippets color TypeScript: keys in the name colour, string values as
 * strings, `true`, `false` and `null` as keywords. The tokens join back to the text.
 *
 * @param {string} text - JSON as printed, whitespace included.
 * @returns {Token[]} The text cut into colored and plain pieces.
 */
export function jsonTokens(text: string): Token[] {
  const out: Token[] = [];
  const pattern =
    /(?<key>"(?:[^"\\]|\\.)*"(?=\s*:))|(?<str>"(?:[^"\\]|\\.)*")|(?<lit>\b(?:true|false|null)\b)/gu;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const groups = match.groups ?? {};
    const cls =
      groups.key !== undefined ? "tok-key" : groups.str !== undefined ? "tok-str" : "tok-kw";
    if (match.index > last) out.push({ text: text.slice(last, match.index), cls: "" });
    out.push({ text: match[0], cls });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: "" });
  return out;
}
