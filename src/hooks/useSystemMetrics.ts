import { useState, useEffect } from "react";
import { useSocket } from "./useSocket";

/** Real-time system metrics received from the NAS backend. */
export interface SystemMetrics {
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
  network: { rx: number; tx: number };
  temperature?: number;
}

export interface UseSystemMetricsReturn {
  metrics: SystemMetrics | null;
  isConnected: boolean;
}

/**
 * Hook for real-time system metrics via Socket.io.
 * Listens to the `system_metrics` event and exposes
 * the latest snapshot along with connection state.
 *
 * @param url - Socket.io server URL (defaults to localhost:3001)
 */
export function useSystemMetrics(
  url?: string,
): UseSystemMetricsReturn {
  const { socket, isConnected } = useSocket(url);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleMetrics = (data: SystemMetrics) => {
      setMetrics(data);
    };

    socket.on("system_metrics", handleMetrics);

    return () => {
      socket.off("system_metrics", handleMetrics);
    };
  }, [socket]);

  return { metrics, isConnected };
}
