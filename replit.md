# ImobCore v2 — Condominium Management SaaS

## Overview

Full-stack SaaS for condominium management with an AI "Síndico Virtual" powered by Anthropic Claude. Built on Node.js ESM + Express + Supabase + React.

## Architecture

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Maintenance Module (Módulo de Manutenção) — COMPLETED

**Backend routes** (all in `artifacts/api-server/src/routes/imobcore.ts`):
- `GET /api/manutencao/dashboard?condominio_id=X` — aggregated equipment stats + Di score
- `GET /api/manutencao/historico?condominio_id=X` — maintenance history (graceful fallback if table missing)
- `POST /api/manutencao/historico` — register new maintenance
- `PATCH /api/manutencao/historico/:id/concluir` — complete maintenance record
- `POST /api/manutencao/di/analisar` — Claude Haiku 4-5 analysis of equipment + alerts (uses `localizacao` column)
- `POST /api/manutencao/di/plano-preventivo` — Di generates preventive maintenance plan
- `GET /api/manutencao/alertas?condominio_id=X` — unresolved alerts from Di
- `PATCH /api/manutencao/alertas/:id/resolver` — resolve alert
- `GET /api/admin/manutencao/migration-sql` — returns SQL to create missing tables

**Supabase tables needed** (NOT YET CREATED — run SQL from migration-sql endpoint):
- `manutencoes` (maintenance history records)
- `alertas_manutencao` (Di-generated alerts)
- `equipamentos` — EXISTS ✅ (23 cols, uses `prox_manutencao`, `custo_manutencao`, `localizacao`)
- `planos_manutencao` — EXISTS ✅

**Frontend** (`artifacts/imobcore-frontend/src/App.tsx`):
- Tab "ia" → calls `/api/manutencao/di/analisar`, shows KPI cards from `resumo`, alerts from Di, Claude text
- Tab "os" → maintenance history from `/api/manutencao/historico` + modal to register new maintenance
- State: `mantHistList`, `mantDiResumo`, `mantDiAlertas`, `loadMantHistorico()`, `mantHistSave()`

**Demo data**: 7 equipamentos inserted for condo `aaf09fe0-bf3b-4ccd-b74e-13958916c193` (Copacabana Beach Residence) via Supabase REST API.

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
- **Painel Gestor**: Full dashboard with sidebar, KPI cards, AI chat, OS CRUD, financials, IoT water sensors (AguaModule), MISP alerts, Maintenance module, Encomendas module, SSE log, 3D Condo Map
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
- `GET /api/medidores` — List utility meters (filter: condominio_id, tipo agua/gas/energia)
- `POST /api/medidores` — Create utility meter (numero_serie, local, tipo, unidade_medida, alerta_consumo_alto)
- `PATCH /api/medidores/:id` — Update meter
- `DELETE /api/medidores/:id` — Delete meter
- `GET /api/leituras-medidores` — List meter readings (filter: medidor_id or condominio_id)
- `POST /api/leituras-medidores` — Register reading (auto-calculates consumo from previous reading, updates ultima_leitura on medidor)
- `PATCH /api/leituras-medidores/:id` — Update reading
- `DELETE /api/leituras-medidores/:id` — Delete reading
- `GET /api/utilities/resumo` — Consolidated summary of agua/gas/energia by condo
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

## Di Engine (Master → Di → Módulos)

The Di AI engine is configured per condominium by the Master and acts contextually across all modules.

### Tables (Supabase)
- `di_system_prompt` — Blocks of Di's system prompt (columns: `bloco`, `titulo`, `conteudo`, `fixo`, `condominio_id`). Global blocks have `condominio_id = null`; per-condo overrides have the condo UUID.
- `di_configuracoes` — Per-condo Di config (`nome_di`, `tom_comunicacao` [direto_empatico|formal|suave], `modulos_ativos` JSONB, `limite_financeiro`, `identidade_persona`, `system_prompt`, `regras_de_ouro`, `di_ativa`)
- `di_historico` — All Di interactions saved (tipo, prioridade, resumo, mensagem_gestor, score_impacto, payload JSONB, modulo)

### Engine Files
- `src/di-engine/context.ts` — `carregarContextoDi(condoId, snapshot, perfil, nomeUsuario, unidadeId)` loads Di's configured identity + template variable substitution (`{{nome_condominio}}`, `{{saldo}}`, etc.)
- `src/di-engine/modulos.ts` — `CATALOGO_MODULOS` (12 modules), `getModulosPorPerfil()`, `getAcoesPorPerfil()`
- `src/lib/supabase.ts` — Shared Supabase client
- `src/lib/anthropic.ts` — Shared Anthropic client (Replit proxy support)

### New API Endpoints
- `GET /api/modulos?perfil=gestor` — Lists modules available for a given profile
- `GET /api/modulos/:id/dados?condominio_id=X` — Real data for a specific module
- `POST /api/modulos/:id/di-analise` — Di analyzes a module and returns {status, emoji, pontos, recomendacao}
- `POST /api/modulos/:id/di-chat` — Contextual chat with Di about a specific module
- `POST /api/admin/migrate-di` — Seeds 6 prompt blocks + initializes di_configuracoes for all condos

### Updated Endpoints
- `POST /api/sindico/chat` — Now uses `carregarContextoDi` to load Di's identity/rules from DB before responding
- `POST /api/di` — Briefing now uses Di's configured name and system prompt from DB

### Supported Profiles (Perfil)
`master`, `gestor`, `sindico`, `morador`, `zelador`

### Migrations
- `migrations/015_di_integration.sql` — DDL for di_system_prompt, di_memoria, and ALTER di_configuracoes

