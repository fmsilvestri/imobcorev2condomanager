-- Módulo Áreas do Condomínio
-- Aplicado automaticamente via exec_sql RPC em 2026-03-26

CREATE TABLE IF NOT EXISTS areas_condominio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'area_comum',
  descricao text DEFAULT '',
  bloco text DEFAULT '',
  andar text DEFAULT '',
  capacidade integer DEFAULT 0,
  responsavel_id uuid,
  responsavel_nome text DEFAULT '',
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_areas_condominio_id ON areas_condominio(condominio_id);
CREATE INDEX IF NOT EXISTS idx_areas_tipo ON areas_condominio(tipo);

-- Adicionar colunas de áreas em briefings_funcionarios (se não existirem)
ALTER TABLE briefings_funcionarios ADD COLUMN IF NOT EXISTS areas_ids uuid[] DEFAULT '{}';
ALTER TABLE briefings_funcionarios ADD COLUMN IF NOT EXISTS areas_nomes text[] DEFAULT '{}';
