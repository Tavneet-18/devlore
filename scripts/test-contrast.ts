/**
 * WCAG contrast guard for the editorial palette.
 *
 * Every colour on this site is a `--color-*` variable in app/globals.css, and
 * most of the small type is 9–10px uppercase — the size at which a colour that
 * "looks fine" at 16px is unreadable. That is exactly how `--color-faint`
 * reached 2.55:1 in light mode and shipped: `#5f5f70` on `#07070c` looked
 * deliberate in a dark screenshot and nobody checked the ratio.
 *
 * This reads the palette out of the stylesheet — dark from `@theme`, light from
 * `html.light` — and fails the build if any token used for text drops below its
 * required ratio against any surface it is drawn on. Both halves matter: a
 * token can pass on the page background and fail on a card.
 *
 * Surfaces are checked as composites, because the axis cards sit on
 * `bg-raised/20` (past) and `bg-raised/50` (live) rather than on `bg` itself.
 *
 * Run: npm run test:contrast
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

/* ---------------------------------------------------------------- colour -- */

function hex(value: string): [number, number, number] {
  let h = value.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over composite of `fg` at `alpha` on `bg`, as a hex string. */
function over(fg: string, bg: string, alpha: number): string {
  const F = hex(fg);
  const B = hex(bg);
  const m = F.map((v, i) => Math.round(v * alpha + B[i] * (1 - alpha)));
  return (
    "#" +
    m
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/* ----------------------------------------------------------------- parse -- */

/** Every `--color-<name>` declared inside a top-level block of `source`. */
function paletteFrom(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
    out[name] = value;
  }
  return out;
}

const themeBlock = CSS.slice(CSS.indexOf("@theme {"), CSS.indexOf("}", CSS.indexOf("@theme {")));
const lightBlock = CSS.slice(CSS.indexOf("html.light {"));
const lightEnd = lightBlock.indexOf("\n}");
const light = lightBlock.slice(0, lightEnd);

const dark = paletteFrom(themeBlock);
const lightPalette = { ...dark, ...paletteFrom(light) };

const MODES: Record<string, Record<string, string>> = { dark, light: lightPalette };

/* ------------------------------------------------------------ expectations - */

/**
 * Tokens drawn as text, with the ratio they must clear. All of them are used
 * below 14px somewhere — the axis card's type label is 9px — so 4.5:1 across
 * the board rather than the 3:1 large-text allowance.
 */
const TEXT_4_5 = [
  "ink",
  "muted",
  "faint",
  "primary",
  "primary-2",
  "cyan",
  "closing",
  "calm",
  "positive",
  "caution",
  "critical",
  "t-hackathon",
  "t-meetup",
  "t-workshop",
  "t-webinar",
  "t-conference",
  "t-career",
];

/**
 * Deliberately de-emphasised labels: axis month headers, weekday letters,
 * weekend dates, the deadline-kind line on a past card.
 *
 * These were originally held to 3:1 on the reasoning that "non-essential" text
 * can be quiet. That was the wrong call — a 9px weekday letter at 3.8:1 reads
 * as a broken render, not as restraint, and the audit of the painted page put
 * 78 elements in that band on the front page alone. Held to the same 4.5:1 as
 * everything else; the hierarchy now comes from size and tracking, which is
 * how it should have been doing it all along.
 */
const TEXT_3 = ["faint-dim"];

const SURFACES = ["bg", "surface", "raised"];

/* --------------------------------------------------------------- checking - */

let failures = 0;
const rows: string[] = [];

function check(mode: string, token: string, required: number) {
  const p = MODES[mode];
  const fg = p[token];
  if (!fg) {
    failures++;
    rows.push(`  FAIL ${mode}: --color-${token} is not defined`);
    return;
  }
  for (const surface of SURFACES) {
    const bg = p[surface];
    if (!bg) {
      failures++;
      rows.push(`  FAIL ${mode}: --color-${surface} is not defined`);
      continue;
    }
    const r = contrast(fg, bg);
    if (r < required) {
      failures++;
      rows.push(`  FAIL ${mode}: ${token} on ${surface} = ${r.toFixed(2)}:1 (needs ${required}:1)`);
    }
  }

  /* The axis card surfaces are translucent over the page. Check the real
     composite, not the nominal colour — this is where `bg-raised/50` plus a
     dim text token quietly loses contrast. */
  const base = p["bg"];
  const raised = p["raised"];
  for (const [label, alpha] of [["bg-raised/50", 0.5], ["bg-raised/20", 0.2]] as const) {
    const surface = over(raised, base, alpha);
    const r = contrast(fg, surface);
    if (r < required) {
      failures++;
      rows.push(`  FAIL ${mode}: ${token} on ${label} = ${r.toFixed(2)}:1 (needs ${required}:1)`);
    }
  }
}

for (const mode of Object.keys(MODES)) {
  for (const t of TEXT_4_5) check(mode, t, 4.5);
  /* faint-dim is listed above at 3:1 for its original intent, but is checked
     at 4.5 like the rest — see the note there. */
  for (const t of TEXT_3) check(mode, t, 4.5);
}

/* The primary button inverts: `text-bg` sits on a violet→blue gradient. */
for (const mode of Object.keys(MODES)) {
  const p = MODES[mode];
  for (const end of ["primary", "primary-2"] as const) {
    const r = contrast(p["bg"], p[end]);
    if (r < 4.5) {
      failures++;
      rows.push(`  FAIL ${mode}: bg text on --color-${end} = ${r.toFixed(2)}:1 (needs 4.5:1)`);
    }
  }
}

/* Hairlines are decoration, not text, but a divider nobody can see is not a
   divider. 1.6:1 is the floor for a structural line against its surface. */
for (const mode of Object.keys(MODES)) {
  const p = MODES[mode];
  for (const line of ["line", "line-hi"] as const) {
    const r = contrast(p[line], p["bg"]);
    if (r < 1.6) {
      failures++;
      rows.push(`  FAIL ${mode}: ${line} on bg = ${r.toFixed(2)}:1 (needs 1.6:1)`);
    }
  }
}

if (failures > 0) {
  console.error(`FAIL — ${failures} contrast violation(s):`);
  for (const r of rows) console.error(r);
  process.exit(1);
}

/* Report the tightest passing ratios so a future change that eats the margin
   is visible in review rather than only in a screenshot. */
const worst: string[] = [];
for (const mode of Object.keys(MODES)) {
  const p = MODES[mode];
  const tight = [...TEXT_4_5]
    .map((t) => ({ t, r: Math.min(...SURFACES.map((s) => contrast(p[t], p[s]))) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 3);
  worst.push(
    `  ${mode.padEnd(6)} tightest: ${tight.map((x) => `${x.t} ${x.r.toFixed(2)}:1`).join(", ")}`,
  );
}

console.log("PASS — palette clears WCAG AA in both modes.");
for (const w of worst) console.log(w);