## Structure

```
artifacts/
  api-server/          # Express backend
    src/
      routes/
        imobcore.ts    # All core ImobCore API routes (4141 lines)
        modulos.ts     # Di module routes (GET/POST modulos/*, admin/migrate-di)
        index.ts       # Router registry
        health.ts      # Health check
      di-engine/
        context.ts     # carregarContextoDi() — loads Di context from Supabase
        modulos.ts     # Module catalog and permissions
      lib/
        supabase.ts    # Shared Supabase client
        anthropic.ts   # Shared Anthropic client (Replit proxy)
        financeiro.service.ts  # Financial calculations
      app.ts           # Express app setup
      index.ts         # Server entry point
    migrations/
      015_di_integration.sql  # DDL for Di tables
  imobcore-frontend/   # React + Vite frontend
    src/
      App.tsx          # Full ImobCore UI (all 3 views, ~500KB)
      index.css        # Minimal CSS reset
      main.tsx         # React entry
lib/                   # Shared workspace packages
scripts/               # Utility scripts
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
- Comunicados v2 multicanal (ComunicadosModule.tsx — `src/components/Comunicados/ComunicadosModule.tsx`): 5 sub-tabs: Novo (Di insight strip + CanalSelector + Composer + preview WA/TG side-by-side), Templates (8 templates clicáveis), Histórico (filtro/busca + reenvio + badges), Agendados (agendamentos + regras automáticas), Métricas (KPIs + barras por canal/categoria + relatório Di). Envio real via Z-API (WhatsApp) e Telegram Bot API. Canal config salvo em canal_config table. Schema compat via meta-encoding em corpo (Migration 14).
- AI insights generation
- 3-view interface: Gestor desktop + Síndico mobile + Morador mobile
- Equipment management (CRUD) with Supabase persistence (tabela: equipamentos)
- Maintenance plans v2 (PlanosModule.tsx — `src/components/Planos/PlanosModule.tsx`): 4 sub-tabs: Visão Geral (CRUD with setor/prestador/custo/progress bar/Gerar OS button), Por Setor (10 sector cards with click-to-filter), Gerador Di (Claude AI plan generator for selected sectors), Calendário Anual (12-month bar timeline + sector summary table). New fields (setor, frequencia_tipo, prestador_nome, custo_estimado, ativo, etc.) stored via meta-encoding in instrucoes field for schema backward-compatibility.
- New API endpoints: GET /api/plano-templates, POST /api/planos/gerar-com-di (Claude AI), POST /api/planos/:id/gerar-os (creates OS + updates plan execution count)
- Smart diagnostic scoring with AI analysis (tabelas: score_condominio, insights_ia)
- **Módulo Funcionários & Escala Inteligente** (sidebar item "👷 Funcionários" no Gestor, panel="funcionarios"): **5 tabs** — Equipe (CRUD completo + ranking por score de desempenho), Escala (calendário semanal 7 dias gerado por IA, alerts de cobertura/sobrecarga), Briefings (CRUD completo: manual + Di geradora, PDF export, vinculação de funcionários e áreas), **🏢 Áreas** (CRUD completo de blocos/áreas comuns/equipamentos/setores, filtros por tipo, busca, cards com ícones 3D color-coded, modal de edição, responsável vinculado), Di Analista (análise completa da equipe com Claude). 4 KPI cards: total funcionários, custo mensal (com encargos CLT 68%), passivo trabalhista estimado, risco operacional. Modal de cadastro/edição com todos os campos (cargo, jornada, salário, admissão, extras, faltas, status). Risco trabalhista calculado por funcionário (baixo/moderado/alto/crítico). Score de desempenho automático. Backend: `artifacts/api-server/src/routes/funcionarios.ts`. Endpoints: GET/POST /api/funcionarios, PUT/DELETE /api/funcionarios/:id, POST /api/escala/gerar, GET /api/escala, GET /api/briefings/gerar, GET /api/alertas/escala, GET /api/funcionarios/analise-di, GET /api/funcionarios/migration-sql, GET/POST/PUT/DELETE /api/briefings, GET /api/briefings/migration-sql, POST /api/briefings/gerar-di, GET/POST/PUT/DELETE /api/areas, GET /api/areas/migration-sql. SQL para criar tabelas disponível via botão "📋 Copiar SQL" em cada módulo. **IMPORTANTE**: Tabelas `briefings_funcionarios` e `areas_condominio` precisam ser criadas via SQL no Supabase (copiar via botão na interface). Briefings também persistem `areas_ids`/`areas_nomes`. SQL de migração inclui `ALTER TABLE ADD COLUMN IF NOT EXISTS` para colunas `areas_ids`/`areas_nomes` em tabelas existentes.
- **Importação Financeira Inteligente V6** (aba "📂 Importar" no Gestor financeiro): Upload OFX (parseador nativo SGML/XML), PDF (pdf-parse + fallback Claude Vision), imagens PNG/JPG (Claude Vision OCR). 18 regras heurísticas de classificação. Aprendizado automático via tabela `financeiro_aprendizado`. Detecção de duplicatas. Score de confiança (🟢Alta/🟡Média/🔴Baixa). Edição inline, ensinar IA, confirmar lote. Di gera análise pós-importação. Backend: `artifacts/api-server/src/routes/importacao.ts`. Endpoints: POST /api/financeiro/importar, POST /api/financeiro/importacao/confirmar, POST /api/financeiro/aprender, GET /api/financeiro/aprendizado/stats, POST /api/financeiro/importacao/di-insight, GET /api/financeiro/importacao/migration-sql.
