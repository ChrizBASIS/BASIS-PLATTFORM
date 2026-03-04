# Code-Review Fixes — BASIS Dashboard Platform

**Reviewer:** Cascade (Code-Review Agent)
**Datum:** 2025-03-04
**Stand:** Nach Phase 3 (Multi-Agenten-System) + RBAC + Brutalist Redesign

---

## Kritische Fixes (sofort angewendet)

### 1. `tenant.ts` Middleware — RBAC Migration Bruch
- **Problem:** `users.tenantId` existiert nicht mehr nach RBAC-Refactor (Users sind jetzt über `tenantMembers` verknüpft)
- **Auswirkung:** ALLE authentifizierten API-Requests würden mit einem TypeScript/Runtime Error fehlschlagen
- **Fix:** Middleware nutzt jetzt `tenantMembers` mit `isNull(removedAt)` Filter

### 2. `tenants.ts` Route — Alte Schema-Referenzen
- **Problem:** `POST /tenants` schrieb `users.tenantId` und `users.role` (existieren nicht mehr)
- **Problem:** `GET /tenants/:id/members` las `users.tenantId` (existiert nicht mehr)
- **Fix:** POST erstellt jetzt `tenantMembers`-Eintrag mit Owner-Rolle; GET nutzt JOIN über `tenantMembers`

### 3. `gdpr.ts` — DSGVO-Löschung unvollständig + alte Schema-Referenzen
- **Problem:** `users.tenantId` im Export/Delete, fehlende Löschung neuer Tabellen
- **Fix:** Export nutzt `tenantMembers` JOIN; Delete löscht jetzt auch: `onboardingTasks`, `onboardingProfiles`, `tokenUsage`, `supportSessions`, `tenantMembers`
- **Hinweis:** `audit_log` wird absichtlich NICHT gelöscht (Handels-/Steuerrechtliche Aufbewahrungspflicht) — dokumentiert im Code

### 4. `roles.ts` — Route-Reihenfolge Bug
- **Problem:** `GET /roles/permissions/all`, `/roles/members`, `/roles/me` standen NACH `GET /roles/:id` — wurden nie erreicht (`:id` matchte "permissions", "members", "me")
- **Auswirkung:** Frontend hätte keine Permissions laden können, keine Members sehen, keine eigene Rolle abfragen
- **Fix:** Statische Routes (`/permissions/all`, `/me`, `/members`, `/members/:userId`) stehen jetzt VOR `/:id`

### 5. `sandbox.ts` — Fehlende Tenant-Isolation
- **Problem:** Session-Endpoints (GET, preview, publish, revert, diff) prüften nicht die Tenant-Zugehörigkeit
- **Auswirkung:** Jeder authentifizierte User konnte Sessions anderer Tenants lesen/ändern
- **Fix:** Alle Endpoints nutzen jetzt `innerJoin(projects)` mit `eq(projects.tenantId, tenantId)`

### 6. `auth.ts` — `/me` Endpoint ungeschützt
- **Problem:** `auth.get('/me')` hatte kein `authMiddleware` → `c.get('user')` war `undefined`
- **Fix:** `authMiddleware` explizit auf `/me` registriert (globales auth auf auth-Router nicht möglich wegen Device Flow Endpoints)

---

## Mittlere Fixes

### 7. `db/index.ts` — Nicht-validierte DB-URL
- **Problem:** `process.env.DATABASE_URL!` mit Non-Null Assertion, umging Zod-Validierung
- **Fix:** Nutzt jetzt `getEnv().DATABASE_URL`

### 8. `runner.ts` — process.env statt getEnv()
- **Problem:** OpenAI Client nutzte `process.env.OPENAI_API_KEY` direkt
- **Fix:** Nutzt jetzt `getEnv()` für validierte Env-Vars

### 9. `token-usage.ts` — Hardcoded Plan-Limit
- **Problem:** `PLAN_LIMITS['pro']` war hardcoded statt aus Tenant-Daten
- **Fix:** Lädt jetzt `tenants.plan` aus der DB

---

## Kleine Fixes

### 10. CLI `node-fetch` entfernt
- Dependency war gelistet aber nie importiert (Node 20+ hat nativen `fetch()`)

