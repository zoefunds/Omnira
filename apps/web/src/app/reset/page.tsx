'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Crown, KeyRound, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Field } from '@/components/Field';
import { api, ApiError } from '@/lib/api';

export default function ResetPasswordRoute() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}

function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ token, newPassword: password });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_TOKEN') {
        setError(
          'This reset link is invalid or has expired. Request a new one from the forgot-password page.',
        );
      } else {
        setError('Could not reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <ErrorShell
        title="Missing token"
        body="This page needs a reset token. Please use the link from your email."
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] grid lg:grid-cols-2">
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-parchment-100/60 border-r border-parchment-300 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 30% 50%, rgba(184,144,31,0.18), transparent 60%)',
          }}
        />
        <div className="flex items-center gap-2 text-gold-700">
          <Crown size={20} strokeWidth={1.5} />
          <span className="font-serif text-2xl text-ink-900">Omnira</span>
        </div>
        <div>
          <h2 className="font-serif text-4xl text-ink-900 leading-tight">
            Choose a new<br />password.
          </h2>
          <p className="mt-4 text-ink-600 max-w-sm">
            After you confirm, all existing sessions on every device will be
            signed out. Your GenLayer wallet address remains the same.
          </p>
          <div className="mt-8 rounded-md border border-parchment-300 bg-parchment-50 p-4 text-sm text-ink-600">
            <div className="inline-flex items-center gap-2 text-ink-900 font-medium">
              <ShieldCheck size={16} className="text-gold-600" strokeWidth={1.5} />
              Secure by design
            </div>
            <ul className="mt-2 text-xs space-y-1 list-disc list-inside">
              <li>Token expires 30 minutes after we sent it.</li>
              <li>Single-use. Becomes invalid the moment it succeeds.</li>
              <li>All other sessions are revoked automatically.</li>
            </ul>
          </div>
        </div>
        <div />
      </aside>

      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Reset Password
          </p>
          <h1 className="font-serif text-4xl text-ink-900">
            Set a new password
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Choose something at least 10 characters long.
          </p>

          {done ? (
            <div className="mt-8 rounded-xl border border-gold-300 bg-parchment-50 shadow-card p-6">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-gold-shine flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-parchment-50" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-ink-900">
                    Password updated
                  </h2>
                  <p className="mt-1 text-sm text-ink-600">
                    You can now sign in with your new password. Redirecting you to login.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <Field
                label="New password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                label="Confirm new password"
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                required
                minLength={10}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-gold-shine px-5 py-3 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-50"
              >
                <KeyRound size={16} strokeWidth={1.5} />
                {loading ? 'Updating.' : 'Update password'}
              </button>
            </form>
          )}

          <p className="mt-6 text-sm text-ink-600">
            Remembered it?{' '}
            <Link
              href="/login"
              className="text-gold-700 font-medium hover:text-gold-600"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function ErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-md mx-auto px-6 py-20 text-center">
      <h1 className="font-serif text-3xl text-ink-900">{title}</h1>
      <p className="mt-3 text-sm text-ink-600">{body}</p>
      <Link
        href="/forgot-password"
        className="mt-6 inline-flex rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
      >
        Request a new link
      </Link>
    </div>
  );
}
