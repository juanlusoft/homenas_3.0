# HomePiNAS v3

**NAS Dashboard de nueva generación con diseño Stitch "Luminous Obsidian"**

## Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- **UI**: shadcn/ui (40+ components) + Stitch design system
- **Database**: better-sqlite3 (WAL mode)
- **Testing**: Vitest + Storybook 10
- **Linting**: ESLint 10 (flat config)

## Quick Start

```bash
pnpm install
cp .env.example .env.local  # adjust API URL
pnpm dev                    # http://localhost:5173
pnpm build                  # production build
pnpm lint                   # ESLint
```

## Design System — Stitch "Luminous Obsidian"

- Deep Slate surfaces (`#10141a` base) with teal accents (`#44e5c2`)
- Space Grotesk (display) + Manrope (body) + JetBrains Mono (metrics)
- Glassmorphism: backdrop-blur + ambient shadows
- No-Line Rule: tonal surface shifts instead of borders
- Glow-Pill status indicators (healthy/warning/error)

## 📋 Changelog

### v3.1.0 (23 Marzo 2026)
- Tailwind CSS 3.4 → **4.2.2** (CSS-first @theme, @tailwindcss/vite)
- ESLint 9 → **10.1.0** (strict flat config)
- Added **better-sqlite3** + DB layer (config, metrics, notifications)
- Fixed hardcoded API URL → env variable (`VITE_API_URL`)
- Fixed storybook imports, useSocket render safety
- Removed `tailwind.config.js`, `postcss.config.js`

### v3.0.0 (21 Marzo 2026) - Initial Release
- React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Stitch "Luminous Obsidian" design system
- GlassCard, GlowPill, StitchButton components
- Dashboard with system metrics + disk array + services

## 🗺️ Roadmap

- v3.2.0: Socket.io real-time metrics + chart components
- v3.3.0: Full NAS API integration (backend Express proxy)
- v3.4.0: Storybook component documentation
- v3.5.0: Framer Motion page transitions
- v4.0.0: Multi-device management + mobile

## Development

```bash
pnpm run storybook          # component docs on :6006
pnpm run build-storybook    # static storybook
./scripts/update-version.sh patch "description"
```

---

**Team**: Vision 👁️ (HomeLabs Avengers)
**Target**: HomePiNAS production NAS
