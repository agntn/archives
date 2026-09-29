import type { ThemeRegistrationRaw } from "shiki";

/**
 * The Shiki theme for code blocks in the docs. Every colour is a `--shiki-token-*` variable from
 * `app/app.css`, the same palette the landing's `tok-*` classes read, so a snippet looks the same in
 * a panel and on a page. Names, punctuation and numbers stay in the text colour, like on the landing.
 */
/**
 * One palette variable from app.css.
 *
 * @param {string} name - The token name after `--shiki-token-`.
 * @returns {string} The CSS variable reference.
 */
function token(name: string): string {
  return `var(--shiki-token-${name})`;
}

export const archivesTheme: ThemeRegistrationRaw = {
  name: "archives",
  type: "dark",
  colors: {
    "editor.foreground": "var(--ui-text-highlighted)",
    "editor.background": "transparent",
  },
  settings: [
    { settings: { foreground: "var(--ui-text-highlighted)", background: "transparent" } },
    {
      scope: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.new",
      ],
      settings: { foreground: token("keyword") },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
        "entity.name.type",
        "support.type",
      ],
      settings: { foreground: token("function") },
    },
    {
      scope: ["string", "string.quoted", "string.template", "punctuation.definition.string"],
      settings: { foreground: token("string") },
    },
    {
      scope: ["comment", "punctuation.definition.comment", "string.quoted.docstring.multi"],
      settings: { foreground: token("comment") },
    },
    {
      scope: ["markup.inserted", "punctuation.definition.inserted"],
      settings: { foreground: token("string") },
    },
    {
      scope: ["markup.deleted", "punctuation.definition.deleted"],
      settings: { foreground: "var(--archives-del)" },
    },
  ],
};
