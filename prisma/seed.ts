import { PrismaClient } from "@prisma/client";
import { ingestCity } from "../lib/ingest";
import { getEnhancer } from "../lib/ai";
import { isEventType } from "../lib/constants";
import type { RawEvent } from "../lib/ai/types";

const db = new PrismaClient();
const enhancer = getEnhancer();

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

/**
 * Two hand-written submissions used to demonstrate the moderation queue.
 * They are inserted as PENDING so /admin has something to review.
 */
const MANUAL_PENDING: RawEvent[] = [
  {
    source: "manual",
    title: "Community Web3 Meetup — Mumbai",
    description:
      "A gathering for blockchain and web3 builders to demo projects, discuss wallets and smart contracts with the local community. Newcomers welcome.",
    date: new Date(Date.now() + 12 * 86400000).toISOString(),
    city: "Mumbai",
    isOnline: false,
    eventType: "meetup",
    organizer: "XYZ Blockchain Club",
    link: "https://example.com/web3-mumbai",
  },
  {
    source: "manual",
    title: "Frontend Jam 2026 — Full-stack Workshop",
    description:
      "Hands-on full-day workshop covering React, Next.js and deployment for aspiring frontend engineers.",
    date: new Date(Date.now() + 20 * 86400000).toISOString(),
    city: "Delhi",
    isOnline: true,
    eventType: "workshop",
    organizer: "Sample Events LLP",
    link: "https://example.com/frontend-jam",
  },
];

async function main() {
  console.log(`Seeding cities: ${CITIES.join(", ")}`);

  // Real (or mock) discovery, run through the same idempotent upsert the daily
  // cron uses — so re-seeding never creates duplicate events.
  for (const city of CITIES) {
    const r = await ingestCity(city);
    console.log(
      `  ${city.padEnd(10)} found=${r.found} upserted=${r.upserted} approved=${r.approved} pending=${r.pending} errors=${r.errors}`
    );
  }

  // Manual moderation-queue samples, keyed so re-seeding is safe.
  let manual = 0;
  for (const raw of MANUAL_PENDING) {
    const externalId = raw.link ?? `manual:${raw.title}`;
    const enhancement = await enhancer.enhance(raw.title, raw.description, raw.link);
    await db.event.upsert({
      where: { externalId },
      create: {
        title: raw.title,
        description: raw.description,
        summary: enhancement.summary,
        date: new Date(raw.date),
        city: raw.city ?? null,
        isOnline: enhancement.isOnline,
        eventType: raw.eventType && isEventType(raw.eventType) ? raw.eventType : "other",
        organizer: raw.organizer,
        link: raw.link ?? null,
        tags: JSON.stringify(enhancement.tags),
        beginnerFriendly: enhancement.beginnerFriendly,
        source: "manual",
        status: "PENDING",
        externalId,
        fetchedAt: new Date(),
      },
      update: {},
    });
    manual += 1;
  }

  const total = await db.event.count();
  console.log(`Seeded ${manual} moderation sample(s). Database now has ${total} events.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
