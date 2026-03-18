# ImobCore v2 — Condominium Management SaaS

## Overview

Full-stack SaaS for condominium management with an AI "Síndico Virtual" powered by Anthropic Claude. Built on Node.js ESM + Express + Supabase + React.

## Architecture

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: Supabase (PostgreSQL via @supabase/supabase-js)
- **AI**: Anthropic Claude claude-sonnet-4-6 via Replit AI Integrations
- **Frontend**: React + Vite (artifacts/imobcore-frontend, port 21216, path `/`)
- **Backend**: Express API server (artifacts/api-server, port 8080, path `/api`)
- **Realtime**: Server-Sent Events (SSE) at `/api/stream`

## Artifacts

### `artifacts/imobcore-frontend` (port 21216, path `/`)
React + Vite frontend with 4 views:
- **Painel Gestor**: Full dashboard with sidebar, KPI cards, AI chat, OS CRUD, financials, IoT water sensors, MISP alerts, Maintenance module, Encomendas module, SSE log
- **App Síndico**: Phone mockup for the building manager with AI chat modal
- **App Morador**: Phone mockup for residents showing communicados, services, status
- **Onboarding Wizard** (8 steps, all implemented):
  - Step 0: Boas-vindas
  - Step 1: Condomínio (form + live preview card, CNPJ, endereço, síndico, POST /api/condominios)
  - Step 2: Estrutura (torre/bloco builder, color stripes, unit grid, PATCH /api/condominios/:id)
  - Step 3: Moradores (unit picker from torres, occupation map, POST /api/moradores, optional)
  - Step 4: Sensores IoT (table + live tank gauges with level colors and summary)
  - Step 5: Financeiro (saldo inicial + taxa mensal + projeção mensal ao vivo com breakdown bars)
  - Step 6: Síndico IA (tom selector + automações + live chat preview per persona)
  - Step 7: Ativação (5-section review grid + torres chips + POST /api/onboarding)

### `artifacts/api-server` (port 8080, path `/api`)
Express API server with all ImobCore routes in `src/routes/imobcore.ts`:
- `GET /api/stream` — SSE endpoint (realtime events)
- `GET /api/dashboard` — full dashboard data from Supabase
- `POST /api/sindico/chat` — AI chat (Claude)
- `POST /api/sindico/comunicado` — AI-generated communications
- `GET /api/os` — List OS with optional filters (status, categoria, prioridade, search)
- `POST /api/os` — Create OS with auto-numbering (max+1) or manual number + responsavel field
- `PUT /api/os/:id` — Update OS (any field) + broadcasts SSE
- `DELETE /api/os/:id` — Delete OS + broadcasts SSE
- `GET /api/sensores` — IoT water sensor data
- `GET /api/misp` — MISP public alerts
- `GET /api/financeiro` — Financial data
- `POST /api/moradores` — Save residents from onboarding (upsert by condominio_id + unidade)
- `POST /api/condominios` — Create/upsert condo (onboarding Step 1)
- `PATCH /api/condominios/:id` — Update condo structure (onboarding Step 2)
- `POST /api/onboarding` — Full activation (Step 7)

## Database (Supabase)

Project: Residencial Parque das Flores, Florianópolis
Tables: condominios, ordens_servico, sensores_agua, alertas_publicos, receitas, despesas, comunicados, configuracoes

Demo data: 1 condomínio, 5 sensors, 5 OSs (2 urgentes), 2 MISP alertas, receitas/despesas, comunicado

## Environment Variables

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key  
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Replit AI proxy URL (auto-set)
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI proxy key (auto-set)

## Structure

```
artifacts/
  api-server/          # Express backend
    src/
      routes/imobcore.ts  # All ImobCore API routes
      app.ts              # Express app setup
      index.ts            # Server entry point
    public/index.html    # Legacy static HTML (not used)
  imobcore-frontend/   # React + Vite frontend
    src/
      App.tsx            # Full ImobCore UI (all 3 views)
      index.css          # Minimal CSS reset
      main.tsx           # React entry
lib/                   # Shared workspace packages
scripts/               # Utility scripts
  src/
    setup-supabase.ts  # Supabase schema + seed
    create-tables.ts   # Table creation
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root:
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`
- `pnpm run build` — runs typecheck then builds all packages

## Key Features

- Real-time SSE events (connected, nova_os, os_atualizada, sensor_update, alerta_sensor, sindico_chat, novo_comunicado)
- AI Síndico Virtual with full context (OS, sensors, finances, MISP, condominium data)
- IoT sensor rings with animated SVG level indicators
- OS CRUD with priority/status management
- Financial dashboard with receitas/despesas
- MISP public security alerts
- AI-generated comunicados (announcements)
- AI insights generation
- 3-view interface: Gestor desktop + Síndico mobile + Morador mobile
- Equipment management (CRUD) with Supabase persistence (tabela: equipamentos)
- Maintenance plans CRUD (tabela: planos_manutencao) with equipment selection, per-equipment cost, and auto-calculated budget forecast
- Smart diagnostic scoring with AI analysis (tabelas: score_condominio, insights_ia)
