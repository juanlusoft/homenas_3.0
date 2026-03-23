-- HomePiNAS v3 — SQLite Schema
-- Persistent state for dashboard config, user prefs, and cached metrics

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  totp_secret TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cpu REAL,
  memory_used REAL,
  memory_total REAL,
  temperature REAL,
  load_1 REAL,
  load_5 REAL,
  load_15 REAL,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Auto-cleanup: keep only 24h of metric snapshots
CREATE TRIGGER IF NOT EXISTS cleanup_old_metrics
AFTER INSERT ON metric_snapshots
BEGIN
  DELETE FROM metric_snapshots
  WHERE timestamp < datetime('now', '-24 hours');
END;

CREATE TABLE IF NOT EXISTS disk_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
