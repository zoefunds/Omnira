import type { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
}

export function Field({ label, error, className, id, ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-600 mb-1">{label}</span>
      <input
        id={inputId}
        {...rest}
        className={clsx(
          'w-full rounded-xl bg-parchment-100 border border-parchment-300',
          'px-3 py-2 text-ink-900 outline-none transition',
          'focus:border-accent focus:bg-parchment-50',
          error && 'border-danger focus:border-danger',
          className,
        )}
      />
      {error && <span className="block text-xs text-danger mt-1">{error}</span>}
    </label>
  );
}
