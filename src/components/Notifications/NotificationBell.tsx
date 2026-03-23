/**
 * Notification bell with dropdown — shows recent alerts
 */

import { useState, useRef, useEffect } from 'react';

export interface Notification {
  id: number;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message?: string;
  time: string;
  read: boolean;
}

const TYPE_ICONS: Record<Notification['type'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '🔴',
  success: '✅',
};

interface NotificationBellProps {
  notifications: Notification[];
  onMarkRead: (id: number) => void;
  onClearAll: () => void;
}

export function NotificationBell({ notifications, onMarkRead, onClearAll }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.read).length;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-[var(--text-secondary)] hover:bg-surface-void transition-colors"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[var(--error)] rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto glass-elevated rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={onClearAll} className="text-xs text-teal hover:underline">
                Clear all
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-disabled)]">No notifications</p>
          ) : (
            <div>
              {notifications.slice(0, 10).map(n => (
                <button
                  key={n.id}
                  onClick={() => onMarkRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--outline-variant)] hover:bg-surface-void transition-colors ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{TYPE_ICONS[n.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{n.title}</p>
                      {n.message && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{n.message}</p>
                      )}
                      <p className="text-xs text-[var(--text-disabled)] mt-1">{n.time}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-teal mt-1.5 shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
