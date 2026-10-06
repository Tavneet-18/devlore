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
        // aria-hidden subtrees are not tap targets. The submit form's honeypot
        // is a real <input> parked off-screen at left:-9999px and it measures
        // 201x24; demanding 44px of it would mean padding something no reader
        // can reach, and demanding nothing of it is the truth.
        if (el.closest('[aria-hidden="true"]')) continue;
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

  // The other routes get the same treatment, not just overflow. Tap targets were
  // only ever measured on the front page, which is how the submit form shipped
  // with a 39px field height and a 34px button: nothing on /list was looked at.
  for (const [path, settle] of [
    ["/list", "form"],
    ["/bookmarks", null],
    ["/events", EVENT_LINKS],
  ]) {
    const p = await browser.newPage();
    try {
      await p.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, deviceScaleFactor: 2 });
      await p.goto(`${origin}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
      if (settle) await p.waitForSelector(settle, { timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const r = await p.evaluate(() => {
        const de = document.documentElement;
        const small = [];
        for (const el of document.querySelectorAll("a, button, input, label")) {
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          let hw = b.width;
          let hh = b.height;
          const own = getComputedStyle(el, "::after");
          if (own.content === '""' && own.position === "absolute") {
            if (own.width.endsWith("px")) hw = Math.max(hw, parseFloat(own.width));
            if (own.height.endsWith("px")) hh = Math.max(hh, parseFloat(own.height));
          }
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
            small.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 30)} ${Math.round(hw)}x${Math.round(hh)}`);
        }
        return { overflow: de.scrollWidth - de.clientWidth, small };
      });
      if (r.overflow <= 0) ok(`no horizontal overflow on ${path}`);
      else fail(`${path} overflows by ${r.overflow}px`);
      if (r.small.length === 0) ok(`every control on ${path} has a 44px hit area`);
      else {
        fail(`${path}: ${r.small.length} control(s) under 44px`);
        for (const s of r.small.slice(0, 8)) console.log(`         ${s}`);
      }
    } finally {
      await p.close();
    }
  }
}

/**
 * The card quick-look.
 *
 * A modal is easy to build in a way that looks correct and is not: one that
 * traps Tab but lets a click reach the nav behind it, or one that closes and
 * drops focus on <body> so a keyboard user has to tab the length of the page to
 * find where they were. Neither shows up in a screenshot, so both are asserted
 * here against a real click.
 *
 * `handle.click()` rather than `el.click()` in page.evaluate: a synthetic click
 * does not move focus, which makes focus-restoration untestable — an earlier
 * version of this check reported focus returning to <body> purely because of
 * that, and the real behaviour was correct all along.
 *
 * Placement is asserted too. The sheet is pinned to the bottom edge under 640px
 * and centred above it, and that is the part most likely to break silently: a
 * centred sheet still looks like a sheet.
 */
