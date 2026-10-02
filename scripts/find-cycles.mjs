// Detect runtime import cycles in app/, components/ and lib/.
// A cycle that crosses the server/client boundary is what triggers the
// "Cannot access 'X' before initialization" error in production chunks.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(".");
const DIRS = ["app", "components", "lib"];
const files = new Set();

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) files.add(p);
  }
}
for (const d of DIRS) walk(join(ROOT, d));

function runtimeImports(file) {
  const src = readFileSync(file, "utf8");
  const found = [];
  const re = /^\s*(?:import(?!\s+type)[^"']*?from|import|export[^"']*?from)\s*["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(src))) found.push(m[1]);
  return found;
}

function resolveImport(fromFile, spec) {
  const p = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) :
            spec.startsWith(".") ? join(dirname(fromFile), spec) : null;
  if (!p) return null;
  return [p, p + ".ts", p + ".tsx", join(p, "index.ts"), join(p, "index.tsx")]
    .find(x => existsSync(x) && statSync(x).isFile()) ?? null;
}

const graph = new Map();
for (const f of files) {
  const deps = [];
  for (const spec of runtimeImports(f)) {
    const r = resolveImport(f, spec);
    if (r) deps.push(r);
  }
  graph.set(f, deps);
}

const color = new Map();
const stack = [];
const cycles = [];

function dfs(node) {
  color.set(node, 1);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) {
    if (!color.has(dep)) dfs(dep);
    else if (color.get(dep) === 1) {
      const start = stack.indexOf(dep);
      cycles.push([...stack.slice(start), dep]);
    }
  }
  stack.pop();
  color.set(node, 2);
}
for (const f of graph.keys()) if (!color.has(f)) dfs(f);

const seen = new Set();
const unique = [];
for (const c of cycles) {
  const key = [...c.slice(0, -1)].map(x => x.replace(/\\/g, "/")).sort().join("|");
  if (!seen.has(key)) { seen.add(key); unique.push(c); }
}

console.log(`cycles found: ${unique.length}`);
for (const c of unique) {
  console.log("\n" + c.map(x => x.replace(ROOT + "\\", "").split("\\").join("/")).join(" -> "));
}
