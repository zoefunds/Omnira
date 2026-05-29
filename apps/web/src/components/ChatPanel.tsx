'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { API_BASE } from '@/lib/config';
import { useAuth } from '@/store/auth';
import Link from 'next/link';
import { useChat, type ChatItem } from '@/store/chat';

const EMPTY: ChatItem[] = [];

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface Props {
  matchId: string;
  socket: Socket;
}

export function ChatPanel({ matchId, socket }: Props) {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const items = useChat((s) => s.byMatch[matchId] ?? EMPTY);
  const setHistory = useChat((s) => s.setHistory);
  const append = useChat((s) => s.append);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load history once per match
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(`${API_BASE}/match/${matchId}/chat`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j: { messages: ChatItem[] }) => {
        if (alive) setHistory(matchId, j.messages);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [matchId, token, setHistory]);

  // Subscribe to incoming
  useEffect(() => {
    const onMsg = (m: ChatItem) => {
      if (m.matchId === matchId) append(m);
    };
    socket.on('chat:message', onMsg);
    return () => { socket.off('chat:message', onMsg); };
  }, [socket, matchId, append]);

  // Auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setErr(null);
    socket.emit('chat:send', { matchId, body }, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) setErr(ack.error ?? 'failed');
      else setDraft('');
    });
  }

  return (
    <div className="flex flex-col h-72">
      <div ref={listRef} className="flex-1 overflow-y-auto px-1 space-y-1">
        {items.length === 0 && (
          <div className="text-xs text-ink-400 p-2">Say hi 👋</div>
        )}
        {items.map((m) => {
          const mine = m.senderId === user?.id;
          return (
            <div key={m.id} className="text-sm leading-snug">
              <div className="flex items-baseline gap-2">
                <Link href={m.senderUsername ? `/u/${m.senderUsername}` : '#'}
                  className={`font-medium hover:underline ${mine ? 'text-accent' : 'text-ink-900'}`}>
                  {m.senderUsername ?? 'anon'}
                </Link>
                <span className="text-[10px] text-ink-400">{fmtTime(m.createdAt)}</span>
              </div>
              <div className="text-ink-900 break-words">{m.body}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={500}
          placeholder="Type a message…"
          className="flex-1 rounded-xl bg-parchment-50 border border-parchment-300 px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="rounded-xl bg-accent text-parchment-50 text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-accent-hover"
        >
          Send
        </button>
      </div>
      {err && <p className="text-xs text-danger mt-1">{err}</p>}
    </div>
  );
}
