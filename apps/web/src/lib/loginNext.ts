'use client';

/** Build a /login URL that preserves the user's destination. */
export function loginHref(pathname: string | null): string {
  if (!pathname || pathname === '/login' || pathname === '/signup') return '/login';
  return `/login?next=${encodeURIComponent(pathname)}`;
}
