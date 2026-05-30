'use client';

import { useSettings } from '@/store/settings';

interface Props {
  userId: string;
  username: string;
  size?: number;
  className?: string;
}

export function UserAvatar({ userId, username, size = 36, className = '' }: Props) {
  const avatar = useSettings((s) => s.avatars[userId]);
  const letter = (username?.[0] ?? '?').toUpperCase();

  if (avatar) {
    return (
      <img
        src={avatar}
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
