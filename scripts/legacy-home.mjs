/**
 * Builds `src/legacy/home.html` from the saved copy of the hotel's former page
 * (`old-site/index.html`, saved from
 * https://melalgroup.com/index.php/sepehr-apartment-hotel/ with Chrome's
 * "Webpage, Complete"), so the home page of this site renders the same markup
 * on the same theme stylesheets (`public/legacy/css/be.css`, `responsive.css`
 * and the theme options that page carried inline, `theme.css`).
 *
 * What changes, and nothing else:
 *   - asset paths `./files/…` → `/legacy/img/…` (same files, copied verbatim);
 *   - links into the old group site → this site's pages (see LINKS);
 *   - the theme's icon font was not part of the saved page, so its icons are
 *     replaced by inline SVGs (Font Awesome Free, CC BY 4.0) of the same names;
 *   - the WordPress search form posts to this site's `/search` page;
 *   - `data-retina` attributes (pointing at the old host) are dropped;
 *   - the JS-computed inline widths are dropped; `src/routes/index.tsx`
 *     recomputes them exactly as the theme's scripts.js did.
 *
 * Run: node scripts/legacy-home.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ICONS } from "../src/legacy/icons.mjs";

const SRC = new URL("../old-site/index.html", import.meta.url);
const OUT = new URL("../src/legacy/home.html", import.meta.url);

const LINKS = {
  "https://melalgroup.com/": "/",
  "https://melalgroup.com/index.php/about-us/": "/hotel",
  "https://melalgroup.com/index.php/contact-us/": "/contact",
  "https://melalgroup.com/index.php/sepehr-apartment-hotel/": "/",
  "https://melalgroup.com/index.php/sepehr-apartment-hotel/#": "#",
  "https://melalgroup.com/index.php/melal-apartment-hotel/": "https://melalgroup.com/index.php/melal-apartment-hotel/",
  "https://melalgroup.com/index.php/studio-sepehr/": "/rooms",
  "https://melalgroup.com/index.php/suite-sepehr/": "/rooms",
  "https://melalgroup.com/index.php/medium-suite-sepehr/": "/rooms",
  "https://melalgroup.com/index.php/large-suite-sepehr/": "/rooms",
  "https://melalgroup.com/index.php/2-bedroom-sepehr/": "/rooms",
};



function icon(cls) {
  const def = ICONS[cls];
  if (!def) throw new Error(`no SVG for ${cls}`);
  return `<i class="${cls}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${def[0]}" aria-hidden="true" focusable="false"><path d="${def[1]}"/></svg></i>`;
}

const page = readFileSync(SRC, "utf8");
const start = page.indexOf('<div id="Wrapper">');
const end = page.indexOf("<!-- mfn_hook_bottom -->");
if (start < 0 || end < 0) throw new Error("old-site/index.html: #Wrapper not found");
let html = page.slice(start, end);
// The closing of #Wrapper is the last </div> before the hook comment.
html = html.slice(0, html.lastIndexOf("</div>") + 6);

// No scripts from the old page run here.
html = html.replace(/<script[\s\S]*?<\/script>/g, "");
// Assets.
html = html.replace(/\.\/files\//g, "/legacy/img/");
html = html.replace(/ data-(no-)?retina="[^"]*"/g, "");
// The search form posts to this site's search page.
html = html.replace(/(<form method="get" id="searchform") action="https:\/\/melalgroup\.com\/"/, '$1 action="/search"');
// Links (every remaining absolute link must be in LINKS).
html = html.replace(/href="(https?:\/\/[^"]*)"/g, (m, href) => {
  const to = LINKS[href];
  if (to === undefined) throw new Error(`unmapped link ${href}`);
  return `href="${to}"`;
});
// JS-computed inline sizes: recomputed at runtime (see src/routes/index.tsx).
html = html.replace(/<div class="top_bar_left clearfix" style="width: [^"]*">/, '<div class="top_bar_left clearfix">');
// Icons.
html = html.replace(/<i class="(icon-[a-z-]+)"><\/i>/g, (m, cls) => icon(cls));
// Nothing may still point at the old host, except the other hotel's page and
// one CSS background image Chrome did not save (`home_lawyer_section.jpg`,
// behind the "comprises 40 guestrooms" text); it stays on its original URL
// until a copy is added to public/legacy/img.
const ALLOWED_OLD_HOST = ["melalgroup.com/index.php/melal-apartment-hotel/", "melalgroup.com/wp-content/uploads/2015/04/home_lawyer_section.jpg"];
const stray = html.match(/melalgroup\.com[^"') ]*/g)?.filter((s) => !ALLOWED_OLD_HOST.includes(s));
if (stray?.length) throw new Error(`stray old-host references: ${stray.join(", ")}`);

mkdirSync(new URL("../src/legacy/", import.meta.url), { recursive: true });
writeFileSync(OUT, html.trim() + "\n");
console.log(`[legacy-home] wrote src/legacy/home.html (${html.length} bytes)`);
