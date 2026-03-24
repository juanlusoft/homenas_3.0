/**
 * Socket.io Context — single shared connection for the entire app
 */

import React, { createContext, useContext, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from '../hooks/useSocket';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  error: string | null;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  error: null,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { socket, connected, error } = useSocket();

  const value = useMemo(() => ({ socket, connected, error }), [socket, connected, error]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext);
}

export default SocketContext;
