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
│   │   └── src/commands/       # login, init, deploy, status
│   └── dashboard-template/     # Next.js 15 Dashboard (Port 3002)
│       └── src/
│           ├── app/            # Pages: /, /agents, /conversations,
│           │                   #   /analytics, /settings, /login,
│           │                   #   /auth/callback
│           ├── components/     # Sidebar, AgentDesk, AgentChat,
│           │                   #   TokenMeter, OnboardingWizard, AuthGuard
│           ├── hooks/          # useDashboardData
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

GET    /api/v1/gdpr/export             Datenexport (DSGVO Art. 20)
GET    /api/v1/gdpr/audit-log          Audit-Log
DELETE /api/v1/gdpr/delete             Account-Löschung (DSGVO Art. 17)
```

---

## Dashboard-Seiten

| Route | Beschreibung |
|---|---|
| `/` | Haupt-Dashboard: Lena-Briefing, Agenten-Desks, TokenMeter |
| `/agents` | Agenten-Übersicht mit Status + Chat |
| `/conversations` | Gesprächsverlauf mit Detail-Ansicht |
| `/analytics` | Token-Verlauf, Agent-Performance, Aufgaben-Status |
| `/settings` | Tenant-Name, Agenten-Config, Team, DSGVO |
| `/login` | Keycloak PKCE Login |
| `/auth/callback` | OAuth2 Callback |

---

## RBAC — Rollen & Berechtigungen

6 System-Rollen: `owner`, `admin`, `manager`, `member`, `viewer`, `basis_support`

31 Berechtigungen für: `tenant`, `project`, `deployment`, `agent`, `sandbox`,
`team`, `role`, `integration`, `token_usage`, `gdpr`, `onboarding`, `crm`

---

## Compliance

- Alle Endpoints mit `authMiddleware` + `tenantMiddleware` + `rbac()` gesichert
- Tenant-Isolation via Drizzle-Queries (`eq(table.tenantId, tenantId)`)
- Audit-Log für kritische Aktionen (tenant.deleted, project.deleted)
- DSGVO Art. 17: Vollständige Datenlöschung inkl. `roles`, `rolePermissions`
- CRM-Credentials AES-256-GCM verschlüsselt
