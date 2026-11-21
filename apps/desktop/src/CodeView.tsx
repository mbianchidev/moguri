import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { common, createLowlight } from "lowlight";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";

const lowlight = createLowlight(common);
/** Past this size a read-only preview stays plain text so a large file never blocks the renderer. */
export const HIGHLIGHT_LIMIT = 256 * 1024;
const extensions: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json", md: "markdown", mdx: "markdown", css: "css", scss: "scss", less: "less", html: "xml", htm: "xml", xml: "xml", svg: "xml",
  plist: "xml", yml: "yaml", yaml: "yaml", sh: "bash", bash: "bash", zsh: "bash", py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  kt: "kotlin", kts: "kotlin", swift: "swift", c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", m: "objectivec", mm: "objectivec",
  cs: "csharp", php: "php", sql: "sql", toml: "ini", ini: "ini", cfg: "ini", diff: "diff", patch: "diff", graphql: "graphql", gql: "graphql",
  lua: "lua", pl: "perl", r: "r", vb: "vbnet", wat: "wasm",
};
const names: Record<string, string> = { makefile: "makefile", gnumakefile: "makefile", gemfile: "ruby", rakefile: "ruby", ".bashrc": "bash", ".zshrc": "bash" };

export function languageForPath(path: string): string | undefined {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  const language = names[name] ?? (name.includes(".") ? extensions[name.slice(name.lastIndexOf(".") + 1)] : undefined);
  return language && lowlight.registered(language) ? language : undefined;
}

/** Read-only syntax-highlighted text. Highlighting builds React elements from a syntax tree, never HTML strings. */
export function CodeView({ path, text, label }: { path: string; text: string; label?: string }) {
  const language = languageForPath(path);
  const highlighted = useMemo(() => {
    if (!language || text.length > HIGHLIGHT_LIMIT) return null;
    try { return toJsxRuntime(lowlight.highlight(language, text), { Fragment, jsx, jsxs }); }
    catch { return null; }
  }, [language, text]);
  return <pre className="workspace-file-content code-view" tabIndex={0} aria-label={label ?? path} data-language={highlighted ? language : "plaintext"}>
    <code className={highlighted ? `hljs language-${language}` : undefined}>{highlighted ?? text}</code>
  </pre>;
}

/** One line's highlighted React nodes, or the plain text when the language is unknown or the line is too long to be worth it. */
export function highlightLine(language: string | undefined, text: string) {
  if (!language || text.length > 2000) return text;
  try { return toJsxRuntime(lowlight.highlight(language, text), { Fragment, jsx, jsxs }); }
  catch { return text; }
}
