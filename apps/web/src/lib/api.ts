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
