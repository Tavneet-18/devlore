import type { DiscoverySource, RawEvent } from "./types";

/**
 * Simulated event feeds for Devpost, Unstop, Meetup and GDG.
 *
 * These return STABLE placeholder events (no scraping, no ToS violations).
 * Replace `fetch` implementations with the real public APIs when you are
 * ready to go live — see README "Swapping mock data for real APIs".
 */

function daysFromNow(days: number, hour = 18): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const HACKATHON_TITLES = [
  "CodeCraft Hackathon",
  "CityScale Hack 2026",
  "Build & Ship: Innovation Sprint",
  "Zero to App Weekend",
  "AI Build-Off",
];

const WORKSHOP_TITLES = [
  "Intro to Machine Learning in Python",
  "Hands-on Modern Web Dev",
  "Getting Started with Flutter",
  "Cloud Foundations Workshop",
  "Git & GitHub for Beginners",
];

const MEETUP_TITLES = [
  "Tech Social Meetup",
  "Developer Community Night",
  "Open Source Contributors Hangout",
  "Women in Tech Circle",
];

const ORGANIZERS = [
  "Devlore Partners",
  "TechForge Collective",
  "CodeTogether",
  "StartupNest",
  "FutureSkills India",
  "The Product Guild",
];

function mockEvents(location: string): RawEvent[] {
  const city = location.split(",")[0].trim() || "Your City";
  const base = new Date().getTime();

  const hacklatons: RawEvent[] = HACKATHON_TITLES.map((title, i) => ({
    source: "devpost",
    title,
    description: `A 48-hour hackathon where participants prototype real products. Open to students, working professionals and solopreneurs. Teams can be 1-4 people, with mentors available and prizes for the best use of AI. Beginner-friendly tracks available.`,
    date: daysFromNow(4 + i * 9),
    city,
    isOnline: false,
    eventType: "hackathon",
    organizer: ORGANIZERS[i % ORGANIZERS.length],
    link: `https://devlore.example/hackathon/${i + 3}`,
  }));

  const workshops: RawEvent[] = WORKSHOP_TITLES.map((title, i) => ({
    source: "unstop",
    title,
    description: `A practical, guided workshop. Bring your laptop and leave with working code. Perfect for beginners who want to get started with a new technology, with a certificate of participation for attendees.`,
    date: daysFromNow(2 + i * 5),
    city: i % 2 === 0 ? city : undefined,
    isOnline: i % 2 === 1,
    eventType: "workshop",
    organizer: ORGANIZERS[(i + 2) % ORGANIZERS.length],
    link: `https://devlore.example/workshop/${i + 4}`,
  }));

  const webinars: RawEvent[] = [
    {
      source: "unstop",
      title: "Career in Tech: Ask Me Anything",
      description:
        "Live webinar with engineers and hiring managers. Learn what recruiters look for, how to prepare, and what frameworks actually get you hired in 2026. Includes a live Q&A session.",
      date: daysFromNow(1),
      isOnline: true,
      eventType: "webinar",
      organizer: ORGANIZERS[4],
      link: `https://devlore.example/webinar/${base}`,
    },
  ];

  const meetups: RawEvent[] = MEETUP_TITLES.map((title, i) => ({
    source: "meetup",
    title,
    description: `A relaxed evening of lightning talks, demos and networking with the local developer community in ${city}. Bring your ideas, laptops welcome, food and coffee sponsored by the community.`,
    date: daysFromNow(6 + i * 7),
    city,
    isOnline: false,
    eventType: "meetup",
    organizer: ORGANIZERS[(i + 1) % ORGANIZERS.length],
    link: `https://devlore.example/meetup/${i + 5}`,
  }));

  const gdg: RawEvent[] = [
    {
      source: "gdg",
      title: `GDG ${city} Cloud & GenAI Study Group`,
      description: "Monthly Google Developers Group session covering Gemini APIs, modern Android and cloud architecture. Great for developers new to Google Cloud who want hands-on practice.",
      date: daysFromNow(8),
      city,
      isOnline: false,
      eventType: "meetup",
      organizer: "GDG Community",
      link: `https://devlore.example/gdg/${city}`,
    },
  ];

  return [...hacklatons, ...workshops, ...webinars, ...meetups, ...gdg];
}

export const MOCK_SOURCES: DiscoverySource[] = [
  { id: "devpost", displayName: "Devpost", fetch: (location) => Promise.resolve(mockEvents(location).filter((e) => e.source === "devpost")) },
  { id: "unstop", displayName: "Unstop", fetch: (location) => Promise.resolve(mockEvents(location).filter((e) => e.source === "unstop")) },
  { id: "meetup", displayName: "Meetup", fetch: (location) => Promise.resolve(mockEvents(location).filter((e) => e.source === "meetup")) },
  { id: "gdg", displayName: "GDG Events", fetch: (location) => Promise.resolve(mockEvents(location).filter((e) => e.source === "gdg")) },
];