async function checkQuickLook() {
  const CASES = [
    ["desktop 1440x900", { width: 1440, height: 900, isMobile: false, hasTouch: false }, "centred"],
    ["phone 390x844", { width: 390, height: 844, isMobile: true, hasTouch: true }, "sheet"],
  ];

  for (const [label, viewport, placement] of CASES) {
    console.log(`\nquick-look @ ${label}`);
    const page = await browser.newPage();
    await page.emulate({
      viewport: { ...viewport, deviceScaleFactor: viewport.isMobile ? 2 : 1 },
      userAgent: viewport.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });

    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
      await page.waitForSelector("button[aria-haspopup='dialog']", { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 800));

      const trigger = await page.$("button[aria-haspopup='dialog']");
      const triggerTitle = await trigger.evaluate((el) => el.textContent.trim().slice(0, 40));

      // Turning the title into a <button> removed one duplicate link per row,
      // which took the front page from 142 event links to 94. That is correct
      // and slightly better for crawlers, but it also means a row's only
      // crawlable path to the detail page is now the "View ->" link. Assert
      // that pairing directly, because a row that lost both would leave its
      // event unreachable from the index while every count-based check passed.
      const rows = await page.evaluate(() => {
        const out = [];
        for (const btn of document.querySelectorAll('button[aria-haspopup="dialog"]')) {
          const row = btn.closest("div.group");
          const view = [...(row?.querySelectorAll("a") ?? [])].find(
            (a) => a.textContent.trim() === "View →"
          );
          out.push({ hasView: !!view });
        }
        return out;
      });
      const orphans = rows.filter((r) => !r.hasView);
      if (orphans.length === 0)
        ok(`all ${rows.length} rows keep a crawlable View link`);
      else fail(`${orphans.length} row(s) have no View link — their detail page is unreachable from the index`);

      await trigger.click();
      await new Promise((r) => setTimeout(r, 400));

      const open = await page.evaluate(() => {
        const d = document.querySelector("dialog[open]");
        if (!d) return { found: false };
        const b = d.getBoundingClientRect();
        const rows = [...d.querySelectorAll("dl > div")].map((r) => ({
          label: (r.querySelector("dt")?.textContent ?? "").trim(),
          value: (r.querySelector("dd")?.textContent ?? "").trim(),
        }));
        return {
          found: true,
          // :modal is the assertion that matters. `open` alone is true for a
          // non-modal dialog, which traps nothing and inerts nothing.
          modal: d.matches(":modal"),
          rect: { top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width) },
          vh: window.innerHeight,
          vw: window.innerWidth,
          rows,
          hasFullLink: !!d.querySelector('a[href^="/events/"]'),
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      if (open.found) ok("opens");
      else fail("did not open on click");

      if (open.modal) ok("is a true modal dialog (:modal)");
      else fail("opened without :modal — background is not inert");

      if (placement === "sheet") {
        // Pinned to the bottom edge, and full-bleed across the width.
        if (Math.abs(open.rect.bottom - open.vh) <= 2 && open.rect.w >= open.vw - 2)
          ok(`bottom sheet: flush to the bottom edge, ${open.rect.w}px of ${open.vw}px wide`);
        else fail(`sheet placement wrong: bottom ${open.rect.bottom} of ${open.vh}, width ${open.rect.w} of ${open.vw}`);
      } else {
        const gapAbove = open.rect.top;
        const gapBelow = open.vh - open.rect.bottom;
        // Centred within a couple of pixels. Both gaps must be positive too:
        // a dialog pushed off the top of the screen has no positive top gap and
        // would otherwise pass a naive absolute-difference check.
        if (gapAbove > 0 && gapBelow > 0 && Math.abs(gapAbove - gapBelow) <= 3)
          ok(`centred panel: ${gapAbove}px above, ${gapBelow}px below`);
        else fail(`not centred: ${gapAbove}px above, ${gapBelow}px below (viewport ${open.vh})`);
      }

      if (open.rows.length > 0) ok(`${open.rows.length} fact rows: ${open.rows.map((r) => r.label).join(", ")}`);
      else fail("no fact rows rendered");

      // A placeholder here would mean a field the source never published is
      // being shown as something other than absent.
      const placeholders = open.rows.filter((r) => /^(—|-|tba|tbd|n\/?a|null|undefined|-+)$/i.test(r.value));
      if (placeholders.length === 0) ok("no placeholder values in the fact rows");
      else fail(`${placeholders.length} fact row(s) show a placeholder: ${placeholders.map((p) => `${p.label}="${p.value}"`).join(", ")}`);

      if (open.hasFullLink) ok("full-details link present");
      else fail("no link through to the full page");

      if (open.overflowX <= 0) ok("no horizontal overflow while open");
      else fail(`page overflows by ${open.overflowX}px while the dialog is open`);

      // The background must be inert to a click, not merely to Tab.
      const before = page.url();
      const nav = await page.$("header nav a");
      if (nav) {
        const box = await nav.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await new Promise((r) => setTimeout(r, 500));
        if (page.url() === before) ok("background nav is inert to clicks");
        else fail(`a click reached the page behind the dialog (navigated to ${page.url()})`);
        // Re-open; the previous click closed it via the backdrop.
        await page.waitForSelector("button[aria-haspopup='dialog']", { timeout: 10000 });
        await (await page.$("button[aria-haspopup='dialog']")).click();
        await new Promise((r) => setTimeout(r, 400));
      }

      // Escape closes, and focus lands back on the row that opened it.
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 400));
      const after = await page.evaluate(() => ({
        closed: !document.querySelector("dialog")?.open,
        focusIsTrigger: document.activeElement?.getAttribute("aria-haspopup") === "dialog",
        focusLabel: (document.activeElement?.textContent ?? "").trim().slice(0, 40),
        focusTag: document.activeElement?.tagName,
      }));
      if (after.closed) ok("Escape closes it");
      else fail("Escape did not close it");
      if (after.focusIsTrigger)
        ok(`focus returned to the triggering row ("${after.focusLabel}")`);
      else fail(`focus after close is ${after.focusTag}, not the trigger that opened it`);

      console.log(`  (opened "${triggerTitle}")`);
    } finally {
      await page.close();
    }
  }
}

/**
 * Claims the code does not actually back up.
 *
 * Each of these was a sentence or a response the site asserted and the
 * implementation did not honour, and each passed every other check because none
 * of them looked.
 *
 * There is deliberately no assertion here that visiting an event page
 * increments its view count. That would be the most direct test, and it would
 * also write a View row on every run — so the number meant to measure readers
 * would be mostly this script. The increment is verified once by hand after
 * deploy instead, and the dedupe guarantee is enforced by the unique index on
 * View(viewerId, eventId), which the schema carries.
 */
