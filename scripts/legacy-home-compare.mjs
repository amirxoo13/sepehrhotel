/**
 * Pixel comparison of the home page against the saved copy of the old page.
 *
 * Serves `old-site/` on a local port, screenshots both pages at desktop and
 * phone widths in headless Chromium, and prints the number of differing
 * pixels per width (pixelmatch, threshold 0.1). The remaining difference is
 * expected to be the icons only: the saved page has no icon font, this site
 * draws them as SVGs.
 *
 * Run with the app up (`npm run dev` on http://localhost:8080):
 *   npm run legacy:compare
 *   CHROME=/path/to/chrome APP=http://localhost:8080 npm run legacy:compare
 *
 * Diff images are written to artifacts/legacy-compare/.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const APP = process.env.APP ?? "http://localhost:8080";
const CHROME = process.env.CHROME ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const WIDTHS = [1366, 1920, 390];
const OUT = "artifacts/legacy-compare";
const OLD_SITE = new URL("../old-site/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".download": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png" };

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(OLD_SITE, path === "/" ? "index.html" : path);
  if (!file.startsWith(OLD_SITE) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const oldUrl = `http://127.0.0.1:${server.address().port}/index.html`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
async function shot(url, width, file) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}
function pad(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const p = new PNG({ width: w, height: h });
  p.data.fill(255);
  PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0);
  return p;
}
let worst = 0;
for (const width of WIDTHS) {
  const a = `${OUT}/old-${width}.png`;
  const b = `${OUT}/new-${width}.png`;
  await shot(oldUrl, width, a);
  await shot(`${APP}/`, width, b);
  const A = PNG.sync.read(readFileSync(a));
  const B = PNG.sync.read(readFileSync(b));
  const w = Math.max(A.width, B.width);
  const h = Math.max(A.height, B.height);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(pad(A, w, h).data, pad(B, w, h).data, diff.data, w, h, { threshold: 0.1 });
  writeFileSync(`${OUT}/diff-${width}.png`, PNG.sync.write(diff));
  const percent = (100 * n) / (w * h);
  worst = Math.max(worst, percent);
  console.log(`${width}px: old ${A.width}x${A.height}, new ${B.width}x${B.height}, differing pixels ${n} (${percent.toFixed(3)}%)`);
}
await browser.close();
server.close();
console.log(worst < 0.1 ? "OK — within the icon-only allowance (0.1%)" : "DIFFERENT — inspect the diff images");
process.exit(worst < 0.1 ? 0 : 1);
