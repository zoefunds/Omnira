'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Crown, Mail, CheckCircle2, Wallet } from 'lucide-react';
import { Field } from '@/components/Field';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // No-op in this build — surface the same UX a real reset would have.
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 600);
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
            Forgot<br />your password?
          </h2>
          <p className="mt-4 text-ink-600 max-w-sm">
            We&apos;ll send a one-time reset link to the email tied to your
            account. Your onchain wallet stays exactly as it was.
          </p>
          <div className="mt-8 rounded-md border border-parchment-300 bg-parchment-50 p-4 text-sm text-ink-600">
            <div className="inline-flex items-center gap-2 text-ink-900 font-medium">
              <Wallet size={16} className="text-gold-600" strokeWidth={1.5} />
              Your wallet is safe
            </div>
            <p className="mt-1 text-xs">
              The GenLayer wallet derived at signup is bound to your account ID,
              not your password. Resetting your password keeps the same wallet
              address.
            </p>
          </div>
        </div>
        <div />
      </aside>

      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Account Recovery
          </p>
          <h1 className="font-serif text-4xl text-ink-900">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Enter the email address you used to sign up. We&apos;ll send a
            secure link.
          </p>

          {sent ? (
            <div className="mt-8 rounded-xl border border-gold-300 bg-parchment-50 shadow-card p-6">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-gold-shine flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-parchment-50" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-ink-900">
                    Check your inbox
                  </h2>
                  <p className="mt-1 text-sm text-ink-600">
                    If <span className="font-medium text-ink-900">{email}</span>{' '}
                    matches an Omnira account, we&apos;ve sent a reset link.
                    It expires in 30 minutes.
                  </p>
                  <p className="mt-4 text-xs text-ink-400">
                    Didn&apos;t receive anything? Check your spam folder, or{' '}
                    <button
                      onClick={() => setSent(false)}
                      className="text-gold-700 hover:text-gold-600"
                    >
                      try a different email
                    </button>
                    .
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <Field
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-gold-shine px-5 py-3 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-50"
              >
                <Mail size={16} strokeWidth={1.5} />
                {loading ? 'Sending.' : 'Send reset link'}
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
