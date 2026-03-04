# BASIS Dashboard Platform

DSGVO-konforme Dashboard-Plattform mit CLI, Branchen-Templates, Widget-Baukasten und Multi-Agenten-System für KMUs in Südtirol.

## Monorepo-Struktur

```
basis-platform/
├── packages/
│   ├── api/                  # Hono.js Backend API
│   │   ├── src/
│   │   │   ├── db/           # Drizzle ORM Schema + Connection
│   │   │   ├── lib/          # Env validation, utilities
│   │   │   ├── middleware/    # Auth (Keycloak JWT) + Tenant isolation
│   │   │   ├── routes/       # Auth, Tenants, Projects, Agents, Sandbox, GDPR
│   │   │   └── index.ts      # Entry point
│   │   └── drizzle.config.ts
│   ├── cli/                  # basis-cli NPM Package
│   │   └── src/
│   │       ├── commands/     # login, init, deploy, status
│   │       └── lib/          # Config store
│   └── dashboard-template/   # Next.js Dashboard (Phase 2)
├── package.json              # Workspace root
└── tsconfig.base.json        # Shared TypeScript config
```

## Quick Start

```bash
# Install dependencies
npm install

# Start API (development)
npm run dev:api

# Start CLI (development)
npm run dev:cli
```

## Tech Stack

- **API:** Hono.js + Drizzle ORM + PostgreSQL 16
- **CLI:** Commander.js + Inquirer + Chalk
- **Auth:** Keycloak (self-hosted) + OAuth2 Device Flow
- **Dashboard:** Next.js 16 + shadcn/ui + TailwindCSS v4
- **Agents:** OpenAI Agents SDK (TypeScript) — 7 spezialisierte Agenten
- **Hosting:** Hetzner Cloud (Deutschland) + Coolify + Traefik v3
- **DSGVO:** EU-only, OpenAI EU-Endpoint, verschlüsselte Backups

## KI-Agenten Team

| Agent | Name | Zuständigkeit |
|---|---|---|
| 🎯 Orchestrator | Lena | Analyse, Delegation, Koordination |
| 📧 Sekretariat | Marie | E-Mails, Termine, Korrespondenz |
| 🗂 Backoffice | Tom | Dokumente, Formulare, Organisation |
| 💰 Finance | Clara | Rechnungen, Buchhaltung, Reports |
| 📣 Marketing | Marco | Social Media, Texte, Kampagnen |
| 🛟 Support | Alex | Dashboard-Hilfe, Technik |
| 🔨 Builder | Nico | Sandbox, Widgets bauen (Build Mode) |

## Environment Variables

Copy `.env.example` to `.env` in `packages/api/`:
```bash
cp packages/api/.env.example packages/api/.env
```

## Konzept-Dokument

Vollständiges Konzept mit Architektur, API-Endpoints, DSGVO, Widget-System, Branchen-Templates, Onboarding und Multi-Agenten-System:

→ [Plan-Dokument](/.windsurf/plans/basis-dashboard-platform-2e8bd2.md)
