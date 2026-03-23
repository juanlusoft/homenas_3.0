/**
 * Notification state management hook
 */

import { useState, useCallback, useEffect } from 'react';
// useEffect already imported
import { useSocket } from './useSocket';
import type { Notification } from '@/components/Notifications';

const INITIAL: Notification[] = [];

let nextId = 100;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL);

  // Fetch notification history from backend
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || '/api'}/settings/notifications/history`)
      .then(r => r.json())
      .then((history: { title: string; message: string; severity: string; time: string }[]) => {
        const mapped: Notification[] = history.slice(0, 20).map((h, i) => ({
          id: nextId + i,
          type: h.severity === 'error' ? 'error' as const : h.severity === 'warning' ? 'warning' as const : 'info' as const,
          title: h.title,
          message: h.message,
          time: new Date(h.time).toLocaleString(),
          read: false,
        }));
        if (mapped.length > 0) setNotifications(mapped);
      })
      .catch(() => {});
  }, []);
  const { socket } = useSocket();

  // Listen for server-pushed notifications
  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data: { type: Notification['type']; title: string; message?: string }) => {
      setNotifications(prev => [{
        id: nextId++,
        type: data.type,
        title: data.title,
        message: data.message,
        time: 'Just now',
        read: false,
      }, ...prev]);
    };

    socket.on('notification', handleNotification);
    return () => { socket.off('notification', handleNotification); };
  }, [socket]);

  const markRead = useCallback((id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, markRead, clearAll };
}
