import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPublicHotel, getSessionContext } from "@/lib/hotel/api";
import { nextReconnectDelay } from "@/lib/hotel/live-plan";
import { useI18n } from "@/lib/i18n";

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

type PublicHotel = Awaited<ReturnType<typeof getPublicHotel>>;

const links = [
  { to: "/", label: "navHome" },
  { to: "/rooms", label: "navStay" },
  { to: "/hotel", label: "navHotel" },
  { to: "/dining", label: "navDining" },
  { to: "/gallery", label: "navGallery" },
  { to: "/location", label: "navPlace" },
] as const;

export function SiteHeader() {
  const { t, toggle } = useI18n();
  const { user } = useCurrentUserState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const book = (
    <Link to="/book" search={{ checkIn: "", checkOut: "", guests: 1 }} className="btn btn-primary" onClick={() => setOpen(false)}>
      {t.reserve}
    </Link>
  );

  const overMedia = pathname === "/" && !scrolled && !open;

  return (
    <header className={overMedia ? "site-header over-media" : "site-header"}>
      <div className="wrap site-bar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-kicker">{t.city}</span>
            <span className="brand-name">{t.brand}</span>
          </span>
        </Link>
        <nav className="desk-nav" aria-label={t.navHome}>
          {links.map((item) => (
            <Link key={item.to} to={item.to} className="nav-link" activeOptions={{ exact: item.to === "/" }} activeProps={{ "data-status": "active" }}>
              {t[item.label]}
            </Link>
          ))}
        </nav>
        <div className="site-tools">
          <button type="button" className="btn btn-quiet" onClick={toggle}>
            {t.lang}
          </button>
          {user ? (
            <Link to="/stay" className="btn btn-quiet desk-only">
              {t.stay}
            </Link>
          ) : (
            <Link to="/login" className="btn btn-quiet desk-only">
              {t.signIn}
            </Link>
          )}
          {staff ? (
            <Link to="/ops" className="btn btn-quiet desk-only">
              {t.ops}
            </Link>
          ) : null}
          {book}
          <button type="button" className="btn btn-quiet menu-btn" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={18} aria-hidden="true" />
            <span className="sr-only">{t.menu}</span>
          </button>
        </div>
      </div>
      {open ? (
        <>
          <button type="button" className="drawer-backdrop" aria-label={t.close} onClick={() => setOpen(false)} />
          <nav className="drawer" aria-label={t.menu}>
            <button ref={closeRef} type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
              <X size={18} aria-hidden="true" />
              {t.close}
            </button>
            {links.map((item) => (
              <Link key={item.to} to={item.to} className="nav-link" onClick={() => setOpen(false)}>
                {t[item.label]}
              </Link>
            ))}
            <Link to="/policies" className="nav-link" onClick={() => setOpen(false)}>
              {t.navPolicies}
            </Link>
            <Link to="/contact" className="nav-link" onClick={() => setOpen(false)}>
              {t.navContact}
            </Link>
            {user ? (
              <Link to="/stay" className="nav-link" onClick={() => setOpen(false)}>
                {t.stay}
              </Link>
            ) : (
              <Link to="/login" className="nav-link" onClick={() => setOpen(false)}>
                {t.signIn}
              </Link>
            )}
            {staff ? (
              <Link to="/ops" className="nav-link" onClick={() => setOpen(false)}>
                {t.ops}
              </Link>
            ) : null}
            {book}
            {user ? (
              <button
                type="button"
                className="btn btn-quiet"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void signOut().catch(() => setSigningOut(false));
                }}
              >
                {t.signOut}
              </button>
            ) : null}
          </nav>
        </>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  const { t, locale, toggle } = useI18n();
  const [hotel, setHotel] = useState<PublicHotel | null>(null);
  useEffect(() => {
    let stop = false;
    void getPublicHotel()
      .then((data) => {
        if (!stop) setHotel(data);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);
  const facts = (hotel?.facts ?? []) as { key: string; value_en: string; value_fa: string }[];
  const settings = (hotel?.settings ?? []) as { key: string; value: string }[];
  const phone = facts.find((fact) => fact.key === "phone");
  const address = settings.find((item) => item.key === (locale === "fa" ? "address_fa" : "address_en"));
  const phoneText = phone ? (locale === "fa" ? phone.value_fa : phone.value_en) : "";
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <p className="brand-name">{t.brand}</p>
          <p>{address?.value}</p>
          {phoneText ? (
            <p>
              <a href="tel:+982122245050">{phoneText}</a>
            </p>
          ) : null}
          <p>{t.noPublicEmail}</p>
        </div>
        <div>
          <h2>{t.navHotel}</h2>
          <ul>
            <li><Link to="/hotel">{t.navHotel}</Link></li>
            <li><Link to="/rooms">{t.navStay}</Link></li>
            <li><Link to="/gallery">{t.navGallery}</Link></li>
            <li><Link to="/location">{t.navPlace}</Link></li>
          </ul>
        </div>
        <div>
          <h2>{t.stay}</h2>
          <ul>
            <li><Link to="/book" search={{ checkIn: "", checkOut: "", guests: 1 }}>{t.reserve}</Link></li>
            <li><Link to="/stay">{t.stay}</Link></li>
            <li><Link to="/dining">{t.navDining}</Link></li>
            <li><Link to="/login">{t.account}</Link></li>
          </ul>
        </div>
        <div>
          <h2>{t.navContact}</h2>
          <ul>
            <li><Link to="/contact">{t.navContact}</Link></li>
            <li><Link to="/policies">{t.navPolicies}</Link></li>
            <li>
              <a href="http://melalgroup.com/index.php/sepehr-apartment-hotel/">{t.groupPage}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-base">
        <p>{t.rights}</p>
        <button type="button" className="btn btn-quiet" onClick={toggle}>
          {t.lang}
        </button>
      </div>
    </footer>
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
