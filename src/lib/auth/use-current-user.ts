import { useEffect, useMemo, useState } from "react";
import { authClient } from "./client";

/** Normalized user shape used across the app. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/**
 * Current user + loading state, from Better Auth's `useSession()`
 * (`/api/auth/get-session`, cookie-backed).
 *
 * Protect a route by waiting out `isPending` before acting on `user`:
 * redirecting on `user: null` alone bounces signed-in visitors to sign-in on
 * every hard reload.
 */
export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  // The server always renders "loading"; the first client render must match
  // it (a session already cached in the browser would otherwise break hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const id = data?.user?.id;
  const name = data?.user?.name ?? null;
  const email = data?.user?.email ?? null;
  const image = data?.user?.image ?? null;
  // One stable object per signed-in identity: effects that depend on `user`
  // must not re-run on every render (they did, and reloaded in a loop).
  const user = useMemo<AppUser | null>(
    () => (id ? { id, displayName: name, primaryEmail: email, profileImageUrl: image } : null),
    [id, name, email, image],
  );
  if (!mounted) return { user: null, isPending: true };
  return { user, isPending };
}

/**
 * Convenience view of `useCurrentUserState().user` for display. NOTE: `null`
 * means *loading OR signed out* — for guards use `useCurrentUserState()`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
