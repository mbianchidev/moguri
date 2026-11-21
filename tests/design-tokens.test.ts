import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { appearanceColors, colorContrast, indicatorTone, outcomeLabel, sessionIndicatorColors, sessionStatusLabel, themePalettes, themeVariable,
  type Appearance, type SessionIndicatorKind, type SessionStatus, type ThemeMode } from "../packages/sdk/src/index.ts";

const css = readFileSync(new URL("../apps/desktop/src/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../apps/desktop/src/App.tsx", import.meta.url), "utf8");

function block(selector: string) {
  const start = css.indexOf(`${selector} {\n`);
  assert.ok(start >= 0, `${selector} token block is missing`);
  const end = css.indexOf("\n}\n", start);
  const body = css.slice(start + selector.length + 3, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens.set(match[1]!, match[2]!.trim());
  return { tokens, text: css.slice(start, end + 3) };
}
const dark = block(":root"), light = block(':root[data-theme="light"]');
const hex = (value: string) => {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  return (short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : value).toLowerCase();
};
const backgrounds = ["canvas", "surface", "sidebar", "subtle"] as const;

/** Resolves a token exactly as the renderer would for a palette: runtime palette and session-indicator values win. */
function resolver(appearance: Appearance, mode: ThemeMode) {
  const colors = appearanceColors(appearance, mode);
  const runtime = new Map<string, string>(Object.entries(colors).map(([key, value]) => [themeVariable(key), value]));
  for (const [key, value] of Object.entries(sessionIndicatorColors(colors.sidebar))) runtime.set(`--session-${key}`, value);
  const declared = new Map([...dark.tokens, ...mode === "light" ? light.tokens : []]);
  const resolve = (name: string, depth = 0): string => {
    assert.ok(depth < 8, `${name} has a circular reference`);
    const value = runtime.get(name) ?? declared.get(name);
    assert.ok(value, `${name} is not declared`);
    const reference = /^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/.exec(value);
    if (!reference) return hex(value);
    return runtime.has(reference[1]!) || declared.has(reference[1]!) ? resolve(reference[1]!, depth + 1) : hex(reference[2]!.trim());
  };
  return { colors, resolve };
}
const appearances = themePalettes.filter((palette) => palette.id !== "custom").map((palette) => ({ theme: "dark", palette: palette.id }) as Appearance);

test("desktop CSS palette fallbacks are the shared SDK Moguri palette", () => {
  for (const [mode, tokens] of [["dark", dark.tokens], ["light", light.tokens]] as const) {
    for (const [key, value] of Object.entries(appearanceColors({ theme: mode }, mode))) {
      assert.equal(hex(tokens.get(themeVariable(key)) ?? "missing"), value, `${mode} ${themeVariable(key)} drifted from the SDK palette`);
    }
  }
});

test("the documented token scales are declared", () => {
  const required = [
    ...["running", "attention", "completed", "merged", "failed", "partial", "stopped", "queued", "neutral", "unknown"].map((name) => `--status-${name}`),
    ...[0, 1, "1-5", 2, "2-5", 3, "3-5", 4, 5, 6, 7, 8].map((step) => `--space-${step}`),
    ...["xs", "sm", "md", "lg", "xl", "pill"].map((name) => `--radius-${name}`),
    "--font-sans", "--font-mono", ...["2xs", "xs", "sm", "md", "base", "lg", "xl", "2xl", "3xl"].map((name) => `--font-size-${name}`),
    "--line-height-tight", "--line-height-normal", "--line-height-relaxed", "--font-weight-medium", "--font-weight-semibold", "--font-weight-bold",
    "--target-size", "--target-size-coarse", ...["raised", "tooltip", "popover", "dialog", "drawer-start", "drawer-end"].map((name) => `--elevation-${name}`),
    "--backdrop", "--backdrop-soft", "--focus-ring", "--focus-ring-width", "--focus-ring-color", "--focus-ring-offset",
    "--duration-fast", "--duration-base", "--duration-slow", "--ease-standard",
  ];
  assert.deepEqual(required.filter((name) => !dark.tokens.has(name)), []);
  for (const tokens of [dark.tokens, light.tokens]) {
    for (const name of tokens.keys()) {
      const seen = new Set<string>();
      for (let current: string | undefined = name; current; current = /^var\((--[a-z0-9-]+)/.exec(tokens.get(current) ?? dark.tokens.get(current) ?? "")?.[1]) {
        assert.ok(!seen.has(current), `${name} resolves through a circular reference`); seen.add(current);
      }
    }
  }
  assert.match(css, /:focus-visible \{ outline: var\(--focus-ring\); outline-offset: var\(--focus-ring-offset\); \}/);
});

test("every stylesheet variable is declared or set by the desktop at runtime", () => {
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]!));
  const runtime = ["--nav-width", "--context-width"];
  const missing = [...new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]!))]
    .filter((name) => !declared.has(name) && !runtime.includes(name) && !/^--session-(running|attention|completed|merged|draft)(-hover|-selected)?$/.test(name));
  assert.deepEqual(missing, [], "undeclared variables silently drop borders, colors and spacing");
  assert.ok(app.includes("--session-${key}${suffix}") && app.includes("--nav-width") && app.includes("--context-width"));
});

test("raw colors live only in the token blocks", () => {
  const rest = css.replace(dark.text, "").replace(light.text, "");
  assert.deepEqual([...rest.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0]), []);
});

