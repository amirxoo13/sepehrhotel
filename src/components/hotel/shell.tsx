import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LegacyIcon } from "@/components/hotel/legacy-icon";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSessionContext } from "@/lib/hotel/api";
import { useLegacyChrome } from "@/lib/legacy-chrome";
import { nextReconnectDelay } from "@/lib/hotel/live-plan";
import { useI18n, type Copy } from "@/lib/i18n";

/**
 * The shell around every app page: the old site's header (logo, menu, search
 * icon), its title band (`#Subheader`) and its footer, with the same markup
 * and classes as the saved home page (`src/legacy/home.html`), so the theme
 * stylesheets render them the same. Only the menu differs: it carries this
 * site's pages, the account entries and the language switch.
 */
const STAFF = new Set([
  "SUPER_ADMIN",
  "HOTEL_ADMIN",
  "RECEPTION",
  "HOUSEKEEPING",
  "LAUNDRY",
  "KITCHEN",
  "COFFEE_SHOP",
  "PARKING",
  "MAINTENANCE",
  "ACCOUNTING",
  "MANAGER",
]);

type NavTarget = "/rooms" | "/hotel" | "/dining" | "/gallery" | "/location" | "/contact" | "/policies";
const links: { to: NavTarget; label: keyof Copy }[] = [
  { to: "/rooms", label: "navStay" },
  { to: "/hotel", label: "navHotel" },
  { to: "/dining", label: "navDining" },
  { to: "/gallery", label: "navGallery" },
  { to: "/location", label: "navPlace" },
  { to: "/policies", label: "navPolicies" },
  { to: "/contact", label: "navContact" },
];

/** The title band shows the page's name. */
const TITLE_BY_PATH: Record<string, keyof Copy> = {
  "/rooms": "navStay",
  "/hotel": "navHotel",
  "/dining": "navDining",
  "/gallery": "navGallery",
  "/location": "navPlace",
  "/policies": "navPolicies",
  "/contact": "navContact",
  "/book": "book",
  "/login": "signIn",
  "/stay": "stay",
  "/ops": "ops",
  "/search": "searchTitle",
};

export function pageTitle(pathname: string, t: Copy): string {
  const key = TITLE_BY_PATH[pathname];
  if (key) return String(t[key]);
  if (pathname.startsWith("/room/")) return String(t.qr);
  return String(t.brand);
}

function MenuItem({ current, children }: { current: boolean; children: React.ReactNode }) {
  return <li className={current ? "menu-item menu-item-type-post_type menu-item-object-page current-menu-item" : "menu-item menu-item-type-post_type menu-item-object-page"}>{children}</li>;
}

