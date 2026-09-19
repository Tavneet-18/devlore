import { PrismaClient } from "@prisma/client";
import { discoverEvents } from "../lib/ai/discovery";
import { getEnhancer } from "../lib/ai";
import type { RawEvent } from "../lib/ai/types";

const db = new PrismaClient();
const enhancer = getEnhancer();

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

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
  console.log(`Seeding events for cities: ${CITIES.join(", ")}`);

  const allRaw: RawEvent[] = [];
  for (const city of CITIES) {
    const result = await discoverEvents(city);
    allRaw.push(...result.events);
  }

  const seen = new Set<string>();
  let created = 0;

  for (const raw of allRaw) {
    const key = `${raw.title}|${raw.date}|${raw.city ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const enhancement = await enhancer.enhance(raw.title, raw.description, raw.link);

    await db.event.create({
      data: {
        title: raw.title,
        description: raw.description,
        summary: enhancement.summary,
        date: new Date(raw.date),
        city: raw.city ?? null,
        isOnline: enhancement.isOnline,
        eventType: raw.eventType ?? "other",
        organizer: raw.organizer,
        link: raw.link ?? null,
        tags: JSON.stringify(enhancement.tags),
        beginnerFriendly: enhancement.beginnerFriendly,
        source: raw.source,
        status: "APPROVED",
        viewCount: Math.floor(Math.random() * 40),
      },
    });
    created += 1;
  }

  for (const raw of MANUAL_PENDING) {
    const enhancement = await enhancer.enhance(raw.title, raw.description, raw.link);
    await db.event.create({
      data: {
        title: raw.title,
        description: raw.description,
        summary: enhancement.summary,
        date: new Date(raw.date),
        city: raw.city ?? null,
        isOnline: enhancement.isOnline,
        eventType: raw.eventType ?? "other",
        organizer: raw.organizer,
        link: raw.link ?? null,
        tags: JSON.stringify(enhancement.tags),
        beginnerFriendly: enhancement.beginnerFriendly,
        source: "manual",
        status: "PENDING",
      },
    });
    created += 1;
  }

  console.log(`Created ${created} events (approved + pending).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });