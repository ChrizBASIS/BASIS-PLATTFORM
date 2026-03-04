# BASIS Dashboard Platform

DSGVO-konforme KI-Büro-Plattform für KMUs — 7 spezialisierte KI-Agenten, Multi-Tenant, vollständige API + Dashboard + CLI.

---

## Monorepo-Struktur

```
basis-platform/
├── packages/
│   ├── api/                    # Hono.js Backend (Port 3001)
│   │   └── src/
│   │       ├── agents/         # 7 Agenten: prompts, runner, orchestrator
│   │       ├── db/             # Drizzle ORM — Schema + Migrations
│   │       ├── lib/            # env, tenant-yaml, audit-log, crm-adapters
│   │       ├── middleware/     # auth (Keycloak JWT), tenant, rbac
│   │       └── routes/         # auth, tenants, agents, projects, sandbox,
│   │                           #   onboarding, token-usage, tenant-profile,
│   │                           #   gdpr, roles, integrations
│   ├── cli/                    # basis-cli (npm package)
│   │   └── src/commands/       # login, logout, init, deploy, status
│   └── dashboard-template/     # Next.js 15 Dashboard (Port 3002)
│       └── src/
│           ├── app/            # Pages: /, /agents, /conversations,
│           │                   #   /analytics, /sandbox, /integrations,
│           │                   #   /settings, /team, /billing, /help,
│           │                   #   /login, /auth/callback
│           ├── components/     # Sidebar, AgentDesk, AgentChat, TokenMeter,
│           │                   #   OnboardingWizard, AuthGuard,
│           │                   #   Toast, ErrorBoundary, ThemeProvider
│           ├── hooks/          # useDashboardData (AGENT_META)
│           └── lib/            # api-client.ts, auth.ts (PKCE)
├── package.json                # npm workspaces
└── tsconfig.base.json
```

---

## Quick Start

### 1. Voraussetzungen

- Node.js 20+
- PostgreSQL 16
- Keycloak 24+ (für Auth)
- OpenAI API Key

### 2. Installation

```bash
git clone https://github.com/ChrizBASIS/BASIS-PLATTFORM.git
cd basis-platform
npm install
```

### 3. API konfigurieren

```bash
cp packages/api/.env.example packages/api/.env
```

Pflichtfelder in `packages/api/.env`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/basis

KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=basis
KEYCLOAK_CLIENT_ID=basis-api
KEYCLOAK_CLIENT_SECRET=your-secret

OPENAI_API_KEY=sk-...
# Optional: OPENAI_BASE_URL=https://api.openai.com/v1

CRM_ENCRYPTION_KEY=32-byte-hex-key   # für CRM-Credentials (AES-256-GCM)
```

### 4. Datenbank initialisieren

```bash
cd packages/api
npx drizzle-kit push        # Schema anlegen
npx tsx src/db/seed-rbac.ts # RBAC-Rollen + Berechtigungen seeden
```

### 5. Starten

```bash
# Terminal 1 — API
npm run dev:api        # http://localhost:3001

# Terminal 2 — Dashboard
npm run dev:dashboard  # http://localhost:3002

# Terminal 3 — CLI (optional)
npm run dev:cli
```

### 6. Dashboard konfigurieren

```bash
cp packages/dashboard-template/.env.local.example packages/dashboard-template/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=basis
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=basis-dashboard
```

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| Backend API | Hono.js + TypeScript + Drizzle ORM |
| Datenbank | PostgreSQL 16 |
| Auth | Keycloak (OIDC + PKCE) |
| KI-Modell | OpenAI GPT-4o-mini |
| Dashboard | Next.js 15 + TailwindCSS v4 (brutalist) |
| CLI | Commander.js + Inquirer + Chalk |
| Hosting | Hetzner Cloud (EU) + Coolify |

---

## KI-Agenten

| Farbe | Name | Typ | Zuständigkeit |
|---|---|---|---|
| #E8FF3A | **Lena** | orchestrator | Koordination, Delegation, Tages-Briefing |
| #A78BFA | **Marie** | sekretariat | E-Mails, Termine, Korrespondenz |
| #60A5FA | **Tom** | backoffice | Dokumente, Personal, Formulare |
| #34D399 | **Clara** | finance | Rechnungen, Buchhaltung, Lohn |
| #FB923C | **Marco** | marketing | Social Media, Newsletter, Kampagnen |
| #F472B6 | **Alex** | support | Kundenanfragen, Bewertungen, Tickets |
| #38BDF8 | **Nico** | builder | Automatisierungen, Dashboards, Widgets |

---

## API-Routen (Übersicht)

```
POST   /api/v1/auth/device/code        CLI-Login starten
POST   /api/v1/auth/device/token       Token nach Browser-Bestätigung
POST   /api/v1/auth/refresh            Token erneuern
GET    /api/v1/auth/me                 Aktueller User

GET    /api/v1/agents/list             Alle Agenten mit Status
POST   /api/v1/agents/chat             Chat (auto-routing)
POST   /api/v1/agents/chat/stream      SSE-Streaming Chat
POST   /api/v1/agents/:type/chat       Direkt an Agenten
GET    /api/v1/agents/conversations    Gesprächsverlauf
GET    /api/v1/agents/conversations/:id Einzelgespräch
PATCH  /api/v1/agents/config           Agenten aktivieren/deaktivieren

GET    /api/v1/tenant-profile/json     Profil als strukturiertes JSON
GET    /api/v1/tenant-profile/yaml     Profil als YAML
POST   /api/v1/tenant-profile/sync     Profil aktualisieren

POST   /api/v1/onboarding/profile      Betriebsprofil anlegen
POST   /api/v1/onboarding/analyze      Tasks analysieren + zuweisen
GET    /api/v1/onboarding/tasks/lena   Aufgaben für Lena-Briefing

GET    /api/v1/token-usage/summary     Token-Verbrauch (aktueller Monat)
GET    /api/v1/token-usage/history     Verlauf (letzte 30 Tage)

GET    /api/v1/tenants/:id             Tenant-Details
PATCH  /api/v1/tenants/:id             Tenant aktualisieren
DELETE /api/v1/tenants/:id             Tenant löschen (Soft-Delete)
GET    /api/v1/tenants/:id/members     Team-Mitglieder

GET    /api/v1/projects                Alle Projekte (Tenant)
POST   /api/v1/projects                Projekt erstellen
GET    /api/v1/projects/:id            Projekt-Details
POST   /api/v1/projects/:id/deploy     Deployment starten
GET    /api/v1/projects/:id/deployments Deployment-Verlauf
DELETE /api/v1/projects/:id            Projekt löschen

POST   /api/v1/sandbox/session         Sandbox-Session starten
GET    /api/v1/sandbox/session/:id     Session-Status
POST   /api/v1/sandbox/session/:id/widget   Widget via Nico erstellen
POST   /api/v1/sandbox/session/:id/publish  Änderungen veröffentlichen
POST   /api/v1/sandbox/session/:id/revert   Sandbox verwerfen
GET    /api/v1/sandbox/session/:id/diff     Diff vs Live

GET    /api/v1/integrations            Aktive Integrationen
POST   /api/v1/integrations            Integration verbinden
POST   /api/v1/integrations/:id/test   Verbindung testen
POST   /api/v1/integrations/:id/sync   Sync auslösen
GET    /api/v1/integrations/:id/contacts  Kontakte abrufen
GET    /api/v1/integrations/:id/deals     Deals abrufen
DELETE /api/v1/integrations/:id        Verbindung trennen

GET    /api/v1/gdpr/export             Datenexport (DSGVO Art. 20)
GET    /api/v1/gdpr/audit-log          Audit-Log
DELETE /api/v1/gdpr/delete             Account-Löschung (DSGVO Art. 17)
```

---

## Dashboard-Seiten

| Route | Beschreibung |
|---|---|
| `/` | Haupt-Dashboard: Lena-Briefing, Agenten-Desks, TokenMeter, Onboarding |
| `/agents` | Agenten-Übersicht mit Status + Inline-Chat |
| `/conversations` | Gesprächsverlauf Master-Detail-View |
| `/analytics` | Token-Verlauf, Agent-Performance, Aufgaben-Status |
| `/sandbox` | **Build Mode** — YAML-Viewer, Projekte, Nico-Chat, Sandbox-Sessions, Deploy |
| `/integrations` | CRM-Anbindungen: Odoo, HubSpot, Salesforce, Pipedrive |
| `/team` | Team-Verwaltung, Einladungen, Rollen-Übersicht |
| `/billing` | Plan-Übersicht (Starter/Pro/Enterprise), Token-Verbrauch |
| `/help` | FAQ-Accordion, Tastenkürzel, Support |
| `/settings` | Tenant-Name, Agenten-Config (toggle+tools), DSGVO |
| `/login` | Keycloak PKCE Login |
| `/auth/callback` | OAuth2 Callback |

---

## RBAC — Rollen & Berechtigungen

6 System-Rollen: `owner`, `admin`, `manager`, `member`, `viewer`, `basis_support`

31 Berechtigungen für: `tenant`, `project`, `deployment`, `agent`, `sandbox`,
`team`, `role`, `integration`, `token_usage`, `gdpr`, `onboarding`, `crm`

---

## Komponenten-Übersicht (Dashboard)

| Komponente | Beschreibung |
|---|---|
| `Sidebar` | Hauptnavigation, Next.js Link (SPA), aktiver Link-Highlight, Tenant-Badge |
| `AuthGuard` | Schützt alle Routes (außer `/login`, `/auth/callback`) |
| `ThemeProvider` | Dark/Light-Mode, CSS-Variablen |
| `Toast` + `useToast` | Globale Notifications (success/error/info/warning) |
| `ErrorBoundary` | React-Fehlergrenze mit Reload-Option |
| `AgentDesk` | Agenten-Karte auf dem Haupt-Dashboard |
| `AgentChat` | Inline-Chat-Panel (SSE-Streaming) |
| `TokenMeter` | Balken-Anzeige Token-Verbrauch |
| `OnboardingWizard` | 4-Schritt Wizard (Profil → Aufgaben → Analyse → Agenten) |

---

## Compliance

- Alle Endpoints mit `authMiddleware` + `tenantMiddleware` + `rbac()` gesichert
- Tenant-Isolation via Drizzle-Queries (`eq(table.tenantId, tenantId)`)
- Audit-Log für kritische Aktionen (tenant.deleted, project.deleted, integration.created)
- DSGVO Art. 17: Vollständige Datenlöschung inkl. `roles`, `rolePermissions`
- CRM-Credentials AES-256-GCM verschlüsselt (nie im Klartext in der DB)
- Alle CRM-Daten nur On-Demand abgerufen — kein Rohdaten-Caching
