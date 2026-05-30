'use client';

import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { useRouter, usePathname } from 'next/navigation';
import { disconnectSocket } from '@/lib/socket';
import { Settings, Crown } from 'lucide-react';
import { NotificationsMenu } from '@/components/NotificationsMenu';

const AUTHED_LINKS = [
  { href: '/lobby', label: 'Play' },
  { href: '/puzzles', label: 'Puzzles' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/watch', label: 'Watch' },
];

export function Nav() {
  const { user, clear } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  return (
    <header className="sticky top-0 z-20 border-b border-parchment-300 bg-parchment-200/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group">
          <Crown
            size={20}
            className="text-gold-600 group-hover:text-gold-500 transition"
            strokeWidth={1.5}
          />
          <span className="font-serif text-2xl tracking-tight text-ink-900 leading-none">
            Omnira
          </span>
        </Link>

        {/* Center nav */}
        {user && (
          <nav className="hidden md:flex items-center gap-8 text-sm">
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
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <NotificationsMenu />
              <Link
                href="/settings"
                aria-label="Settings"
                className={`transition ${
                  isActive('/settings')
                    ? 'text-gold-600'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                <Settings size={18} strokeWidth={1.5} />
              </Link>
              <Link
                href={`/u/${user.username}`}
                className="flex items-center gap-2 group"
                title={user.walletAddress}
              >
                <div className="h-9 w-9 rounded-full bg-gold-shine flex items-center justify-center text-parchment-50 font-serif text-sm shadow-soft ring-1 ring-gold-700/30">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
              </Link>
              <button
                onClick={() => {
                  disconnectSocket();
                  clear();
                  router.push('/login');
                }}
                className="hidden sm:inline text-sm text-ink-400 hover:text-ink-900 transition"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-ink-600 hover:text-ink-900 transition"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-gold-shine px-4 py-2 text-sm font-medium text-parchment-50 shadow-soft hover:opacity-90 transition"
              >
                Join Now
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
