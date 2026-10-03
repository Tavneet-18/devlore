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

    // The theme toggle: flipping it must re-skin the page without errors, and
  // the choice must survive a reload (it is read pre-paint from localStorage).
  const toggleSel = 'button[aria-label*="mode" i]';
  await page.waitForSelector(toggleSel, { timeout: 15000 });
  ok("theme toggle present");
  await page.click(toggleSel);
  await new Promise((r) => setTimeout(r, 600));
  const light = await page.evaluate(() => document.documentElement.classList.contains("light"));
  const stored = await page.evaluate(() => localStorage.getItem("devlore-theme"));
  if (light && stored === "light") ok("light mode applies and persists");
  else fail(`light mode broken (class=${light}, stored=${stored})`);
  await page.click(toggleSel);
  await new Promise((r) => setTimeout(r, 600));
  const back = await page.evaluate(() => document.documentElement.classList.contains("light"));
  if (!back) ok("dark mode restores");
  else fail("dark mode did not restore");

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

/**
 * Desktop axis geometry, measured in a real browser.
 *
 * SSR cannot catch this class of bug: the server emits positions and the
 * browser decides heights from the rendered text. `LANE_H` sat at 108px while
 * real cards measure 131–164px, so lanes overlapped — 34 of 35 cards collided,
 * worst case 196px wide by 37px deep, with the upper card's translucent panel
 * over the lower one's title. It type-checked, linted, built, and every server
 * test passed the entire time, because nothing ever laid the cards out.
 *
 * Two cards overlap only when their x-ranges AND y-ranges both intersect.
 * Cards in different lanes share a y-range but sit at different x, so comparing
 * them as collisions is a false positive.
 */
async function checkAxisGeometry() {
  console.log(`\naxis geometry @ 1440`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector(EVENT_LINKS, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));

    const g = await page.evaluate(() => {
      const de = document.documentElement;
      const cards = [...document.querySelectorAll('a[href^="/events/"]')].filter(
        (a) => a.className.includes("backdrop-blur")
      );
      const boxes = cards.map((a) => {
        const b = a.getBoundingClientRect();
        return { l: b.left, r: b.right, t: b.top, b: b.bottom };
      });

      let worst = 0;
      let pairs = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const c = boxes[j];
          const xo = Math.min(a.r, c.r) - Math.max(a.l, c.l);
          const yo = Math.min(a.b, c.b) - Math.max(a.t, c.t);
          if (xo > 1 && yo > 1) {
            pairs++;
            worst = Math.max(worst, Math.min(xo, yo));
          }
        }
      }

      const band = document.querySelector('div[style*="width: 2880px"], div[style*="width:2880px"]');
      return {
        overflow: de.scrollWidth - de.clientWidth,
        cards: boxes.length,
        pairs,
        worst: Math.round(worst),
        cardW: boxes.length ? Math.round(cards[0].getBoundingClientRect().width) : 0,
        bandW: band ? Math.round(band.getBoundingClientRect().width) : 0,
      };
    });

    if (g.overflow <= 0) ok("no horizontal overflow at 1440");
    else fail(`horizontal overflow at 1440: ${g.overflow}px`);

    if (g.cards > 0) ok(`${g.cards} axis cards`);
    else fail("no axis cards rendered");

    if (g.pairs === 0) ok("no axis cards overlap");
    else fail(`${g.pairs} overlapping card pairs, deepest ${g.worst}px`);

    if (g.cardW === 196) ok("card width 196px");
    else fail(`card width ${g.cardW}px, expected 196px`);

    if (g.bandW === 2880) ok("band width 2880px");
    else fail(`band width ${g.bandW}px, expected 2880px`);
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

  await checkAxisGeometry();

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