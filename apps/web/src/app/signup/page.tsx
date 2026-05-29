'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';

export default function SignupPage() {
  const router = useRouter();
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
      router.push('/play');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'EMAIL_TAKEN') setErrors({ email: 'already in use' });
        else if (e.code === 'USERNAME_TAKEN') setErrors({ username: 'already taken' });
        else setErrors({ _form: e.message });
      } else {
        setErrors({ _form: 'unexpected error' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-md mx-auto">
      <h1 className="font-serif text-3xl text-ink-900 mb-6">Create your account</h1>
      <form onSubmit={onSubmit} className="space-y-4">
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
        {errors._form && <p className="text-sm text-danger">{errors._form}</p>}
        <p className="text-xs text-ink-400">
          A permanent GenLayer wallet will be created for you and will stay tied to this account
          across any device.
        </p>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-600">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
