'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api, ApiError } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

/** Re-validate at most this often. */
const REVALIDATE_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Runs once per page load after the auth store rehydrates from localStorage.
 * Calls /auth/me with the stored token. If the user no longer exists or the
 * token is invalid, wipes the local session and bounces the user to /login.
 *
 * This handles the case where the DB was wiped or the user was deleted but
 * the browser still has a stale JWT + user record cached.
 */
export function AuthGuard() {
  const { token, user, hydrated, clear } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const lastValidatedAt = useRef(0);
  const inFlight = useRef(false);

  const handleExpired = useCallback(() => {
    disconnectSocket();
    clear();
    const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset'];
    if (!publicPages.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [clear, pathname, router]);

  const revalidate = useCallback(async () => {
    if (inFlight.current) return;
    const { token: t, user: u, hydrated: h } = useAuth.getState();
    if (!h || !t || !u) return;
    if (Date.now() - lastValidatedAt.current < REVALIDATE_INTERVAL_MS) return;
    inFlight.current = true;
    try {
      const res = await api.me(t);
      useAuth.setState({ user: res.user });
      lastValidatedAt.current = Date.now();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
        handleExpired();
      }
    } finally {
      inFlight.current = false;
    }
  }, [handleExpired]);

  // Initial revalidation when hydration completes.
  useEffect(() => {
    if (hydrated && token && user) void revalidate();
  }, [hydrated, token, user, revalidate]);

  // Revalidate every time the tab regains focus or visibility, and on a
  // 5-minute interval. The internal `lastValidatedAt` clamp coalesces these
  // so we never hammer /auth/me more than once per REVALIDATE_INTERVAL_MS.
  useEffect(() => {
    const onFocus = () => { void revalidate(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const id = setInterval(() => { void revalidate(); }, REVALIDATE_INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(id);
    };
  }, [revalidate]);

  // Listen for global session-expired event from api.request auto-refresh.
  useEffect(() => {
    const onExpired = () => handleExpired();
    window.addEventListener('omnira:session-expired', onExpired);
    return () => window.removeEventListener('omnira:session-expired', onExpired);
  }, [handleExpired]);

  return null;
}
