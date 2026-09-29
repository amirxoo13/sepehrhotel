import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { LocaleProvider } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/hotel/shell";
import { useI18n } from "@/lib/i18n";
import appCss from "../styles.css?url";

/** Public origin for absolute share-card URLs (override with VITE_PUBLIC_SITE_URL). */
const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, "") || "https://sepehrhotel.vercel.app";
const TITLE = "Sepehr Apartment Hotel";
const DESCRIPTION = "Sepehr Apartment Hotel, Fereshteh, Tehran — stay requests, guest services, and hotel operations.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "theme-color", content: "#161513" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: `${SITE_URL}/og.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: TITLE },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Vazirmatn:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootShell,
});

function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="sr-only" href="#main">
      {t.skip}
    </a>
  );
}

function PageFrame() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className={pathname === "/" ? undefined : "page-offset"}>
      <Outlet />
    </div>
  );
}

function RootShell() {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <LocaleProvider>
            <SkipLink />
            <SiteHeader />
            <PageFrame />
            <SiteFooter />
          </LocaleProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
