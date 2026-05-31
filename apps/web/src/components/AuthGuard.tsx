'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api, ApiError } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

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
  const ran = useRef(false);

  useEffect(() => {
    if (!hydrated || ran.current) return;
    if (!token || !user) return;
    ran.current = true;

    (async () => {
      try {
        const res = await api.me(token);
        useAuth.setState({ user: res.user });
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
          handleExpired();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user]);

  function handleExpired() {
    disconnectSocket();
    clear();
    const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset'];
    if (!publicPages.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }

  // Listen for global session-expired event from api.request auto-refresh.
  useEffect(() => {
    const onExpired = () => handleExpired();
    window.addEventListener('omnira:session-expired', onExpired);
    return () => window.removeEventListener('omnira:session-expired', onExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
