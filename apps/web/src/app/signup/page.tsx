'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Field } from '@/components/Field';
import { Crown, Wallet, ShieldCheck } from 'lucide-react';

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

export default function SignupRoute() {
  return (
    <Suspense fallback={<AuthSkeleton title="Join the lounge" eyebrow="Create Account" />}>
      <SignupPage />
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
            <div className="h-10 rounded-md bg-parchment-200" />
            <div className="h-12 rounded-md bg-parchment-300" />
          </div>
        </div>
      </main>
    </div>
  );
}

function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextHref = safeNext(params.get('next'));
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [errors, setErrors] = useState<Partial<typeof form> & { _form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const res = await api.signup(form);
      setSession({ token: res.token, user: res.user });
      router.push(nextHref);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'EMAIL_TAKEN') setErrors({ email: 'already in use' });
        else if (e.code === 'USERNAME_TAKEN')
          setErrors({ username: 'already taken' });
        else setErrors({ _form: e.message });
      } else {
        setErrors({ _form: 'unexpected error' });
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
              'radial-gradient(ellipse 60% 40% at 20% 30%, rgba(184,144,31,0.18), transparent 60%)',
          }}
        />
        <div>
          <div className="flex items-center gap-2 text-gold-700">
            <Crown size={20} strokeWidth={1.5} />
            <span className="font-serif text-2xl text-ink-900">Omnira</span>
          </div>
          <h2 className="mt-10 font-serif text-4xl text-ink-900 leading-tight">
            Begin your<br />ascent.
          </h2>
          <p className="mt-4 text-ink-600 max-w-sm">
            Create an Omnira account in under a minute. Your wallet, history,
            and rating live forever onchain.
          </p>
        </div>
        <ul className="space-y-4 text-sm text-ink-600">
          <li className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-gold-shine flex items-center justify-center text-parchment-50 shrink-0">
              <Wallet size={16} strokeWidth={1.5} />
            </div>
            <div>
              <div className="font-medium text-ink-900">Self-custody wallet</div>
              <div className="text-xs text-ink-400">
                Derived for you. Yours forever.
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-gold-shine flex items-center justify-center text-parchment-50 shrink-0">
              <ShieldCheck size={16} strokeWidth={1.5} />
            </div>
            <div>
              <div className="font-medium text-ink-900">Verified results</div>
              <div className="text-xs text-ink-400">
                Every match settled by a GenLayer contract.
              </div>
            </div>
          </li>
        </ul>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Create Account
          </p>
          <h1 className="font-serif text-4xl text-ink-900">
            Join the lounge
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            A wallet will be derived at signup and tied to your account
            permanently.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={errors.email}
            />
            <Field
              label="Username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              error={errors.username}
            />
            <Field
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              error={errors.password}
            />
            {errors._form && (
              <p className="text-sm text-danger">{errors._form}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-md bg-gold-shine px-5 py-3 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Creating account.' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-sm text-ink-600">
            Already have an account?{' '}
            <Link
              href={
                nextHref === '/lobby'
                  ? '/login'
                  : `/login?next=${encodeURIComponent(nextHref)}`
              }
              className="text-gold-700 font-medium hover:text-gold-600"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
