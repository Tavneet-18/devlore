// What structured fields does each source actually provide?
// Reads only the captured fixtures, so this is reproducible offline.
import { readFileSync, existsSync } from "node:fs";

const F = "tests/fixtures";

function load(name: string): unknown {
  const p = `${F}/${name}.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

/** Collect every leaf key path present anywhere in an object. */
function keyPaths(node: unknown, prefix = "", out = new Set<string>(), depth = 0): Set<string> {
  if (node === null || node === undefined || depth > 6) return out;
  if (Array.isArray(node)) {
    node.slice(0, 3).forEach((v) => keyPaths(v, prefix + "[]", out, depth + 1));
    return out;
  }
  if (typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") keyPaths(v, path, out, depth + 1);
    else out.add(path);
  }
  return out;
}

/** Fields we care about, and which source paths could satisfy them. */
const WANTED: [string, RegExp][] = [
  ["description text", /^(data\.)?sections\[\]\.content$|description|(data\.)?desc/i],
  ["prize", /prize/i],
  ["team size", /teamSize|team_size|participants_details\[\]/i],
  ["eligibility / students", /eligib|student|fresher|age|underserved/i],
  ["fee (free/paid)", /ticket|entry_fee|fee|is_free/i],
  ["mode (online/hybrid)", /tags\.mode|formatType|formats\[\]|is_online|mode/i],
  ["venue", /venue|location|address|city/i],
  ["themes / tracks", /themes\[\]|theme|categories|tags\[\]/i],
  ["organiser name", /organizer|organisation|organization|chapter|company/i],
  ["start date", /startDate|startsAt|starts_at|registrationStart|submissionStart|start_date/i],
  ["end date", /endDate|endsAt|ends_at|submissionEnd|end_date/i],
  ["registration deadline", /reg_ends_at|registrationEnd|deadline|regnRequirements/i],
  ["participant count", /participants_count|registrations\.value|participant|rating/i],
  ["poster image", /logo|backgroundUrl|featured_cover_img|imageUrl|thumbnail/i],
  ["stable id", /^(data\.)?uuid$|^(data\.)?id$|slug|cards\[\]\.id/i],
];

function report(label: string, fixture: unknown, sampleKeys: string[]) {
  console.log("=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
  if (!fixture) { console.log("  (no fixture)"); console.log(""); return; }

  const all = [...keyPaths(fixture)].sort();
  console.log(`  ${all.length} distinct leaf paths captured\n`);

  for (const [name, rx] of WANTED) {
    const hits = all.filter((k) => rx.test(k));
    const status = hits.length ? "YES" : "no ";
    console.log(`  [${status}] ${name.padEnd(26)} ${hits.slice(0, 3).join("  ") || "—"}`);
  }
  if (sampleKeys.length) console.log(`\n  sample keys: ${sampleKeys.join(", ")}`);
  console.log("");
}

function main() {
  const dv = load("devfolio__next_data") as { open_hackathons?: Record<string, unknown>[] } | null;
  if (dv?.open_hackathons?.[0]) {
    report("DEVFOLIO  (open_hackathons[0])", dv.open_hackathons[0], Object.keys(dv.open_hackathons[0]));
  }

  const h2 = load("hack2skill__event_details") as { data?: Record<string, unknown> } | null;
  if (h2?.data) {
    console.log("  settings/tags subkeys:");
    const tags = (h2.data.tags ?? {}) as Record<string, unknown>;
    console.log("   ", Object.keys(tags).join(", "));
    const mode = (tags.mode ?? {}) as Record<string, unknown>;
    console.log("    mode:", JSON.stringify(mode));
    const ts = (tags.teamSize ?? {}) as Record<string, unknown>;
    console.log("    teamSize:", JSON.stringify(ts));
    const ticket = (tags.ticket ?? {}) as Record<string, unknown>;
    console.log("    ticket:", JSON.stringify(ticket));
    const sections = (h2.data.sections ?? []) as { title?: string }[];
    console.log("    section titles:", sections.map((s) => s.title).join(" | ").slice(0, 300));
    console.log("");
    report("HACK2SKILL  (data)", h2.data, Object.keys(h2.data));
  }

  const wmd = load("wemakedevs__rsc_flight") as { cards?: Record<string, unknown>[] } | null;
  if (wmd?.cards?.[0]) {
    report("WEMAKEDEVS  (cards[0])", wmd.cards[0], Object.keys(wmd.cards[0]));
  }

  const mlh = load("mlh__inertia_page") as { upcomingEvents?: Record<string, unknown>[] } | null;
  if (mlh?.upcomingEvents?.[0]) {
    report("MLH  (upcomingEvents[0])", mlh.upcomingEvents[0], Object.keys(mlh.upcomingEvents[0]));
  }
}

main();
