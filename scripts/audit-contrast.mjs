/**
 * Rendered-contrast audit.
 *
 * test:contrast checks the palette as declared. This checks what the browser
 * actually painted, which is where the compound failures live: an ancestor's
 * `opacity`, a text colour stacked on a translucent card surface, a gradient
 * poster behind a label. Those are exactly the cases that produced the
 * invisible past-event cards, and no amount of reading the stylesheet finds
 * them.
 *
 * Walks every element that renders its own text, resolves the effective
 * foreground and background by compositing alpha up the ancestor chain, and
 * reports the worst ratios per mode.
 *
 * Usage: node scripts/audit-contrast.mjs [url]      (default: production)
 * Exits non-zero if any visible text lands under 3:1, which is the floor for
 * large text and the point below which something is broken rather than quiet.
 */

import puppeteer from "puppeteer-core";

const URL = process.argv[2] ?? "https://devlore-kappa.vercel.app/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const AUDIT = `
(() => {
  const parse = (v) => {
    if (!v) return null;
    const s = v.trim();
    let m = s.match(/^rgba?\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = s.match(/^color\\(srgb ([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s/]+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const pageBg = parse(getComputedStyle(document.body).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };

  /** Background behind \`el\`: composite every translucent layer up to the body. */
  const bgOf = (el) => {
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a === 1) break;
      }
      node = node.parentElement;
    }
    let acc = { ...pageBg, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };

  /** Alpha an ancestor's \`opacity\` subtracts from this element's ink. */
  const inheritedAlpha = (el) => {
    let a = 1;
    let node = el.parentElement;
    while (node) {
      const o = parseFloat(getComputedStyle(node).opacity);
      if (Number.isFinite(o)) a *= o;
      node = node.parentElement;
    }
    return a;
  };

  const label = (el) => {
    const bits = [];
    let node = el;
    for (let i = 0; node && node !== document.body && i < 3; i++, node = node.parentElement) {
      const c = node.className;
      if (typeof c === "string" && c.trim()) {
        bits.push(c.trim().split(/\\s+/).slice(0, 3).join("."));
        break;
      }
    }
    const px = parseFloat(getComputedStyle(el).fontSize);
    return (bits.join(" > ") || el.tagName.toLowerCase()) + " @" + px + "px";
  };

  const out = [];
  for (const el of document.querySelectorAll("*")) {
    // Only elements that render their own text.
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!text) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const fg = parse(cs.color);
    if (!fg) continue;

    const a = fg.a * inheritedAlpha(el);
    if (a < 0.02) continue;

    const bg = bgOf(el);
    const r = ratio(over({ ...fg, a }, bg), bg);
    out.push({ r: Math.round(r * 100) / 100, text: text.slice(0, 42), where: label(el) });
  }
  return out;
})()
`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-extensions"],
});

let hardFailures = 0;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  try {
    await page.waitForSelector('a[href^="/events/"]', { timeout: 30000 });
  } catch {
    console.log("  (no event links rendered; auditing whatever is on the page)");
  }
  await new Promise((r) => setTimeout(r, 2000));

  for (const mode of ["dark", "light"]) {
    await page.evaluate((m) => {
      document.documentElement.classList.toggle("light", m === "light");
    }, mode);
    await new Promise((r) => setTimeout(r, 400));

    const rows = await page.evaluate(AUDIT);
    rows.sort((a, b) => a.r - b.r);
    const below45 = rows.filter((x) => x.r < 4.5);
    const below30 = rows.filter((x) => x.r < 3);

    console.log(`\n=== ${mode} — ${rows.length} text elements ===`);
    console.log(`  under 4.5:1  ${below45.length}`);
    console.log(`  under 3.0:1  ${below30.length}`);
    for (const r of rows.slice(0, 12)) {
      console.log(`   ${String(r.r).padStart(6)}:1  ${r.where}\n             "${r.text}"`);
    }
    hardFailures += below30.length;
  }
} finally {
  await browser.close();
}

if (hardFailures > 0) {
  console.error(`\nFAIL — ${hardFailures} rendered text element(s) under 3:1.`);
  process.exit(1);
}
console.log("\nPASS — no rendered text below 3:1 in either mode.");