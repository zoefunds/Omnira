'use client';

interface Props {
  points: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ points, width = 120, height = 28 }: Props) {
  if (points.length < 2) {
    return <div className="text-[10px] text-ink-400">no history</div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const delta = last - first;
  const cls = delta >= 0 ? 'stroke-accent' : 'stroke-danger';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" strokeWidth={1.5} className={cls} />
    </svg>
  );
}
