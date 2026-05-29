import { API_BASE } from './config';

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  walletAddress: string;
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

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
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

api.listActiveSiteMatches = () =>
  request<{ matches: ApiSiteActiveMatch[] }>(`/matches/active`, { method: 'GET' });
api.getMatchState = (matchId: string) =>
  request<{ match: ApiMatchState }>(`/match/${matchId}`, { method: 'GET' });

