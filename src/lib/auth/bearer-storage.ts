/**
 * Where the session bearer token may be kept in web storage.
 *
 * The token exists for ONE reason: inside the Grok live-preview iframe cookies
 * are partitioned, so the client must carry the session as a bearer token.
 * Everywhere else (the deployed site included) the HttpOnly session cookie
 * carries the session. Keeping the token in storage there gains nothing and
 * costs a lot: `authMiddleware` forwards it as server-function context, and
 * TanStack Start serialises the context of GET server functions into the URL
 * query string (request logs, browser history, Referer). Client-safe: no
 * server imports.
 */
export const BEARER_KEY = "grok-auth.bearer-token";

const LIVE_PREVIEW_SUFFIX = ".grok-sandbox.com";

/** True only for the sandbox live-preview host. */
export function isLivePreviewHost(hostname: string): boolean {
  return hostname.endsWith(LIVE_PREVIEW_SUFFIX);
}

/**
 * Store the `set-auth-token` header of a sign-in response, but only on the
 * live-preview host. Returns the stored token, or null when nothing was kept.
 */
export function rememberBearerToken(
  response: { headers: { get(name: string): string | null } },
  hostname: string,
  storage: Pick<Storage, "setItem"> | undefined,
): string | null {
  if (!isLivePreviewHost(hostname)) return null;
  const token = response.headers.get("set-auth-token");
  if (!token || !storage) return null;
  try {
    storage.setItem(BEARER_KEY, token);
  } catch {
    /* private mode */
    return null;
  }
  return token;
}
