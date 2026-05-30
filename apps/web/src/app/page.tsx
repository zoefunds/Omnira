'use client';

import Link from 'next/link';
import { useAuth } from '@/store/auth';
import {
  Zap,
  LineChart,
  Trophy,
  Check,
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

// Check is still used in the coaching bullet list below.

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      {/* ─────────────── HERO ─────────────── */}
      <section className="relative overflow-hidden">
        {/* Faint decorative gradient */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(184,144,31,0.14), transparent 60%)',
          }}
        />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-28 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-4">
            Onchain Chess · GenLayer
          </p>
          <h1 className="font-serif text-5xl md:text-7xl tracking-tight text-ink-900 leading-tight">
            Master the Art of{' '}
            <span className="text-gold-600 italic">Strategy</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-ink-600 leading-relaxed text-lg">
            Join the world&apos;s most elite chess community. Play against top-tier
            opponents, analyze with advanced AI, and learn from legendary
            Grandmasters. Every move recorded onchain.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {user ? (
              <Link
                href="/lobby"
                className="rounded-md bg-gold-shine px-7 py-3 text-sm font-medium tracking-wide uppercase text-parchment-50 shadow-soft hover:opacity-90 transition"
              >
                Play Now
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="rounded-md bg-gold-shine px-7 py-3 text-sm font-medium tracking-wide uppercase text-parchment-50 shadow-soft hover:opacity-90 transition"
                >
                  Play Now
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-ink-900 px-7 py-3 text-sm font-medium tracking-wide uppercase text-ink-900 hover:bg-ink-900 hover:text-parchment-50 transition"
                >
                  Explore Community
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─────────────── FEATURE CARDS ─────────────── */}
      <section className="bg-parchment-100/60 border-y border-parchment-300">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="font-serif text-3xl md:text-4xl tracking-wide text-ink-900 uppercase">
              Engineered for Excellence
            </h2>
            <div className="mt-3 flex justify-center">
              <span className="gold-rule" />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Zap size={20} strokeWidth={1.5} />}
              title="Live Play"
              body="Experience lag-free matches on our high-performance global servers. Rated play with advanced anti-cheat measures."
            />
            <FeatureCard
              icon={<LineChart size={20} strokeWidth={1.5} />}
              title="Advanced Analysis"
              highlight
              body="Deep dive into your games with cloud-integrated Stockfish 16. Identify blunders, missed wins, and tactical patterns instantly."
            />
            <FeatureCard
              icon={<Trophy size={20} strokeWidth={1.5} />}
              title="Global Tournaments"
              body="Compete in sanctioned grand prix events with significant prize pools and official ranking systems."
            />
          </div>
        </div>
      </section>

      {/* ─────────────── COACHING ─────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Image / placeholder */}
          <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-ink-900/90 shadow-card">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at 30% 20%, rgba(184,144,31,0.25), transparent 60%), linear-gradient(180deg, #1a1a1a 0%, #2a2620 100%)',
              }}
            />
            <div className="relative z-10 h-full flex flex-col items-center justify-center p-10 text-parchment-100">
              <GraduationCap size={64} className="text-gold-400 mb-6" strokeWidth={1.2} />
              <p className="font-serif text-2xl italic text-center leading-snug">
                &ldquo;Chess is the gymnasium of the mind.&rdquo;
              </p>
              <p className="mt-4 text-xs uppercase tracking-[0.3em] text-gold-300">
