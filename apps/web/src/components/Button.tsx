import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition',
        'shadow-soft disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-accent text-parchment-50 hover:bg-accent-hover',
        variant === 'ghost' &&
          'bg-transparent text-ink-900 border border-parchment-400 hover:bg-parchment-100',
        variant === 'danger' && 'bg-danger text-parchment-50 hover:opacity-90',
        className,
      )}
    />
  );
}
