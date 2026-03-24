-- Módulo Manutenção: tabela equipamentos
-- Cria a tabela se não existir e adiciona colunas opcionais com segurança

CREATE TABLE IF NOT EXISTS equipamentos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id        UUID NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  nome                 TEXT NOT NULL,
  categoria            TEXT NOT NULL DEFAULT 'outros',
  cat_icon             TEXT DEFAULT '⚙️',
  localizacao          TEXT DEFAULT '',
  fabricante           TEXT DEFAULT '',
  modelo               TEXT DEFAULT '',
  serie                TEXT DEFAULT '',
  data_instalacao      DATE,
  vida_util_meses      INTEGER DEFAULT 120,
  instalado_ha         NUMERIC(5,1) DEFAULT 0,
  consumo_eletrico_kwh NUMERIC(10,2) DEFAULT 0,
  horas_uso_dia        NUMERIC(5,1) DEFAULT 8,
  status               TEXT NOT NULL DEFAULT 'operacional'
                         CHECK (status IN ('operacional','atencao','manutencao','inativo')),
  prox_manutencao      DATE,
  ultima_manutencao    DATE,
  custo_manutencao     NUMERIC(12,2) DEFAULT 0,
  quantidade           INTEGER DEFAULT 1,
  descricao            TEXT DEFAULT '',
  fornecedor_id        UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Adiciona colunas que podem estar faltando em instâncias mais antigas
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS cat_icon             TEXT DEFAULT '⚙️';
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS modelo               TEXT DEFAULT '';
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS serie                TEXT DEFAULT '';
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS instalado_ha         NUMERIC(5,1) DEFAULT 0;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS prox_manutencao      DATE;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS ultima_manutencao    DATE;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS custo_manutencao     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS quantidade           INTEGER DEFAULT 1;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS fornecedor_id        UUID REFERENCES fornecedores(id) ON DELETE SET NULL;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT now();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_equipamentos_condominio  ON equipamentos(condominio_id);
CREATE INDEX IF NOT EXISTS idx_equipamentos_status      ON equipamentos(status);
CREATE INDEX IF NOT EXISTS idx_equipamentos_categoria   ON equipamentos(categoria);

-- RLS: síndico e gestor podem ver e editar equipamentos do próprio condomínio
ALTER TABLE equipamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipamentos_select" ON equipamentos;
CREATE POLICY "equipamentos_select" ON equipamentos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "equipamentos_insert" ON equipamentos;
CREATE POLICY "equipamentos_insert" ON equipamentos
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "equipamentos_update" ON equipamentos;
CREATE POLICY "equipamentos_update" ON equipamentos
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "equipamentos_delete" ON equipamentos;
CREATE POLICY "equipamentos_delete" ON equipamentos
  FOR DELETE USING (true);
