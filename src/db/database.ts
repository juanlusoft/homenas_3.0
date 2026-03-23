/**
 * HomePiNAS v3 — SQLite database layer
 * Uses better-sqlite3 for synchronous, fast local storage.
 *
 * NOTE: This module is for server-side (backend/Electron) use only.
 * The Vite frontend imports types but not the Database class directly.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  message: string | null;
  severity: 'info' | 'warning' | 'error' | 'success';
  read: number;
  created_at: string;
}

export interface MetricSnapshot {
  id: number;
  cpu: number;
  memory_used: number;
  memory_total: number;
  temperature: number;
  load_1: number;
  load_5: number;
  load_15: number;
  timestamp: string;
}

/**
 * Database manager — singleton pattern.
 * WAL mode for concurrent read performance.
 */
export class HomePiNASDB {
  private db: Database.Database;

  constructor(dbPath: string = join(__dirname, '../../data/homepinas.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  /** Run schema migrations */
  private init(): void {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schema);
  }

  /** Get a config value */
  getConfig(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM config WHERE key = ?')
      .get(key) as ConfigRow | undefined;
    return row?.value;
  }

  /** Set a config value (upsert) */
  setConfig(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value);
  }

  /** Record a metric snapshot */
  recordMetrics(metrics: Omit<MetricSnapshot, 'id' | 'timestamp'>): void {
    this.db
      .prepare(
        `INSERT INTO metric_snapshots (cpu, memory_used, memory_total, temperature, load_1, load_5, load_15)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        metrics.cpu, metrics.memory_used, metrics.memory_total,
        metrics.temperature, metrics.load_1, metrics.load_5, metrics.load_15
      );
  }

  /** Get recent metric snapshots */
  getRecentMetrics(hours: number = 1): MetricSnapshot[] {
    return this.db
      .prepare(
        `SELECT * FROM metric_snapshots
         WHERE timestamp > datetime('now', ? || ' hours')
         ORDER BY timestamp ASC`
      )
      .all(`-${hours}`) as MetricSnapshot[];
  }

  /** Add a notification */
  addNotification(
    type: string, title: string, message?: string,
    severity: 'info' | 'warning' | 'error' | 'success' = 'info'
  ): number {
    const result = this.db
      .prepare('INSERT INTO notifications (type, title, message, severity) VALUES (?, ?, ?, ?)')
      .run(type, title, message ?? null, severity);
    return Number(result.lastInsertRowid);
  }

  /** Get unread notifications */
  getUnreadNotifications(): NotificationRow[] {
    return this.db
      .prepare('SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC LIMIT 50')
      .all() as NotificationRow[];
  }

  /** Mark notification as read */
  markRead(id: number): void {
    this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  }

  /** Record a disk event */
  recordDiskEvent(device: string, eventType: string, details?: string): void {
    this.db
      .prepare('INSERT INTO disk_events (device, event_type, details) VALUES (?, ?, ?)')
      .run(device, eventType, details ?? null);
  }

  /** Close the database */
  close(): void {
    this.db.close();
  }
}
