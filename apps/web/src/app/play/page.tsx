'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';

export default function PlayPage() {
  const router = useRouter();
  const { user, token } = useAuth();

  useEffect(() => {
    if (!user || !token) router.replace('/login');
  }, [user, token, router]);

  if (!user) return null;

  return (
    <section>
      <h1 className="font-serif text-3xl text-ink-900">Play</h1>
      <p className="mt-2 text-ink-600">
        The matchmaking lobby and live board land in the next phase.
      </p>
      <div className="mt-6 rounded-xl border border-parchment-300 bg-parchment-100 p-5 max-w-md">
        <div className="text-sm text-ink-400">Your wallet</div>
        <div className="mt-1 font-mono text-sm text-ink-900 break-all">{user.walletAddress}</div>
        <div className="mt-3 text-xs text-ink-400">
          This address was derived deterministically from your account. It will stay the same
          on any device you log in from.
        </div>
      </div>
    </section>
  );
}
