import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client for the browser. Talks to this app's own Better Auth at
 * same-origin `/api/auth/*`; the HttpOnly session cookie carries the session.
 */
export const authClient = createAuthClient();

/**
 * Sign out of this app's session, then navigate. Rejects when the server does
 * not confirm (the session is an HttpOnly cookie only the server can clear),
 * so a control can re-enable itself and let the visitor retry.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = redirectTo;
}
