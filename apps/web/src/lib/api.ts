import { API_BASE } from './config';

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  walletAddress: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export interface ApiNotification {
  id: string;
  kind:
    | 'WELCOME'
    | 'MATCH_INVITE'
    | 'TOURNAMENT_STARTING'
    | 'DAILY_PUZZLE'
    | 'ANALYSIS_READY'
    | 'FRIEND_ACTIVITY'
    | 'ANNOUNCEMENT';
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: ApiUser;
  token: string;
}

export type ChallengeColor = 'WHITE' | 'BLACK' | 'RANDOM';
export type ChallengeStatus = 'OPEN' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';

export interface ApiChallenge {
  id: string;
  code: string;
  creatorId: string;
  creator: { id: string; username: string };
  category: 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';
  initialMs: number;
  incrementMs: number;
  colorPreference: ChallengeColor;
  rated: boolean;
  isPublic: boolean;
  minRating: number | null;
  maxRating: number | null;
  status: ChallengeStatus;
  acceptedById: string | null;
  matchId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface CreateChallengeBody {
  initialMs: number;
  incrementMs: number;
  colorPreference?: ChallengeColor;
  rated?: boolean;
  isPublic?: boolean;
  minRating?: number | null;
  maxRating?: number | null;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Broadcast that the session has been invalidated (refresh failed or token
 *  is no longer valid). Listeners (AuthGuard, individual pages) can wipe
 *  local state and bounce to /login. */
function emitSessionExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('omnira:session-expired'));
}

