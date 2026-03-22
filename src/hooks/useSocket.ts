import { io, type Socket } from "socket.io-client";
import { useEffect, useState, useRef } from "react";

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
  url: string = "http://localhost:3001",
): UseSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(url, {
      transports: ["websocket", "polling"],
      timeout: 20_000,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      forceNew: true,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
      setReconnectAttempts(0);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleConnectError = (error: Error) => {
      setConnectionError(error.message);
    };

    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempts(attempt);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url]);

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    reconnectAttempts,
  };
}
