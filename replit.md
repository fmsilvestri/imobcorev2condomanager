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
- **Painel Gestor**: Full dashboard with sidebar, KPI cards, AI chat, OS CRUD, financials, IoT water sensors (AguaModule), MISP alerts, Maintenance module, Encomendas module, SSE log
- **App Síndico**: SindicoHome component (`src/components/sindico/SindicoHome.tsx`) — dark/light theme (localStorage-persisted), condo photo card with upload, quick stats strip, IA banner, module grid, bottom nav with FAB
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
- `POST /api/di` — Di (Síndica Virtual) briefing executivo: returns `{fala, cards:[{tipo,titulo,mensagem,acao,badge?}], dados}`. 4 tipos: critico|atencao|info|insight. Geração determinística + Claude para fala personalizada.
- `GET /api/notificacoes/config?condominio_id=X` — canal config (telegram/whatsapp/push tokens)
- `POST /api/notificacoes/config` — salvar config canais por condomínio (tabela: notificacoes_config)
- `POST /api/notificacoes/disparar` — gera cards Di + dispara por canal segundo tipo (critico→todos; atencao→telegram+push; info/insight→push)
- `POST /api/notificacoes/teste` — envia mensagem de teste num canal específico
- `GET /api/notificacoes/historico?condominio_id=X` — histórico de notificações (tabela: notificacoes_log)
- `POST /api/notificacoes/_gerar_cards` — endpoint interno: gera cards Di sem Claude (usado pelo disparador)
- `GET /api/bi/overview` — KPIs globais: MRR, ARR, condos, moradores, OS, inadimplência, crescimento 30d (X-Admin-Token required)
- `GET /api/bi/charts` — Séries temporais: receita/despesa mensal, OS por categoria, crescimento condos, MRR acumulado (X-Admin-Token required)
- `GET /api/bi/forecast` — Previsões 3 meses via moving average + trend, horizon com receita/despesa projetada (X-Admin-Token required)
- `POST /api/bi/insights` — Claude (Di) gera insights estratégicos: {insights:[{tipo,titulo,descricao,acao}], resumo} (X-Admin-Token required)
- `POST /api/admin/login` — Admin Global auth (email + password → token)
- `GET /api/admin/dashboard` — Global KPIs: total condos, users, OS, inadimplência, plan counts (X-Admin-Token required)
- `GET /api/admin/condominios` — All condominiums list (X-Admin-Token required)
- `PATCH /api/admin/condominio/:id` — Update plano/status (X-Admin-Token required)
- `GET /api/admin/usuarios` — All users/residents (X-Admin-Token required)
- `GET /api/admin/planos` — SaaS plan configs (FREE/PRO/ENTERPRISE) with limits & features
- `GET /api/admin/sistema` — System health: Supabase latency, API uptime, memory, SSE clients (X-Admin-Token required)
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
- Maintenance plans v2 (PlanosModule.tsx — `src/components/Planos/PlanosModule.tsx`): 4 sub-tabs: Visão Geral (CRUD with setor/prestador/custo/progress bar/Gerar OS button), Por Setor (10 sector cards with click-to-filter), Gerador Di (Claude AI plan generator for selected sectors), Calendário Anual (12-month bar timeline + sector summary table). New fields (setor, frequencia_tipo, prestador_nome, custo_estimado, ativo, etc.) stored via meta-encoding in instrucoes field for schema backward-compatibility.
- New API endpoints: GET /api/plano-templates, POST /api/planos/gerar-com-di (Claude AI), POST /api/planos/:id/gerar-os (creates OS + updates plan execution count)
- Smart diagnostic scoring with AI analysis (tabelas: score_condominio, insights_ia)