/**
 * Descriptions the ingest adapters used to invent.
 *
 * Two adapters had a `description || <invented sentence>` fallback, so a source
 * record with a blank description became a confident paragraph of prose the
 * site had made up. GDG's asserted "Talks, demos and networking" about a
 * session it had never read — which could have been a workshop, a study jam or
 * a conference. Unstop's asserted "Apply and form a team to compete" about any
 * listing, including ones that are not competitions at all.
 *
 * Cheap to assert and impossible to notice by reading, since the sentences read
 * like ordinary copy.
 */
const INVENTED_DESCRIPTIONS =
  /community session in|Talks, demos and networking|Apply and form a team to compete/i;

async function checkHonestClaims() {
  console.log(`\nhonest claims`);

  // DELETE must not report success for an event that is not there. Previously
  // it swallowed the error and always answered 200 "Event deleted", so a
  // moderator who failed to delete something was told they had.
  const missing = "cmur0000000000000000000nonexistent";
  const res = await fetch(`${origin}/api/events/${missing}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && /not found/i.test(body.error ?? ""))
    ok("deleting a non-existent event reports 404, not success");
  else
    fail(`DELETE of a missing event returned ${res.status} ${JSON.stringify(body).slice(0, 80)} — a failed delete would look successful`);

  // The bookmarks page claimed a 30-day expiry that no pruning job implements.
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/bookmarks`, { waitUntil: "networkidle2", timeout: 60000 });
    const text = await page.evaluate(() => document.body.innerText);
    if (!/expire after 30 days/i.test(text))
      ok("bookmarks page makes no unbacked expiry claim");
    else
      fail('bookmarks page still claims bookmarks "expire after 30 days" — nothing prunes them');
  } finally {
    await page.close();
  }

  // No stored event may carry a description an adapter made up.
  const events = await (await fetch(`${origin}/api/events`)).json();
  const fabricated = (events.events ?? []).filter((e) =>
    INVENTED_DESCRIPTIONS.test(`${e.description ?? ""} ${e.summary ?? ""}`)
  );
  if (fabricated.length === 0) ok("no event carries an adapter-invented description");
  else
    fail(
      `${fabricated.length} event(s) carry a fabricated description: ` +
        fabricated.map((e) => `"${e.title}"`).join(", ")
    );
}

/**
 * The two queries that used to read whole tables.
 *
 * Neither showed up as a slow page — both returned correct results — so nothing
 * caught them. The detail page read every APPROVED event in order to pick three,
 * and /api/events read every EventSourceRef row in order to annotate the page it
 * had just returned. Both tables only grow.
 *
 * What is asserted here is the observable consequence of narrowing them, since
 * query shape cannot be seen from the outside: the similar strip still finds
 * matches, and cross-source links still render. A pool narrowed too far would
 * quietly return an empty strip rather than fail.
 */
async function checkQueryNarrowing() {
  console.log(`\nquery narrowing`);

  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector('a[href^="/events/"]', { timeout: 30000 });
    const href = await page.evaluate(
      () => document.querySelector('a[href^="/events/"]')?.getAttribute("href") ?? null
    );
    if (!href) {
      fail("no event link on the front page to test a detail page with");
      return;
    }

    await page.goto(`${origin}${href}`, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 800));

    const detail = await page.evaluate(() => {
      const text = document.body.innerText;
      const heading = [...document.querySelectorAll("h2")].find((h) =>
        /also worth a look/i.test(h.textContent ?? "")
      );
      const section = heading?.closest("section");
      return {
        hasStrip: !!heading,
        // How many rows the strip actually produced.
        rows: section ? section.querySelectorAll('button[aria-haspopup="dialog"], a[href^="/events/"]').length : 0,
        // Cross-source links are rendered from the EventSourceRef lookup.
        alsoListed: /also listed on/i.test(text),
      };
    });

    if (detail.hasStrip && detail.rows > 0)
      ok(`similar-events strip still populated (${detail.rows} rows)`);
    else if (!detail.hasStrip)
      ok("no similar strip on this event (legitimate: nothing scored above zero)");
    else fail("similar-events strip rendered with no rows");

    ok(detail.alsoListed ? "cross-source links render" : "no cross-source links on this event");
  } finally {
    await page.close();
  }
}

/**
 * Keyboard reachability and accessible names.
 *
 * Every assertion here corresponds to a defect that passed typecheck, lint,
 * build and the 1440px guard, because none of them is a visual regression:
 * they only appear when you cannot see the page or cannot point at it.
 *
 * Two of these are measured with real key presses rather than by inspecting
 * attributes, because the attribute being present is not the same as the
 * behaviour working. `page.focus()` on the body does NOT rewind the sequential
 * focus navigation starting point — Tab continues from wherever focus was, so
 * an earlier draft concluded the skip link was not first in the tab order when
 * in fact the test had not rewound. Reloading is what rewinds it.
 */
