'use client';

import type { ApiAlternative } from '@/store/alternatives';

function fmtEval(cp: number | null, mate: number | null) {
  if (mate != null) return `#${mate}`;
  if (cp == null) return '·';
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

export function AlternativeResult({ alt }: { alt: ApiAlternative }) {
  if (alt.status === 'PENDING') {
    return (
      <div className="text-xs text-ink-400 flex items-center gap-2 mt-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        Running engine on alternative {alt.alternativeUci}…
      </div>
    );
  }
  if (alt.status === 'FAILED') {
    return (
      <div className="text-xs text-danger mt-2">
        Alternative {alt.alternativeUci} failed: {alt.errorMessage}
      </div>
    );
  }

  const delta = alt.cpDelta;
  const verdict =
    delta == null ? 'comparable'
    : delta >= 100 ? 'much better'
    : delta >= 30 ? 'better'
    : delta <= -100 ? 'much worse'
    : delta <= -30 ? 'worse'
    : 'roughly the same';
  const cls = delta == null ? 'text-ink-400'
    : delta >= 100 ? 'text-accent'
    : delta >= 30 ? 'text-accent'
    : delta <= -100 ? 'text-danger'
    : delta <= -30 ? 'text-danger'
    : 'text-ink-600';

  return (
    <div className="rounded-lg border border-parchment-300 bg-parchment-100 p-2.5 mt-2 text-xs">
      <div className="font-mono">
        <span className="text-ink-900">{alt.alternativeSan || alt.alternativeUci}</span>
        <span className="text-ink-400 mx-2">vs played</span>
        <span className="text-ink-900">{alt.playedSan}</span>
      </div>
      <div className="mt-1 text-ink-600">
        played: <span className="text-ink-900 font-mono">{fmtEval(alt.playedEvalCp, alt.playedEvalMate)}</span>
        <span className="mx-2 text-ink-400">·</span>
        alt: <span className="text-ink-900 font-mono">{fmtEval(alt.altEvalCp, alt.altEvalMate)}</span>
      </div>
      <div className={`mt-1 ${cls}`}>
        {delta != null && <span className="font-mono mr-1.5">{delta > 0 ? '+' : ''}{(delta / 100).toFixed(2)}</span>}
        the alternative was {verdict}
      </div>
    </div>
  );
}
