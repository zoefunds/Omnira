'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ─────────────────── Types ─────────────────── */

export type Language = 'en' | 'es' | 'fr' | 'de';
export type Theme = 'parchment' | 'ink' | 'system';
export type BoardStyle = 'classic' | 'walnut' | 'marble';
export type PieceSet = 'engraved' | 'modern' | 'minimal';

/** Each board style maps to a [light, dark] CSS color pair, used everywhere
 *  we render react-chessboard. */
export const BOARD_PALETTES: Record<BoardStyle, { light: string; dark: string }> = {
  classic: { light: 'var(--board-light)', dark: 'var(--board-dark)' },
  walnut:  { light: '#e9d8b5', dark: '#7d5638' },
  marble:  { light: '#ece4d8', dark: '#7d7a72' },
};

export const LANG_LABEL: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

/* Strings used across the surface area. Keep small + grow as needed. */
type Strings = {
  navPlay: string;
  navPuzzles: string;
  navTournaments: string;
  navWatch: string;
  navSignIn: string;
  navJoinNow: string;
  navSignOut: string;
  settingsTitle: string;
  settingsBlurb: string;
  langLabel: string;
  themeLabel: string;
  boardLabel: string;
  pieceLabel: string;
  notificationsTitle: string;
  notificationsBlurb: string;
  accountTitle: string;
  walletTitle: string;
  securityTitle: string;
  appearanceTitle: string;
  appearanceBlurb: string;
  saved: string;
};

const I18N: Record<Language, Strings> = {
  en: {
    navPlay: 'Play',
    navPuzzles: 'Puzzles',
    navTournaments: 'Tournaments',
    navWatch: 'Watch',
    navSignIn: 'Sign in',
    navJoinNow: 'Join Now',
    navSignOut: 'Sign out',
    settingsTitle: 'Settings',
    settingsBlurb: 'Manage your account, wallet, and preferences.',
    langLabel: 'Display language',
    themeLabel: 'Theme',
    boardLabel: 'Board style',
    pieceLabel: 'Piece set',
    notificationsTitle: 'Notifications',
    notificationsBlurb: 'Choose what you want to be alerted about.',
    accountTitle: 'Account',
    walletTitle: 'Wallet',
    securityTitle: 'Security',
    appearanceTitle: 'Appearance',
    appearanceBlurb: 'Make Omnira feel like home.',
    saved: 'Saved',
  },
  es: {
    navPlay: 'Jugar',
    navPuzzles: 'Tácticas',
    navTournaments: 'Torneos',
    navWatch: 'Ver',
    navSignIn: 'Iniciar sesión',
    navJoinNow: 'Únete ya',
    navSignOut: 'Cerrar sesión',
    settingsTitle: 'Ajustes',
    settingsBlurb: 'Gestiona tu cuenta, monedero y preferencias.',
    langLabel: 'Idioma',
    themeLabel: 'Tema',
    boardLabel: 'Estilo del tablero',
    pieceLabel: 'Juego de piezas',
    notificationsTitle: 'Notificaciones',
    notificationsBlurb: 'Elige sobre qué quieres ser avisado.',
    accountTitle: 'Cuenta',
    walletTitle: 'Monedero',
    securityTitle: 'Seguridad',
    appearanceTitle: 'Apariencia',
    appearanceBlurb: 'Haz que Omnira se sienta como en casa.',
    saved: 'Guardado',
  },
  fr: {
    navPlay: 'Jouer',
    navPuzzles: 'Tactiques',
    navTournaments: 'Tournois',
    navWatch: 'Regarder',
    navSignIn: 'Se connecter',
    navJoinNow: 'Rejoindre',
    navSignOut: 'Déconnexion',
    settingsTitle: 'Paramètres',
    settingsBlurb: 'Gérez votre compte, portefeuille et préférences.',
    langLabel: 'Langue',
    themeLabel: 'Thème',
    boardLabel: "Style d'échiquier",
    pieceLabel: 'Jeu de pièces',
    notificationsTitle: 'Notifications',
    notificationsBlurb: 'Choisissez ce dont vous voulez être averti.',
    accountTitle: 'Compte',
    walletTitle: 'Portefeuille',
    securityTitle: 'Sécurité',
    appearanceTitle: 'Apparence',
    appearanceBlurb: 'Faites de Omnira votre maison.',
    saved: 'Enregistré',
  },
  de: {
    navPlay: 'Spielen',
    navPuzzles: 'Taktik',
    navTournaments: 'Turniere',
    navWatch: 'Zuschauen',
    navSignIn: 'Anmelden',
    navJoinNow: 'Beitreten',
    navSignOut: 'Abmelden',
    settingsTitle: 'Einstellungen',
    settingsBlurb: 'Verwalte Konto, Wallet und Präferenzen.',
    langLabel: 'Sprache',
    themeLabel: 'Thema',
    boardLabel: 'Brettstil',
    pieceLabel: 'Figurensatz',
    notificationsTitle: 'Benachrichtigungen',
    notificationsBlurb: 'Wähle, worüber du benachrichtigt werden willst.',
    accountTitle: 'Konto',
    walletTitle: 'Wallet',
    securityTitle: 'Sicherheit',
    appearanceTitle: 'Erscheinungsbild',
    appearanceBlurb: 'Mach Omnira zu deinem Zuhause.',
    saved: 'Gespeichert',
  },
};

interface SettingsState {
  language: Language;
  theme: Theme;
  board: BoardStyle;
  pieceSet: PieceSet;
  setLanguage: (l: Language) => void;
  setTheme: (t: Theme) => void;
  setBoard: (b: BoardStyle) => void;
  setPieceSet: (p: PieceSet) => void;
  t: (key: keyof Strings) => string;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: 'en',
      theme: 'parchment',
      board: 'classic',
      pieceSet: 'engraved',
      setLanguage: (language) => {
        set({ language });
        if (typeof document !== 'undefined') {
          document.documentElement.lang = language;
        }
      },
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setBoard: (board) => {
        set({ board });
        applyBoard(board);
      },
      setPieceSet: (pieceSet) => set({ pieceSet }),
      t: (key) => I18N[get().language][key] ?? I18N.en[key],
    }),
    {
      name: 'omnira-settings',
      onRehydrateStorage: () => (state) => {
        if (typeof window === 'undefined' || !state) return;
        document.documentElement.lang = state.language;
        applyTheme(state.theme);
        applyBoard(state.board);
      },
    },
  ),
);

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'ink'
        : 'parchment'
      : theme;
  if (resolved === 'ink') {
    document.body.style.background = '#1a1a1a';
    document.body.style.color = '#efece4';
  } else {
    document.body.style.background = '#efece4';
    document.body.style.color = '#1a1a1a';
  }
}

function applyBoard(board: BoardStyle) {
  if (typeof document === 'undefined') return;
  const p = BOARD_PALETTES[board];
  document.documentElement.style.setProperty('--board-light', p.light);
  document.documentElement.style.setProperty('--board-dark', p.dark);
}
