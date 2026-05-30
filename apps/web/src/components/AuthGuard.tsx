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
  const { token, user, hydrated, clear, setSession } = useAuth();
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
        // Refresh the user record in case username/email changed.
        setSession({ token, user: res.user });
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
          disconnectSocket();
          clear();
          // If they're already on a public page, no need to redirect.
          const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset'];
          if (!publicPages.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
            router.replace('/login');
          }
        }
      }
    })();
  }, [hydrated, token, user, clear, setSession, router, pathname]);

  return null;
}
