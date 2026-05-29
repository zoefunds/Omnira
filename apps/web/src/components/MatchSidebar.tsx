'use client';

import { Button } from './Button';
import { useMatch } from '@/store/match';
import type { Socket } from 'socket.io-client';

interface Props {
  socket: Socket;
}

export function MatchSidebar({ socket }: Props) {
  const { matchId, history, myColor, drawOfferFrom, ended } = useMatch();

  if (!matchId) return null;

  function resign() {
    if (confirm('Resign this game?')) socket.emit('match:resign', { matchId });
  }
  function offerDraw() {
    socket.emit('match:offerDraw', { matchId });
  }
  function acceptDraw() {
    socket.emit('match:acceptDraw', { matchId });
  }

  // pair the half-moves into full moves: 1. e4 e5, 2. Nf3 Nc6, ...
  const rows: Array<{ n: number; w?: string; b?: string }> = [];
  for (const item of history) {
    const n = Math.ceil(item.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || row.n !== n) {
      row = { n };
      rows.push(row);
    }
    if (item.ply % 2 === 1) row.w = item.san;
    else row.b = item.san;
  }

  const drawFromOpponent = drawOfferFrom && drawOfferFrom !== myColor;

  return (
    <aside className="w-full lg:w-72 rounded-xl border border-parchment-300 bg-parchment-100 p-4 flex flex-col gap-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-400">Moves</div>
        <ol className="mt-2 max-h-72 overflow-y-auto font-mono text-sm text-ink-900 space-y-0.5">
          {rows.length === 0 && <li className="text-ink-400">—</li>}
          {rows.map((r) => (
            <li key={r.n} className="flex gap-3">
              <span className="w-6 text-right text-ink-400">{r.n}.</span>
              <span className="w-14">{r.w ?? ''}</span>
              <span className="w-14">{r.b ?? ''}</span>
            </li>
          ))}
        </ol>
      </div>

      {!ended && (
        <div className="flex flex-col gap-2">
          {drawFromOpponent && (
            <div className="rounded-lg border border-accent/40 bg-parchment-50 p-3 text-sm">
              <div className="text-ink-600">Opponent offers a draw</div>
              <div className="mt-2 flex gap-2">
                <Button onClick={acceptDraw}>Accept</Button>
                <Button variant="ghost" onClick={() => useMatch.setState({ drawOfferFrom: null })}>
                  Decline
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={offerDraw} className="flex-1">
              Offer draw
            </Button>
            <Button variant="danger" onClick={resign} className="flex-1">
              Resign
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