GM Alexander Vance
              </p>
            </div>
          </div>

          {/* Copy */}
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-700">
              Elite Training
            </p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl leading-tight text-ink-900">
              Grandmaster<br />Coaching
            </h2>
            <p className="mt-6 text-ink-600 leading-relaxed">
              Gain exclusive access to private sessions with the world&apos;s leading
              tactical minds. Our curated coaching program pairs you with mentors
              who have reached the pinnacle of FIDE rankings.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink-600">
              {[
                'Personalized opening repertoire development',
                'Interactive endgame masterclasses',
                'Real-time match review & psychological training',
              ].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <Check size={18} className="text-gold-600 mt-0.5 shrink-0" strokeWidth={2} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href={user ? '/lobby' : '/signup'}
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium tracking-wide uppercase text-gold-700 border-b border-gold-500 pb-1 hover:text-gold-600 hover:border-gold-600 transition"
            >
              Book a consultation
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────── HOW IT WORKS ─────────────── */}
      <section className="bg-parchment-100/60 border-y border-parchment-300">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-3">
              From Sign-Up to Checkmate
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-wide text-ink-900 uppercase">
              How It Works
            </h2>
            <div className="mt-3 flex justify-center">
              <span className="gold-rule" />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <StepCard
              step="01"
              title="Create your account"
              body="A self-custody GenLayer wallet is derived for you instantly. No seed phrases, no extensions. Your identity follows you across every device."
            />
            <StepCard
              step="02"
              title="Find your match"
              body="Pick a time control or accept an open challenge. Our matchmaker pairs you with players near your rating in seconds."
              highlight
            />
            <StepCard
              step="03"
              title="Settle onchain"
              body="When the game ends, the result is committed to GenLayer. Your rating, history, and trophies live forever on-chain."
            />
          </div>
        </div>
      </section>

      {/* ─────────────── ONCHAIN STRIP ─────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6 text-center">
          <SmallFeat
            icon={<ShieldCheck size={22} className="text-gold-600" strokeWidth={1.5} />}
            title="Provable Games"
            body="Every result settled by a GenLayer intelligent contract."
          />
          <SmallFeat
            icon={<Sparkles size={22} className="text-gold-600" strokeWidth={1.5} />}
            title="Self-custody Wallet"
            body="A wallet is derived for you at signup. Yours across every device."
          />
          <SmallFeat
            icon={<Trophy size={22} className="text-gold-600" strokeWidth={1.5} />}
            title="Onchain Tournaments"
            body="Brackets, prize pools, and standings recorded on-chain."
          />
        </div>
      </section>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="border-t border-parchment-300">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-sm text-ink-400">
          <span className="font-serif text-xl text-ink-900">Omnira</span>
          <nav className="flex flex-wrap gap-6">
            <Link href="/" className="hover:text-ink-900">Privacy Policy</Link>
            <Link href="/" className="hover:text-ink-900">Terms of Service</Link>
            <Link href="/" className="hover:text-ink-900">Support</Link>
            <Link href="/" className="hover:text-ink-900">Careers</Link>
          </nav>
          <span>© {new Date().getFullYear()} Omnira. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

/* ───────────── Sub-components ───────────── */

function FeatureCard({
  icon,
  title,
  body,
  highlight = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-7 transition ${
        highlight
          ? 'bg-parchment-50 border border-gold-300 shadow-gold'
          : 'bg-parchment-50/70 border border-parchment-300 hover:border-gold-300 hover:shadow-card'
      }`}
    >
      <div
        className={`h-10 w-10 rounded-md flex items-center justify-center ${
          highlight
            ? 'bg-gold-shine text-parchment-50'
            : 'bg-parchment-200 text-gold-700'
        }`}
      >
        {icon}
      </div>
      <h3
        className={`mt-5 font-serif text-xl ${
          highlight ? 'text-gold-700' : 'text-ink-900'
        }`}
      >
        {title}
      </h3>
      <p className="mt-2 text-sm text-ink-600 leading-relaxed">{body}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  body,
  highlight = false,
}: {
  step: string;
  title: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl p-7 transition ${
        highlight
          ? 'bg-parchment-50 border border-gold-300 shadow-gold'
          : 'bg-parchment-50/70 border border-parchment-300 hover:border-gold-300 hover:shadow-card'
      }`}
    >
      <div
        className={`font-serif text-5xl leading-none ${
          highlight ? 'text-gold-600' : 'text-parchment-500'
        }`}
      >
        {step}
      </div>
      <h3 className="mt-4 font-serif text-2xl text-ink-900">{title}</h3>
      <p className="mt-2 text-sm text-ink-600 leading-relaxed">{body}</p>
    </div>
  );
}

function SmallFeat({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center px-4">
      <div className="h-12 w-12 rounded-full bg-parchment-100 border border-parchment-300 flex items-center justify-center">
        {icon}
      </div>
      <h4 className="mt-3 font-serif text-lg text-ink-900">{title}</h4>
      <p className="mt-1 text-sm text-ink-600 leading-relaxed">{body}</p>
    </div>
  );
}
