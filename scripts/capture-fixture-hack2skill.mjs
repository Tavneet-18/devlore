// Capture a real Hack2Skill event-details payload as a fixture.
import { writeFileSync, mkdirSync } from "node:fs";

const ua = "DevloreBot/1.0 (+https://devlore-kappa.vercel.app)";
mkdirSync("tests/fixtures", { recursive: true });

const r = await fetch("https://hack2skill.com/api/v1/event/codeforcommunities2/event-details", {
  headers: { "User-Agent": ua, Accept: "application/json" },
});
const j = await r.json();
const d = j?.data ?? j;

// sections[] carries the long-form content; keep the shape but trim bulk.
const sections = (d.sections ?? []).map((s) => ({
  ...s,
  content: typeof s.content === "string" ? s.content.slice(0, 300) : s.content,
}));

writeFileSync(
  "tests/fixtures/hack2skill__event_details.json",
  JSON.stringify(
    {
      _meta: {
        source: "hack2skill",
        method: "a: public JSON API /api/v1/event/<slug>/event-details",
        url: "https://hack2skill.com/api/v1/event/codeforcommunities2/event-details",
        captured: new Date().toISOString(),
        note: "sections[].content trimmed to 300 chars for fixture size.",
        slugDiscovery: "robots-declared https://hack2skill.com/sitemap.xml, minus the 356 slugs robots.txt disallows",
      },
      success: j?.success,
      data: { ...d, sections },
    },
    null,
    2
  )
);
console.log("saved tests/fixtures/hack2skill__event_details.json");
console.log("status:", d.status, "| regEnd:", d.registrationEnd, "| mode:", d.tags?.mode?.value);
console.log("keys:", Object.keys(d).join(", "));
