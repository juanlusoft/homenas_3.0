import { io, type Socket } from "socket.io-client";
import { useEffect, useState, useCallback } from "react";

export interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  reconnectAttempts: number;
}

/**
 * Core Socket.io connection hook.
 * Manages a single socket instance with automatic reconnection,
 * connection state tracking, and proper cleanup on unmount.
 *
 * @param url - Socket.io server URL (defaults to localhost:3001)
 */
export function useSocket(
  url: string = import.meta.env.VITE_WS_URL || window.location.origin,
): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
    setConnectionError(null);
    setReconnectAttempts(0);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  const handleConnectError = useCallback((error: Error) => {
    setConnectionError(error.message);
  }, []);

  const handleReconnectAttempt = useCallback((attempt: number) => {
    setReconnectAttempts(attempt);
  }, []);

  useEffect(() => {
    const newSocket = io(url, {
      transports: ["websocket", "polling"],
      timeout: 20_000,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      forceNew: true,
    });

    newSocket.on("connect", handleConnect);
    newSocket.on("disconnect", handleDisconnect);
    newSocket.on("connect_error", handleConnectError);
    newSocket.io.on("reconnect_attempt", handleReconnectAttempt);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- socket must be initialized in effect
    setSocket(newSocket);

    return () => {
      newSocket.off("connect", handleConnect);
      newSocket.off("disconnect", handleDisconnect);
      newSocket.off("connect_error", handleConnectError);
      newSocket.io.off("reconnect_attempt", handleReconnectAttempt);
      newSocket.disconnect();
      setSocket(null);
    };
  }, [url, handleConnect, handleDisconnect, handleConnectError, handleReconnectAttempt]);

  return {
    socket,
    isConnected,
    connectionError,
    reconnectAttempts,
  };
}
