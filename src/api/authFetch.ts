/**
 * Authenticated fetch wrapper — automatically adds JWT token
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function getToken(): string | null {
  return localStorage.getItem('homepinas-token');
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't override Content-Type for FormData (file uploads)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...options, headers });

  // If 401, token expired — just log it, don't reload (avoids infinite loop)
  if (res.status === 401) {
    console.warn('[authFetch] 401 on', path);
  }

  return res;
}

/** Shorthand for GET */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  return res.json();
}

/** Shorthand for POST */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await authFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
