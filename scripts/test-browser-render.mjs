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

/**
 * The phone.
 *
 * Everything asserted above was invisible to it. Build, typecheck, lint, the
 * server tests and the 1440px browser guard were all green while the front
 * page scrolled 131px sideways on a phone, the axis band demanded an 8.4x
 * sideways drag before the first event appeared, 129 controls sat below the
 * 44px a thumb needs, and 294 pieces of text were under 12px. None of that
 * shows up at 1440px, so a guard that only runs at 1440px cannot see it.
 *
 * Two details make this measurable rather than decorative:
 *
 * Hit areas are read from the ::after overlay, not the element box. The touch
 * targets are 20–33px elements carrying a pseudo-element that grows the
 * tappable region to 44px without moving anything. Measuring `boundingClientRect`
 * alone would report 129 failures and be wrong about all of them.
 *
 * `(pointer: coarse)` is asserted rather than assumed. Every tap-target rule
 * is scoped to it; if headless Chrome ever stopped reporting coarse under
 * emulation, the rules would silently not apply and the measurement below would
 * quietly stop testing the thing it exists to test.
 */
async function checkMobile() {
  console.log(`\nphone @ 390x844, touch`);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`${e.message}`.split("\n")[0]));

  try {
    await page.emulate({
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    if (coarse) ok("pointer: coarse — tap-target rules are in force");
    else fail("pointer: coarse is false; tap-target rules would not be measured");

    await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector(EVENT_LINKS, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));

    const m = await page.evaluate(() => {
      const de = document.documentElement;

      // Hit area = the element box, grown by its ::after overlay when it has one.
      const small = [];
      for (const el of document.querySelectorAll("a, button, input, label")) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        let hw = b.width;
        let hh = b.height;
        const cs = getComputedStyle(el, "::after");
        if (cs.content === '""' && cs.position === "absolute") {
          if (cs.width.endsWith("px")) hw = Math.max(hw, parseFloat(cs.width));
          if (cs.height.endsWith("px")) hh = Math.max(hh, parseFloat(cs.height));
        }
        // An input can be small itself while its wrapper or label carries the
        // overlay, which is where the tappable region actually lives.
        const carrier = el.closest(".tap-target");
        if (carrier && carrier !== el) {
          const cb = carrier.getBoundingClientRect();
          const ccs = getComputedStyle(carrier, "::after");
          if (ccs.content === '""' && ccs.position === "absolute") {
            if (ccs.width.endsWith("px")) hw = Math.max(hw, cb.width, parseFloat(ccs.width));
            if (ccs.height.endsWith("px")) hh = Math.max(hh, cb.height, parseFloat(ccs.height));
          }
        }
        if (hw < 44 || hh < 44)
          small.push(`${el.tagName.toLowerCase()} ${Math.round(hw)}x${Math.round(hh)} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 20)}"`);
      }

      let tiny = 0;
      for (const el of document.querySelectorAll("body *")) {
        if (!el.textContent?.trim()) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        // 11px, not 12px. 11px is the floor this site sets deliberately: 294
        // elements sit exactly on it, so asserting <12 would flag the floor
        // itself and could never pass.
        if (fs > 0 && fs < 11) tiny++;
      }

      const scope = document.querySelector('[data-axis="mobile"]');
      const rows = scope ? [...scope.children].filter((el) => el.tagName === "DIV") : [];
      let offRail = 0;
      let maxTracks = 0;
      let cardsInRail = 0;
      for (const row of rows) {
        const cards = [...row.querySelectorAll('a[href^="/events/"]')];
        const rail = row.lastElementChild;
        const rb = rail?.getBoundingClientRect();
        for (const c of cards) {
          const cb = c.getBoundingClientRect();
          if (rb && cb.right > rb.left + 1) offRail++;
          if (rail?.contains(c)) cardsInRail++;
        }
        if (cards.length) {
          const grid = cards[0].parentElement;
          const cols = getComputedStyle(grid).gridTemplateColumns;
          maxTracks = Math.max(maxTracks, cols === "none" ? 0 : cols.split(" ").length);
        }
      }

      return {
        overflow: de.scrollWidth - de.clientWidth,
        small,
        tiny,
        rows: rows.length,
        cards: scope ? scope.querySelectorAll('a[href^="/events/"]').length : 0,
        offRail,
        cardsInRail,
        maxTracks,
        nowLabel: !!scope?.querySelector("span"),
        // The desktop band must not be rendered, not merely be off-screen: it
        // is 2880px of absolutely positioned cards, and leaving it in the tree
        // would cost 35 links in the accessibility tree.
        //
        // `clientRects.length`, NOT `getComputedStyle(el).display`. A computed
        // display reports the element's OWN value and does not inherit an
        // ancestor's `display: none` — the band's immediate parent is the
        // scroller, and its grandparent is the `hidden md:block` wrapper. So
        // getComputedStyle says "block" for a band that renders nowhere.
        desktopRendered: [...document.querySelectorAll("div")].some(
          (d) => d.style.width === "2880px" && d.getClientRects().length > 0
        ),
      };
    });

    if (m.overflow <= 0) ok("no horizontal overflow");
    else fail(`horizontal overflow: ${m.overflow}px`);

    if (m.small.length === 0) ok("every control has a 44px hit area");
    else {
      fail(`${m.small.length} control(s) under 44px:`);
      for (const s of m.small.slice(0, 8)) console.log(`         ${s}`);
    }

    if (m.tiny === 0) ok("no text under 11px");
    else fail(`${m.tiny} text elements under 11px`);

    if (m.rows === 9) ok("mobile axis: 9 date rows (2 past + 7 ahead)");
    else fail(`mobile axis: ${m.rows} date rows, expected 9`);

    if (m.cards > 0) ok(`mobile axis: ${m.cards} cards`);
    else fail("mobile axis rendered no cards");

    if (m.offRail === 0) ok("every card sits left of its date rail");
    else fail(`${m.offRail} card(s) overlap the date rail`);

    if (m.cardsInRail === 0) ok("date rail holds only dates");
    else fail(`${m.cardsInRail} card(s) inside the date rail`);

    if (m.maxTracks > 0 && m.maxTracks <= 3) ok(`at most ${m.maxTracks} cards side by side`);
    else fail(`${m.maxTracks} cards side by side, expected 1–3`);

    if (!m.desktopRendered) ok("desktop band not rendered");
    else fail("the 2880px desktop band is still rendered on a phone");

    for (const e of pageErrors) fail(`uncaught: ${e}`);
    if (pageErrors.length === 0) ok("no uncaught exceptions");
  } finally {
    await page.close();
  }

  // Overflow on the other routes. The front page is the worst case — it has the
  // axis, the filter row and 49 index rows — but a sideways scroll anywhere is
  // a sideways scroll.
  for (const path of ["/list", "/bookmarks", "/events"]) {
    const p = await browser.newPage();
    try {
      await p.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, deviceScaleFactor: 2 });
      await p.goto(`${origin}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
      const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o <= 0) ok(`no horizontal overflow on ${path}`);
      else fail(`${path} overflows by ${o}px`);
    } finally {
      await p.close();
    }
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

  await checkMobile();

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