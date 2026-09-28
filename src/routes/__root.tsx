import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LocaleProvider } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/hotel/shell";
import { useI18n } from "@/lib/i18n";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sepehr Apartment Hotel" },
      { name: "theme-color", content: "#161513" },
      { name: "description", content: "Sepehr Apartment Hotel, Fereshteh, Tehran — stay requests, guest services, and hotel operations." },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
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
        <PreviewHostBridge />
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
