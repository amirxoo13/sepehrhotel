import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import homeHtml from "../legacy/home.html?raw";

/**
 * The home page is the hotel's former page (BeTheme on WordPress), served
 * from the saved copy in `old-site/` — same markup (`src/legacy/home.html`,
 * built by `scripts/legacy-home.mjs`) on the same stylesheets. The root route
 * leaves out the app's own stylesheet and shell on this path.
 *
 * The few behaviours the theme's jQuery provided are re-implemented below,
 * with the same thresholds: the header's left width, the sticky top bar
 * (`scripts.js` mfnSticky), hover/click sub-menus (`menu.js` mfnMenu), the
 * mobile menu toggle, the search box (fade toggle) and the back-to-top button.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "SEPEHR APARTMENT HOTEL" }],
    links: [
      { rel: "stylesheet", href: "/legacy/css/be.css" },
      { rel: "stylesheet", href: "/legacy/css/responsive.css" },
      { rel: "stylesheet", href: "/legacy/css/theme.css" },
    ],
  }),
  component: LegacyHome,
});

const MOBILE_INIT = 1240; // mfn.mobileInit on the old page
const MENU_DELAY = 100; // mfnMenu default `delay`
const TOP_BAR_TOP = "61px"; // scripts.js `topBarTop`

function LegacyHome() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel);
    const topBar = $<HTMLElement>("#Top_bar");
    const placeholder = $<HTMLElement>(".header_placeholder");
    const left = $<HTMLElement>(".top_bar_left");
    const right = $<HTMLElement>(".top_bar_right");
    const one = $<HTMLElement>("#Top_bar .one");
    const menu = $<HTMLElement>("#Top_bar #menu");
    const toggle = $<HTMLAnchorElement>(".responsive-menu-toggle");
    const backToTop = $<HTMLAnchorElement>("#back_to_top");
    const searchButton = $<HTMLAnchorElement>("#search_button");
    const searchWrapper = $<HTMLElement>("#Top_bar .search_wrapper");
    const searchClose = $<HTMLAnchorElement>("#Top_bar .icon_close");
    if (!topBar || !placeholder || !left || !one || !menu) return;

    // scripts.js headerWidth(): the left block takes what the right block leaves.
    const headerWidth = () => {
      let rightW = right?.getBoundingClientRect().width ?? 0;
      if (rightW) rightW += 10;
      left.style.width = `${one.getBoundingClientRect().width - rightW}px`;
    };

    // scripts.js mfnSticky(): stick once scrolled past the top bar's own height.
    let animation: Animation | null = null;
    const sticky = () => {
      const startY = topBar.getBoundingClientRect().height;
      if (window.scrollY > startY) {
        if (!topBar.classList.contains("is-sticky")) {
          placeholder.style.height = `${startY}px`;
          topBar.classList.add("is-sticky");
          animation?.cancel();
          animation = topBar.animate([{ top: "-60px" }, { top: "0px" }], { duration: 300, fill: "forwards" });
          headerWidth();
        }
      } else if (topBar.classList.contains("is-sticky")) {
        animation?.cancel();
        animation = null;
        placeholder.style.height = "0px";
        topBar.classList.remove("is-sticky");
        topBar.style.top = TOP_BAR_TOP;
        headerWidth();
      }
    };

    // menu.js: hover on desktop, "+" toggle on narrow screens.
    const timers = new WeakMap<Element, number>();
    const show = (li: Element) => {
      li.classList.add("hover");
      const ul = li.querySelector<HTMLElement>(":scope > ul");
      if (ul) {
        window.clearTimeout(timers.get(li));
        ul.style.display = "block";
        ul.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MENU_DELAY });
      }
    };
    const hide = (li: Element) => {
      li.classList.remove("hover");
      const ul = li.querySelector<HTMLElement>(":scope > ul");
      if (ul) {
        ul.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MENU_DELAY });
        timers.set(
          li,
          window.setTimeout(() => {
            ul.style.display = "none";
          }, MENU_DELAY),
        );
      }
    };
    const items = Array.from(menu.querySelectorAll<HTMLLIElement>("li"));
    const onEnter = (event: Event) => {
      if (window.innerWidth >= MOBILE_INIT) show(event.currentTarget as Element);
    };
    const onLeave = (event: Event) => {
      if (window.innerWidth >= MOBILE_INIT) hide(event.currentTarget as Element);
    };
    const onToggleClick = (event: Event) => {
      if (window.innerWidth >= MOBILE_INIT) return;
      const li = (event.currentTarget as Element).closest("li");
      if (!li) return;
      if (li.classList.contains("hover")) hide(li);
      else show(li);
    };
    for (const li of items) {
      li.addEventListener("mouseenter", onEnter);
      li.addEventListener("mouseleave", onLeave);
      li.querySelector(":scope > .menu-toggle")?.addEventListener("click", onToggleClick);
    }

    // scripts.js: the responsive menu button slides the menu open and closed.
    const onMenuButton = (event: Event) => {
      event.preventDefault();
      if (!toggle) return;
      toggle.classList.toggle("active");
      menu.style.display = toggle.classList.contains("active") ? "block" : "none";
    };
    toggle?.addEventListener("click", onMenuButton);

    // scripts.js: the search icon (and its close icon) fade the search box in and out.
    const onSearchToggle = (event: Event) => {
      event.preventDefault();
      if (!searchWrapper) return;
      const open = searchWrapper.style.display !== "block";
      searchWrapper.style.display = "block";
      searchWrapper.animate([{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }], { duration: 400 }).finished.then(() => {
        if (!open) searchWrapper.style.display = "none";
      });
      if (open) searchWrapper.querySelector<HTMLInputElement>(".field")?.focus();
    };
    searchButton?.addEventListener("click", onSearchToggle);
    searchClose?.addEventListener("click", onSearchToggle);

    const onBackToTop = (event: Event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    backToTop?.addEventListener("click", onBackToTop);

    const onResize = () => {
      headerWidth();
      if (window.innerWidth >= MOBILE_INIT) menu.style.display = "";
    };
    headerWidth();
    sticky();
    window.addEventListener("scroll", sticky, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", sticky);
      window.removeEventListener("resize", onResize);
      toggle?.removeEventListener("click", onMenuButton);
      backToTop?.removeEventListener("click", onBackToTop);
      searchButton?.removeEventListener("click", onSearchToggle);
      searchClose?.removeEventListener("click", onSearchToggle);
      for (const li of items) {
        li.removeEventListener("mouseenter", onEnter);
        li.removeEventListener("mouseleave", onLeave);
        li.querySelector(":scope > .menu-toggle")?.removeEventListener("click", onToggleClick);
      }
      animation?.cancel();
    };
  }, []);

  // The markup is the saved page's own; nothing user-supplied is inserted.
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: homeHtml }} />;
}
