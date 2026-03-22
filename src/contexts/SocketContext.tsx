import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useSocket, type UseSocketReturn } from "@/hooks/useSocket";

const SocketContext = createContext<UseSocketReturn | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
  /** Socket.io server URL. Defaults to http://localhost:3001 */
  url?: string;
}

/**
 * Provides a shared Socket.io connection to the component tree.
 * Wrap your app (or a subtree) with this provider, then consume
 * with `useSocketContext()` in child components.
 */
export function SocketProvider({ children, url }: SocketProviderProps) {
  const socketState = useSocket(url);

  return (
    <SocketContext.Provider value={socketState}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Consume the shared Socket.io connection from the nearest `SocketProvider`.
 * Throws if used outside the provider boundary.
 */
export function useSocketContext(): UseSocketReturn {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return context;
}
