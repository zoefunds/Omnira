'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Trophy,
  BarChart3,
  History,
  Users,
} from 'lucide-react';
import { useAuth } from '@/store/auth';

const SECTIONS = [
  { href: '/lobby',       label: 'Lobby',       icon: LayoutGrid },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/watch',       label: 'Analysis',    icon: BarChart3 },
  { href: '/puzzles',     label: 'Puzzles',     icon: History },
];

export function PlaySidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  return (
    <aside className="hidden lg:block w-60 shrink-0 border-r border-parchment-300 bg-parchment-100/40 min-h-[calc(100vh-64px)] sticky top-16 self-start">
      <div className="p-5">
        <div className="text-sm font-medium flex items-center gap-2 text-ink-900">
          <span className="h-2 w-2 rounded-full bg-success" />
          Member Lounge
        </div>
        {user && (
          <p className="mt-1 text-xs text-ink-400">
            Rating:{' '}
            <span className="text-ink-600 font-medium">1500</span>
          </p>
        )}
      </div>

      <nav className="px-3 space-y-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = isActive(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                active
                  ? 'bg-gold-shine text-parchment-50 shadow-soft'
                  : 'text-ink-600 hover:bg-parchment-200/70 hover:text-ink-900'
              }`}
            >
              <Icon size={16} strokeWidth={1.5} />
              {s.label}
            </Link>
          );
        })}
        <Link
          href={user ? `/u/${user.username}` : '/login'}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-600 hover:bg-parchment-200/70 hover:text-ink-900 transition"
        >
          <Users size={16} strokeWidth={1.5} />
          Profile
        </Link>
      </nav>

      {/* Bottom CTA */}
      <div className="p-5 mt-6">
        <Link
          href="/lobby"
          className="block w-full text-center rounded-md bg-gold-shine py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
        >
          New Game
        </Link>
      </div>
    </aside>
  );
}
