// Capture a real WeMakeDevs RSC flight payload as a fixture.
import { writeFileSync, mkdirSync } from "node:fs";

const ua = "DevloreBot/1.0 (+https://devlore-kappa.vercel.app)";
mkdirSync("tests/fixtures", { recursive: true });

const res = await fetch("https://www.wemakedevs.org/hackathons", { headers: { "User-Agent": ua } });
const html = await res.text();

const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,([\s\S]*?)\]\)<\/script>/g)]
  .map((m) => m[1]).join("")
  .replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\\\/g, "\\");

const cards = [];
for (const m of flight.match(/\{"id":"[0-9a-f-]{36}","title":[\s\S]{0,900}?\}/g) ?? []) {
  try { cards.push(JSON.parse(m)); } catch {}
}

writeFileSync(
  "tests/fixtures/wemakedevs__rsc_flight.json",
  JSON.stringify(
    {
      _meta: {
        source: "wemakedevs",
        method: "b: Next.js RSC flight payload (self.__next_f.push)",
        url: "https://www.wemakedevs.org/hackathons",
        captured: new Date().toISOString(),
        cardCount: cards.length,
        note: "No registration-deadline field exists in the payload. Only startDate/endDate. The 3 upcoming cards are kept as the realistic sample.",
      },
      cards,
    },
    null,
    2
  )
);
console.log("saved tests/fixtures/wemakedevs__rsc_flight.json");
console.log("cards:", cards.length);
console.log("keys:", [...new Set(cards.flatMap((c) => Object.keys(c)))].join(", "));
