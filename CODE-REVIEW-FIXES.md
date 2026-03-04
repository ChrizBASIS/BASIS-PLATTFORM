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
| `integrations/hubspot.ts` | ✅ (nach Fix) | REST v3, read-only, token never in errors — toter Search-Code entfernt |
| `integrations/registry.ts` | ✅ | Factory pattern, decrypts in-memory only |
| `lib/crypto.ts` | ✅ (nach Fix) | AES-256-GCM, random IV, auth tag — jetzt `getEnv()` statt `process.env` |
| `routes/integrations.ts` | ✅ | RBAC enforced, credentials never returned, hard delete |
| `db/schema.ts` (+2 tables) | ✅ | integrations + integration_sync_log with FKs |
| `seed-rbac.ts` (+3 perms) | ✅ | integration:create/read/manage, assigned to correct roles (31 total) |
| `gdpr.ts` (updated) | ✅ | Cascade delete includes sync logs + integrations |
| `tenant-yaml.ts` (updated) | ✅ | integrations + crm_summary sections, nutzt tenantMembers korrekt |
| `agents/prompts.ts` (updated) | ✅ | CRM tools for Marie, Clara, Marco |

### Phase 4 Fixes (vom Reviewer angewendet)

#### 12. `crypto.ts` — `process.env` statt `getEnv()`
- **Problem:** `getKey()` nutzte `process.env.CRM_ENCRYPTION_KEY` direkt, inkonsistent mit restlicher Codebase
- **Fix:** Nutzt jetzt `getEnv().CRM_ENCRYPTION_KEY`

#### 13. `hubspot.ts` — Toter Code bei getContacts
- **Problem:** Search-Branch machte einen sinnlosen GET-Request zum Search-Endpoint (der POST erwartet), überschrieb sofort das Ergebnis mit dem List-Endpoint
- **Fix:** Vereinfacht — nur List-Endpoint, TODO-Kommentar für POST-basierte Suche

### Phase 4 Positive Highlights

- **Sicherheit:** Credentials werden AES-256-GCM verschlüsselt gespeichert, nur in-memory entschlüsselt
- **DSGVO:** HARD DELETE bei Integration-Löschung (kein Soft-Delete für Credentials)
- **Architektur:** Adapter-Pattern mit Registry sauber umgesetzt, erweiterbar für Salesforce/Pipedrive
- **Tenant-Isolation:** Alle Integration-Endpoints prüfen `tenantId`, RBAC durchgängig
- **Agent-Kontext:** CRM-Daten fließen über YAML-Profil in den Agent-Kontext — keine Raw-Daten an LLMs

### Offene Hinweise Phase 4

5. **`integrations.ts` `/providers` fehlt `integration:read` RBAC** — Aktuell kann jeder authentifizierte User die Provider-Liste sehen (nur `authMiddleware + tenantMiddleware`, kein RBAC). Wahrscheinlich gewollt (kein sensibles Datum), aber inkonsistent mit den anderen Endpoints.

6. **Odoo `getSummary()` lädt bis zu 2000 Records** — Bei großen Kunden-Instanzen könnte das langsam sein. Für MVP OK, langfristig: COUNT statt fetch + length.

7. **Kein automatischer Sync-Cron** — `syncIntervalMinutes` ist in schema definiert (Default 60min), aber kein BullMQ-Job oder Cron nutzt es. Muss in einer späteren Phase implementiert werden.

---

## Compliance-Audit (vollständiger Prinzipien-Check)

**Datum:** 2025-03-04 (zweite Review-Runde)

### ✅ Eingehaltene Prinzipien

| Prinzip | Status | Details |
|---------|--------|---------|
| `getEnv()` statt `process.env` | ✅ | `process.env` kommt nur noch in `lib/env.ts` vor |
| Schema-Konsistenz | ✅ | Kein `users.tenantId` oder `users.role` mehr im Code |
| YAML Single Source of Truth | ✅ | Alle 11 Datenquellen fließen ein (meta, business, team, workflows, tasks, agents, token_usage, projects, integrations, crm_summary, context) |
| Credentials nie in Errors/Logs/Responses | ✅ | GET /integrations gibt nie `credentialsEncrypted/Iv/Tag` zurück |
| Tenant-Isolation | ✅ | Alle Endpoints prüfen `tenantId` (nach Widget-Fix) |
| Seed-RBAC konsistent | ✅ | Alle 31 Permissions definiert, korrekt auf 6 Rollen verteilt |

### 🔴 Kritische Fixes (Compliance-Audit) — ALLE ANGEWENDET ✅

#### 14. ~~`projects.ts` — RBAC fehlte auf ALLEN Endpoints~~ → **GEFIXT**
- `rbac('project', 'create/read/delete')` und `rbac('deployment', 'create/read')` auf alle Endpoints

#### 15. ~~`sandbox.ts` — RBAC fehlte + Widget-Endpoint ohne Tenant-Check~~ → **GEFIXT**
- RBAC auf alle 6 Endpoints (`sandbox:create/read/manage`), Widget-Endpoint mit `innerJoin` Tenant-Check

#### 16. ~~`gdpr.ts` — RBAC fehlte auf ALLEN Endpoints~~ → **GEFIXT**
- `rbac('gdpr', 'read')` auf Export + Audit-Log, `rbac('gdpr', 'manage')` auf Delete

#### 17. ~~`tenants.ts` — RBAC fehlte auf GET/PATCH/DELETE/members~~ → **GEFIXT**
- `rbac('tenant', 'read/update/delete')` und `rbac('team', 'read')` auf Members-Endpoint

#### 18. ~~`onboarding.ts` — RBAC nur auf 1 von 5 Endpoints~~ → **GEFIXT**
- `rbac('agent', 'manage')` auf POST-Endpoints, `rbac('agent', 'read')` auf alle GET-Endpoints

#### 19. ~~`gdpr.ts` — DSGVO-Löschung vergaß `roles` + `rolePermissions`~~ → **GEFIXT**
- `rolePermissions` (via `inArray`) und `roles` (via `tenantId`) werden jetzt mitgelöscht

### 🟡 Mittlere Fixes (Compliance-Audit) — ALLE ANGEWENDET ✅

#### 20. ~~`tenants.ts` — Audit-Log für Tenant-Löschung fehlte~~ → **GEFIXT**
- `audit_log` Eintrag mit `tenant.deleted` Action nach Soft-Delete

#### 21. ~~`projects.ts` — Audit-Log für Projekt-Löschung fehlte~~ → **GEFIXT**
- `audit_log` Eintrag mit `project.deleted` Action nach Hard-Delete

### Offene Hinweise (Compliance-Audit)

8. **`supportSessions` fehlen im YAML** — Wenn ein BASIS-Mitarbeiter gerade Zugriff hat, sollten Agenten das wissen. Feature-Wunsch für spätere Phase.

9. **Audit-Logging unvollständig** — `roles.ts` (Rollen-Änderungen) und `sandbox.ts` (Publish) loggen nicht ins Audit-Log. Für MVP akzeptabel, langfristig nachrüsten.
