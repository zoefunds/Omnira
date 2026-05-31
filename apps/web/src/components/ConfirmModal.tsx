'use client';

import { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'gold';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmBtn =
    variant === 'danger'
      ? 'bg-danger text-parchment-50 hover:opacity-90'
      : 'bg-gold-shine text-parchment-50 hover:opacity-90';

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-parchment-50 border border-parchment-300 rounded-xl shadow-card w-full max-w-sm relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-400 hover:text-ink-900 transition"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                variant === 'danger' ? 'bg-danger/10 text-danger' : 'bg-gold-shine text-parchment-50'
              }`}
            >
              <AlertTriangle size={18} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-xl text-ink-900">{title}</h2>
              {body && (
                <p className="mt-1 text-sm text-ink-600 leading-relaxed">
                  {body}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`rounded-md px-5 py-2 text-sm font-medium uppercase tracking-wide shadow-soft transition ${confirmBtn}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
