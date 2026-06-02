'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface Props {
  /** Full hash (or address, or any string the user might want to copy). */
  value: string;
  /** Optional explorer URL — render as a small external-link icon if provided. */
  explorerUrl?: string;
  /** Optional override of the visible label. Default truncates the middle. */
  display?: string;
  /** Visual variant. */
  variant?: 'inline' | 'pill';
  className?: string;
}

function truncate(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * Copyable transaction-hash / address chip. Click anywhere on it to copy the
 * full value; an "ExternalLink" icon opens a block explorer if provided.
 *
 *   <CopyTxHash value={tx} />
 *   <CopyTxHash value={addr} explorerUrl={`https://.../address/${addr}`} />
 */
export function CopyTxHash({
  value,
  explorerUrl,
  display,
  variant = 'inline',
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const visible = display ?? truncate(value);

  const base =
    variant === 'pill'
      ? 'inline-flex items-center gap-1.5 rounded-md border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-mono text-ink-900 hover:border-gold-300 transition'
      : 'inline-flex items-center gap-1.5 font-mono text-ink-900 hover:text-gold-700 transition';

  return (
    <span className={`${base} ${className}`}>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        title={value}
        className="inline-flex items-center gap-1.5"
      >
        <span>{visible}</span>
        {copied ? (
          <Check size={12} strokeWidth={2} className="text-gold-600" />
        ) : (
          <Copy size={12} strokeWidth={1.5} className="text-ink-400" />
        )}
      </button>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-400 hover:text-gold-700 transition"
          aria-label="Open in explorer"
          title="Open in block explorer"
        >
          <ExternalLink size={12} strokeWidth={1.5} />
        </a>
      )}
    </span>
  );
}
