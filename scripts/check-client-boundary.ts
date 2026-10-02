// Guard the client/server boundary.
//
// A previous commit imported the zod-validated event-details module from a
// client component, which shipped the entire zod library to every visitor's
// browser — where its module initialisation threw and the whole front page
// rendered the error boundary. The failure was invisible to tsc, eslint and
// `next build`, which all passed.
//
// This walks the runtime import graph from every client entry point and fails
// if a server-only module is reachable. `import type` is ignored: it is erased
// at compile time and cannot reach the bundle.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";

const ROOT = resolve(__dirname, "..");

/** Modules that must never execute in the browser. */
const FORBIDDEN = [
  "zod",
  "@prisma/client",
  "@/lib/db",
  "@/lib/event-details", // zod lives here; client uses @/lib/event-facts instead
  "@/lib/ai/",
  "@/lib/ingest",
  "@/lib/session",
  "@/lib/admin-",
  "@/lib/rate-limit",
];

/** Where client code can begin. Components plus the client-safe lib modules. */
const CLIENT_SAFE_LIBS = [
  "lib/event-facts.ts",
  "lib/event-summary.ts",
  "lib/event-summary",
  "lib/format.ts",
  "lib/calendar.ts",
  "lib/constants.ts",
  "lib/use-now.ts",
  "lib/issue.ts",
];

function allFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      allFiles(p, out);
    } else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Runtime (non-type-only) relative/aliased imports of a file. */
function runtimeImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const found: string[] = [];
  // Matches `import {...} from "x"`, `import "x"`, `export ... from "x"`,
  // but not `import type ...` (erased at compile, cannot reach the bundle).
  const re = /^\s*(?:import(?! type\b)[^"']*?from|import|export[^"']*?from)\s*["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) found.push(m[1]);
  return found;
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) {
    const p = join(ROOT, spec.slice(2));
    return withExtension(p);
  }
  if (spec.startsWith(".")) {
    const p = join(dirname(fromFile), spec);
    return withExtension(p);
  }
  return spec; // bare package specifier
}

function withExtension(p: string): string | null {
  for (const cand of [p, `${p}.ts`, `${p}.tsx`, join(p, "index.ts"), join(p, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function rel(p: string): string {
  return p.slice(ROOT.length + 1).split(sep).join("/");
}

const entries = [
  ...allFiles(join(ROOT, "components")),
  ...CLIENT_SAFE_LIBS.map((l) => join(ROOT, l)).filter((p) => existsSync(p)),
];

const violations: string[] = [];
const seen = new Set<string>();

function walk(file: string, chain: string[]) {
  const key = rel(file);
  if (seen.has(key)) return;
  seen.add(key);
  for (const spec of runtimeImports(file)) {
    const target = resolveImport(file, spec);
    const label = target ? rel(target) : spec;
    const hit = FORBIDDEN.some((f) =>
      f.endsWith("/") ? label === f.slice(0, -1) || label.startsWith(f) || spec.startsWith(f) : label === f || spec === f
    );
    if (hit) {
      violations.push(`${chain.join(" -> ")} -> ${label}  (via "${spec}")`);
      continue;
    }
    if (target && (target.endsWith(".ts") || target.endsWith(".tsx"))) {
      walk(target, [...chain, label]);
    }
  }
}

for (const e of entries) walk(e, [rel(e)]);

if (violations.length > 0) {
  console.log("CLIENT BUNDLE VIOLATIONS — server-only modules reachable from client code:\n");
  for (const v of violations) console.log(`  ${v}`);
  console.log(
    "\nClient components must use lib/event-facts.ts (zero imports) instead of\nlib/event-details.ts (zod). See the header of lib/event-facts.ts."
  );
  process.exitCode = 1;
} else {
  console.log(`OK: ${entries.length} client entry points walked, no server-only modules reachable.`);
}
