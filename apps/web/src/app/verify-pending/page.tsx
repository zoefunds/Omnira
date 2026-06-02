'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, MailCheck, Loader2, RotateCw, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { api, ApiError } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

export default function VerifyPendingPage() {
  const router = useRouter();
  const { user, token, hydrated, clear } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Once the auth store rehydrates, decide where the user should be:
  // - Not signed in → /login
  // - Signed in + already verified → /lobby
  // - Signed in + not verified → stay here
  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) {
      router.replace('/login');
      return;
    }
    if (user.emailVerified) {
      router.replace('/lobby');
    }
  }, [hydrated, user, token, router]);

  // Poll /auth/me every 5s to detect verification done in another tab/inbox.
  useEffect(() => {
    if (!token || !user || user.emailVerified) return;
    const id = setInterval(async () => {
      try {
        const r = await api.me(token);
        useAuth.setState({ user: r.user });
        if (r.user.emailVerified) {
          clearInterval(id);
          router.replace('/lobby');
        }
      } catch {
        /* ignore */
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [token, user, router]);

  async function refreshNow() {
    if (!token) return;
    setChecking(true);
    try {
      const r = await api.me(token);
      useAuth.setState({ user: r.user });
      if (r.user.emailVerified) router.replace('/lobby');
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    if (!token) return;
    setResending(true);
    setResendError(null);
    try {
      await api.resendVerification(token);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setResendError('Slow down — try again in a few minutes.');
      } else {
        setResendError('Could not send. Try again.');
      }
    } finally {
      setResending(false);
    }
  }

  function signOut() {
    disconnectSocket();
    clear();
    router.replace('/login');
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-gold-700">
            <Crown size={20} strokeWidth={1.5} />
            <span className="font-serif text-2xl text-ink-900">Omnira</span>
          </div>
        </div>

        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-7 sm:p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-gold-shine flex items-center justify-center shadow-soft">
            <MailCheck size={26} className="text-parchment-50" strokeWidth={1.5} />
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.3em] text-gold-700">
            One More Step
          </p>
          <h1 className="mt-2 font-serif text-3xl text-ink-900 leading-tight">
            Verify your email
          </h1>
          <p className="mt-3 text-sm text-ink-600 leading-relaxed">
            We sent a verification link to{' '}
            <span className="font-medium text-ink-900">{user.email}</span>.
            Click it to unlock your account. This page will update automatically once you do.
          </p>

          <div className="mt-6 rounded-md border border-parchment-300 bg-parchment-50 p-3 text-xs text-ink-600 inline-flex items-start gap-2 text-left">
            <ShieldCheck size={14} className="text-gold-600 mt-0.5 shrink-0" strokeWidth={1.5} />
            <span>
              Verification protects your account and password resets. Your
              GenLayer wallet has already been derived and is safe.
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={refreshNow}
              disabled={checking}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-60"
            >
              {checking ? (
                <Loader2 size={14} className="animate-spin" strokeWidth={2} />
              ) : (
                <RotateCw size={14} strokeWidth={2} />
              )}
              {checking ? 'Checking.' : "I've verified — continue"}
            </button>

            <button
              onClick={resend}
              disabled={resending || resent}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-parchment-400 px-5 py-2.5 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition disabled:opacity-60"
            >
              {resent
                ? 'Sent — check your inbox'
                : resending
                ? 'Sending.'
                : 'Resend verification email'}
            </button>

            {resendError && (
              <p className="text-xs text-danger mt-1">{resendError}</p>
            )}
          </div>

          <p className="mt-6 text-[11px] text-ink-400 leading-relaxed">
            Wrong email?{' '}
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1 text-gold-700 hover:text-gold-600"
            >
              <LogOut size={11} strokeWidth={1.5} />
              Sign out
            </button>{' '}
            and create a different account.
          </p>
        </div>
      </div>
    </div>
  );
}
