import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { LocaleProvider } from "@/lib/i18n";
import { AppShell } from "@/components/hotel/shell";
import { useI18n } from "@/lib/i18n";
import appCss from "../styles.css?url";

/** Public origin for absolute share-card URLs (override with VITE_PUBLIC_SITE_URL). */
const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, "") || "https://sepehrhotel.vercel.app";
const TITLE = "Sepehr Apartment Hotel";
const DESCRIPTION = "Sepehr Apartment Hotel, Fereshteh, Tehran — stay requests, guest services, and hotel operations.";

/**
 * Every page renders on the old site's theme stylesheets (`public/legacy/css`)
 * with the old page's `<body>` classes, which those stylesheets key off.
 *
 * The home page (`/`) is the saved old page itself (`src/routes/index.tsx`):
 * English, left-to-right, without the app stylesheet or shell. Every other
 * page is the app, wrapped in the theme's header, title band and footer
 * (`AppShell`), with the app stylesheet for its own content.
 */
const isLegacyHome = (pathname: string) => pathname === "/";

/** The old page's `<body>` classes, verbatim: the theme stylesheets key off them (header layout, sticky bar, centred subheader, colours). */
const LEGACY_BODY_CLASS =
  "page-template-default page page-id-204 wp-custom-logo color-custom style-default button-default layout-full-width hide-love is-elementor header-classic sticky-header sticky-white ab-hide subheader-both-center mobile-tb-center mobile-mini-mr-ll be-reg-24011 elementor-default elementor-kit-6 elementor-page elementor-page-204";

export const Route = createRootRoute({
  head: ({ matches }) => {
    const legacy = matches.some((match) => (match as { routeId: string }).routeId === "/");
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: TITLE },
        { name: "theme-color", content: "#1b181f" },
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
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/icon-180.png" },
        { rel: "stylesheet", href: "/legacy/css/be.css" },
        { rel: "stylesheet", href: "/legacy/css/responsive.css" },
        { rel: "stylesheet", href: "/legacy/css/theme.css" },
        ...(legacy ? [{ rel: "preload", as: "style", href: appCss }] : [{ rel: "stylesheet", href: appCss }]),
      ],
    };
  },
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

function RootShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const legacy = isLegacyHome(pathname);
  return (
    <html lang={legacy ? "en-US" : "fa"} dir={legacy ? "ltr" : "rtl"} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={legacy ? LEGACY_BODY_CLASS : `${LEGACY_BODY_CLASS} app-page`}>
        <AuthProvider>
          <LocaleProvider documentDirection={!legacy}>
            {legacy ? (
              <Outlet />
            ) : (
              <AppShell>
                <SkipLink />
                <Outlet />
              </AppShell>
            )}
          </LocaleProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