export function SiteHeader() {
  const { t, toggle } = useI18n();
  const { user } = useCurrentUserState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [staff, setStaff] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) {
      setStaff(false);
      return;
    }
    let stop = false;
    void getSessionContext()
      .then((ctx) => {
        if (!stop) setStaff((ctx.roles as string[]).some((role) => STAFF.has(role)));
      })
      .catch(() => {
        if (!stop) setStaff(false);
      });
    return () => {
      stop = true;
    };
  }, [user]);

  return (
    <div id="Header_wrapper" className="" dir="ltr">
      <header id="Header">
        <div className="header_placeholder" style={{ height: 0 }} />
        <div id="Top_bar" className="" style={{ top: "61px" }}>
          <div className="container">
            <div className="column one">
              <div className="top_bar_left clearfix">
                <div className="logo">
                  <a id="logo" href="/" title={t.brand} data-height="60" data-padding="15" className="retina">
                    <img className="logo-main scale-with-grid " src="/legacy/img/logo2.png" data-height="590" alt="logo2" style={{ maxHeight: "60px" }} />
                    <img className="logo-sticky scale-with-grid " src="/legacy/img/logo_2x.png" data-height="240" alt="logo_2x" style={{ maxHeight: "35px" }} />
                    <img className="logo-mobile scale-with-grid " src="/legacy/img/logo2.png" data-height="590" alt="logo2" style={{ maxHeight: "90px" }} />
                    <img className="logo-mobile-sticky scale-with-grid " src="/legacy/img/logo2.png" data-height="590" alt="logo2" style={{ maxHeight: "50px" }} />
                  </a>
                </div>
                <div className="menu_wrapper">
                  <nav id="menu" aria-label={t.menu}>
                    <ul id="menu-main-menu" className="menu menu-main">
                      <li className="menu-item menu-item-type-post_type menu-item-object-page menu-item-home">
                        {/* The home page is the old page on its own stylesheets: a full load, not a client-side route change. */}
                        <a href="/">
                          <span>{t.navHome}</span>
                        </a>
                      </li>
                      {links.map((item) => (
                        <MenuItem key={item.to} current={pathname === item.to}>
                          <Link to={item.to}>
                            <span>{String(t[item.label])}</span>
                          </Link>
                        </MenuItem>
                      ))}
                      <MenuItem current={pathname === "/book"}>
                        <Link to="/book" search={{ checkIn: "", checkOut: "", guests: 1 }}>
                          <span>{t.reserve}</span>
                        </Link>
                      </MenuItem>
                      {user ? (
                        // The account entries sit under one item with a sub-menu, like "Hotels" on the old page.
                        <li
                          className={
                            (pathname === "/stay" || pathname === "/ops" ? "current-menu-ancestor current-menu-parent " : "") +
                            "menu-item menu-item-type-custom menu-item-object-custom menu-item-has-children submenu"
                          }
                        >
                          <a
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                            }}
                          >
                            <span>{t.account}</span>
                          </a>
                          <ul className="sub-menu">
                            <MenuItem current={pathname === "/stay"}>
                              <Link to="/stay">
                                <span>{t.stay}</span>
                              </Link>
                            </MenuItem>
                            {staff ? (
                              <MenuItem current={pathname === "/ops"}>
                                <Link to="/ops">
                                  <span>{t.ops}</span>
                                </Link>
                              </MenuItem>
                            ) : null}
                            <li className="menu-item menu-item-type-custom menu-item-object-custom last-item">
                              <a
                                href="#"
                                aria-disabled={signingOut}
                                onClick={(event) => {
                                  event.preventDefault();
                                  if (signingOut) return;
                                  setSigningOut(true);
                                  void signOut().catch(() => setSigningOut(false));
                                }}
                              >
                                <span>{t.signOut}</span>
                              </a>
                            </li>
                          </ul>
                          <span className="menu-toggle"></span>
                        </li>
                      ) : (
                        <MenuItem current={pathname === "/login"}>
                          <Link to="/login">
                            <span>{t.signIn}</span>
                          </Link>
                        </MenuItem>
                      )}
                      <li className="menu-item menu-item-type-custom menu-item-object-custom last">
                        <a
                          href="#"
                          lang={t.lang === "English" ? "en" : "fa"}
                          onClick={(event) => {
                            event.preventDefault();
                            toggle();
                          }}
                        >
                          <span>{t.lang}</span>
                        </a>
                      </li>
                    </ul>
                  </nav>
                  <a className="responsive-menu-toggle " href="#" aria-label={t.menu}>
                    <LegacyIcon name="icon-menu-fine" />
                  </a>
                </div>
                <div className="secondary_menu_wrapper"></div>
                <div className="banner_wrapper"></div>
                <div className="search_wrapper">
                  <form method="get" id="searchform" action="/search">
                    <i className="icon_search icon-search-fine"></i>
                    <a href="#" className="icon_close" aria-label={t.close}>
                      <LegacyIcon name="icon-cancel-fine" />
                    </a>
                    <input type="text" className="field" name="s" placeholder={t.searchTitle} aria-label={t.searchTitle} />
                    <input type="submit" className="display-none" value="" />
                  </form>
                </div>
              </div>
              <div className="top_bar_right">
                <div className="top_bar_right_wrapper">
                  <a id="search_button" href="#" aria-label={t.searchTitle}>
                    <LegacyIcon name="icon-search-fine" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div id="Subheader">
        <div className="container">
          <div className="column one">
            <h1 className="title">{pageTitle(pathname, t)}</h1>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The old site's footer, verbatim (see docs/OPERATIONS.md for the two open items). */
