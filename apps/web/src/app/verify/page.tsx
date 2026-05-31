'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Crown, CheckCircle2, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

export default function VerifyRoute() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPage />
    </Suspense>
  );
}

function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMsg('Missing verification token.');
      return;
    }
    void (async () => {
      try {
        await api.verifyEmail({ token });
        // Refresh the local user record if we know the user.
        const t = useAuth.getState().token;
        if (t) {
          try {
            const me = await api.me(t);
            useAuth.setState({ user: me.user });
          } catch {
            /* ignore */
          }
        }
        setState('success');
        setTimeout(() => router.push('/lobby'), 2200);
      } catch (e) {
        setState('error');
        if (e instanceof ApiError && e.code === 'INVALID_TOKEN') {
          setErrorMsg('This link is invalid or has expired. Request a new one from Settings.');
        } else {
          setErrorMsg('Could not verify. Please try again.');
        }
      }
    })();
  }, [token, router]);

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="inline-flex items-center gap-2 text-gold-700">
        <Crown size={20} strokeWidth={1.5} />
        <span className="font-serif text-2xl text-ink-900">Omnira</span>
      </div>

      {state === 'pending' && (
        <div className="mt-12">
          <div className="mx-auto h-12 w-12 rounded-full bg-parchment-200 border border-parchment-300 animate-pulse" />
          <h1 className="mt-6 font-serif text-3xl text-ink-900">
            Verifying your email.
          </h1>
          <p className="mt-2 text-sm text-ink-600">Hang tight.</p>
        </div>
      )}

      {state === 'success' && (
        <div className="mt-12">
          <div className="mx-auto h-14 w-14 rounded-full bg-gold-shine flex items-center justify-center shadow-soft">
            <CheckCircle2 size={26} className="text-parchment-50" strokeWidth={1.5} />
          </div>
          <h1 className="mt-6 font-serif text-3xl text-ink-900">
            Email verified
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Redirecting you to the lobby.
          </p>
        </div>
      )}

      {state === 'error' && (
        <div className="mt-12">
          <div className="mx-auto h-14 w-14 rounded-full bg-danger/10 flex items-center justify-center">
            <XCircle size={26} className="text-danger" strokeWidth={1.5} />
          </div>
          <h1 className="mt-6 font-serif text-3xl text-ink-900">
            Couldn&apos;t verify
          </h1>
          <p className="mt-2 text-sm text-ink-600 max-w-sm mx-auto">
            {errorMsg}
          </p>
          <Link
            href="/settings"
            className="mt-6 inline-flex rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
          >
            Go to settings
          </Link>
        </div>
      )}
    </div>
  );
}
