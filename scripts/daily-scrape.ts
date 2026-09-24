#!/usr/bin/env tsx
/**
 * Daily ingest runner.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/daily-scrape.ts                    # all cities
 *   npx tsx --env-file=.env scripts/daily-scrape.ts --city=Bangalore   # single city
 *   npx tsx --env-file=.env scripts/daily-scrape.ts --dry-run          # no DB writes
 *
 * `--env-file=.env` is required: tsx does not read .env on its own, and the
 * discovery/AI mode flags are read from the environment.
 *
 * Writes a summary to ingest-summary.json for CI artifacts.
 *
 * The hosted equivalent is GET /api/cron/ingest, which Vercel Cron triggers
 * daily. This script exists so the job can also run from GitHub Actions or
 * locally without going through HTTP.
 */

import { writeFile } from "node:fs/promises";
import { ingestAll, ingestCity } from "../lib/ingest";
import { discoverEvents } from "../lib/ai/discovery";

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

function parseArgs(argv: string[]) {
  const city = argv.find((a) => a.startsWith("--city="))?.slice("--city=".length)?.trim();
  return {
    dryRun: argv.includes("--dry-run"),
    city: city && city.length > 0 ? city : undefined,
  };
}

async function saveSummary(summary: unknown) {
  try {
    await writeFile("ingest-summary.json", JSON.stringify(summary, null, 2), "utf8");
  } catch (e) {
    console.warn(`Could not write ingest-summary.json: ${(e as Error).message}`);
  }
}

async function main() {
  const { dryRun, city } = parseArgs(process.argv.slice(2));
  const cities = city ? [city] : CITIES;
  const startedAt = new Date().toISOString();

  console.log(
    `Devlore ingest — mode=${dryRun ? "dry-run" : "write"} ` +
      `discovery=${process.env.DISCOVERY_MODE ?? "mock"} ai=${process.env.AI_PROVIDER ?? "mock"} ` +
      `cities=${cities.join(",")}`
  );

  if (dryRun) {
    const results = [];
    for (const c of cities) {
      const res = await discoverEvents(c);
      const preview = res.events.slice(0, 3).map((e) => ({
        title: e.title,
        date: e.date,
        city: e.city ?? null,
        isOnline: e.isOnline ?? false,
        organizer: e.organizer,
        link: e.link ?? null,
      }));
      console.log(`  ${c.padEnd(10)} found=${res.found} deduped=${res.deduped}`);
      for (const p of preview) console.log(`      - ${p.title} (${p.date.slice(0, 10)})`);
      results.push({ city: c, found: res.found, deduped: res.deduped, preview });
    }
    await saveSummary({ dryRun: true, startedAt, finishedAt: new Date().toISOString(), results });
    return;
  }

  const results = city ? [await ingestCity(city)] : await ingestAll(cities);
  for (const r of results) {
    console.log(
      `  ${r.city.padEnd(10)} found=${r.found} upserted=${r.upserted} ` +
        `approved=${r.approved} pending=${r.pending} errors=${r.errors}`
    );
  }

  const total = results.reduce(
    (acc, r) => ({
      upserted: acc.upserted + r.upserted,
      approved: acc.approved + r.approved,
      pending: acc.pending + r.pending,
      errors: acc.errors + r.errors,
    }),
    { upserted: 0, approved: 0, pending: 0, errors: 0 }
  );

  console.log(
    `DONE upserted=${total.upserted} approved=${total.approved} pending=${total.pending} errors=${total.errors}`
  );
  await saveSummary({ dryRun: false, startedAt, finishedAt: new Date().toISOString(), total, results });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
