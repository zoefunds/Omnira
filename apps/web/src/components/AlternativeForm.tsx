'use client';

import { useState, useMemo } from 'react';
import { Chess } from 'chess.js';
import { API_BASE } from '@/lib/config';
import { useAuth } from '@/store/auth';
import { useAlternatives } from '@/store/alternatives';
import { Button } from './Button';

interface Props {
  matchId: string;
  ply: number;
  fenBefore: string;
  /** Already-played move at this ply, e.g. "Nf3" */
  playedSan: string;
  onClose: () => void;
}

/** Convert a SAN string to UCI, validating against the given FEN. Returns null if illegal. */
function sanToUci(fen: string, san: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move(san);
    if (!m) return null;
    return `${m.from}${m.to}${m.promotion ?? ''}`;
  } catch {
    return null;
  }
}

/** Convert a UCI string to UCI (validating). */
function uciValidate(fen: string, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length === 5 ? uci[4] : undefined;
    const m = c.move({ from, to, promotion });
    return m ? uci : null;
  } catch {
    return null;
  }
}

export function AlternativeForm({ matchId, ply, fenBefore, playedSan, onClose }: Props) {
  const token = useAuth((s) => s.token);
  const upsert = useAlternatives((s) => s.upsert);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live preview of legal hits
  const legal = useMemo(() => {
    try {
      const c = new Chess(fenBefore);
      const moves = c.moves({ verbose: true }) as Array<{ san: string; from: string; to: string; promotion?: string }>;
      return moves.map((m) => ({ san: m.san, uci: `${m.from}${m.to}${m.promotion ?? ''}` }));
    } catch {
      return [];
    }
  }, [fenBefore]);

  const candidate = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // First try UCI, then SAN.
    return uciValidate(fenBefore, trimmed) ?? sanToUci(fenBefore, trimmed);
  }, [input, fenBefore]);

  async function submit() {
    if (!token || !candidate) { setErr('illegal or unparsable move'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_BASE}/match/${matchId}/alternatives`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ply, alternativeUci: candidate }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j?.error ?? 'failed'); return; }
      upsert(j.alternative);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-parchment-50 p-3 mt-2">
      <div className="text-[10px] uppercase tracking-wider text-accent mb-1">
        Try a different move at ply {ply} (you played {playedSan})
      </div>
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="e.g. Nxd5  or  g1f3"
        className="w-full rounded-xl bg-parchment-100 border border-parchment-300 px-3 py-1.5 text-sm font-mono outline-none focus:border-accent"
      />
      <div className="mt-1 text-[11px] text-ink-400">
        {candidate ? <span>parsed as <span className="font-mono text-ink-900">{candidate}</span></span> : <span>{legal.length} legal moves available</span>}
      </div>
      {err && <div className="text-[11px] text-danger mt-1">{err}</div>}
      <div className="mt-2 flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !candidate}>{busy ? 'Sending…' : 'Run'}</Button>
      </div>
    </div>
  );
}
