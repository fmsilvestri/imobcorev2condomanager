-- ImobCore v2 — Migração de tabelas pendentes
-- Execute no Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard → seu projeto → SQL Editor

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela: manutencoes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manutencoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id   UUID,
  equipamento_id  UUID,
  tipo            TEXT NOT NULL DEFAULT 'preventiva',
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  status          TEXT DEFAULT 'agendada',
  prioridade      TEXT DEFAULT 'normal',
  tecnico_nome    TEXT,
  tecnico_contato TEXT,
  custo_estimado  NUMERIC,
  custo_real      NUMERIC,
  agendada_para   TIMESTAMPTZ,
  concluida_em    TIMESTAMPTZ,
  proxima_em      TIMESTAMPTZ,
  criada_por_di   BOOLEAN DEFAULT false,
  notas_di        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS man_equip ON manutencoes(equipamento_id, status);
CREATE INDEX IF NOT EXISTS man_condo ON manutencoes(condominio_id, status, agendada_para);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabela: alertas_manutencao
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alertas_manutencao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id   UUID,
  equipamento_id  UUID,
  manutencao_id   UUID,
  tipo            TEXT NOT NULL DEFAULT 'vencimento',
  mensagem        TEXT NOT NULL,
  severidade      TEXT DEFAULT 'normal',
  resolvido       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela: piscina_leituras
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS piscina_leituras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id   UUID,
  ph              NUMERIC NOT NULL,
  cloro           NUMERIC NOT NULL,
  temperatura     NUMERIC,
  alcalinidade    NUMERIC,
  dureza_calcica  NUMERIC,
  status          TEXT DEFAULT 'ok',
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pisc_condo ON piscina_leituras(condominio_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabela: documentos_condominio
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_condominio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id   UUID NOT NULL,
  nome            VARCHAR(255) NOT NULL,
  tipo            VARCHAR(100) NOT NULL,
  descricao       TEXT,
  conteudo_texto  TEXT,
  arquivo_url     TEXT,
  arquivo_nome    VARCHAR(255),
  arquivo_mime    VARCHAR(100),
  arquivo_path    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS doc_condo ON documentos_condominio(condominio_id, created_at DESC);

-- Se a tabela documentos_condominio já existia sem as colunas de arquivo:
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_url    TEXT;
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_nome   VARCHAR(255);
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_mime   VARCHAR(100);
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_path   TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação final — deve retornar as 4 tabelas criadas:
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('manutencoes', 'alertas_manutencao', 'piscina_leituras', 'documentos_condominio');
