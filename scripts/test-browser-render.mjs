// Load the real site in a real browser and fail if the page is broken there.
//
// The homepage fetches its events in useEffect, so nothing on the server ever
// evaluates the axis, the index or the cards. A client-side crash therefore
// still returns HTTP 200, still ships valid HTML, and still passes every server
// check — while showing the reader nothing but an error boundary. That failure
// shipped once and was invisible until someone opened the site in a browser.
//
// This asserts what a reader would see: no Next error boundary, no uncaught
// exception, no console errors, and the expected content actually present.
//
//   node scripts/test-browser-render.mjs [url]
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.argv[2] ?? "https://devlore-kappa.vercel.app/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-extensions"],
});

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  [FAIL] ${msg}`);
};
const ok = (msg) => console.log(`  [ok] ${msg}`);

try {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`${e.message}\n${e.stack ?? ""}`.trim()));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  const res = await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  console.log(`${url} -> ${res?.status()}`);
  if (!res || res.status() !== 200) fail(`status ${res?.status()}`);

  // Give useEffect-driven rendering and the events fetch time to settle.
  await new Promise((r) => setTimeout(r, 4000));

  const dom = await page.content();
  if (dom.includes("__next_error__")) fail("Next error boundary rendered");

  for (const e of pageErrors) fail(`uncaught: ${e.split("\n")[0]}`);
  if (pageErrors.length === 0) ok("no uncaught exceptions");
  for (const e of consoleErrors) fail(`console: ${e.slice(0, 200)}`);
  if (consoleErrors.length === 0) ok("no console errors");

  // The headline is server-rendered; the axis is not. Both must be present.
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Ahead in/i.test(text)) fail("headline missing");
  else ok("headline present");

  const cards = await page.evaluate(
    () => document.querySelectorAll('a[href^="/events/"]').length
  );
  if (cards === 0) fail("no event cards rendered");
  else ok(`${cards} event links rendered`);

  const axis = /Spatial axis/i.test(text);
  const index = /The index/i.test(text);
  console.log(`  [info] axis section: ${axis}, index section: ${index}`);
  if (index) ok("index rendered");
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nPASS — page renders in a browser" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);