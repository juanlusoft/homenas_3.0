/**
 * Real-time metrics hook — consumes Socket.io 'metrics' events
 */

import { useState, useEffect } from 'react';
import { useSocket } from './useSocket';

export interface LiveMetrics {
  cpu: string;
  memory: { used: number; total: number };
  temperature: number;
  uptime: number;
  network: { rx: number; tx: number } | null;
  timestamp: string;
}

export interface UseLiveMetricsReturn {
  metrics: LiveMetrics | null;
  isConnected: boolean;
  history: LiveMetrics[];
}

const MAX_HISTORY = 60; // 2 minutes at 2s intervals

export function useLiveMetrics(): UseLiveMetricsReturn {
  const { socket, connected: isConnected } = useSocket();
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [history, setHistory] = useState<LiveMetrics[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleMetrics = (data: LiveMetrics) => {
      setMetrics(data);
      setHistory(prev => {
        const next = [...prev, data];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
    };

    socket.on('metrics', handleMetrics);

    return () => {
      socket.off('metrics', handleMetrics);
    };
  }, [socket]);

  return { metrics, isConnected, history };
}
