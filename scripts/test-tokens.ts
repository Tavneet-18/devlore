/**
 * Undefined-colour-token guard.
 *
 * `text-tertiary` and `bg-tertiary` sat in LocationBar against a palette that
 * has no `--color-tertiary`. Nothing caught it: TypeScript accepts any string,
 * ESLint does not know Tailwind's theme, and Tailwind v4 silently emits *no
 * rule at all* for a utility whose token does not exist. So a geolocation
 * button rendered in inherited colour with an invisible status dot while every
 * check stayed green.
 *
 * The reference set is derived from the built stylesheet rather than a
 * hand-kept list of allowed names, so it cannot rot: any colour utility
 * Tailwind actually generated is, by definition, valid. A utility referenced in
 * source that produced no rule is either a typo or dead code, and both deserve
 * a failure.
 *
 * Must run after `next build` — it reads .next/static/css.
 * Run: npm run test:tokens
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CSS_DIR = join(ROOT, ".next", "static", "css");

if (!existsSync(CSS_DIR)) {
  console.error("FAIL — .next/static/css is missing. Run `npm run build` first.");
  process.exit(1);
}

/* -------------------------------------------------------------------------- */

/**
 * Utilities whose colour comes from a `--color-*` token.
 *
 * `via-` and `to-` are deliberately absent. In Tailwind's gradient syntax they
 * are ambiguous — `bg-gradient-to-br` makes `to-br` a *direction* and
 * `to-primary` a *colour* — so including them flagged every gradient on the
 * site. `from-` is unambiguous and is checked.
 */
const UTILITY = "(?:text|bg|border|ring|outline|decoration|divide|from|fill|stroke|shadow|placeholder)";
const IS_UTILITY = new RegExp(`^(?:${UTILITY})-`);

/* ------------------------------------------------------ classes that exist - */

/** Tailwind escapes class names in selectors: `.hover\:text-ink:hover`. */
function unescapeClass(raw: string): string {
  return raw.replace(/\\([.:/[\]()%#,!])/g, "$1");
}

const generated = new Set<string>();

for (const name of readdirSync(CSS_DIR)) {
  if (!name.endsWith(".css")) continue;
  const css = readFileSync(join(CSS_DIR, name), "utf8");

  // exec rather than matchAll: on this project's tsconfig target, iterating a
  // matchAll result silently stops after the first few matches.
  // The leading `{` matters: Tailwind wraps `hover:` variants in
  // `@media (hover:hover){.hover\:border-line-hi:hover{...}}`, so a rule can
  // open straight after a brace with no selector before it.
  const re = /(^|[\s,>+~}{])\.((?:\\.|[^\s,{}[\]()>+~])+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (m[0].length === 0) re.lastIndex++;
    // A selector interleaves variant prefixes, the utility and pseudo-classes:
    // `.hover\:border-line-hi:hover`. Index every segment that is itself a
    // utility, so the bare name resolves whether or not it was ever used
    // unprefixed.
    for (const segment of unescapeClass(m[2]).split(":")) {
      if (!IS_UTILITY.test(segment)) continue;
      generated.add(segment);
      // An opacity modifier is part of the selector, not the token:
      // `.bg-raised\/50` must make `bg-raised` look valid.
      const base = segment.split("/")[0];
      if (base && base !== segment) generated.add(base);
    }
  }
}

/* ------------------------------------------------------ classes that are used */

/**
 * Other Tailwind scales that share these prefixes. Without this every
 * `text-sm`, `border-b` and `shadow-lg` reads as an unknown colour.
 */
const NOT_COLOUR = new Set([
  // text-<size>, leading, tracking
  "xs", "sm", "base", "lg", "xl", "tighter", "tight", "normal", "wide", "wider", "widest",
  // text-<align> / text-<wrap>
  "left", "center", "right", "justify", "start", "end", "nowrap", "balance", "pretty",
  // font-weight
  "thin", "extralight", "light", "medium", "semibold", "bold", "extrabold",
  // border-<width|style>
  "solid", "dashed", "dotted", "double", "hidden", "none",
  // shadow-<size>
  "inner", "inset",
  // keywords
  "current", "inherit", "transparent", "black", "white",
]);

/**
 * One utility reference: optional variant prefix, the utility, and the token.
 * `hover:border-line-hi`, `from-primary/30`, `bg-raised/50`, `text-t-hackathon`.
 *
 * Numeric shades and arbitrary values are skipped by construction — `text-2xl`
 * has no letter after the dash and `text-[13px]` has no letter at all — which
 * is the same reason the site's numeric Tailwind colours are not checked here.
 */
const CANDIDATE = new RegExp(
  "(?:^|[\\s\"'`])[\\w:-]*(" + UTILITY + ")-([a-z][a-z0-9-]*)(?=[\\s\"'`/]|$)",
  "g",
);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const offenders: string[] = [];

for (const file of [
  ...sourceFiles(join(ROOT, "app")),
  ...sourceFiles(join(ROOT, "components")),
  ...sourceFiles(join(ROOT, "lib")),
]) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const re = new RegExp(CANDIDATE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) re.lastIndex++;
    const [, utility, token] = m;
    if (NOT_COLOUR.has(token.split("-")[0])) continue;
    const cls = `${utility}-${token}`;
    if (generated.has(cls)) continue;
    offenders.push(`${rel}: ${cls}`);
  }
}

const unique = [...new Set(offenders)].sort();

if (unique.length > 0) {
  console.error(`FAIL — ${unique.length} colour utility/utilities produced no CSS rule:`);
  for (const o of unique) console.error(`  ${o}`);
  console.error("\nEither the token is not declared in app/globals.css @theme, or the code is dead.");
  process.exit(1);
}

console.log(
  `PASS — every colour utility in app/, components/ and lib/ resolves (${generated.size} class names in the built CSS).`,
);