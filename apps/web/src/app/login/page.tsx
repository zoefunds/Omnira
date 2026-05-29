'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';

export default function LoginPage() {
  const router = useRouter();
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
      router.push('/play');
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
    <section className="max-w-md mx-auto">
      <h1 className="font-serif text-3xl text-ink-900 mb-6">Welcome back</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Email or username"
          name="identifier"
          autoComplete="username"
          required
          value={form.identifier}
          onChange={(e) => setForm({ ...form, identifier: e.target.value })}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Signing in…' : 'Log in'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-600">
        New here?{' '}
        <Link href="/signup" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}
