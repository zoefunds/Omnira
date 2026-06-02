'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  Trophy,
  Swords,
  Sparkles,
  GraduationCap,
  Megaphone,
  Users,
} from 'lucide-react';
import { api, type ApiNotification } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useSocket } from '@/hooks/useSocket';

const ICON: Record<ApiNotification['kind'], React.ReactNode> = {
  WELCOME: <Sparkles size={16} className="text-gold-600" strokeWidth={1.5} />,
  MATCH_INVITE: <Swords size={16} className="text-gold-600" strokeWidth={1.5} />,
  TOURNAMENT_STARTING: <Trophy size={16} className="text-gold-600" strokeWidth={1.5} />,
  DAILY_PUZZLE: <Sparkles size={16} className="text-gold-600" strokeWidth={1.5} />,
  ANALYSIS_READY: <GraduationCap size={16} className="text-gold-600" strokeWidth={1.5} />,
  FRIEND_ACTIVITY: <Users size={16} className="text-gold-600" strokeWidth={1.5} />,
  ANNOUNCEMENT: <Megaphone size={16} className="text-gold-600" strokeWidth={1.5} />,
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function NotificationsMenu() {
  const token = useAuth((s) => s.token);
  const socket = useSocket(token);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Outside click closes.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Live push: server emits 'notification:new' whenever notify() runs.
  // Backstop with a low-frequency poll (5 min) in case a socket reconnect
  // missed an event.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await api.listNotifications(token);
        if (!cancelled) {
          setNotes(r.items);
          setUnread(r.unread);
        }
      } catch {
        /* ignore */
      }
    };
    void pull();
    const id = setInterval(pull, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  // Server push: merge new notifications into the list as they arrive.
  useEffect(() => {
    if (!socket) return;
    const onNew = (n: ApiNotification) => {
      setNotes((arr) => (arr.some((x) => x.id === n.id) ? arr : [n, ...arr].slice(0, 30)));
      setUnread((u) => u + 1);
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket]);

  useEffect(() => {
    if (!open || !token) return;
    void (async () => {
      try {
        const r = await api.listNotifications(token);
        setNotes(r.items);
        setUnread(r.unread);
      } catch {
        /* ignore */
      }
    })();
  }, [open, token]);

  async function markAllRead() {
    if (!token) return;
    setNotes((arr) =>
      arr.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
    try {
      await api.markNotificationsRead({ all: true }, token);
    } catch {
      /* swallow; UI is optimistic */
    }
  }

  async function clickNote(n: ApiNotification) {
    if (!token) return;
    if (!n.readAt) {
      setNotes((arr) =>
        arr.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.markNotificationsRead({ ids: [n.id] }, token);
      } catch {
        /* ignore */
      }
    }
    if (n.href) setOpen(false);
  }

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
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-auto sm:mt-3 sm:w-80 rounded-xl border border-parchment-300 bg-parchment-50 shadow-card z-30 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-parchment-300">
            <span className="font-serif text-lg text-ink-900">Notifications</span>
            <button
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-gold-700 hover:text-gold-600 disabled:opacity-40"
              onClick={markAllRead}
              disabled={unread === 0}
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
              notes.map((n) => {
                const inner = (
                  <div className="flex gap-3 px-4 py-3">
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-parchment-200 border border-parchment-300 flex items-center justify-center shrink-0">
                      {ICON[n.kind]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-900 truncate">
                          {n.title}
                        </span>
                        {!n.readAt && (
                          <span className="h-1.5 w-1.5 rounded-full bg-gold-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-ink-600 leading-snug line-clamp-2">
                        {n.body}
                      </p>
                      <div className="text-[10px] text-ink-400 mt-0.5">
                        {relativeTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li
                    key={n.id}
                    className={`transition hover:bg-parchment-100 ${
                      !n.readAt ? 'bg-parchment-100/60' : ''
                    }`}
                  >
                    {n.href ? (
                      <Link href={n.href} onClick={() => void clickNote(n)}>
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void clickNote(n)}
                        className="w-full text-left"
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
