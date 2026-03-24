-- ============================================================
-- MIGRAÇÃO: Tabelas de Medidores de Utilidades (Água/Gás/Energia)
-- Para executar: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Tabela de Medidores
CREATE TABLE IF NOT EXISTS public.medidores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id        UUID NOT NULL,
  unidade_id           UUID,
  tipo                 TEXT NOT NULL CHECK (tipo IN ('agua','gas','energia')),
  numero_serie         TEXT NOT NULL,
  local                TEXT NOT NULL,
  ativo                BOOLEAN NOT NULL DEFAULT true,
  ultima_leitura       NUMERIC,
  ultima_leitura_em    TIMESTAMPTZ,
  unidade_medida       TEXT NOT NULL DEFAULT 'kWh',
  alerta_consumo_alto  NUMERIC,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medidores_condo ON public.medidores(condominio_id);
CREATE INDEX IF NOT EXISTS idx_medidores_tipo  ON public.medidores(tipo);

-- 2. Tabela de Leituras de Medidores
CREATE TABLE IF NOT EXISTS public.leituras_medidores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medidor_id        UUID NOT NULL REFERENCES public.medidores(id) ON DELETE CASCADE,
  condominio_id     UUID NOT NULL,
  data_leitura      DATE NOT NULL,
  leitura_atual     NUMERIC NOT NULL,
  leitura_anterior  NUMERIC,
  consumo           NUMERIC,
  custo             NUMERIC,
  observacoes       TEXT,
  gerado_por_ia     BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leituras_medidor ON public.leituras_medidores(medidor_id);
CREATE INDEX IF NOT EXISTS idx_leituras_condo   ON public.leituras_medidores(condominio_id);
CREATE INDEX IF NOT EXISTS idx_leituras_data    ON public.leituras_medidores(data_leitura DESC);

-- ✅ Migração concluída!
-- Após executar, acesse os módulos Energia, Gás e Água no ImobCore
-- para cadastrar medidores e registrar leituras mensais.
-- A Di (Síndica Virtual) passará a monitorar o consumo automaticamente.
