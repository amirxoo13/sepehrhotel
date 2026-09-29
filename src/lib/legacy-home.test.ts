/**
 * The home page is the saved copy of the hotel's former page. These checks
 * keep `src/legacy/home.html` honest against its source (`old-site/`): every
 * photograph, the same text, working local assets, no links into the old host.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../legacy/home.html", import.meta.url), "utf8");
const saved = readFileSync(new URL("../../old-site/index.html", import.meta.url), "utf8");

function text(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("every image of the old page is on the home page and exists under public/legacy", () => {
  const old = [...saved.matchAll(/src="\.\/files\/([^"]+\.(?:jpg|png))"/g)].map((m) => m[1]);
  assert.equal(new Set(old).size, 19, "19 distinct images on the saved page (17 photographs, 2 logos)");
  for (const file of new Set(old)) {
    assert.ok(home.includes(`src="/legacy/img/${file}"`), `${file} is referenced`);
    assert.ok(existsSync(new URL(`../../public/legacy/img/${file}`, import.meta.url)), `${file} exists`);
  }
  assert.equal(home.match(/src="\/legacy\/img\//g)?.length, old.length, "same number of image tags");
});

test("the visible text is the old page's text", () => {
  const body = saved.slice(saved.indexOf('<div id="Wrapper">'), saved.indexOf("<!-- mfn_hook_bottom -->"));
  const expected = text(body).replace(/Enter your search/, "").replace(/\s+/g, " ").trim();
  assert.equal(text(home), expected);
});

test("no asset or link points at the old host, except the other hotel's page", () => {
  const refs = [...home.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (ref.startsWith("http")) assert.equal(ref, "https://melalgroup.com/index.php/melal-apartment-hotel/", ref);
  }
  const backgrounds = [...home.matchAll(/url\((https?:[^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(backgrounds, ["https://melalgroup.com/wp-content/uploads/2015/04/home_lawyer_section.jpg"], "the one background Chrome did not save");
  assert.ok(!home.includes("data-retina"), "retina attributes (old host) dropped");
  for (const sheet of ["be.css", "responsive.css", "theme.css"]) {
    assert.ok(existsSync(new URL(`../../public/legacy/css/${sheet}`, import.meta.url)), sheet);
  }
});

test("the seven footer icons and the menu toggle carry inline SVGs", () => {
  for (const cls of ["icon-skype", "icon-facebook", "icon-twitter", "icon-vimeo", "icon-play", "icon-flickr", "icon-linkedin", "icon-up-open-big", "icon-menu-fine"]) {
    assert.match(home, new RegExp(`<i class="${cls}"><svg `), cls);
  }
  assert.ok(!/<i class="icon-[a-z-]+"><\/i>/.test(home), "no empty icon element is left");
});
