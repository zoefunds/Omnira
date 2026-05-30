'use client';

import { useState } from 'react';
import {
  X,
  KeyRound,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

type Step = 'warn' | 'confirm' | 'reveal';

export function ExportWalletModal({ onClose }: { onClose: () => void }) {
  const token = useAuth((s) => s.token);
  const [step, setStep] = useState<Step>('warn');
  const [acks, setAcks] = useState({ shareNo: false, lossNo: false });
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{
    address: string;
    privateKey: string;
  } | null>(null);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<'address' | 'key' | null>(null);

  const allAcks = acks.shareNo && acks.lossNo;

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.exportWallet({ password }, token);
      setSecret({ address: res.address, privateKey: res.privateKey });
      setStep('reveal');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'INVALID_PASSWORD') {
          setError('Wrong password. Try again.');
        } else if (e.code === 'TOO_MANY_REQUESTS' || e.status === 429) {
          setError('Too many export attempts. Try again in 15 minutes.');
        } else if (e.code === 'DERIVATION_MISMATCH') {
          setError(
            'Server-side wallet derivation has changed. Contact support.',
          );
        } else {
          setError('Could not export. Try again in a moment.');
        }
      } else {
        setError('Network error. Try again.');
      }
    } finally {
      setLoading(false);
      setPassword('');
    }
  }

  async function copy(text: string, what: 'address' | 'key') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (step !== 'reveal') onClose();
      }}
    >
      <div
        className="bg-parchment-50 border border-parchment-300 rounded-xl shadow-card w-full max-w-md relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {step !== 'reveal' && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-ink-400 hover:text-ink-900 transition"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        )}

        {/* ─────────── STEP 1: warning ─────────── */}
        {step === 'warn' && (
          <div className="p-6">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold-700">
              <KeyRound size={14} strokeWidth={1.5} />
              Export Wallet
            </div>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">
              Reveal your private key
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              This is the master key for your GenLayer wallet. Anyone who has
              it owns the funds and identity.
            </p>

            <div className="mt-5 rounded-md border border-danger/30 bg-danger/5 p-4 text-sm">
              <div className="flex items-start gap-2 text-danger font-medium">
                <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                Read before continuing
              </div>
              <ul className="mt-3 space-y-2 text-ink-600 text-xs leading-relaxed">
                <li>• Never paste your key into a website, chat, or screenshot.</li>
                <li>• Omnira support will <strong>never</strong> ask for this key.</li>
                <li>• Your username, password, and wallet will keep working in Omnira after export.</li>
                <li>• Importing into MetaMask / Rabby gives you a second way to control the same wallet.</li>
              </ul>
            </div>

            <div className="mt-5 space-y-3 text-sm text-ink-900">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acks.shareNo}
                  onChange={(e) =>
                    setAcks((a) => ({ ...a, shareNo: e.target.checked }))
                  }
                  className="mt-1 accent-gold-600"
                />
                <span>
                  I understand that anyone with this key controls my wallet.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acks.lossNo}
                  onChange={(e) =>
                    setAcks((a) => ({ ...a, lossNo: e.target.checked }))
                  }
                  className="mt-1 accent-gold-600"
                />
                <span>
                  I will save this key in a secure place. Omnira cannot recover it.
                </span>
              </label>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={!allAcks}
                className="rounded-md bg-gold-shine px-5 py-2 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ─────────── STEP 2: password confirm ─────────── */}
        {step === 'confirm' && (
          <form onSubmit={onConfirm} className="p-6">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold-700">
              <ShieldAlert size={14} strokeWidth={1.5} />
              Confirm Identity
            </div>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">
              Enter your password
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              We require your password before revealing the private key, even
              if you&apos;re already signed in.
            </p>

            <label className="block mt-5">
              <span className="block text-xs uppercase tracking-wider text-ink-400 mb-1.5">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/40 transition"
              />
            </label>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setStep('warn')}
                className="rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || password.length < 1}
                className="rounded-md bg-gold-shine px-5 py-2 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-40"
              >
                {loading ? 'Verifying.' : 'Reveal key'}
              </button>
            </div>
          </form>
        )}

        {/* ─────────── STEP 3: reveal ─────────── */}
        {step === 'reveal' && secret && (
          <div className="p-6">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold-700">
              <KeyRound size={14} strokeWidth={1.5} />
              Your private key
            </div>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">
              Save this somewhere safe
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              This is the only place this key will be shown. Close this window
              when you&apos;ve saved it.
            </p>

            {/* Address */}
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
                Address
              </div>
              <div className="flex items-center gap-2 rounded-md border border-parchment-300 bg-parchment-100 px-3 py-2">
                <span className="font-mono text-xs text-ink-900 truncate flex-1">
                  {secret.address}
                </span>
                <button
                  onClick={() => copy(secret.address, 'address')}
                  className="text-ink-400 hover:text-gold-700 transition shrink-0"
                  aria-label="Copy address"
                >
                  {copied === 'address' ? (
                    <Check size={14} className="text-gold-600" strokeWidth={2} />
                  ) : (
                    <Copy size={14} strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Private key */}
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
                Private key
              </div>
              <div className="flex items-center gap-2 rounded-md border border-gold-300 bg-parchment-100 px-3 py-2">
                <span className="font-mono text-xs text-ink-900 truncate flex-1 select-all">
                  {show
                    ? secret.privateKey
                    : '•'.repeat(Math.min(secret.privateKey.length, 64))}
                </span>
                <button
                  onClick={() => setShow((v) => !v)}
                  className="text-ink-400 hover:text-gold-700 transition shrink-0"
                  aria-label={show ? 'Hide key' : 'Show key'}
                >
                  {show ? (
                    <EyeOff size={14} strokeWidth={1.5} />
                  ) : (
                    <Eye size={14} strokeWidth={1.5} />
                  )}
                </button>
                <button
                  onClick={() => copy(secret.privateKey, 'key')}
                  className="text-ink-400 hover:text-gold-700 transition shrink-0"
                  aria-label="Copy private key"
                >
                  {copied === 'key' ? (
                    <Check size={14} className="text-gold-600" strokeWidth={2} />
                  ) : (
                    <Copy size={14} strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-ink-600 leading-relaxed">
              <strong className="text-danger">Heads up:</strong> Anyone with
              this key can spend from this wallet. Treat it like a password
              you can never change.
            </div>

            <div className="mt-5 rounded-md border border-parchment-300 bg-parchment-50 p-4 text-xs text-ink-600 leading-relaxed">
              <strong className="text-ink-900">Import into MetaMask / Rabby:</strong>
              <ol className="mt-2 ml-4 list-decimal space-y-1">
                <li>Open MetaMask → top-right account icon → <em>Add account or hardware wallet → Import account</em></li>
                <li>Select <em>Private Key</em> and paste the key above.</li>
                <li>Add a custom network: GenLayer Studio Net, RPC URL <code className="font-mono">https://studio.genlayer.com/api</code>.</li>
              </ol>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md bg-gold-shine px-5 py-2 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
              >
                I&apos;ve saved it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
