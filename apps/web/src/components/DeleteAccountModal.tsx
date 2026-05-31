'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { disconnectSocket } from '@/lib/socket';

export function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { token, user, clear } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmUsername, setConfirmUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameMatches = user && confirmUsername.trim() === user.username;
  const canSubmit = password.length > 0 && usernameMatches && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !user) return;
    setLoading(true);
    setError(null);
    try {
      await api.deleteAccount({ password, confirmUsername }, token);
      disconnectSocket();
      clear();
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'INVALID_PASSWORD') setError('Wrong password.');
        else if (e.code === 'USERNAME_MISMATCH') setError('Username does not match exactly.');
        else if (e.status === 429) setError('Too many attempts. Try again in 15 minutes.');
        else setError('Could not delete. Please try again.');
      } else {
        setError('Network error. Try again.');
      }
    } finally {
      setLoading(false);
      setPassword('');
    }
  }

  if (!user) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-parchment-50 border border-parchment-300 rounded-xl shadow-card w-full max-w-md relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-400 hover:text-ink-900 transition"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
        <form onSubmit={onSubmit} className="p-6">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-danger">
            <AlertTriangle size={14} strokeWidth={1.5} />
            Danger Zone
          </div>
          <h2 className="mt-2 font-serif text-2xl text-ink-900">Delete your account</h2>
          <p className="mt-2 text-sm text-ink-600">
            Your username, email, and avatar will be cleared. Match history and
            your wallet address remain on-chain as a public record. This cannot
            be undone.
          </p>

          <label className="block mt-5">
            <span className="block text-xs uppercase tracking-wider text-ink-400 mb-1.5">
              Type your username to confirm
            </span>
            <input
              autoFocus
              autoComplete="off"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              placeholder={user.username}
              className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm font-mono outline-none focus:border-danger focus:ring-1 focus:ring-danger/40 transition"
            />
          </label>

          <label className="block mt-3">
            <span className="block text-xs uppercase tracking-wider text-ink-400 mb-1.5">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-danger focus:ring-1 focus:ring-danger/40 transition"
            />
          </label>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <div className="mt-6 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-md bg-danger px-5 py-2 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} strokeWidth={2} />
              {loading ? 'Deleting.' : 'Delete forever'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
