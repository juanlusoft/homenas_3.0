# HomePiNAS v3

**Dashboard NAS de nueva generación · Diseño Stitch "Luminous Obsidian"**

## Instalación

```bash
curl -sL https://raw.githubusercontent.com/juanlusoft/homenas_3.0/main/install.sh | sudo bash
```

Accede por HTTPS: `https://<IP-del-NAS>`

## Stack

| Componente | Tecnología |
|-----------|------------|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| UI | shadcn/ui + Stitch "Luminous Obsidian" |
| Backend | Express 5 + Socket.io 4 |
| Monitorización | systeminformation (real-time) |
| Base de datos | better-sqlite3 (WAL mode) |
| Charts | Recharts 3 (lazy-loaded) |
| Testing | Vitest + Storybook 10 |
| Linting | ESLint 10 (flat config) |
| i18n | Español + English |

## Vistas (15)

| Vista | Descripción |
|-------|-------------|
| 🔐 Login | Autenticación con TOTP 2FA |
| 📊 Panel | Métricas en tiempo real + 4 gráficos |
| 📂 Archivos | Gestor de archivos lista/cuadrícula |
| 🔗 Compartidos | Samba + NFS |
| 💾 Almacenamiento | Discos + SMART |
| 📦 Copias de seguridad | Tareas programadas |
| 🖥️ Active Backup | Backup de PCs remotos |
| 🐳 Servicios | Docker + systemd |
| 🏗️ Stacks | Editor Docker Compose |
| 🏪 Tienda | 57 apps instalables |
| 🌐 Red | Interfaces + gráfico tráfico |
| 📋 Registros | Visor de logs filtrable |
| 🖥️ Terminal | Terminal web |
| ⚙️ Sistema | Info hardware + acciones |
| 🔧 Ajustes | Hostname, SSH, HTTPS, ventiladores |
| 👤 Usuarios | Cuentas + seguridad 2FA |

## Wizard de Primer Inicio

6 pasos: Idioma → Cuenta Admin → Nombre NAS → Red → Pool de Discos → Resumen

### Pool de Discos
- **SnapRAID + MergerFS**: paridad + datos + caché (recomendado)
- **Mirror (RAID1)**: discos idénticos
- **Basic**: disco único
- Detección automática de discos (NVMe via JMB585, SSD, HDD)
- Filtro de puertos vacíos y tarjetas SD

## Desarrollo

```bash
pnpm install
pnpm dev          # Vite + backend concurrently
pnpm build        # producción
pnpm lint         # ESLint
pnpm run storybook # componentes en :6006
```

## Arquitectura

```
src/
├── api/           # Cliente API
├── components/
│   ├── UI/        # GlassCard, GlowPill, StitchButton
│   ├── Charts/    # MetricsChart, NetworkChart
│   ├── ActiveBackup/  # DeviceCard, DeviceDetail
│   ├── HomeStore/     # AppCard
│   ├── Notifications/ # NotificationBell
│   └── Wizard/        # StepStorage
├── hooks/         # useSocket, useLiveMetrics, useAPI...
├── i18n/          # es.ts, en.ts (300+ claves)
├── pages/         # 15 vistas
└── db/            # SQLite schema + database.ts

server/
├── routes/        # metrics, storage, network, services, active-backup
├── realtime/      # Socket.io metrics emitter (2s)
└── index.ts       # Express + Socket.io
```

## 📋 Changelog

### v3.20.0 (23 Marzo 2026)
- i18n completo: 300+ claves, todas las páginas traducidas
- Wizard solo Español + English
- Active Backup: backup de PCs remotos (Win/Mac/Linux)
- HomeStore: 57 apps instalables
- Charts real-time: CPU, Memoria, Temperatura, Red
- Docker Compose editor
- Terminal web + visor de logs
- Login + Wizard de primer inicio
- Detección de discos real (JMB585, SSD, HDD)
- HTTPS self-signed + nginx reverse proxy
- Responsive sidebar (mobile hamburger)

### v3.0.0 (21 Marzo 2026) - Release Inicial
- React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Stitch "Luminous Obsidian" design system

---

**Equipo**: Vision 👁️ (HomeLabs Avengers)
**Destino**: HomePiNAS NAS de producción
