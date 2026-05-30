'use client';

import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { disconnectSocket } from '@/lib/socket';

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function Nav() {
  const { user, clear } = useAuth();
  const router = useRouter();

  return (
    <header className="relative z-10 border-b border-parchment-300 bg-parchment-200/70 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-serif text-xl tracking-tight text-ink-900">
          Omnira
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {/* Lobby link (visible when authed) */}
          {user ? (
            <>
              <Link href="/lobby" className="text-ink-600 hover:text-ink-900">Lobby</Link>
              <Link href="/tournaments" className="text-ink-600 hover:text-ink-900">Tournaments</Link>
              <Link href="/watch" className="text-ink-600 hover:text-ink-900">Watch</Link>
              <Link href="/puzzles" className="text-ink-600 hover:text-ink-900">Puzzles</Link>
              <Link href={`/u/${user.username}`} className="text-ink-600 hover:text-ink-900">{user.username}</Link>
              <span
                className="font-mono text-xs text-ink-400"
                title={user.walletAddress}
              >
                {shortAddr(user.walletAddress)}
              </span>
              <button
                onClick={() => {
                  disconnectSocket();
                  clear();
                  router.push('/login');
                }}
                className="text-ink-600 hover:text-ink-900"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink-600 hover:text-ink-900">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-accent px-3 py-1.5 text-parchment-50 hover:bg-accent-hover"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
