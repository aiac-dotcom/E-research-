# E-Research: university research information platform

One platform to **collect, verify, store and present** a university's research and academic activities, plus the QS ranking dashboard. Every feature is a **service** that an administrator can switch on or off.

- **Research repository**: one PostgreSQL database for publications and other outputs (COAR types, DOI, open-access status, SDGs, CRediT roles).
- **Academic activities**: seminars, conferences, keynotes, grants, awards, patents, editorial roles, peer review, supervision, consultancy, outreach and more.
- **Harvesting**: search a person's name, pick the right author profiles, and import their works from **OpenAlex, ORCID, Crossref, Semantic Scholar** (free) and **Scopus, Web of Science** (subscription). Also DOI look-up, scheduled auto-harvest and citation refresh.
- **Manager approval**: nothing is stored permanently or shown on a profile until the direct manager approves it. Approval routes through the organisation structure, several people can share one position, and the full history is kept.
- **Organisation structure**: university → colleges → departments / units / centres, with positions such as Head of Department or Dean, and an approval scope of "unit" or "whole subtree".
- **Researcher pages**: a public profile per person with approved outputs, activities, identifiers and exports.
- **University showcase**: public statistics and highlights, which can be filtered by college or unit.
- **Ranking dashboard**: QS World and Arab rankings, peer comparison, predictions, what-if analysis and optional AI analysis (the original dashboard, now one service).
- **OAI-PMH** endpoint and **BibTeX / RIS / CSV / JSON** exports.

The design is benchmarked against Pure, Symplectic Elements, Converis, Esploro, DSpace-CRIS and VIVO, and follows CERIF, ORCID / DOI / ROR, COAR, CRediT, OAI-PMH, Snowball Metrics, DORA / CoARA and WCAG 2.2. See **[docs/BENCHMARK.md](docs/BENCHMARK.md)**.

## How the workflow works

```
 harvested record ──► To confirm ──(staff: "yes, mine")──► Awaiting approval ──(manager approves)──► stored permanently
 manual entry ─────────────────────────────────────────────►        │                                   + shown on profile
                                                                    ├─ returned for changes ─► staff edits & resubmits
                                                                    └─ rejected
```

* **Who approves?** Everyone holding an *approver* position in the submitter's unit, plus holders of "whole subtree" positions in parent units (for example a Dean). If nobody other than the submitter qualifies, the item escalates to the parent unit, and finally to system administrators.
* **Co-authors.** When an output with ORCID-identified co-authors from the university is approved, the same work is suggested to those colleagues as *To confirm*.
* **Edits to approved records** are change requests and go through approval again.
* If the **approvals** service is switched off, submissions are approved automatically. This is logged as `auto_approved`.

## Services

| Key | Default | What it controls |
|---|---|---|
| `research_repository` | on | Outputs, repository search, DOI look-up |
| `activities` | on | Academic activities |
| `approvals` | on | Manager approval (off = auto-approve) |
| `harvesting` | on | External search and import; per-source switches, auto-harvest interval, citation refresh |
| `profiles` | on | Public researcher pages and directory |
| `showcase` | on | Public university showcase |
| `exports` | on | BibTeX / RIS / CSV / JSON downloads |
| `oai_pmh` | off | `/api/oai` OAI-PMH endpoint |
| `ranking` | on | QS ranking dashboard |
| `ranking_ai` | on | AI ranking analysis (needs an Anthropic key) |
| `qa` | off | Legacy software-QA dashboard from the original code |

Organisation, people and administration are core and always available. When a service is off, its menu items disappear and its API returns `404 {"disabled": true}`.

## Repository layout

```
artifacts/api-server        Express 5 API
  src/lib/auth.ts           Clerk / dev authentication, roles
  src/lib/services.ts       service registry + requireService() guard
  src/lib/approval.ts       approval routing over the org tree
  src/lib/workflow.ts       submissions state machine, materialisation
  src/lib/harvest/          OpenAlex, ORCID, Crossref, Semantic Scholar, Scopus, WoS connectors
  src/lib/showcase.ts       showcase statistics
  src/routes/research/      research API (admin, workflow, repository/public, OAI-PMH)
  src/routes/ranking/       QS ranking service (original)
artifacts/qa-dashboard      React + Vite web app (pages/research, pages/admin, ranking pages)
lib/db                      Drizzle schema (src/schema/research.ts = CRIS model)
scripts/src/seed-demo.ts    loads fictional demo data through the API
server-install/             production install guide, .env template, systemd, nginx
docs/BENCHMARK.md           benchmark, standards, visualisation rules, roadmap
```

## Run locally (evaluation mode, no Clerk account needed)

Requirements: Node 22+ (24 LTS for production), pnpm 10, PostgreSQL 14+.

```sh
pnpm install
createdb eresearch
export DATABASE_URL=postgresql://localhost:5432/eresearch
pnpm --filter @workspace/db run push            # create tables

# API in development auth mode (refused when NODE_ENV=production)
cd artifacts/api-server
AUTH_MODE=dev ADMIN_EMAILS=admin@demo.edu ALLOWED_EMAIL_DOMAINS=demo.edu PORT=3001 pnpm run dev

# Optional: fictional demo data, in another terminal
API_URL=http://localhost:3001 ADMIN=admin@demo.edu pnpm --filter @workspace/scripts run seed-demo

# Web app
cd artifacts/qa-dashboard
PORT=5173 BASE_PATH=/ VITE_AUTH_MODE=dev API_PROXY=http://localhost:3001 pnpm run dev
```

Open http://localhost:5173 and sign in as `admin@demo.edu`. To see the other roles, sign in as `layla@demo.edu` (Head of Department, Computer Science) or `huda@demo.edu` (staff).

The ranking service reads the QS workbooks from `Data/`. They are licensed QS data and are deliberately **not** in this public repository (see `.gitignore`). Copy your `Data/` folder to the repository root to use the ranking pages.

## Production

Follow **[server-install/INSTALL.md](server-install/INSTALL.md)** (Ubuntu, Node 24, PostgreSQL, Nginx, systemd, Clerk). All settings are documented in [server-install/.env.example](server-install/.env.example). API keys stay in server environment variables and are never stored in the database or sent to browsers.

## API overview

| Area | Endpoints |
|---|---|
| Session | `GET /api/me`, `PUT /api/me/profile`, `GET /api/services` |
| Organisation (admin) | `/api/org/units[/:id]`, `/api/admin/org/units`, `/api/admin/positions/:id[/assignments]`, `/api/admin/assignments/:id` |
| People | `GET /api/people`, `/api/admin/people[/:id]`, `POST /api/admin/people/import` |
| Submissions | `GET /api/submissions/mine`, `POST /api/submissions`, `PUT/DELETE /api/submissions/:id`, `POST …/:id/claim\|dismiss\|resubmit`, `POST /api/{outputs,activities}/:id/edit-request` |
| Approvals | `GET /api/approvals`, `POST /api/approvals/:id` `{decision: approve\|return\|reject, comment}`, `POST /api/approvals-bulk` |
| Repository | `GET /api/outputs`, `GET /api/outputs-export/{bib,ris,csv,json}`, `GET /api/activities`, `GET /api/lookup/doi?doi=` |
| Harvesting | `GET /api/harvest/providers`, `GET /api/harvest/authors?name=`, `POST /api/harvest/preview\|import\|link`, `POST /api/harvest/run/:personId` |
| Public | `GET /api/public/showcase?unitId=`, `/api/public/people[/:slug]`, `/api/public/people/:slug/export/:format`, `/api/oai` |
| Ranking | `/api/ranking/*` (original service) |
