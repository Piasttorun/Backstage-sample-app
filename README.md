# backstage-sample-app

An internal developer portal built on [Backstage](https://backstage.io) that continuously discovers GitLab repositories, ingests their documentation and test reports, and surfaces quality metrics through three role-specific dashboards: **Scrum**, **Product**, and **Leadership**.

Current state: Phase 1 MVP with one integrated service (`java-sample-service`). Architecture is designed to scale to 200+ services without re-platforming.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 22 (use `.nvmrc` via nvm) |
| Yarn | 4.4.1 (managed via `.yarnrc.yml`) |
| Docker + Docker Compose | Any recent version |
| WSL2 (Windows only) | Required to run Node/Yarn commands |

---

## Quick Start

> **Windows users:** all Node/Yarn commands must be run inside a WSL terminal.

### 1. Clone and enter the repo

```bash
git clone https://github.com/your-org/backstage-sample-app.git
cd backstage-sample-app
```

### 2. Set Node version

```bash
nvm use 22   # reads .nvmrc — install nvm first if needed
```

### 3. Install dependencies

```bash
yarn install
```

### 4. Configure secrets (first time only)

```bash
cp .env.example .env          # fill in GITLAB_TOKEN, GITLAB_OAUTH_CLIENT_ID/SECRET, BACKEND_SECRET
```

Then create `app-config.local.yaml` at the repo root — see [GitLab Integration Setup](#gitlab-integration-setup) for the exact template.

> Neither `.env` nor `app-config.local.yaml` are ever committed — they are gitignored.

### 5. Start PostgreSQL

```bash
docker compose down db        # stop any stale container first
docker compose up db -d       # start fresh with port binding
```

Verify it's ready:
```bash
docker compose ps db          # should show "healthy"
```

### 6. Start Backstage

```bash
yarn start
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:7007

Backstage takes ~15 seconds to compile on first run. The catalog entry for `java-sample-service` will appear automatically once the backend finishes initialising.

### 7. (Optional) Full Docker Compose

Build and run Postgres + Backstage together in containers:

```bash
docker compose up --build
```

---

## GitLab Integration Setup

### app-config.local.yaml

Create this file at the repo root (it is gitignored). It overrides the main config with real secrets:

```yaml
backend:
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: backstage
      password: backstage
      database: backstage
  auth:
    keys:
      - secret: your-random-32-char-secret-here

integrations:
  gitlab:
    - host: gitlab.com
      token: ${GITLAB_TOKEN}

auth:
  providers:
    gitlab:
      development:
        clientId: ${GITLAB_OAUTH_CLIENT_ID}
        clientSecret: ${GITLAB_OAUTH_CLIENT_SECRET}
```

### .env

```env
BACKEND_SECRET=your-random-32-char-secret-here
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
GITLAB_OAUTH_CLIENT_ID=your-oauth-app-id
GITLAB_OAUTH_CLIENT_SECRET=your-oauth-app-secret
```

### GitLab OAuth App

In GitLab → User Settings → Applications, create an OAuth app with:

- **Redirect URI:** `http://localhost:7007/api/auth/gitlab/handler/frame`
- **Scopes:** `read_user`, `openid`, `profile`, `email`

### GitLab Personal Access Token

Generate a token at GitLab → User Settings → Access Tokens with scopes: `read_api`, `read_repository`.

---

## Registering a Service Repo

For a repo to appear in the catalog with docs and API info, it needs:

### 1. catalog-info.yaml (repo root)

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  description: My service description
  annotations:
    gitlab.com/project-slug: your-namespace/my-service
    backstage.io/techdocs-ref: dir:.
    devops.io/last-pipeline-status: unknown
    devops.io/last-test-pass-rate: unknown
    devops.io/last-coverage: unknown
    devops.io/last-pipeline-timestamp: unknown
  tags:
    - java
spec:
  type: service
  lifecycle: experimental
  owner: user:default/your-gitlab-username
  system: devops-sandbox
  providesApis:
    - my-service-api

---

apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: my-service-api
  description: REST API exposed by my-service
spec:
  type: openapi
  lifecycle: experimental
  owner: user:default/your-gitlab-username
  system: devops-sandbox
  definition: |
    openapi: "3.0.3"
    info:
      title: my-service
      version: "1.0.0"
    paths:
      /:
        get:
          summary: Health check
          responses:
            "200":
              description: OK
```

### 2. TechDocs (mkdocs.yml + docs/)

```
mkdocs.yml
docs/
  index.md
  api.md
```

**mkdocs.yml:**
```yaml
site_name: my-service
docs_dir: docs
nav:
  - Home: index.md
  - API Reference: api.md
plugins:
  - techdocs-core
```

### 3. Register in app-config.yaml

Add a catalog location entry:

```yaml
catalog:
  locations:
    - type: url
      target: https://gitlab.com/your-namespace/my-service/-/blob/master/catalog-info.yaml
      rules:
        - allow: [Component, API]
```

Then restart Backstage (`yarn start`). The service will appear in the catalog with its docs and API spec.

### 4. CI Metrics Webhook

After a pipeline completes, POST to the Backstage metrics webhook:

```bash
curl -X POST http://localhost:7007/api/metrics/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entityRef": "component:default/my-service",
    "pipelineId": "12345",
    "branch": "main",
    "metrics": {
      "testsPassed": 142,
      "testsFailed": 3,
      "coveragePercent": 87.4
    }
  }'
```

The endpoint is unauthenticated and returns `202 Accepted`.

---

## Project Structure

```
.
├── app-config.yaml              # Main non-secret config
├── app-config.local.yaml        # Local secrets (gitignored)
├── app-config.production.yaml   # Production overrides
├── docker-compose.yml           # Postgres + Backstage services
├── .env.example                 # Template for .env (gitignored)
├── packages/
│   ├── app/                     # React frontend
│   └── backend/
│       ├── src/index.ts         # Backend entrypoint (plugins wired here)
│       └── src/metricsPlugin.ts # Phase 1 metrics webhook plugin
├── plugins/                     # Custom frontend plugins (future dashboards)
└── examples/
    ├── java-sample-service-catalog-info.yaml   # Reference catalog entity
    └── java-sample-service-techdocs/           # Reference TechDocs structure
```

---

## Design Plan

### Goals

| Goal | Description |
|------|-------------|
| Repo Discovery | Automatically scan all repos in a GitLab group and register them as Backstage catalog entities |
| Doc & Report Rendering | Pull documentation and test reports from repos and render them in Backstage |
| Test Metrics | Capture and store test results after CI runs and expose them as structured metrics in Backstage |
| Stakeholder Dashboards | Surface metrics through three audience-specific boards: Scrum, Product, Leadership |

### Architecture

```
GitLab Group
  └── Repo A   ──┐
  └── Repo B   ──┤
  └── Repo ...  ─┤──► Backstage Backend
  └── Repo N   ──┘         │
                            ├── GitLab Discovery Provider  ──► Catalog
                            ├── TechDocs Generator         ──► Doc Storage (S3/GCS/local)
                            ├── Report Ingestion Plugin     ──► Reports Store
                            └── Metrics Collector           ──► Metrics Store (PostgreSQL)
                                                                     │
                                                              ┌──────┴──────┐
                                                              │  Dashboard  │
                                                              │   Plugins   │
                                                         ┌────┴────┐ ┌─────┴────┐
                                                      Scrum    Product  Leadership
```

### Dashboards

#### Scrum Board
**Audience:** Dev teams, Scrum Masters

| Widget | Data Source |
|--------|------------|
| Test pass rate (current sprint, per service) | Metrics DB |
| Coverage trend (last 5 runs) | Metrics DB |
| Open pipeline failures | GitLab API |
| Service health status | Catalog annotations |

#### Product Board
**Audience:** Product Managers, QA Leads

| Widget | Data Source |
|--------|------------|
| Overall test pass rate across all services | Metrics DB (aggregated) |
| Services with declining coverage (week-over-week) | Metrics DB |
| SAST findings by severity | Metrics DB |
| Services with no recent pipeline run | Metrics DB (staleness query) |

#### Leadership Board
**Audience:** Engineering Managers, external stakeholders (read-only)

| Widget | Data Source |
|--------|------------|
| Overall engineering health score | Metrics DB |
| % services passing all quality gates | Metrics DB |
| Critical SAST findings requiring escalation | Metrics DB |
| Delivery throughput (pipelines/week) | Metrics DB |

### Access Control

| Role | Access |
|------|--------|
| Dev team member | Full catalog, Scrum Board for owned services, TechDocs |
| Product Manager | Product Board, entity overview |
| Leadership / External Stakeholder | Leadership Board only (read-only, no entity navigation) |
| Platform Engineer | Full admin; all boards, catalog mutations, plugin config |

Identity via GitLab OAuth. Permissions via `@backstage/plugin-permission-*`.

### Implementation Phases

**Phase 1 — MVP (current)**
- [x] Bootstrap Backstage app with PostgreSQL backend
- [x] Enable TechDocs with local builder
- [x] Integrate pilot service (java-sample-service) with catalog, API spec, and TechDocs
- [x] Metrics webhook endpoint (POST /api/metrics/webhook → 202, logs payload)
- [ ] Scrum Board plugin (Phase 1.5)

**Phase 2 — Reports & Boards**
- [ ] Report Ingestion Plugin (fetch CI artifacts from GitLab API)
- [ ] Product Board and Leadership Board plugins
- [ ] Permissions framework wired to GitLab OAuth groups

**Phase 3 — Scale & Automation**
- [ ] GitLab Discovery Provider for group-level scanning (enable when using a real GitLab group vs personal namespace)
- [ ] TechDocs pre-build in CI (publish to S3; Backstage serves static assets only)
- [ ] BullMQ queue for async metric ingestion under high load
- [ ] Time-series trend charts on all boards
- [ ] Auto-scaffold missing `catalog-info.yaml` via Backstage Software Template

### Scalability Notes (200+ services)

| Concern | Mitigation |
|---------|-----------|
| GitLab API rate limits | Set discovery provider `frequency` ≥ 30 min; dedicated service account |
| TechDocs build time | Move to CI-built + S3 publish in Phase 3 |
| Metrics DB growth | Monthly partitioning; 90-day retention for raw runs |
| Repos missing catalog-info.yaml | Phase 3 auto-scaffold Software Template |

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Portal framework | Backstage v1.x |
| Backend runtime | Node.js 22 |
| Database | PostgreSQL 15 |
| Doc storage | Local (MVP) → S3-compatible (prod) |
| Identity provider | GitLab OAuth |
| CI integration | GitLab CI webhooks |
| Deployment | Docker Compose (MVP) → Kubernetes (future) |
| Dashboard charting | Apache ECharts / Recharts (Phase 2) |