test("component spacing, type sizes and radii use scale tokens rather than literal pixels", () => {
  const rest = css.replace(dark.text, "").replace(light.text, "");
  const withoutFunctions = (value: string) => {
    let previous = "";
    while (previous !== value) { previous = value; value = value.replace(/[a-z-]*\([^()]*\)/g, ""); }
    return value;
  };
  const literals: string[] = [];
  for (const match of rest.matchAll(/(?<=[{;\s])((?:padding|margin)(?:-[a-z-]+)?|gap|row-gap|column-gap|font-size|font|border(?:-[a-z]+)*-radius)\s*:\s*([^;{}]+)/g)) {
    // Hairlines (1px) and fluid clamp()/calc() geometry are allowed; a font shorthand's /line-height is not a type size.
    const value = withoutFunctions(match[1] === "font" ? match[2]!.replace(/\/\S+/, "") : match[2]!);
    if ([...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].some((px) => !["0", "1", "-1"].includes(px[1]!))) literals.push(match[0]);
  }
  assert.deepEqual(literals, []);
});

test("status, focus and text tokens meet WCAG contrast for every palette in Dark and Light", () => {
  const failures: string[] = [];
  for (const appearance of appearances) {
    for (const mode of ["dark", "light"] as const) {
      const { colors, resolve } = resolver(appearance, mode);
      const check = (token: string, background: string, minimum: number) => {
        const ratio = colorContrast(resolve(token), colors[background as keyof typeof colors]);
        if (ratio < minimum) failures.push(`${appearance.palette} ${mode}: ${token} on ${background} ${ratio.toFixed(2)}:1 < ${minimum}:1`);
      };
      for (const background of backgrounds) {
        for (const token of ["--text", "--muted", "--status-failed", "--status-attention", "--status-partial", "--status-unknown"]) check(token, background, 4.5);
        for (const token of ["--focus-ring-color", "--status-running", "--status-completed", "--status-merged", "--status-stopped", "--status-queued", "--status-neutral"]) check(token, background, 3);
      }
      check("--control-line", "surface", 3);
      check("--warning-text", "warningBg", 4.5); check("--error-text", "errorBg", 4.5); check("--on-accent", "accent", 4.5);
    }
  }
  assert.deepEqual(failures, []);
});

test("fixed-identity brand and chart tokens keep their own contrast", () => {
  const { resolve } = resolver({ theme: "dark" }, "dark");
  for (const token of ["--brand-ink", "--brand-mist", "--brand-violet", "--brand-gold", "--brand-rose"]) {
    assert.ok(colorContrast(resolve(token), resolve("--brand-night")) >= 4.5, `${token} on the startup screen`);
  }
  for (const mode of ["dark", "light"] as const) {
    const { colors, resolve: value } = resolver({ theme: mode }, mode);
    for (const lane of ["prompt", "answer", "thinking", "command", "file", "web", "tool", "context"]) {
      assert.ok(colorContrast(value(`--chart-${lane}`), colors.surface) >= 3, `${mode} --chart-${lane} on surface`);
    }
    for (const token of ["keyword", "string", "comment", "number", "title", "type", "tag", "addition", "deletion"]) {
      assert.ok(colorContrast(value(`--syntax-${token}`), value("--code")) >= 4.5, `${mode} --syntax-${token} on code`);
    }
  }
  for (const appearance of appearances) {
    for (const mode of ["dark", "light"] as const) {
      const { colors, resolve: value } = resolver(appearance, mode);
      for (const background of backgrounds) for (const state of ["open", "closed", "merged"]) {
        assert.ok(colorContrast(value(`--github-${state}`), colors[background]) >= 3, `${appearance.palette} ${mode} --github-${state} on ${background}`);
      }
    }
  }
});

test("infinite animations stop under reduced motion and transitions are disabled globally", () => {
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n?\}\n/g)].map((match) => match[1]).join("\n");
  assert.match(reduced, /\*, \*::before, \*::after \{ transition: none !important;/);
  for (const match of css.matchAll(/([^{}\n]+)\{[^}]*animation: [a-z-]+ [^;]*infinite/g)) {
    const selector = match[1]!.trim().split(",")[0]!.trim();
    assert.ok(reduced.includes(selector), `${selector} keeps animating under reduced motion`);
  }
});

test("the shared status vocabulary names every state and maps tones to declared status tokens", () => {
  const statuses: SessionStatus[] = ["idle", "queued", "running", "waiting_input", "stopping", "completed", "stopped", "failed", "partial", "archived"];
  for (const status of statuses) {
    const label = sessionStatusLabel(status);
    assert.notEqual(label.tone, "unknown", status); assert.doesNotMatch(label.label, /_/);
  }
  assert.deepEqual(sessionStatusLabel("waiting_input"), { label: "Needs attention", tone: "attention" });
  assert.deepEqual(sessionStatusLabel("generated_future"), { label: "Unknown (Generated future)", tone: "unknown" });
  assert.deepEqual(outcomeLabel(undefined), { label: "Unknown", tone: "unknown" });
  assert.deepEqual(outcomeLabel("partial"), { label: "Partial result", tone: "partial" });
  assert.equal(outcomeLabel("unconfirmed").tone, "unknown");
  const kinds: SessionIndicatorKind[] = ["running", "question", "approval", "completed", "merged", "failed", "partial", "stopped", "queued", "idle", "archived"];
  for (const kind of kinds) assert.ok(dark.tokens.has(`--status-${indicatorTone(kind)}`), kind);
  for (const tone of ["running", "attention", "completed", "failed", "partial", "stopped", "queued", "unknown"]) {
    assert.ok(css.includes(`.status-badge[data-tone="${tone}"] .status-badge-dot`), `${tone} badge dot`);
  }
});
