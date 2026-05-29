'use client';

import { useState } from 'react';
import type { LlmReport, PhaseAssessment, TurningPoint } from '@/store/analysis';
import { useAlternatives, type ApiAlternative } from '@/store/alternatives';

const ALT_EMPTY: ApiAlternative[] = [];
import { AlternativeForm } from './AlternativeForm';
import { AlternativeResult } from './AlternativeResult';
import { useMatch } from '@/store/match';

function PhaseCard({
  title,
  data,
}: {
  title: string;
  data: PhaseAssessment | undefined;
}) {
  if (!data || (!data.assessment && !data.name && !data.type && !data.structure && !data.plans)) {
    return null;
  }
  return (
    <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{title}</div>
      {data.name && (
        <div className="font-serif text-sm text-ink-900 mt-0.5">
          {data.name}{data.eco && <span className="ml-1 font-mono text-ink-400 text-xs">({data.eco})</span>}
        </div>
      )}
      {data.type && (
        <div className="font-serif text-sm text-ink-900 mt-0.5">{data.type}</div>
      )}
      {data.structure && (
        <div className="text-xs text-ink-600 mt-1">{data.structure}</div>
      )}
      {data.plans && (
        <div className="text-xs text-ink-600 mt-1">{data.plans}</div>
      )}
      {data.assessment && (
        <div className="text-sm text-ink-900 mt-1.5 leading-snug">{data.assessment}</div>
      )}
    </div>
  );
}

function TurningPointCard({ tp, fenBefore }: { tp: TurningPoint; fenBefore: string }) {
  const whiteMove = tp.ply % 2 === 1;
  const [open, setOpen] = useState(false);
  const matchId = useMatch((s) => s.matchId);
  const alts = useAlternatives((s) => (matchId ? s.byMatch[matchId] ?? ALT_EMPTY : ALT_EMPTY))
    .filter((a) => a.ply === tp.ply);
  return (
    <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-400">
          ply {tp.ply} · {whiteMove ? 'white' : 'black'}
        </span>
        {tp.tactical_motif && (
          <span className="text-[10px] uppercase tracking-wider text-accent border border-accent/40 rounded-full px-2 py-0.5">
            {tp.tactical_motif}
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-sm">
        <span className="text-ink-900">{tp.san}</span>
        <span className="text-ink-400 mx-2">→ better:</span>
        <span className="text-accent">{tp.best_san}</span>
      </div>
      <p className="text-sm text-ink-900 mt-1.5 leading-snug">{tp.what_happened}</p>

      {matchId && !open && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          Try a different move →
        </button>
      )}
      {matchId && open && (
        <AlternativeForm
          matchId={matchId}
          ply={tp.ply}
          fenBefore={fenBefore}
          playedSan={tp.san}
          onClose={() => setOpen(false)}
        />
      )}
      {alts.map((a) => (
        <AlternativeResult key={a.id} alt={a} />
      ))}
    </div>
  );
}

function ThemePills({ themes }: { themes: string[] | undefined }) {
  if (!themes || themes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {themes.map((t) => (
        <span
          key={t}
          className="text-[11px] rounded-full bg-parchment-200 border border-parchment-300 px-2 py-0.5 text-ink-600"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function AdviceCards({ advice }: { advice: { white?: string; black?: string } | undefined }) {
  if (!advice || (!advice.white && !advice.black)) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {advice.white && (
        <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">Advice · White</div>
          <p className="text-sm text-ink-900 leading-snug">{advice.white}</p>
        </div>
      )}
      {advice.black && (
        <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">Advice · Black</div>
          <p className="text-sm text-ink-900 leading-snug">{advice.black}</p>
        </div>
      )}
    </div>
  );
}

export function CoachNotes({ report, summary, fenByPly }: { report: LlmReport; summary: string | null; fenByPly: Record<number, string> }) {
  // If the model gave us nothing parseable, fall back to raw text.
  const hasStructured = !!(report.summary || report.opening || report.middlegame || report.turning_points || report.advice);
  if (!hasStructured && !summary && !report.raw) return null;

  return (
    <div className="flex flex-col gap-3">
      {(report.summary || summary) && (
        <div className="rounded-xl border border-accent/30 bg-parchment-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-accent mb-1">Coach's notes</div>
          <p className="text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
            {report.summary ?? summary}
          </p>
        </div>
      )}

      {(report.opening || report.middlegame || report.endgame) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <PhaseCard title="Opening" data={report.opening} />
          <PhaseCard title="Middlegame" data={report.middlegame} />
          <PhaseCard title="Endgame" data={report.endgame} />
        </div>
      )}

      {report.turning_points && report.turning_points.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-400">Turning points</div>
          {report.turning_points.map((tp, i) => <TurningPointCard key={`${tp.ply}-${i}`} tp={tp} fenBefore={fenByPly[tp.ply] ?? ''} />)}
        </div>
      )}

      {report.themes && report.themes.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">Themes</div>
          <ThemePills themes={report.themes} />
        </div>
      )}

      <AdviceCards advice={report.advice} />

      {!hasStructured && report.raw && (
        <pre className="text-xs text-ink-600 whitespace-pre-wrap bg-parchment-50 border border-parchment-300 rounded-xl p-3">
          {report.raw.slice(0, 1500)}
        </pre>
      )}
    </div>
  );
}
