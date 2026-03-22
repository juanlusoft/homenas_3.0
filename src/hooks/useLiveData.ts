import { useState, useEffect } from "react";
import { useSocket } from "./useSocket";

export interface UseLiveDataReturn<T> {
  data: T;
  lastUpdate: Date;
}

/**
 * Generic hook for subscribing to a single Socket.io event.
 * Updates state whenever the server emits data on the given event name.
 *
 * @param event - Socket.io event name to listen on
 * @param initialData - Default value before the first event arrives
 * @param url - Optional Socket.io server URL
 */
export function useLiveData<T>(
  event: string,
  initialData: T,
  url?: string,
): UseLiveDataReturn<T> {
  const { socket } = useSocket(url);
  const [data, setData] = useState<T>(initialData);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (!socket) return;

    const handleData = (newData: T) => {
      setData(newData);
      setLastUpdate(new Date());
    };

    socket.on(event, handleData);

    return () => {
      socket.off(event, handleData);
    };
  }, [socket, event]);

  return { data, lastUpdate };
}
