'use client';

import { useSettings } from '@/store/settings';
import { useAuth } from '@/store/auth';

interface Props {
  userId: string;
  username: string;
  /** Server-provided avatar (preferred). */
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ userId, username, avatarUrl, size = 36, className = '' }: Props) {
  // Prefer signed-in user's own server avatar (always fresh after upload).
  const me = useAuth((s) => s.user);
  const meIsThis = me?.id === userId;
  // Legacy localStorage avatar — used as fallback for users who set one
  // before server-side avatars existed.
  const localAvatar = useSettings((s) => s.avatars[userId]);
  const finalUrl =
    (meIsThis ? me?.avatarUrl : null) ?? avatarUrl ?? localAvatar ?? null;

  const letter = (username?.[0] ?? '?').toUpperCase();

  if (finalUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={finalUrl}
        alt={username}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover ring-1 ring-gold-700/30 shadow-soft ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={`rounded-full bg-gold-shine flex items-center justify-center text-parchment-50 font-serif shadow-soft ring-1 ring-gold-700/30 ${className}`}
    >
      {letter}
    </div>
  );
}
