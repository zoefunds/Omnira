'use client';

import Link from 'next/link';
import { useAuth } from '@/store/auth';

export default function HomePage() {
  const { user } = useAuth();
  return (
    <section className="max-w-2xl">
      <h1 className="font-serif text-5xl tracking-tight text-ink-900">
        Chess, recorded onchain.
      </h1>
      <p className="mt-4 text-ink-600 leading-relaxed">
        Omnira pairs you with players in real time. Every move you make is
        validated by a GenLayer intelligent contract — and your wallet stays
        with you across devices, forever.
      </p>
      <div className="mt-8 flex gap-3">
        {user ? (
          <Link
            href="/play"
            className="rounded-xl bg-accent px-5 py-2.5 text-parchment-50 hover:bg-accent-hover"
          >
            Play
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-xl bg-accent px-5 py-2.5 text-parchment-50 hover:bg-accent-hover"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-parchment-400 px-5 py-2.5 text-ink-900 hover:bg-parchment-100"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