export function SiteFooter() {
  return (
    <footer id="Footer" className="clearfix " dir="ltr">
      <div className="widgets_wrapper ">
        <div className="container">
          <div className="column one-third">
            <aside id="text-2" className="widget widget_text">
              <h4>OUR HOTELS</h4>
              <div className="textwidget">
                <div className="main_title">
                  <p>
                    Our stylish fully serviced apartments are perfect for either business or pleasure. We are offering short term and long term accommodation for the
                    discerning business professionals, holiday-makers, house movers, families, couples and friends.
                  </p>
                </div>
                <div className="row hotels-row">
                  <div className="col-lg-6 nopadding features-intro-img"></div>
                </div>
              </div>
            </aside>
          </div>
          <div className="column one-third">
            <aside id="text-3" className="widget widget_text">
              <h4>FOR RESERVATION</h4>
              <div className="textwidget">
                <div className="row">
                  <div className="col-md-4"></div>
                </div>
                <div className="row">
                  <div className="col-md-12">
                    <div id="social_footer">
                      <div className="row justify-content-md-center text-center">
                        <div className="col-md-12">
                          <strong>
                            <a id="phone" href="tel://982122245080/">
                              +98 21 2224 5080-2
                            </a>
                          </strong>
                        </div>
                        <div>
                          <a href="tel: +989121002009">
                            <strong>+989121002009&nbsp;&nbsp;</strong>
                          </a>
                        </div>
                        <div></div>
                      </div>
                    </div>
                  </div>
                </div>
                <p>
                  <strong>
                    <a href="mailto:melalhotel@gmail.com">&nbsp;melalhotel@gmail.com</a>
                  </strong>
                </p>
              </div>
            </aside>
          </div>
          <div className="column one-third">
            <aside id="text-4" className="widget widget_text">
              <h4>SOME GOOD REASONS</h4>
              <div className="textwidget">
                <div>
                  <div id="services" className="container margin_60">
                    <div className="main_title">
                      <p>Providing a greater space, flexibility and privacy are not always possible in an ordinary hotel room.</p>
                    </div>
                  </div>
                </div>
                <div id="carouselExampleIndicators" className="container carousel slide py-5" data-ride="carousel">
                  <div className="shadowTop mx-2"></div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
      <div className="footer_copy">
        <div className="container">
          <div className="column one">
            <a id="back_to_top" className="footer_button" href="/" aria-label="Back to top">
              <LegacyIcon name="icon-up-open-big" />
            </a>
            <div className="copyright">© 2021 Melal by apweb.ir | All Rights Reserved | Powered by Apweb</div>
            <ul className="social">
              {(
                [
                  ["skype", "Skype", "icon-skype"],
                  ["facebook", "Facebook", "icon-facebook"],
                  ["twitter", "Twitter", "icon-twitter"],
                  ["vimeo", "Vimeo", "icon-vimeo"],
                  ["youtube", "YouTube", "icon-play"],
                  ["flickr", "Flickr", "icon-flickr"],
                  ["linkedin", "LinkedIn", "icon-linkedin"],
                ] as const
              ).map(([cls, title, icon]) => (
                <li key={cls} className={cls}>
                  <a href="#" title={title}>
                    <LegacyIcon name={icon} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Header + title band + content + footer, on the theme's page structure. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useCurrentUserState();
  const { locale } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useLegacyChrome(ref, [pathname, user?.id, locale]);
  return (
    <div id="Wrapper" ref={ref}>
      <SiteHeader />
      <div id="Content" dir={locale === "fa" ? "rtl" : "ltr"}>
        <div className="content_wrapper clearfix">
          <div className="sections_group">
            <div className="entry-content">
              <div className="section app-section">
                <div className="section_wrapper">{children}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

export function useLiveRefresh(enabled: boolean, refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let controller = new AbortController();
    let pending = 0;
    let reconnectTimer = 0;
    let attempt = 0;
    let after = 0;
    const kick = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => refreshRef.current(), 400);
    };
    /**
     * One stream. The server ends every stream after LIVE_STREAM_MAX_MS (the
     * function it runs in has a hard time limit), so a normal end reconnects
     * at once; an error or a non-OK response backs off.
     */
    const connect = async () => {
      if (stop) return;
      controller = new AbortController();
      const headers = new Headers({ Accept: "text/event-stream" });
      let endedNormally = false;
      try {
        const response = await fetch(`/api/live?after=${after}`, {
          headers,
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!response.ok || !response.body) {
          if (!stop) setLive(false);
          if (response.status === 401) return; // signed out: nothing to stream
        } else {
          if (!stop) setLive(true);
          attempt = 0;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stop) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            if (buffer.includes("event: end")) {
              const match = /"after":(\d+)/.exec(buffer);
              if (match) after = Math.max(after, Number(match[1]));
              endedNormally = true;
            }
            if (buffer.includes("data:")) {
              const ids = [...buffer.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1]));
              if (ids.length) after = Math.max(after, ...ids);
              if (!endedNormally) kick();
            }
            buffer = "";
          }
        }
      } catch {
        /* aborted or network error */
      }
      if (stop) return;
      setLive(false);
      const delay = nextReconnectDelay(attempt, endedNormally);
      if (!endedNormally) attempt += 1;
      reconnectTimer = window.setTimeout(() => void connect(), delay);
    };
    void connect();
    const backup = window.setInterval(() => refreshRef.current(), 12000);
    return () => {
      stop = true;
      window.clearTimeout(pending);
      window.clearTimeout(reconnectTimer);
      controller.abort();
      window.clearInterval(backup);
    };
  }, [enabled]);
  return live;
}
