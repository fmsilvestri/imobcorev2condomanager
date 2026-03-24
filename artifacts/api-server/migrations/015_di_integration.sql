-- ============================================================
-- MIGRAÇÃO 015 — Integração Di: Master configura → Di atua
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Tabela: di_system_prompt
-- Armazena os blocos de prompt configuráveis pelo Master
-- ============================================================
CREATE TABLE IF NOT EXISTS di_system_prompt (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bloco_id     text NOT NULL UNIQUE,          -- ex: "1_identidade", "2_regras_ouro"
  titulo       text NOT NULL,
  conteudo     text NOT NULL,
  ordem        integer NOT NULL DEFAULT 0,
  ativo        boolean NOT NULL DEFAULT true,
  condominio_id uuid REFERENCES condominios(id) ON DELETE CASCADE, -- null = global
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_di_system_prompt_ativo ON di_system_prompt(ativo);
CREATE INDEX IF NOT EXISTS idx_di_system_prompt_condo ON di_system_prompt(condominio_id);

-- 2. Colunas extras em di_configuracoes
-- Adiciona modulos_ativos, nome_di, tom_comunicacao se não existirem
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'di_configuracoes' AND column_name = 'nome_di'
  ) THEN
    ALTER TABLE di_configuracoes ADD COLUMN nome_di text DEFAULT 'Di';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'di_configuracoes' AND column_name = 'tom_comunicacao'
  ) THEN
    ALTER TABLE di_configuracoes ADD COLUMN tom_comunicacao text DEFAULT 'profissional';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'di_configuracoes' AND column_name = 'modulos_ativos'
  ) THEN
    ALTER TABLE di_configuracoes ADD COLUMN modulos_ativos jsonb DEFAULT '["os","financeiro","iot","misp","encomendas","portaria","reservas","comunicados","votacoes","crm","diagnostico","condo3dmap"]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'di_configuracoes' AND column_name = 'limite_financeiro'
  ) THEN
    ALTER TABLE di_configuracoes ADD COLUMN limite_financeiro numeric DEFAULT 1000;
  END IF;
END $$;

-- 3. Tabela: di_memoria
-- Histórico das interações da Di por módulo e perfil
-- ============================================================
CREATE TABLE IF NOT EXISTS di_memoria (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  condominio_id uuid REFERENCES condominios(id) ON DELETE CASCADE,
  modulo_id     text,
  perfil        text DEFAULT 'gestor',
  pergunta      text,
  resposta      text,
  tokens_input  integer DEFAULT 0,
  tokens_output integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_di_memoria_condo ON di_memoria(condominio_id);
CREATE INDEX IF NOT EXISTS idx_di_memoria_modulo ON di_memoria(modulo_id);
CREATE INDEX IF NOT EXISTS idx_di_memoria_perfil ON di_memoria(perfil);

-- 4. Seed dos 6 blocos padrão do system prompt
-- (Os dados reais são inseridos via POST /api/admin/migrate-di)
-- Execute esse endpoint após criar as tabelas acima
-- ============================================================

-- Verificar tabela di_configuracoes existe (cria se não existir)
CREATE TABLE IF NOT EXISTS di_configuracoes (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  condominio_id uuid NOT NULL UNIQUE REFERENCES condominios(id) ON DELETE CASCADE,
  nome_di       text DEFAULT 'Di',
  tom_comunicacao text DEFAULT 'profissional',
  modulos_ativos  jsonb DEFAULT '["os","financeiro","iot","misp","encomendas","portaria","reservas","comunicados","votacoes","crm","diagnostico","condo3dmap"]'::jsonb,
  limite_financeiro numeric DEFAULT 1000,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ============================================================
-- APÓS executar este SQL, chame:
-- POST /api/admin/migrate-di
-- Para semear os 6 blocos de prompt e inicializar configurações
-- ============================================================
