import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions — the standard way to get the caller's
 * verified user id. The session cookie is same-origin and rides along with
 * every server-function request automatically.
 *
 *   export const listTodos = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => { ... context.userId ... });
 *
 * Signed out -> throws `UnauthorizedError` (see `verify.server.ts`). Use it on
 * every server function that touches per-user data and scope every query by
 * `context.userId`.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // ONLY import `*.server` modules here: this file is bundled for the client
  // too, and `@tanstack/react-start/server` must never reach the browser.
  const { assertSameSiteRequest } = await import("./isolation.server");
  const { requireUserId } = await import("./verify.server");
  // Reject scripted cross-site requests before touching per-user data.
  assertSameSiteRequest();
  const userId = await requireUserId();
  return next({ context: { userId } });
});
