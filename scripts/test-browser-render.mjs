// Load the real site in a real browser and fail if a page is broken there.
//
// The homepage fetches its events in useEffect, so nothing on the server ever
// evaluates the axis, the index or the cards. A client-side crash therefore
// still returns HTTP 200, still ships valid HTML, and still passes every server
// check — while showing the reader nothing but an error boundary. That failure
// shipped once and was invisible until someone opened the site in a browser.
//
// This asserts what a reader would see on each route: HTTP 200, no Next error
// boundary, no uncaught exception, no console errors, and the content that
// route is supposed to carry.
//
//   node scripts/test-browser-render.mjs [origin]
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const origin = (process.argv[2] ?? "https://devlore-kappa.vercel.app").replace(/\/$/, "");
const EVENT_LINKS = 'a[href^="/events/"]';

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  [FAIL] ${msg}`);
};
const ok = (msg) => console.log(`  [ok] ${msg}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-extensions"],
});

/**
 * Load one route and assert it rendered.
 *
 * `settle` is the selector that means "the client render has landed". Without
 * one the check would race a cold lambda: a fixed delay is sometimes shorter
 * than boot plus /api/events, which is exactly how a passing page once looked
 * like an empty one.
 */
async function check(path, { settle, requireText = [], forbidText = [], expect = true }) {
  console.log(`\n${origin}${path}`);
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`${e.message}`.split("\n")[0]));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  try {
    const res = await page.goto(`${origin}${path}`, { waitUntil: "networkidle2", timeout: 60000 });
    if (!res || res.status() !== 200) fail(`status ${res?.status()}`);

    if (settle) {
      try {
        await page.waitForSelector(settle, { timeout: 30000 });
      } catch {
        fail(`${settle} never appeared`);
      }
    }

    const dom = await page.content();
    if (dom.includes("__next_error__")) fail("Next error boundary rendered");

    for (const e of pageErrors) fail(`uncaught: ${e}`);
    if (pageErrors.length === 0) ok("no uncaught exceptions");
    for (const e of consoleErrors) fail(`console: ${e.slice(0, 200)}`);
    if (consoleErrors.length === 0) ok("no console errors");

    const text = await page.evaluate(() => document.body.innerText);
    const count = await page.evaluate((s) => document.querySelectorAll(s).length, EVENT_LINKS);

    for (const re of requireText) {
      if (re.test(text)) ok(`matches ${re}`);
      else fail(`expected text ${re}`);
    }
    for (const re of forbidText) {
      if (re.test(text)) fail(`unexpected text ${re}`);
      else ok(`no ${re}`);
    }

    const got = typeof expect === "function" ? expect(count) : expect;
    if (got) ok(`${count} event links`);
    else fail(`expected event links, got ${count}`);
    return count;
  } finally {
    await page.close();
  }
}

try {
  // The front page. The axis and the index are both client-rendered here.
  const home = await check("/", {
    settle: EVENT_LINKS,
    requireText: [/Ahead in/i, /Spatial axis/i, /The index/i],
    forbidText: [/couldn't load|application error|this is taking too long/i],
    expect: (n) => n > 0,
  });

  // /list is the submit form, not an index — it carries the editable fields.
  await check("/list", {
    settle: "form",
    requireText: [/Submit an/i, /ORGANISER/i],
    expect: (n) => n === 0,
  });

  // Saved events, empty for a browser that has not bookmarked anything.
  await check("/bookmarks", {
    settle: null,
    requireText: [/Saved/i],
    expect: (n) => n === 0,
  });

  // A detail page, taken from whatever the front page actually linked to.
  const page = await browser.newPage();
  await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(EVENT_LINKS, { timeout: 30000 }).catch(() => {});
  const href = await page.evaluate((s) => document.querySelector(s)?.getAttribute("href"), EVENT_LINKS);
  await page.close();

  if (!href) {
    fail("front page exposed no event link to follow");
  } else {
    await check(href, {
      settle: null,
      forbidText: [/couldn't load|application error/i],
      expect: (n) => n >= 0,
    });
  }

  console.log(
    `\n${failures === 0 ? "PASS" : `FAIL (${failures})`} — ${home} event links on the front page, every route renders in a browser`
  );
} finally {
  await browser.close();
}

process.exit(failures === 0 ? 0 : 1);