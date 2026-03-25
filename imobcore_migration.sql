-- ImobCore v2 — Migração completa de tabelas pendentes
-- Execute no Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard → seu projeto → SQL Editor
-- Execute TUDO de uma vez (Ctrl+Enter ou botão Run)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. manutencoes
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
-- 2. alertas_manutencao
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
-- 3. piscina_leituras
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
  foto_url        TEXT,
  foto_path       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Idempotent columns for existing tables (safe to run multiple times)
ALTER TABLE piscina_leituras ADD COLUMN IF NOT EXISTS foto_url  TEXT;
ALTER TABLE piscina_leituras ADD COLUMN IF NOT EXISTS foto_path TEXT;
CREATE INDEX IF NOT EXISTS pisc_condo ON piscina_leituras(condominio_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. documentos_condominio
--    Usada pela Di Síndica para análise de regimentos, AVCB, convenções, etc.
--    O campo conteudo_texto permite consulta via IA no chat.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_condominio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id   UUID NOT NULL,
  nome            VARCHAR(255) NOT NULL,        -- Ex: "Regimento Interno 2024"
  tipo            VARCHAR(100) NOT NULL,         -- Ex: "regimento", "avcb", "convencao", "contrato"
  descricao       TEXT,                          -- Resumo curto
  conteudo_texto  TEXT,                          -- Texto completo (Di lê e responde perguntas)
  validade        DATE,                          -- Data de vencimento (AVCB, seguros, etc.)
  arquivo_url     TEXT,                          -- URL pública do arquivo no Storage
  arquivo_nome    VARCHAR(255),                  -- Nome original do arquivo
  arquivo_mime    VARCHAR(100),                  -- MIME type (application/pdf, etc.)
  arquivo_path    TEXT,                          -- Caminho interno no Storage bucket
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_condo ON documentos_condominio(condominio_id, created_at DESC);

-- Se a tabela documentos_condominio já existia sem algumas colunas, execute:
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS validade       DATE;
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_url    TEXT;
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_nome   VARCHAR(255);
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_mime   VARCHAR(100);
ALTER TABLE documentos_condominio ADD COLUMN IF NOT EXISTS arquivo_path   TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação final — deve retornar as 4 tabelas criadas
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns c 
        WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS colunas
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('manutencoes', 'alertas_manutencao', 'piscina_leituras', 'documentos_condominio')
ORDER BY table_name;
