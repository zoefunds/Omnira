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
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? 'UNKNOWN', json?.message ?? res.statusText);
  }
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
};
