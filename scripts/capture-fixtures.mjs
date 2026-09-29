// Capture one real sample payload per confirmed source into tests/fixtures.
import { writeFileSync, mkdirSync } from "node:fs";

const ua = "DevloreBot/1.0 (+https://devlore-kappa.vercel.app)";
const dir = "tests/fixtures";
mkdirSync(dir, { recursive: true });

function save(name, obj) {
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(obj, null, 2));
  console.log("saved", `${dir}/${name}.json`);
}

// --- devfolio: __NEXT_DATA__ -> dehydratedState.queries[0]...open_hackathons
{
  const html = await (await fetch("https://devfolio.co/hackathons", { headers: { "User-Agent": ua } })).text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const data = JSON.parse(m[1]);
  const list = data.props.pageProps.dehydratedState.queries[0].state.data.open_hackathons;
  // Trim to a representative slice: one online, one offline, cap the participant noise.
  const sample = list.slice(0, 3).map((e) => ({ ...e, participants_details: (e.participants_details ?? []).slice(0, 1) }));
  save("devfolio__next_data", {
    _meta: {
      source: "devfolio",
      method: "b: __NEXT_DATA__ JSON island",
      url: "https://devfolio.co/hackathons",
      captured: new Date().toISOString(),
      count: list.length,
      note: "participants_details trimmed to 1 for fixture size; real payload has 3.",
    },
    open_hackathons: sample,
  });
}
await new Promise((r) => setTimeout(r, 1100));

// --- mlh: Inertia data-page island
{
  const html = await (await fetch("https://www.mlh.com/seasons/2026/events", { headers: { "User-Agent": ua } })).text();
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  const page = JSON.parse(m[1]);
  const props = page.props;
  save("mlh__inertia_page", {
    _meta: {
      source: "mlh",
      method: "b: Inertia <script data-page> JSON island",
      url: "https://www.mlh.com/seasons/2026/events",
      captured: new Date().toISOString(),
      upcomingCount: (props.upcomingEvents ?? []).length,
      note: "api.mlh.com returns 401; the HTML island is public and allowed by robots.txt.",
    },
    upcomingEvents: props.upcomingEvents ?? [],
    // One past event kept to show the same shape for a completed listing.
    pastEvents: (props.pastEvents ?? []).slice(0, 1),
  });
}
