/**
 * Notification state management hook
 */

import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
import type { Notification } from '@/components/Notifications';

// Initial mock notifications
const INITIAL: Notification[] = [
  { id: 1, type: 'success', title: 'System backup completed', message: 'Full backup finished in 12 minutes', time: '10 min ago', read: false },
  { id: 2, type: 'warning', title: 'Disk /dev/sda at 85%', message: 'Consider cleaning up or expanding storage', time: '1h ago', read: false },
  { id: 3, type: 'info', title: 'Docker update available', message: 'nginx:1.27 → 1.28 available', time: '3h ago', read: true },
];

let nextId = 100;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL);
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
