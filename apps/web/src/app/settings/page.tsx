'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { loginHref } from '@/lib/loginNext';
import {
  useSettings,
  type Language,
  type BoardStyle,
  type PieceSet,
  LANG_LABEL,
} from '@/store/settings';
import { UserAvatar } from '@/components/UserAvatar';
import { ExportWalletModal } from '@/components/ExportWalletModal';
import { KeyRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  User,
  Wallet,
  Bell,
  Shield,
  Palette,
  Globe,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { disconnectSocket } from '@/lib/socket';

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, hydrated, clear } = useAuth();
  const settings = useSettings();
  const [tab, setTab] = useState<
    'account' | 'wallet' | 'notifications' | 'security' | 'appearance' | 'language'
  >('account');
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) router.replace(loginHref(pathname));
  }, [hydrated, user, token, router, pathname]);

  // Flash "Saved" briefly when any setting changes from this page.
  function flash() {
    setSavedFlash(settings.t('saved'));
    setTimeout(() => setSavedFlash(null), 1400);
  }

  if (!user) return null;

  const tabs = [
    { id: 'account',       label: settings.t('accountTitle'),       icon: User },
    { id: 'wallet',        label: settings.t('walletTitle'),        icon: Wallet },
    { id: 'notifications', label: settings.t('notificationsTitle'), icon: Bell },
    { id: 'security',      label: settings.t('securityTitle'),      icon: Shield },
    { id: 'appearance',    label: settings.t('appearanceTitle'),    icon: Palette },
    { id: 'language',      label: settings.t('langLabel'),          icon: Globe },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 relative">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900">
          {settings.t('settingsTitle')}
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          {settings.t('settingsBlurb')}
        </p>
      </div>

      {/* Saved flash */}
      {savedFlash && (
        <div className="fixed top-20 right-6 z-30 inline-flex items-center gap-2 rounded-md bg-gold-shine px-4 py-2 text-sm text-parchment-50 shadow-card animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} strokeWidth={1.5} />
          {savedFlash}
        </div>
      )}

      <div className="grid lg:grid-cols-[240px_1fr] gap-6 lg:gap-8">
        {/* Sidebar tabs — horizontal scroll strip on mobile, vertical list on desktop */}
        <aside className="lg:space-y-1 -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto pb-2 lg:pb-0 lg:overflow-visible scrollbar-hide">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 lg:w-full inline-flex items-center gap-2 lg:gap-3 rounded-md px-3 py-2.5 text-sm transition whitespace-nowrap text-left ${
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
          </div>
          <button
            onClick={() => {
              disconnectSocket();
              clear();
              router.push('/login');
            }}
            className="hidden lg:flex w-full mt-6 items-center gap-3 rounded-md px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition text-left"
          >
            <LogOut size={16} strokeWidth={1.5} />
            {settings.t('navSignOut')}
          </button>
        </aside>

        {/* Content */}
        <section className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5 sm:p-8">
          {tab === 'account' && (
            <Panel
              title={settings.t('accountTitle')}
              description="Your public profile and basic information."
            >
              <AvatarRow userId={user.id} username={user.username} avatarUrl={user.avatarUrl} onChange={flash} />
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
              title={settings.t('walletTitle')}
              description="A self-custody GenLayer wallet derived from your account."
            >
              <Row label="Address" value={user.walletAddress} mono copy />
              <Row label="Network" value="GenLayer Studio" />
              <div className="rounded-md bg-parchment-50 border border-parchment-300 p-4 text-xs text-ink-600 leading-relaxed">
                Your wallet address is permanent and travels with your account.
                Every game you finish is settled to this address on GenLayer.
              </div>

              <div className="rounded-md border border-gold-300 bg-parchment-50 p-4 mt-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-gold-shine flex items-center justify-center text-parchment-50 shrink-0">
                    <KeyRound size={16} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-900">
                      Export private key
                    </div>
                    <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                      Reveal the private key for your wallet so you can import
                      it into MetaMask, Rabby, or another EVM wallet. Requires
                      your password.
                    </p>
                  </div>
                  <button
                    onClick={() => setExportOpen(true)}
                    className="rounded-md bg-gold-shine px-4 py-2 text-xs font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition shrink-0"
                  >
                    Export
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {tab === 'notifications' && (
            <Panel
              title={settings.t('notificationsTitle')}
              description={settings.t('notificationsBlurb')}
            >
              <Toggle label="Match invites"        defaultOn onChange={flash} />
              <Toggle label="Tournament starts"    defaultOn onChange={flash} />
              <Toggle label="Daily puzzle ready"   defaultOn onChange={flash} />
              <Toggle label="Friend activity"               onChange={flash} />
              <Toggle label="Product announcements"         onChange={flash} />
            </Panel>
          )}

          {tab === 'security' && (
            <Panel
              title={settings.t('securityTitle')}
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
              title={settings.t('appearanceTitle')}
              description={settings.t('appearanceBlurb')}
            >
              <Choice<BoardStyle>
                label={settings.t('boardLabel')}
                value={settings.board}
                options={[
                  { value: 'classic', label: 'Classic' },
                  { value: 'walnut',  label: 'Walnut' },
                  { value: 'marble',  label: 'Marble' },
                ]}
                onChange={(v) => {
                  settings.setBoard(v);
                  flash();
                }}
              />
              <Choice<PieceSet>
                label={settings.t('pieceLabel')}
                value={settings.pieceSet}
                options={[
                  { value: 'engraved', label: 'Engraved' },
                  { value: 'modern',   label: 'Modern' },
                  { value: 'minimal',  label: 'Minimal' },
                ]}
                onChange={(v) => {
                  settings.setPieceSet(v);
                  flash();
                }}
              />
            </Panel>
          )}

          {tab === 'language' && (
            <Panel
              title={settings.t('langLabel')}
              description="Choose your preferred language. Switches instantly across the surface."
            >
              <Choice<Language>
                label={settings.t('langLabel')}
                value={settings.language}
                options={(Object.keys(LANG_LABEL) as Language[]).map((v) => ({
                  value: v,
                  label: LANG_LABEL[v],
                }))}
                onChange={(v) => {
                  settings.setLanguage(v);
                  flash();
                }}
              />
            </Panel>
          )}
        </section>
      </div>

      {exportOpen && (
        <ExportWalletModal onClose={() => setExportOpen(false)} />
      )}
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
  onChange,
}: {
  label: string;
  defaultOn?: boolean;
  onChange?: () => void;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-3 border-b border-parchment-300/70 last:border-b-0">
      <span className="text-sm text-ink-900">{label}</span>
      <button
        onClick={() => {
          setOn(!on);
          onChange?.();
        }}
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

function AvatarRow({
  userId,
  username,
  avatarUrl,
  onChange,
}: {
  userId: string;
  username: string;
  avatarUrl: string | null;
  onChange: () => void;
}) {
  const token = useAuth((s) => s.token);
  const setUser = (next: Partial<{ avatarUrl: string | null }>) => {
    const cur = useAuth.getState().user;
    if (!cur) return;
    useAuth.setState({ user: { ...cur, ...next } });
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(file: File) {
    if (!file.type.startsWith('image/')) {
      setErr('Please choose an image file.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErr('Image must be under 4 MB.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file, 256, 0.82);
      if (!token) throw new Error('not signed in');
      await api.setAvatar({ dataUrl }, token);
      setUser({ avatarUrl: dataUrl });
      onChange();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TOO_LARGE') {
        setErr('Image is too large — try a smaller photo.');
      } else {
        setErr('Could not upload. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!token) return;
    setBusy(true);
    try {
      await api.removeAvatar(token);
      setUser({ avatarUrl: null });
      onChange();
    } catch {
      setErr('Could not remove. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-parchment-300/70 flex-wrap">
      <div className="flex items-center gap-4">
        <UserAvatar
          userId={userId}
          username={username}
          avatarUrl={avatarUrl}
          size={64}
        />
        <div>
          <div className="text-sm font-medium text-ink-900">Profile picture</div>
          <div className="text-xs text-ink-400 mt-0.5">
            Shown in the nav bar and on your profile. Synced across devices.
          </div>
          {err && <div className="text-xs text-danger mt-1">{err}</div>}
        </div>
      </div>
      <div className="flex gap-2">
        <label
          className={`rounded-md bg-gold-shine px-4 py-2 text-xs font-medium uppercase tracking-wide text-parchment-50 shadow-soft transition cursor-pointer ${
            busy ? 'opacity-50 pointer-events-none' : 'hover:opacity-90'
          }`}
        >
          {busy ? 'Uploading.' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = '';
            }}
          />
        </label>
        {avatarUrl && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="rounded-md border border-parchment-400 px-4 py-2 text-xs text-ink-600 hover:border-ink-900 hover:text-ink-900 transition disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/** Resize an image to fit inside `max`×`max`, encode as JPEG. */
function resizeToDataUrl(file: File, max: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(max / img.width, max / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="py-3 border-b border-parchment-300/70 last:border-b-0">
      <div className="text-sm font-medium text-ink-900 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                active
                  ? 'border-gold-400 bg-parchment-50 text-gold-700 shadow-soft'
                  : 'border-parchment-300 bg-parchment-50/70 text-ink-600 hover:border-gold-300'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
