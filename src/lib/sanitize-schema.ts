import { defaultSchema, type Options } from "rehype-sanitize";

/**
 * Sanitize schema for rendered note content.
 *
 * Notes are plain Markdown files that can be created or imported by any tool,
 * so their raw HTML must never be trusted: it runs inside a Tauri webview with
 * access to the IPC bridge.
 *
 * `defaultSchema` (GitHub style) already strips `script`, event handlers and
 * unknown tags. We only widen it where the Markdown pipeline needs it:
 * - `remark-math` marks TeX source with `language-math` / `math-inline` /
 *   `math-display` classes, which `rehype-katex` picks up afterwards.
 * - Relative attachment paths (`attachments/<note-id>/<file>`) must keep working.
 * - Pasted `data:` / `blob:` images are safe in `img[src]`.
 *
 * Sanitization runs *before* `rehype-katex`, so KaTeX's own output is left
 * untouched (KaTeX runs with `trust: false`, which disables `\href`,
 * `\htmlClass` and friends).
 */
export const markdownSanitizeSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", /^(language-|math-)/]],
    span: [["className", /^math/]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", /^math/]],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https", "data", "blob"],
  },
};