async function attemptRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('omnira.auth');
    if (!raw) {
      emitSessionExpired();
      return null;
    }
    const { state } = JSON.parse(raw) as { state: { refreshToken?: string | null } };
    const refreshToken = state?.refreshToken;
    if (!refreshToken) {
      emitSessionExpired();
      return null;
    }
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!r.ok) {
      // 401/410 — refresh token revoked or expired; force user to log in again.
      if (r.status === 401 || r.status === 410 || r.status === 403) {
        emitSessionExpired();
      }
      return null;
    }
    const j = (await r.json()) as { token: string };
    // Update storage in place.
    const parsed = JSON.parse(raw);
    parsed.state.token = j.token;
    localStorage.setItem('omnira.auth', JSON.stringify(parsed));
    // Also update the in-memory Zustand store so subsequent calls in this
    // session use the fresh token without waiting for a page reload.
    try {
      const { useAuth } = await import('@/store/auth');
      useAuth.setState({ token: j.token });
    } catch {
      /* ignore — circular import safety */
    }
    return j.token;
  } catch {
    // Network failure during refresh — don't kill the session, the next
    // call will retry. Only treat explicit server rejections as expired.
    return null;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string; _retried?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 && init.token && !init._retried) {
    const fresh = await attemptRefresh();
    if (fresh) return request<T>(path, { ...init, token: fresh, _retried: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json?.error ?? 'UNKNOWN', json?.message ?? res.statusText);
  return json as T;
}

export const api = {
  signup(body: { email: string; username: string; password: string }) {
    return request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) });
  },
  login(body: { identifier: string; password: string }) {
    return request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  },
  me(token: string) {
    return request<{ user: ApiUser }>('/auth/me', { method: 'GET', token });
  },
  currentMatch(token: string) {
    return request<{
      match: {
        matchId: string;
        whitePlayerId: string;
        blackPlayerId: string;
        fen: string;
        initialMs: number;
        incrementMs: number;
        whiteMs: number;
        blackMs: number;
        turn: 'w' | 'b';
        ply: number;
        history: Array<{ ply: number; san: string; uci: string }>;
        ended: boolean;
        drawOfferFrom: 'w' | 'b' | null;
      } | null;
    }>('/me/current-match', { method: 'GET', token });
  },
  forgotPassword(body: { email: string }) {
    return request<{ ok: true; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  resetPassword(body: { token: string; newPassword: string }) {
    return request<{ ok: true }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  setAvatar(body: { dataUrl: string }, token: string) {
    return request<{ ok: true }>('/me/avatar', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  removeAvatar(token: string) {
    return request<{ ok: true }>('/me/avatar', { method: 'DELETE', token });
  },
  deleteAccount(body: { password: string; confirmUsername: string }, token: string) {
    return request<{ ok: true }>('/me', {
      method: 'DELETE',
      token,
      body: JSON.stringify(body),
    });
  },
  verifyEmail(body: { token: string }) {
    return request<{ ok: true }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  resendVerification(token: string) {
    return request<{ ok: true }>('/me/resend-verification', {
      method: 'POST',
      token,
    });
  },
  listNotifications(token: string) {
    return request<{ items: ApiNotification[]; unread: number }>(
      '/me/notifications',
      { method: 'GET', token },
    );
  },
  markNotificationsRead(body: { ids?: string[]; all?: boolean }, token: string) {
    return request<{ ok: true; updated: number }>(
      '/me/notifications/mark-read',
      { method: 'POST', token, body: JSON.stringify(body) },
    );
  },
  exportWallet(body: { password: string }, token: string) {
    return request<{
      address: string;
      privateKey: string;
      derivationVersion: string;
    }>('/me/wallet/export', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  listChallenges() {
    return request<{ challenges: ApiChallenge[] }>('/challenges', { method: 'GET' });
  },
  getChallenge(code: string) {
    return request<{ challenge: ApiChallenge }>(`/challenges/${code}`, { method: 'GET' });
  },
  createChallenge(body: CreateChallengeBody, token: string) {
    return request<{ challenge: ApiChallenge }>('/challenges', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  cancelChallenge(code: string, token: string) {
    return request<{ challenge: ApiChallenge }>(`/challenges/${code}`, {
      method: 'DELETE',
      token,
    });
  },
};

// ────────── Tournaments ──────────

export type TournamentStatus = 'UPCOMING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';

export interface ApiTournament {
  id: string;
  name: string;
  onchainTxHash?: string | null;
  onchainSettledTxHash?: string | null;
  onchainSettledAt?: string | null;
  format: 'ARENA';
  createdById: string;
  createdBy: { id: string; username: string };
  category: 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  startsAt: string;
  durationMs: number;
  endsAt: string;
  status: TournamentStatus;
  winnerId: string | null;
  _count: { players: number };
}

export interface ApiTournamentPlayer {
  id: string;
  tournamentId: string;
  userId: string;
  user: { id: string; username: string };
  score: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  hasStreakBonus: boolean;
  ratingAtStart: number | null;
  joinedAt: string;
  withdrew: boolean;
}

export interface CreateTournamentBody {
  name: string;
  initialMs: number;
  incrementMs: number;
  rated?: boolean;
  startsAt: string;       // ISO
  durationMs: number;
}

api.listTournaments = (status?: TournamentStatus) =>
  request<{ tournaments: ApiTournament[] }>(`/tournaments${status ? `?status=${status}` : ''}`, { method: 'GET' });
api.getTournament = (id: string) =>
  request<{ tournament: ApiTournament }>(`/tournaments/${id}`, { method: 'GET' });
api.getStandings = (id: string) =>
  request<{ standings: ApiTournamentPlayer[] }>(`/tournaments/${id}/standings`, { method: 'GET' });
api.createTournament = (body: CreateTournamentBody, token: string) =>
  request<{ tournament: ApiTournament }>('/tournaments', { method: 'POST', token, body: JSON.stringify(body) });
api.joinTournament = (id: string, token: string) =>
  request<{ player: ApiTournamentPlayer }>(`/tournaments/${id}/join`, { method: 'POST', token, body: '{}' });
api.withdrawTournament = (id: string, token: string) =>
  request<{ ok: boolean }>(`/tournaments/${id}/withdraw`, { method: 'POST', token, body: '{}' });

export interface ApiActiveTournamentMatch {
  id: string;
  whitePlayerId: string;
  blackPlayerId: string;
  currentFen: string | null;
  ply: number;
  whitePlayer: { id: string; username: string };
  blackPlayer: { id: string; username: string };
  startedAt: string;
}

api.listActiveMatches = (id: string) =>
  request<{ matches: ApiActiveTournamentMatch[] }>(`/tournaments/${id}/active-matches`, { method: 'GET' });

// ────────── Users / profiles ──────────

export interface ApiProfile {
  id: string;
  username: string;
  walletAddress: string | null;
  avatarUrl: string | null;
  memberSince: string;
  ratings: Array<{
    category: 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';
    rating: number;
    gamesPlayed: number;
    ratingDev: number;
  }>;
}

export interface ApiProfileMatch {
  id: string;
  status: string;
  resultReason: string | null;
  category: string;
  initialTimeSec: number;
  incrementSec: number;
  whitePlayerId: string;
  blackPlayerId: string;
  whiteRatingBefore: number | null;
  blackRatingBefore: number | null;
  whiteRatingAfter: number | null;
  blackRatingAfter: number | null;
  tournamentId: string | null;
  createdAt: string;
  endedAt: string | null;
  whitePlayer: { id: string; username: string };
  blackPlayer: { id: string; username: string };
  analysis: { matchId: string; llmSummary: string } | null;
}

export interface ApiProfileTournament {
  id: string;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  withdrew: boolean;
  tournament: {
    id: string;
    name: string;
    status: 'UPCOMING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
    startsAt: string;
    endsAt: string;
    category: string;
    initialMs: number;
    incrementMs: number;
    winnerId: string | null;
  };
}

export interface ApiAnalyzedMatch {
  id: string;
  status: string;
  category: string;
  createdAt: string;
  endedAt: string | null;
  whitePlayer: { id: string; username: string };
  blackPlayer: { id: string; username: string };
  analysis: { llmSummary: string };
}

api.getProfile = (username: string) => request<{ profile: ApiProfile }>(`/users/${username}`, { method: 'GET' });
api.getProfileMatches = (username: string) => request<{ matches: ApiProfileMatch[] }>(`/users/${username}/matches`, { method: 'GET' });
api.getProfileRatings = (username: string) => request<{ history: Record<string, Array<{ at: string; rating: number }>> }>(`/users/${username}/ratings`, { method: 'GET' });
api.getProfileTournaments = (username: string) => request<{ tournaments: ApiProfileTournament[] }>(`/users/${username}/tournaments`, { method: 'GET' });
api.getProfileAnalyses = (username: string) => request<{ matches: ApiAnalyzedMatch[] }>(`/users/${username}/analyses`, { method: 'GET' });

// ────────── Spectator ──────────

export interface ApiSiteActiveMatch {
  id: string;
  whitePlayer: { id: string; username: string };
  blackPlayer: { id: string; username: string };
  category: string;
  initialTimeSec: number;
  incrementSec: number;
  tournamentId: string | null;
  startedAt: string;
  currentFen: string | null;
  ply: number;
}

export interface ApiMatchState {
  id: string;
  status: string;
  resultReason: string | null;
  category: string;
  initialTimeSec: number;
  incrementSec: number;
  whitePlayer: { id: string; username: string };
  blackPlayer: { id: string; username: string };
  whiteRatingBefore: number | null;
  blackRatingBefore: number | null;
  whiteRatingAfter: number | null;
  blackRatingAfter: number | null;
  finalFen: string | null;
  currentFen: string | null;
  pgn: string | null;
  startedAt: string | null;
  endedAt: string | null;
  tournamentId: string | null;
  onchainMatchId: string | null;
  onchainTxHash: string | null;
  onchainSettledAt: string | null;
  moves: Array<{ ply: number; san: string; uci: string; fenAfter: string; clockMsWhite: number; clockMsBlack: number }>;
}

api.getMatchesSummary = () =>
  request<{ all: number; BULLET: number; BLITZ: number; RAPID: number; CLASSICAL: number }>(
    '/matches/summary',
    { method: 'GET' },
  );

api.listActiveSiteMatches = (opts?: {
  page?: number;
  pageSize?: number;
  category?: 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';
}) => {
  const qs = new URLSearchParams();
  if (opts?.page) qs.set('page', String(opts.page));
  if (opts?.pageSize) qs.set('pageSize', String(opts.pageSize));
  if (opts?.category) qs.set('category', opts.category);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<{
    matches: ApiSiteActiveMatch[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }>(`/matches/active${suffix}`, { method: 'GET' });
};
api.getMatchState = (matchId: string) =>
  request<{ match: ApiMatchState }>(`/match/${matchId}`, { method: 'GET' });

// ────────── Puzzles ──────────

export interface ApiPuzzle {
  id: string;
  fen: string;
  sideToMove: 'w' | 'b';
  themes: string[];
  rating: number;
}

export interface ApiPuzzleAttemptResponse {
  result: 'CORRECT' | 'WRONG' | 'SKIPPED';
  solutionUci: string;
  solutionSan: string;
  userRating: number;
  puzzleRating: number;
}

export interface ApiPuzzleStats {
  rating: number;
  ratingDev: number;
  solved: number;
  attempted: number;
}

api.getNextPuzzle = (token: string) => request<{ puzzle: ApiPuzzle } | null>('/puzzles/next', { method: 'GET', token });
api.submitPuzzleAttempt = (body: {
  puzzleId: string;
  submittedUci?: string;
  result: 'CORRECT' | 'WRONG' | 'SKIPPED';
  thinkMs: number;
}, token: string) => request<ApiPuzzleAttemptResponse>('/puzzles/attempt', { method: 'POST', token, body: JSON.stringify(body) });
api.getPuzzleStats = (username: string) => request<{ stats: ApiPuzzleStats | null }>(`/puzzles/stats/${username}`, { method: 'GET' });

