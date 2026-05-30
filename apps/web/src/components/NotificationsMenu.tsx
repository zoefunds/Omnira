'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Trophy, Swords, Sparkles, CheckCheck } from 'lucide-react';

type Note = {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};

const SEED: Note[] = [
  {
    id: '1',
    icon: <Sparkles size={16} className="text-gold-600" strokeWidth={1.5} />,
    title: 'Welcome to Omnira',
    body: 'Your GenLayer wallet is ready. Play your first rated game to begin.',
    time: 'just now',
    unread: true,
  },
  {
    id: '2',
    icon: <Trophy size={16} className="text-gold-600" strokeWidth={1.5} />,
    title: 'Tournament starting soon',
    body: 'Sunday Blitz arena opens in 1 hour. Click to join the lobby.',
    time: '12m',
    unread: true,
  },
  {
    id: '3',
    icon: <Swords size={16} className="text-gold-600" strokeWidth={1.5} />,
    title: 'Daily puzzle is live',
    body: 'A fresh themed puzzle has been published. Streak: 0.',
    time: '2h',
    unread: false,
  },
];

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>(SEED);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = notes.filter((n) => n.unread).length;

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative text-ink-600 hover:text-ink-900 transition"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-gold-shine text-[10px] text-parchment-50 flex items-center justify-center px-1 shadow-soft">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 rounded-xl border border-parchment-300 bg-parchment-50 shadow-card z-30 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-parchment-300">
            <span className="font-serif text-lg text-ink-900">Notifications</span>
            <button
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-gold-700 hover:text-gold-600"
              onClick={() =>
                setNotes((arr) => arr.map((n) => ({ ...n, unread: false })))
              }
            >
              <CheckCheck size={12} strokeWidth={2} />
              Mark all read
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-parchment-300/70">
            {notes.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink-400 text-center">
                You&apos;re all caught up.
              </li>
            ) : (
              notes.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 flex gap-3 transition hover:bg-parchment-100 ${
                    n.unread ? 'bg-parchment-100/60' : ''
                  }`}
                >
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-parchment-200 border border-parchment-300 flex items-center justify-center shrink-0">
                    {n.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900 truncate">
                        {n.title}
                      </span>
                      {n.unread && (
                        <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                      )}
                    </div>
                    <p className="text-xs text-ink-600 leading-snug line-clamp-2">
                      {n.body}
                    </p>
                    <div className="text-[10px] text-ink-400 mt-0.5">{n.time}</div>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="px-4 py-2 border-t border-parchment-300 bg-parchment-100/50 text-center">
            <button className="text-xs uppercase tracking-wider text-gold-700 hover:text-gold-600">
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
