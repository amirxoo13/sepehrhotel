import { getRequest } from "@tanstack/react-start/server";

/**
 * Fetch-Metadata request isolation — **server-only** (`.server.ts` suffix).
 *
 * MUST keep the `.server` suffix: this file imports `@tanstack/react-start/server`
 * (`getRequest` → Node `AsyncLocalStorage`). Imported from a dual
 * client/server module under a non-`.server` name, Vite would ship it to the
 * browser and the app would die with `AsyncLocalStorage is not a constructor`.
 *
 * A `SameSite=Lax` session cookie is still sent on same-site subrequests, so a
 * page on a sibling host of the same site could make a SCRIPTED (fetch/XHR/
 * form-POST) request to this app's server functions and ride the cookie.
 *
 * We allow only: same-origin requests (this app's own client), non-browser
 * requests (SSR / server-to-server, which send no `Sec-Fetch-Site`), and
 * top-level GET navigations (normal page loads). Every cross-site / same-site
 * *scripted* request is rejected. Enforced at the `authMiddleware` chokepoint.
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Throw `CrossSiteRequestError` for a scripted cross-site request. */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return; // no request context (e.g. build) — nothing to guard
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  // Non-browser client (no header), the app's own origin, or a direct
  // (address-bar/bookmark) load are all fine.
  if (!site || site === "same-origin" || site === "none") return;
  // A top-level GET navigation is fine even when it's cross-site; scripted
  // requests never set navigate mode.
  const dest = h.get("sec-fetch-dest");
  const isTopLevelGet =
    h.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}
