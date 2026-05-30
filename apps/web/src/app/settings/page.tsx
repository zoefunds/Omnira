'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import {
  User,
  Wallet,
  Bell,
  Shield,
  Palette,
  Globe,
  LogOut,
} from 'lucide-react';
import { disconnectSocket } from '@/lib/socket';

export default function SettingsPage() {
  const router = useRouter();
  const { user, token, hydrated, clear } = useAuth();
  const [tab, setTab] = useState<
    'account' | 'wallet' | 'notifications' | 'security' | 'appearance' | 'language'
  >('account');

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) router.replace('/login');
  }, [hydrated, user, token, router]);

  if (!user) return null;

  const tabs = [
    { id: 'account',       label: 'Account',       icon: User },
    { id: 'wallet',        label: 'Wallet',        icon: Wallet },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security',      label: 'Security',      icon: Shield },
    { id: 'appearance',    label: 'Appearance',    icon: Palette },
    { id: 'language',      label: 'Language',      icon: Globe },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-4xl text-ink-900">Settings</h1>
        <p className="mt-2 text-sm text-ink-600">
          Manage your account, wallet, and preferences.
        </p>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-8">
        {/* Sidebar tabs */}
        <aside className="space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition text-left ${
                  active
                    ? 'bg-gold-shine text-parchment-50 shadow-soft'
                    : 'text-ink-600 hover:bg-parchment-200/70 hover:text-ink-900'
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
                {t.label}
              </button>
            );
          })}
          <button
            onClick={() => {
              disconnectSocket();
              clear();
              router.push('/login');
            }}
            className="w-full mt-6 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition text-left"
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </aside>

        {/* Content */}
        <section className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-8">
          {tab === 'account' && (
            <Panel
              title="Account"
              description="Your public profile and basic information."
            >
              <Row label="Username" value={user.username} hint="Visible to other players." />
              <Row label="Email" value={user.email} hint="Used to sign in." />
              <Row
                label="Member since"
                value={new Date(user.createdAt).toLocaleDateString()}
              />
            </Panel>
          )}

          {tab === 'wallet' && (
            <Panel
              title="Wallet"
              description="A self-custody GenLayer wallet derived from your account."
            >
              <Row
                label="Address"
                value={user.walletAddress}
                mono
                copy
              />
              <Row
                label="Network"
                value="GenLayer Studio"
              />
              <div className="rounded-md bg-parchment-50 border border-parchment-300 p-4 text-xs text-ink-600 leading-relaxed">
                Your wallet address is permanent and travels with your account.
                Every game you finish is settled to this address on GenLayer.
              </div>
            </Panel>
          )}

          {tab === 'notifications' && (
            <Panel
              title="Notifications"
              description="Choose what you want to be alerted about."
            >
              <Toggle label="Match invites"        defaultOn />
              <Toggle label="Tournament starts"    defaultOn />
              <Toggle label="Daily puzzle ready"   defaultOn />
              <Toggle label="Friend activity" />
              <Toggle label="Product announcements" />
            </Panel>
          )}

          {tab === 'security' && (
            <Panel
              title="Security"
              description="Keep your account safe."
            >
              <Row label="Password" value="Set" />
              <Row label="Two-factor authentication" value="Off" />
              <Row label="Active sessions" value="1" />
              <button className="mt-4 rounded-md bg-gold-shine px-5 py-2 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition">
                Change password
              </button>
            </Panel>
          )}

          {tab === 'appearance' && (
            <Panel
              title="Appearance"
              description="Make Omnira feel like home."
            >
              <Choice label="Theme" options={['Parchment', 'Ink', 'System']} active="Parchment" />
              <Choice
                label="Board style"
                options={['Classic', 'Walnut', 'Marble']}
                active="Classic"
              />
              <Choice
                label="Piece set"
                options={['Engraved', 'Modern', 'Minimal']}
                active="Engraved"
              />
            </Panel>
          )}

          {tab === 'language' && (
            <Panel
              title="Language"
              description="Choose your preferred language."
            >
              <Choice
                label="Display language"
                options={['English', 'Español', 'Français', 'Deutsch']}
                active="English"
              />
            </Panel>
          )}
        </section>
      </div>
    </div>
  );
}

/* ───────────── helpers ───────────── */

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-serif text-2xl text-ink-900">{title}</h2>
      <p className="text-sm text-ink-600 mt-1">{description}</p>
      <div className="mt-6 space-y-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  mono = false,
  copy = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-parchment-300/70 last:border-b-0">
      <div>
        <div className="text-sm font-medium text-ink-900">{label}</div>
        {hint && <div className="text-xs text-ink-400 mt-0.5">{hint}</div>}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`text-sm ${mono ? 'font-mono text-ink-600' : 'text-ink-600'} max-w-[280px] truncate`}
        >
          {value}
        </span>
        {copy && (
          <button
            onClick={() => navigator.clipboard?.writeText(value)}
            className="text-xs uppercase tracking-wider text-gold-700 hover:text-gold-600"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  defaultOn = false,
}: {
  label: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-3 border-b border-parchment-300/70 last:border-b-0">
      <span className="text-sm text-ink-900">{label}</span>
      <button
        onClick={() => setOn(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          on ? 'bg-gold-shine' : 'bg-parchment-400'
        }`}
        aria-pressed={on}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-parchment-50 shadow transition transform ${
            on ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function Choice({
  label,
  options,
  active,
}: {
  label: string;
  options: string[];
  active: string;
}) {
  const [current, setCurrent] = useState(active);
  return (
    <div className="py-3 border-b border-parchment-300/70 last:border-b-0">
      <div className="text-sm font-medium text-ink-900 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => setCurrent(o)}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              current === o
                ? 'border-gold-400 bg-parchment-50 text-gold-700'
                : 'border-parchment-300 bg-parchment-50/70 text-ink-600 hover:border-gold-300'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
