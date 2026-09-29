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

/** Font Awesome Free 6 paths (https://fontawesome.com/license/free), by the theme's icon class. */
const ICONS = {
  "icon-skype": ["0 0 448 512", "M424.7 299.8c2.9-14 4.7-28.9 4.7-43.8 0-113.5-91.9-205.3-205.3-205.3-14.9 0-29.7 1.7-43.8 4.7C161.3 40.7 137.7 32 112 32 50.2 32 0 82.2 0 144c0 25.7 8.7 49.3 23.3 68.2-2.9 14-4.7 28.9-4.7 43.8 0 113.5 91.9 205.3 205.3 205.3 14.9 0 29.7-1.7 43.8-4.7 19 14.6 42.6 23.3 68.2 23.3 61.8 0 112-50.2 112-112 .1-25.6-8.6-49.2-23.2-68.1zm-194.6 91.5c-65.6 0-120.5-29.2-120.5-65 0-16 9-30.6 29.5-30.6 31.2 0 34.1 44.9 88.1 44.9 25.7 0 42.3-11.4 42.3-26.3 0-18.7-16-21.6-42-28-62.5-15.4-117.8-22-117.8-87.2 0-59.2 58.6-81.1 109.1-81.1 55.1 0 110.8 21.9 110.8 55.4 0 16.9-11.4 31.8-30.3 31.8-28.3 0-29.2-33.5-75-33.5-25.7 0-42 7-42 22.5 0 19.8 20.8 21.8 69.1 33 41.4 9.3 90.7 26.8 90.7 77.6 0 59.1-57.1 86.5-112 86.5z"],
  "icon-facebook": ["0 0 320 512", "M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z"],
  "icon-twitter": ["0 0 512 512", "M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z"],
  "icon-vimeo": ["0 0 448 512", "M447.8 153.6c-2 43.6-32.4 103.3-91.4 179.1-60.9 79.2-112.4 118.8-154.6 118.8-26.1 0-48.2-24.1-66.3-72.3C100.3 250 85.3 174.3 56.2 174.3c-3.4 0-15.1 7.1-35.2 21.1L0 168.2c51.6-45.3 100.9-95.7 131.8-98.5 34.9-3.4 56.3 20.5 64.4 71.5 28.7 181.5 41.4 208.9 93.6 126.7 18.7-29.6 28.8-52.1 30.2-67.6 4.8-45.9-35.8-42.8-63.3-31 22-72.1 64.1-107.1 126.2-105.1 45.8 1.2 67.5 31.1 64.9 89.4z"],
  "icon-play": ["0 0 384 512", "M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"],
  "icon-flickr": ["0 0 448 512", "M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zM144.5 319c-35.1 0-63.5-28.4-63.5-63.5s28.4-63.5 63.5-63.5 63.5 28.4 63.5 63.5-28.4 63.5-63.5 63.5zm159 0c-35.1 0-63.5-28.4-63.5-63.5s28.4-63.5 63.5-63.5 63.5 28.4 63.5 63.5-28.4 63.5-63.5 63.5z"],
  "icon-linkedin": ["0 0 448 512", "M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z"],
  "icon-up-open-big": ["0 0 512 512", "M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"],
  "icon-search-fine": ["0 0 512 512", "M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"],
  "icon-cancel-fine": ["0 0 384 512", "M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"],
  "icon-menu-fine": ["0 0 448 512", "M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"],
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
