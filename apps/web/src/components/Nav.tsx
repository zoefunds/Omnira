'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { useRouter, usePathname } from 'next/navigation';
import { disconnectSocket } from '@/lib/socket';
import { Settings, Crown, Menu, X } from 'lucide-react';
import { NotificationsMenu } from '@/components/NotificationsMenu';
import { useSettings } from '@/store/settings';
import { UserAvatar } from '@/components/UserAvatar';

export function Nav() {
  const { user, clear } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useSettings((s) => s.t);
  const [mobileOpen, setMobileOpen] = useState(false);

  const AUTHED_LINKS = [
    { href: '/lobby',       label: t('navPlay') },
    { href: '/puzzles',     label: t('navPuzzles') },
    { href: '/tournaments', label: t('navTournaments') },
    { href: '/watch',       label: t('navWatch') },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileOpen]);

  function signOut() {
    disconnectSocket();
    clear();
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-20 border-b border-parchment-300 bg-parchment-200/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <Crown
            size={20}
            className="text-gold-600 group-hover:text-gold-500 transition"
            strokeWidth={1.5}
          />
          <span className="font-serif text-xl sm:text-2xl tracking-tight text-ink-900 leading-none">
            Omnira
          </span>
        </Link>

        {/* Center nav — desktop only */}
        {user && (
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm">
            {AUTHED_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`relative transition ${
                  isActive(l.href)
                    ? 'text-gold-600 font-medium'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                {l.label}
                {isActive(l.href) && (
                  <span className="absolute -bottom-[22px] left-0 right-0 h-[2px] bg-gold-500" />
                )}
              </Link>
            ))}
          </nav>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <>
              <NotificationsMenu />
              <Link
                href="/settings"
                aria-label="Settings"
                className={`hidden sm:inline-block transition ${
                  isActive('/settings')
                    ? 'text-gold-600'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                <Settings size={18} strokeWidth={1.5} />
              </Link>
              <Link
                href={`/u/${user.username}`}
                className="hidden md:block group"
                title={user.walletAddress}
              >
                <UserAvatar
                  userId={user.id}
                  username={user.username}
                  size={36}
                />
              </Link>
              <button
                onClick={signOut}
                className="hidden lg:inline text-sm text-ink-400 hover:text-ink-900 transition"
              >
                {t('navSignOut')}
              </button>

              {/* Mobile hamburger */}
              <button
                aria-label="Menu"
                onClick={() => setMobileOpen((v) => !v)}
                className="md:hidden text-ink-600 hover:text-ink-900 transition"
              >
                {mobileOpen ? (
                  <X size={22} strokeWidth={1.5} />
                ) : (
                  <Menu size={22} strokeWidth={1.5} />
                )}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-ink-600 hover:text-ink-900 transition"
              >
                {t('navSignIn')}
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-gold-shine px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-parchment-50 shadow-soft hover:opacity-90 transition"
              >
                {t('navJoinNow')}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ─────────── Mobile drawer ─────────── */}
      {user && mobileOpen && (
        <div
          className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-parchment-200 border-t border-parchment-300 overflow-y-auto animate-in fade-in slide-in-from-top-2"
          onClick={() => setMobileOpen(false)}
        >
          {/* Subtle paper texture so it doesn't look like a flat sheet */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(rgba(0,0,0,0.015) 1px, transparent 1px) 0 0 / 3px 3px',
            }}
          />
          <div
            className="relative px-4 py-6 max-w-md mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Profile chip */}
            <Link
              href={`/u/${user.username}`}
              className="flex items-center gap-3 rounded-xl border border-parchment-300 bg-parchment-50 p-3 shadow-soft hover:border-gold-300 transition"
            >
              <UserAvatar
                userId={user.id}
                username={user.username}
                size={44}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-900 truncate">
                  {user.username}
                </div>
                <div className="text-[11px] text-ink-400 font-mono truncate">
                  {user.walletAddress.slice(0, 10)}…
                </div>
              </div>
            </Link>

            {/* Nav links */}
            <nav className="mt-6 flex flex-col">
              {AUTHED_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-3 rounded-md text-base transition ${
                    isActive(l.href)
                      ? 'bg-gold-shine text-parchment-50 shadow-soft'
                      : 'text-ink-900 hover:bg-parchment-300/60'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/settings"
                className={`px-3 py-3 rounded-md text-base inline-flex items-center gap-2 transition ${
                  isActive('/settings')
                    ? 'bg-gold-shine text-parchment-50 shadow-soft'
                    : 'text-ink-900 hover:bg-parchment-300/60'
                }`}
              >
                <Settings size={16} strokeWidth={1.5} />
                Settings
              </Link>
            </nav>

            <button
              onClick={signOut}
              className="mt-6 w-full rounded-md border border-danger/40 py-3 text-sm text-danger hover:bg-danger hover:text-parchment-50 transition"
            >
              {t('navSignOut')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
