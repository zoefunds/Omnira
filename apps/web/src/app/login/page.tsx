'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Field } from '@/components/Field';
import { Crown } from 'lucide-react';

/** Only allow internal paths so a malicious ?next= can't redirect off-site. */
function safeNext(raw: string | null): string {
  if (!raw) return '/lobby';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
  } catch {
    /* ignore */
  }
  return '/lobby';
}

export default function LoginRoute() {
  return (
    <Suspense fallback={<AuthSkeleton title="Welcome back" eyebrow="Member Sign-in" />}>
      <LoginPage />
    </Suspense>
  );
}

function AuthSkeleton({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="min-h-[calc(100vh-64px)] grid lg:grid-cols-2">
      <div className="hidden lg:block bg-parchment-100/60 border-r border-parchment-300" />
      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md animate-pulse">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            {eyebrow}
          </p>
          <h1 className="font-serif text-4xl text-ink-900">{title}</h1>
          <div className="mt-2 h-4 w-2/3 rounded bg-parchment-300/70" />
          <div className="mt-8 space-y-4">
            <div className="h-10 rounded-md bg-parchment-200" />
            <div className="h-10 rounded-md bg-parchment-200" />
            <div className="h-12 rounded-md bg-parchment-300" />
          </div>
        </div>
      </main>
    </div>
  );
}

function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextHref = safeNext(params.get('next'));
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(form);
      setSession({ token: res.token, user: res.user });
      router.push(nextHref);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        setError('Invalid email/username or password.');
      } else {
        setError('Unexpected error. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] grid lg:grid-cols-2">
      {/* Left brand panel */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-parchment-100/60 border-r border-parchment-300 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 80% 70%, rgba(184,144,31,0.18), transparent 60%)',
          }}
        />
        <div>
          <div className="flex items-center gap-2 text-gold-700">
            <Crown size={20} strokeWidth={1.5} />
            <span className="font-serif text-2xl text-ink-900">Omnira</span>
          </div>
        </div>

        <div>
          <blockquote className="font-serif text-3xl text-ink-900 italic leading-snug max-w-md">
            &ldquo;The board is set, the pieces are moving.&rdquo;
          </blockquote>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-gold-700">
            Welcome back to Omnira
          </p>
        </div>

        <div className="text-sm text-ink-600 max-w-sm">
          Pick up where you left off. Your rating, history, and onchain wallet
          are exactly as you left them.
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Member Sign-in
          </p>
          <h1 className="font-serif text-4xl text-ink-900">Welcome back</h1>
          <p className="mt-2 text-sm text-ink-600">
            Sign in with your username or email.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field
              label="Email or username"
              name="identifier"
              autoComplete="username"
              required
              value={form.identifier}
              onChange={(e) =>
                setForm({ ...form, identifier: e.target.value })
              }
            />
            <div>
              <Field
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />
              <div className="mt-2 text-right">
                <Link
                  href="/forgot-password"
                  className="text-xs text-gold-700 hover:text-gold-600"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-md bg-gold-shine px-5 py-3 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Signing in.' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-ink-600">
            New to Omnira?{' '}
            <Link
              href={
                nextHref === '/lobby'
                  ? '/signup'
                  : `/signup?next=${encodeURIComponent(nextHref)}`
              }
              className="text-gold-700 font-medium hover:text-gold-600"
            >
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