### 11. `auth.ts` Hono Type Error
- `response.status` als `number` war nicht kompatibel mit Hono's `ContentfulStatusCode` Union
- Fix: Type Assertion `as 400 | 401 | 403 | 500`

---

## Neue Dateien geprüft (Phase 3) — Qualität

| Datei | Status | Anmerkung |
|-------|--------|-----------|
| `agents/types.ts` | ✅ | Saubere Typen, gute Struktur |
| `agents/prompts.ts` | ✅ | 7 Agenten mit detaillierten System-Prompts, SHARED_RULES, Tools pro Agent |
| `agents/orchestrator.ts` | ✅ | Keyword-Routing, Context-Loading, Conversation-Management |
| `agents/runner.ts` | ✅ (nach Fix) | OpenAI Integration, Token-Tracking, Streaming (SSE), Handoff |
| `routes/onboarding.ts` | ✅ | Profil + Task-Analyse + Agent-Zuweisung + YAML-Sync |
| `routes/roles.ts` | ✅ (nach Fix) | RBAC CRUD, System-Rollen-Schutz, Member-Management |
| `routes/support.ts` | ✅ | Zeitlich begrenzte Sessions, Audit-Logging, Revoke/Extend |
| `routes/token-usage.ts` | ✅ (nach Fix) | Summary + History, pro-Agent Breakdown |
| `routes/tenant-profile.ts` | ✅ | YAML GET/Sync/Download mit Content-Type Negotiation |
| `lib/tenant-yaml.ts` | ✅ | Umfangreicher YAML-Generator, Version-Tracking |
| `middleware/rbac.ts` | ✅ | Permission-Check, Owner-Bypass, getUserPermissions Helper |
| `db/seed-rbac.ts` | ✅ | 28 Permissions, 6 Rollen (inkl. basis_support) |
| `db/schema.ts` | ✅ | 16 Tabellen, korrekte FKs, Unique-Indices |

---

## Offene Hinweise (nicht-kritisch, für spätere Phasen)

1. **CLI `init` sendet Agenten nicht an API** — User wählt Agenten aus, aber `POST /projects` Body enthält nur name/subdomain/template. Die Agenten-Auswahl wird nur lokal geloggt.

2. ~~**`loadConversation` in orchestrator.ts prüft kein Tenant**~~ → **GEFIXT** — `loadConversation()` erfordert jetzt `tenantId` als zweiten Parameter. Beide Aufrufe in `runner.ts` wurden aktualisiert.

3. **`POST /tenants` — Owner-Rolle muss vorher existieren** — Der Fix setzt voraus, dass die `owner`-Rolle für den neuen Tenant existiert. Das Seed-Script muss also bei Tenant-Erstellung laufen, oder die Rollen werden im selben Request erstellt.

4. **Tenant-Middleware nimmt nur den ERSTEN Tenant** — Bei Multi-Tenant-Usern (User gehört zu mehreren Tenants) nimmt die Middleware `.limit(1)`. Das ist für MVP OK, aber langfristig braucht es einen Tenant-Switcher (Header oder Query-Param).

---

## CRM-Integration Review (Phase 4)

| Datei | Status | Anmerkung |
|-------|--------|-----------|
| `integrations/types.ts` | ✅ | CRMAdapter Interface, Unified Schema, Provider-Types |
| `integrations/odoo.ts` | ✅ | JSON-RPC, read-only, 15s timeout, no credential leaks |
| `integrations/hubspot.ts` | ✅ | REST v3, read-only, token never in errors |
| `integrations/registry.ts` | ✅ | Factory pattern, decrypts in-memory only |
| `lib/crypto.ts` | ✅ | AES-256-GCM, random IV, auth tag, safe error messages |
| `routes/integrations.ts` | ✅ | RBAC enforced, credentials never returned, hard delete |
| `db/schema.ts` (+2 tables) | ✅ | integrations + integration_sync_log with FKs |
| `seed-rbac.ts` (+3 perms) | ✅ | integration:create/read/manage, assigned to correct roles |
| `gdpr.ts` (updated) | ✅ | Cascade delete includes sync logs + integrations |
| `tenant-yaml.ts` (updated) | ✅ | integrations + crm_summary sections |
| `agents/prompts.ts` (updated) | ✅ | CRM tools for Marie, Clara, Marco |