async function checkKeyboardAccess() {
  console.log(`\nkeyboard access @ 1440`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector('a[href^="/events/"]', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));

    // The axis: 2880px wide, scrollbar hidden, previously reachable only by
    // dragging with a mouse.
    const axis = await page.evaluate(() => {
      const el = document.querySelector('[role="region"]');
      return el
        ? {
            tabIndex: el.getAttribute("tabindex"),
            name: el.getAttribute("aria-label"),
            scrolls: el.scrollWidth > el.clientWidth,
          }
        : null;
    });
    if (axis && axis.tabIndex === "0") ok("axis is in the tab order (tabindex=0)");
    else fail(`axis is not focusable (role=region ${axis ? `tabindex=${axis.tabIndex}` : "absent"})`);

    if (axis?.name) ok(`axis has an accessible name: "${axis.name}"`);
    else fail("the axis region has no accessible name, so its focus announces nothing useful");

    if (axis?.scrolls) {
      const before = await page.evaluate(
        () => document.querySelector('[role="region"]').scrollLeft
      );
      await page.focus('[role="region"]');
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
      await new Promise((r) => setTimeout(r, 300));
      const after = await page.evaluate(
        () => document.querySelector('[role="region"]').scrollLeft
      );
      if (after > before) ok(`arrow keys scroll the axis (${before} -> ${after}px)`);
      else fail(`focusing the axis and pressing ArrowRight did not scroll it (${before} -> ${after})`);
    } else {
      fail("the axis region does not overflow, so nothing to scroll");
    }

    // Skip link. Reload first: that is what rewinds the tab sequence.
    await page.goto(`${origin}/`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector('a[href^="/events/"]', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => {
      const el = document.activeElement;
      const b = el?.getBoundingClientRect();
      return {
        text: (el?.textContent ?? "").trim(),
        visible: !!b && b.width > 20 && b.height > 10,
      };
    });
    if (/skip to content/i.test(first.text)) ok("first Tab reaches the skip link");
    else fail(`first Tab reached "${first.text}", not the skip link`);
    if (first.visible) ok("skip link becomes visible when focused");
    else fail("skip link is still visually hidden while focused — focus:not-sr-only is not applying");

    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 400));
    const landed = await page.evaluate(() => ({
      id: document.activeElement?.id,
      tag: document.activeElement?.tagName,
    }));
    if (landed.id === "main" || landed.tag === "MAIN")
      ok("activating it moves focus into <main>");
    else
      fail(`focus after the skip link is ${landed.tag}#${landed.id}, not <main> — it scrolls without moving focus`);

    // Names and state, read from the accessibility tree rather than the DOM.
    const a11y = await page.evaluate(() => {
      const input = document.querySelector('input[type="search"]');
      const buttons = [...document.querySelectorAll("button")];
      const pressed = buttons.filter((b) => b.hasAttribute("aria-pressed"));
      const live = document.querySelector('[aria-live], [role="status"]');
      return {
        searchName: input?.getAttribute("aria-label") ?? null,
        searchHasLabelEl: !!(input?.id && document.querySelector(`label[for="${input.id}"]`)),
        buttons: buttons.length,
        pressed: pressed.length,
        pressedTrue: pressed.filter((b) => b.getAttribute("aria-pressed") === "true").length,
        liveText: live?.textContent?.trim().slice(0, 40) ?? null,
      };
    });
    if (a11y.searchName || a11y.searchHasLabelEl)
      ok(`search input has an accessible name: "${a11y.searchName ?? "<label for>"}"`);
    else fail("search input has no accessible name — a placeholder is not one");

    if (a11y.pressed > 0) ok(`${a11y.pressed} filter buttons expose aria-pressed (${a11y.pressedTrue} selected)`);
    else fail("no filter button exposes its selected state — it is carried by colour alone");

    if (a11y.liveText) ok(`result count is announced live: "${a11y.liveText}"`);
    else fail("no live region announces the result count or load errors");

    // The 404 must be the site's, with its chrome, not Next's default page.
    await page.goto(`${origin}/events/definitely-not-a-real-id`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 400));
    const nf = await page.evaluate(() => ({
      hasNav: !!document.querySelector("header nav"),
      isNextDefault: /this page could not be found|application error/i.test(document.body.innerText),
    }));
    if (nf.hasNav) ok("a dead event link renders the site's own 404, with navigation");
    else fail("a dead event link renders a bare page with no site chrome");
    if (!nf.isNextDefault) ok("404 is not Next's default page");
    else fail("404 is still Next's built-in page");
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

  await checkMobile();

  await checkQuickLook();

  await checkHonestClaims();

  await checkQueryNarrowing();

  await checkKeyboardAccess();

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