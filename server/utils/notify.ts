/**
 * Notification system — sends alerts via Telegram + Email
 */

import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

interface Settings {
  telegramEnabled?: boolean;
  telegramToken?: string;
  telegramChatId?: string;
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpTo?: string;
  notifyOnError?: boolean;
  notifyOnBackup?: boolean;
}

function loadSettings(): Settings {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
  catch { return {}; }
}

/** Send notification via all configured channels */
export async function notify(title: string, message: string, severity: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
  const settings = loadSettings();
  const emoji = severity === 'error' ? '🔴' : severity === 'warning' ? '⚠️' : 'ℹ️';
  const text = `${emoji} *HomePiNAS — ${title}*\n${message}`;

  // Telegram
  if (settings.telegramEnabled && settings.telegramToken && settings.telegramChatId) {
    try {
      await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
    } catch { /* silently fail */ }
  }

  // Email (simple notification log — full SMTP in settings route)
  if (settings.smtpEnabled && settings.smtpTo) {
    try {
      // Log for now — real SMTP requires nodemailer or raw socket
      console.log(`[notify:email] ${title}: ${message} → ${settings.smtpTo}`);
    } catch {}
  }

  // Always log
  console.log(`[notify:${severity}] ${title}: ${message}`);
}

/** Predefined alert types */
export const alerts = {
  diskFull: (disk: string, usage: number) =>
    notify('Disco lleno', `${disk} al ${usage}% de capacidad`, 'error'),

  diskWarning: (disk: string, usage: number) =>
    notify('Disco casi lleno', `${disk} al ${usage}% de capacidad`, 'warning'),

  temperatureHigh: (source: string, temp: number) =>
    notify('Temperatura alta', `${source}: ${temp}°C`, 'warning'),

  temperatureCritical: (source: string, temp: number) =>
    notify('Temperatura crítica', `${source}: ${temp}°C — ¡Riesgo de daño!`, 'error'),

  backupComplete: (name: string, size: string) =>
    notify('Backup completado', `${name} — ${size}`, 'info'),

  backupFailed: (name: string, error: string) =>
    notify('Backup fallido', `${name}: ${error}`, 'error'),

  smartWarning: (disk: string, issue: string) =>
    notify('SMART Warning', `${disk}: ${issue}`, 'warning'),

  serviceDown: (name: string) =>
    notify('Servicio caído', `${name} no está ejecutándose`, 'error'),

  serviceRestarted: (name: string) =>
    notify('Servicio reiniciado', `${name} se ha reiniciado`, 'info'),

  loginFailed: (username: string, ip: string) =>
    notify('Intento de login fallido', `Usuario: ${username} desde ${ip}`, 'warning'),

  userCreated: (username: string) =>
    notify('Nuevo usuario', `Se ha creado el usuario ${username}`, 'info'),

  updateAvailable: (count: number) =>
    notify('Actualizaciones disponibles', `${count} paquetes pendientes de actualizar`, 'info'),
};
