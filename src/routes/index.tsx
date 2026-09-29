import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import homeHtml from "../legacy/home.html?raw";
import { useLegacyChrome } from "@/lib/legacy-chrome";

/**
 * The home page is the hotel's former page (BeTheme on WordPress), served
 * from the saved copy in `old-site/` — same markup (`src/legacy/home.html`,
 * built by `scripts/legacy-home.mjs`) on the same stylesheets. The root route
 * leaves out the app's own stylesheet and shell on this path.
 *
 * The behaviours the theme's jQuery provided (sticky bar, sub-menus, mobile
 * menu, search box, back to top) live in `src/lib/legacy-chrome.ts`, shared
 * with the app shell that wraps every other page.
 */
export const Route = createFileRoute("/")({
  // The theme stylesheets come from the root route (every page uses them).
  head: () => ({ meta: [{ title: "SEPEHR APARTMENT HOTEL" }] }),
  component: LegacyHome,
});

function LegacyHome() {
  const ref = useRef<HTMLDivElement>(null);
  useLegacyChrome(ref);
  // The markup is the saved page's own; nothing user-supplied is inserted.
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: homeHtml }} />;
}
