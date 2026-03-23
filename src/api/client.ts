/**
 * API client for HomePiNAS Mock API
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// Types
export interface SystemMetrics {
  cpu: string;
  memory: { used: number; total: number; free: number };
  temperature: number;
  uptime: number;
  load: string[];
  timestamp: string;
}

export interface Disk {
  device: string;
  name: string;
  size: string;
  used: string;
  free: string;
  usage: number;
  health: 'healthy' | 'warning' | 'critical';
  temperature: number;
  type: string;
  role?: 'cache' | 'data' | 'parity' | 'system';
  smart: { status: string; powerOnHours: number; badSectors: number };
}

export interface NetworkInterface {
  name: string;
  ip: string;
  netmask: string;
  gateway: string;
  status: 'up' | 'down';
  speed: string;
  rx_bytes: number;
  tx_bytes: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused';
  uptime: string;
  ports: string[];
  cpu: string;
  memory: number;
}

export interface SystemdService {
  name: string;
  status: 'active' | 'inactive' | 'failed';
  state: string;
  enabled: boolean;
  uptime: string;
}

// API functions
export const api = {
  getMetrics: () => fetchAPI<SystemMetrics>('/system/metrics'),
  getDisks: () => fetchAPI<Disk[]>('/storage/disks'),
  getNetwork: () => fetchAPI<NetworkInterface[]>('/network/interfaces'),
  getDocker: () => fetchAPI<DockerContainer[]>('/services/docker'),
  getSystemd: () => fetchAPI<SystemdService[]>('/services/systemd'),
};
