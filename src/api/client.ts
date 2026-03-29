/**
 * Centralized API client with JWT authentication
 */

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'homepinas-token';
const USER_KEY = 'homepinas-user';

// ── Token management ──────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): { username: string; role: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: { username: string; role: string }): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ── Authenticated fetch ───────────────────────────────────────────────

export async function fetchAPI<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle auth errors globally
  if (response.status === 401) {
    clearToken();
    // Dispatch event so App.tsx can redirect to login
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new AuthError('Session expired. Please log in again.');
  }

  if (response.status === 403) {
    throw new AuthError('Access denied. Insufficient permissions.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(body.error || `Request failed: ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

// ── Convenience methods ───────────────────────────────────────────────

fetchAPI.get = <T = unknown>(endpoint: string) => fetchAPI<T>(endpoint);

fetchAPI.post = <T = unknown>(endpoint: string, body?: unknown) =>
  fetchAPI<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });

fetchAPI.put = <T = unknown>(endpoint: string, body?: unknown) =>
  fetchAPI<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });

fetchAPI.delete = <T = unknown>(endpoint: string) =>
  fetchAPI<T>(endpoint, { method: 'DELETE' });

export const api = {
  get: fetchAPI.get,
  post: fetchAPI.post,
  put: fetchAPI.put,
  delete: fetchAPI.delete,
  // Legacy convenience methods used by pages
  getDisks: () => fetchAPI<DiskInfo[]>('/storage/disks'),
  getNetwork: () => fetchAPI<NetworkInterface[]>('/network/interfaces'),
  getDocker: () => fetchAPI<DockerContainer[]>('/services/docker'),
  getSystemd: () => fetchAPI<SystemdService[]>('/services/systemd'),
};

// ── Error classes ─────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ── Legacy interfaces (kept for backward compat) ──────────────────────

export interface SystemMetrics {
  cpu: number;
  memory: { used: number; total: number; percent: number };
  temperature: number;
  uptime: number;
  hostname: string;
  loadAvg: number[];
}

export interface DiskInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  size: number;
  used: number;
  available: number;
  free?: number;
  usage?: number;
  usagePercent: number;
  type: 'HDD' | 'SSD' | 'NVMe' | 'Unknown';
  name?: string;
  role?: string;
  temperature?: number;
  model?: string;
  serial?: string;
  health?: string;
  smart?: { status?: string; powerOnHours?: number; badSectors?: number } | null;
  powerOnHours?: number;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  mac: string;
  speed: string;
  status: 'up' | 'down';
  rx: number;
  tx: number;
  netmask?: string;
  gateway?: string;
  rx_bytes?: number;
  tx_bytes?: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'stopped' | 'paused';
  ports: string;
  cpu: number;
  memory: number;
  uptime?: string;
}

export interface SystemdService {
  name: string;
  status: 'running' | 'stopped' | 'failed' | 'active';
  enabled: boolean;
  description: string;
  state?: string;
}

// ── Legacy fetch functions (now use fetchAPI internally) ──────────────

export const fetchMetrics = (): Promise<SystemMetrics> => fetchAPI('/system');
export type Disk = DiskInfo;
export const fetchDisks = (): Promise<DiskInfo[]> => fetchAPI('/storage/disks');
export const fetchNetwork = (): Promise<NetworkInterface[]> => fetchAPI('/network/interfaces');
export const fetchDocker = (): Promise<DockerContainer[]> => fetchAPI('/services/docker');
export const fetchSystemd = (): Promise<SystemdService[]> => fetchAPI('/services/systemd');
