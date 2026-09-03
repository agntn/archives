/**
 * Tiny tokenizers for the snippets the explorer generates itself.
 *
 * Input is escaped before any markup is added, so the result is safe to bind as
 * HTML. The classes match the `tok-*` colours the landing already uses.
 */

function escape(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|(true|false|null)/gu;

export function highlightJson(text: string): string {
  return escape(text).replace(JSON_TOKEN, (match, string: string | undefined, colon: string | undefined, number, keyword) => {
    if (string) {
      return colon ? `<span class="tok-key">${string}</span>${colon}` : `<span class="tok-str">${string}</span>`;
    }
    if (number) {
      return `<span class="tok-const">${number}</span>`;
    }
    return `<span class="tok-kw">${keyword}</span>`;
  });
}

const TS_TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|const|let|await|async|export|new|return|function|type|interface)\b|\b([A-Za-z_$][\w$]*)(?=\()/gu;

export function highlightTs(text: string): string {
  return escape(text).replace(TS_TOKEN, (match, comment, string, keyword, call) => {
    if (comment) return `<span class="tok-cm">${comment}</span>`;
    if (string) return `<span class="tok-str">${string}</span>`;
    if (keyword) return `<span class="tok-kw">${keyword}</span>`;
    return `<span class="tok-fn">${call}</span>`;
  });
}

export function highlightShell(text: string): string {
  return escape(text).replace(/(#[^\n]*)/gu, '<span class="tok-cm">$1</span>');
}
