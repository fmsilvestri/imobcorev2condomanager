import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log("🔧 Setting up ImobCore v2 Supabase schema...\n");

  // Check if condominios table exists
  const { error: checkErr } = await supabase.from("condominios").select("id").limit(1);

  if (checkErr && checkErr.code === "42P01") {
    console.log("❌ Tables don't exist yet.");
    console.log("📋 Please run this SQL in your Supabase SQL Editor:");
    console.log("   https://supabase.com/dashboard/project/" + url.split("//")[1].split(".")[0] + "/sql\n");
    printSQL();
    process.exit(1);
  }

  if (checkErr) {
    console.error("❌ Error connecting to Supabase:", checkErr.message);
    process.exit(1);
  }

  console.log("✅ Tables detected! Running migrations...\n");
  await runMigrations();
  await seedData();
}

async function runMigrations() {
  const projectId = url.split("//")[1].split(".")[0];
  const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectId}/sql/new`;

  // ── Migration 1: condominios extra columns ─────────────────────────────
  const { error: m1Err } = await supabase.from("condominios").select("cnpj, endereco, estado, sindico_email, sindico_tel").limit(1);
  if (m1Err) {
    console.log("⚠️  Migration 1 needed (condominios columns). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    [
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cnpj TEXT",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS endereco TEXT",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'SC'",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS sindico_email TEXT",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS sindico_tel TEXT",
    ].forEach(m => console.log("   " + m + ";"));
    console.log();
  } else {
    console.log("✅ Migration 1 (condominios): OK");
  }

  // ── Migration 1b: condominios — plano, status, trial, logo, cor ────────
  const { error: m1bErr } = await supabase.from("condominios").select("plano, status, trial_expires_at, logo_url, cor_primaria, total_unidades").limit(1);
  if (m1bErr) {
    console.log("⚠️  Migration 1b needed (condominios plano/status/trial). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    [
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS total_unidades INT DEFAULT 0",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'free'",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'trial'",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS logo_url TEXT",
      "ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cor_primaria TEXT DEFAULT '#7C5CFC'",
    ].forEach(m => console.log("   " + m + ";"));
    console.log();
  } else {
    console.log("✅ Migration 1b (condominios plano/status/trial): OK");
  }

  // ── Migration 1c: condominios → photo_url ──────────────────────────────
  const { error: m1cErr } = await supabase.from("condominios").select("photo_url").limit(1);
  if (m1cErr) {
    console.log("⚠️  Migration 1c needed (condominios photo_url). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    console.log("   ALTER TABLE condominios ADD COLUMN IF NOT EXISTS photo_url TEXT;");
    console.log();
  } else {
    // Run silently via API (service role can do DDL through supabase-js? No — just mark OK)
    console.log("✅ Migration 1c (condominios photo_url): OK");
  }

  // ── Migration 2: ordens_servico → responsavel + numero + unique ────────
  const { error: m2Err } = await supabase.from("ordens_servico").select("responsavel, numero").limit(1);
  if (m2Err) {
    console.log("\n⚠️  Migration 2 needed (ordens_servico columns). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    [
      "ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS responsavel TEXT",
      "ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS numero INTEGER",
      "ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_os_numero_condo ON ordens_servico (condominio_id, numero) WHERE numero IS NOT NULL",
    ].forEach(m => console.log("   " + m + ";"));
    console.log();
  } else {
    console.log("✅ Migration 2 (ordens_servico responsavel+numero): OK");
  }

  // ── Migration 3: Diagnóstico Inteligente tables ─────────────────────────
  const { error: m3Err } = await supabase.from("score_condominio").select("id").limit(1);
  if (m3Err) {
    console.log("⚠️  Migration 3 needed (diagnostico tables). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    [
      `CREATE TABLE IF NOT EXISTS score_condominio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  score_total int NOT NULL DEFAULT 0,
  financeiro int NOT NULL DEFAULT 0,
  manutencao int NOT NULL DEFAULT 0,
  operacao int NOT NULL DEFAULT 0,
  iot int NOT NULL DEFAULT 0,
  gestao int NOT NULL DEFAULT 0,
  nivel text,
  dados jsonb,
  insights jsonb,
  ia_analise text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(condominio_id)
)`,
      `CREATE TABLE IF NOT EXISTS insights_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  tipo text,
  mensagem text,
  prioridade text,
  status text DEFAULT 'ativo',
  created_at timestamptz DEFAULT now()
)`,
    ].forEach(m => console.log(m + ";\n"));
    console.log();
  } else {
    console.log("✅ Migration 3 (diagnostico tables): OK");
  }

  // ── Migration 4: Equipamentos — colunas extras para Manutenção ─────────────
  const { error: m4Err } = await supabase.from("equipamentos").select("cat_icon, modelo, serie, instalado_ha, prox_manutencao, ultima_manutencao, custo_manutencao").limit(1);
  if (m4Err) {
    console.log("⚠️  Migration 4 needed (equipamentos extra columns). Run in SQL Editor:");
    [
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS cat_icon text DEFAULT '⚙️'",
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS modelo text",
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS serie text",
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS instalado_ha int DEFAULT 0",
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS prox_manutencao date",
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS ultima_manutencao date",
      "ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS custo_manutencao numeric(10,2) DEFAULT 0",
    ].forEach(m => console.log("   " + m + ";"));
    console.log();
  } else {
    console.log("✅ Migration 4 (equipamentos extra columns): OK");
  }

  // ─── Migration 4b: Equipamentos — fornecedor_id + quantidade ────────────────
  const { error: m4bErr } = await supabase.from("equipamentos").select("fornecedor_id, quantidade").limit(1);
  if (m4bErr) {
    console.log("⚠️  Migration 4b needed (equipamentos fornecedor_id + quantidade). Run in SQL Editor:");
    console.log("   ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES fornecedores(id) ON DELETE SET NULL;");
    console.log("   ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS quantidade int NOT NULL DEFAULT 1;");
    console.log();
  } else {
    console.log("✅ Migration 4b (equipamentos fornecedor_id + quantidade): OK");
  }

  // ─── Migration 5: Planos de Manutenção ──────────────────────────────────────
  const { error: m5Err } = await supabase.from("planos_manutencao").select("id").limit(1);
  if (m5Err) {
    console.log("⚠️  Migration 5 needed (planos_manutencao). Run in SQL Editor:");
    console.log("   CREATE TABLE IF NOT EXISTS planos_manutencao (");
    console.log("     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),");
    console.log("     condominio_id uuid NOT NULL,");
    console.log("     codigo text, nome text NOT NULL,");
    console.log("     tipo text DEFAULT 'preventiva',");
    console.log("     periodicidade text DEFAULT 'mensal',");
    console.log("     equipamentos_itens jsonb DEFAULT '[]',");
    console.log("     custo_total numeric(10,2) DEFAULT 0,");
    console.log("     tempo_estimado_min int DEFAULT 0,");
    console.log("     proxima_execucao date,");
    console.log("     instrucoes text,");
    console.log("     status text DEFAULT 'ativo',");
    console.log("     created_at timestamptz DEFAULT now(),");
    console.log("     updated_at timestamptz DEFAULT now()");
    console.log("   );");
    console.log("   CREATE INDEX IF NOT EXISTS idx_planos_condo ON planos_manutencao(condominio_id);");
    console.log();
  } else {
    console.log("✅ Migration 5 (planos_manutencao): OK");
  }

  // ─── Migration 6: Fornecedores e Contatos ───────────────────────────────────
  const { error: m6Err } = await supabase.from("fornecedores").select("id,nome,categoria").limit(1);
  if (m6Err) {
    console.log("⚠️  Migration 6 needed (fornecedores). Run in SQL Editor:");
    console.log("   CREATE TABLE IF NOT EXISTS fornecedores (");
    console.log("     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),");
    console.log("     condominio_id uuid NOT NULL,");
    console.log("     nome text NOT NULL,");
    console.log("     categoria text DEFAULT 'Geral',");
    console.log("     icone text DEFAULT '🏢',");
    console.log("     telefone text,");
    console.log("     whatsapp text,");
    console.log("     email text,");
    console.log("     endereco text,");
    console.log("     observacoes text,");
    console.log("     status text DEFAULT 'ativo',");
    console.log("     created_at timestamptz DEFAULT now(),");
    console.log("     updated_at timestamptz DEFAULT now()");
    console.log("   );");
    console.log("   CREATE INDEX IF NOT EXISTS idx_fornec_condo ON fornecedores(condominio_id);");
    console.log();
  } else {
    console.log("✅ Migration 6 (fornecedores): OK");
  }

  // ─── Migration 7: Piscina e Qualidade da Água ───────────────────────────────
  const { error: m7Err } = await supabase.from("piscina_leituras").select("id,ph,cloro").limit(1);
  if (m7Err) {
    console.log("⚠️  Migration 7 needed (piscina_leituras). Run in SQL Editor:");
    console.log("   CREATE TABLE IF NOT EXISTS piscina_leituras (");
    console.log("     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),");
    console.log("     condominio_id uuid NOT NULL,");
    console.log("     ph numeric(5,2) NOT NULL,");
    console.log("     cloro numeric(5,2) NOT NULL,");
    console.log("     temperatura numeric(5,1),");
    console.log("     alcalinidade numeric(7,1),");
    console.log("     dureza_calcica numeric(7,1),");
    console.log("     status text DEFAULT 'ok',");
    console.log("     observacoes text,");
    console.log("     created_at timestamptz DEFAULT now()");
    console.log("   );");
    console.log("   CREATE INDEX IF NOT EXISTS idx_piscina_condo ON piscina_leituras(condominio_id, created_at DESC);");
    console.log();
  } else {
    console.log("✅ Migration 7 (piscina_leituras): OK");
  }

  // ─── Migration 8: Histórico de Diagnósticos IA ──────────────────────────────
  const { error: m8Err } = await supabase.from("diagnostico_historico").select("id,score_total").limit(1);
  if (m8Err) {
    console.log("⚠️  Migration 8 needed (diagnostico_historico). Run in SQL Editor:");
    console.log("   CREATE TABLE IF NOT EXISTS diagnostico_historico (");
    console.log("     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),");
    console.log("     condominio_id uuid NOT NULL,");
    console.log("     score_total int NOT NULL,");
    console.log("     nivel text NOT NULL,");
    console.log("     score_financeiro int,");
    console.log("     score_manutencao int,");
    console.log("     score_iot int,");
    console.log("     score_gestao int,");
    console.log("     dados jsonb,");
    console.log("     insights jsonb,");
    console.log("     ia_analise text,");
    console.log("     calculado_em timestamptz DEFAULT now()");
    console.log("   );");
    console.log("   CREATE INDEX IF NOT EXISTS idx_diag_hist_condo ON diagnostico_historico(condominio_id, calculado_em DESC);");
    console.log();
  } else {
    console.log("✅ Migration 8 (diagnostico_historico): OK");
  }

  // ─── Migration 9: OS ↔ Equipamentos – equipamento_ids JSONB ────────────────
  const { error: m9Err } = await supabase.from("ordens_servico").select("equipamento_ids").limit(1);
  if (m9Err) {
    console.log("⚠️  Migration 9 needed (ordens_servico equipamento_ids). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    console.log("   ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS equipamento_ids JSONB DEFAULT '[]';");
    console.log();
  } else {
    console.log("✅ Migration 9 (ordens_servico equipamento_ids): OK");
  }

  // ─── Migration 10: Financeiro Inteligente ────────────────────────────────────
  const { error: m10Err } = await supabase.from("lancamentos_financeiros").select("id").limit(1);
  if (m10Err) {
    console.log("⚠️  Migration 10 needed (lancamentos_financeiros). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    console.log(`
CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES condominios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  categoria TEXT NOT NULL DEFAULT 'geral',
  subcategoria TEXT,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  competencia TEXT,
  status TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','pago','atrasado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orcamento_anual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES condominios(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  valor_previsto NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_real NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`);
    console.log();
  } else {
    console.log("✅ Migration 10 (lancamentos_financeiros, orcamento_anual): OK");
  }

  // ─── Migration 11: Reservatórios IoT + Sensor Leituras ──────────────────────
  const { error: m11Err } = await supabase.from("reservatorios").select("id").limit(1);
  if (m11Err) {
    console.log("⚠️  Migration 11 needed (reservatorios + sensor_leituras). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    console.log(`
CREATE TABLE IF NOT EXISTS reservatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  sensor_id TEXT,
  nome TEXT NOT NULL,
  local TEXT,
  capacidade_litros NUMERIC DEFAULT 10000,
  altura_cm NUMERIC DEFAULT 200,
  mac_address TEXT,
  cf_url TEXT,
  wh_url TEXT,
  protocolo TEXT DEFAULT 'HTTP POST JSON',
  porta INT DEFAULT 80,
  cf_online BOOLEAN DEFAULT false,
  wh_online BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservatorios_condo ON reservatorios(condominio_id);

CREATE TABLE IF NOT EXISTS sensor_leituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id TEXT,
  nivel NUMERIC,
  distancia_cm NUMERIC,
  temperatura NUMERIC,
  pressao NUMERIC,
  mac_address TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_sensor ON sensor_leituras(sensor_id, received_at DESC);
`);
    console.log();
  } else {
    console.log("✅ Migration 11 (reservatorios, sensor_leituras): OK");
  }

  // ─── Migration 11b: Reservatórios — colunas IoT adicionais ──────────────────
  const { error: m11bErr } = await supabase.from("reservatorios")
    .select("altura_cm, mac_address, cf_url, wh_url, protocolo, porta, cf_online, wh_online, sensor_id, condominio_id").limit(1);
  if (m11bErr) {
    console.log("⚠️  Migration 11b needed (reservatorios extra columns). Run in SQL Editor:");
    console.log(`   ${sqlEditorUrl}\n`);
    console.log(`
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS condominio_id UUID;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS sensor_id TEXT;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS local TEXT;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS capacidade_litros NUMERIC DEFAULT 10000;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS altura_cm NUMERIC DEFAULT 200;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS mac_address TEXT;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS cf_url TEXT;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS wh_url TEXT;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS protocolo TEXT DEFAULT 'HTTP POST JSON';
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS porta INT DEFAULT 80;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS cf_online BOOLEAN DEFAULT false;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS wh_online BOOLEAN DEFAULT false;
`);
    console.log();
  } else {
    console.log("✅ Migration 11b (reservatorios columns): OK");
  }

  console.log();
}

function printSQL() {
  const sql = `
CREATE TABLE IF NOT EXISTS condominios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL, cnpj TEXT, endereco TEXT, cidade TEXT, estado TEXT DEFAULT 'SC',
  unidades INT DEFAULT 0, total_unidades INT DEFAULT 0, moradores INT DEFAULT 0,
  sindico_nome TEXT, sindico_email TEXT, sindico_tel TEXT,
  plano TEXT DEFAULT 'free',
  status TEXT DEFAULT 'trial',
  trial_expires_at TIMESTAMPTZ,
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#7C5CFC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Migration for existing installs:
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'SC';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS sindico_email TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS sindico_tel TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS total_unidades INT DEFAULT 0;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'free';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'trial';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cor_primaria TEXT DEFAULT '#7C5CFC';
CREATE TABLE IF NOT EXISTS ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID, numero INTEGER, titulo TEXT NOT NULL,
  descricao TEXT, categoria TEXT, status TEXT DEFAULT 'aberta',
  prioridade TEXT DEFAULT 'media', unidade TEXT, responsavel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_os_numero_condo ON ordens_servico (condominio_id, numero) WHERE numero IS NOT NULL;
-- Migration for existing installs:
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS responsavel TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS numero INTEGER;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE TABLE IF NOT EXISTS sensores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID, sensor_id TEXT UNIQUE, nome TEXT, local TEXT,
  capacidade_litros NUMERIC DEFAULT 0, nivel_atual NUMERIC DEFAULT 0,
  volume_litros NUMERIC DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS alertas_publicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT, titulo TEXT, descricao TEXT, tipo TEXT, nivel TEXT,
  cidade TEXT, bairro TEXT, ativo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS financeiro_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID, descricao TEXT, valor NUMERIC DEFAULT 0,
  categoria TEXT, status TEXT DEFAULT 'pago', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS financeiro_despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID, descricao TEXT, valor NUMERIC DEFAULT 0,
  categoria TEXT, fornecedor TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS comunicados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID, titulo TEXT, corpo TEXT,
  gerado_por_ia BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sindico_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID, sessao_id TEXT, pergunta TEXT, resposta TEXT,
  tokens_input INT DEFAULT 0, tokens_output INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER PUBLICATION supabase_realtime ADD TABLE sensores, ordens_servico, alertas_publicos, comunicados, sindico_historico;
CREATE TABLE IF NOT EXISTS reservatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  sensor_id TEXT,
  nome TEXT NOT NULL,
  local TEXT,
  capacidade_litros NUMERIC DEFAULT 10000,
  altura_cm NUMERIC DEFAULT 200,
  mac_address TEXT,
  cf_url TEXT,
  wh_url TEXT,
  protocolo TEXT DEFAULT 'HTTP POST JSON',
  porta INT DEFAULT 80,
  cf_online BOOLEAN DEFAULT false,
  wh_online BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservatorios_condo ON reservatorios(condominio_id);
CREATE TABLE IF NOT EXISTS sensor_leituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id TEXT,
  nivel NUMERIC,
  distancia_cm NUMERIC,
  temperatura NUMERIC,
  pressao NUMERIC,
  mac_address TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_sensor ON sensor_leituras(sensor_id, received_at DESC);
  `;
  console.log(sql);
}

async function seedData() {
  const force = process.argv.includes("--force");

  // Check if already seeded
  const { data: existing } = await supabase.from("condominios").select("id").limit(1);
  if (existing && existing.length > 0 && !force) {
    console.log("⚠️  Data already exists. Run with --force to reseed.\n");
    console.log("✅ Existing condomínio found - system ready!");
    return;
  }

  if (force) {
    console.log("🗑️  Clearing existing data...");
    await supabase.from("sindico_historico").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("comunicados").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("financeiro_despesas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("financeiro_receitas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("alertas_publicos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("sensores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("ordens_servico").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("condominios").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // 1. Condomínio
  const { data: cond, error: condErr } = await supabase
    .from("condominios")
    .insert({ nome: "Residencial Parque das Flores", cidade: "Florianópolis", unidades: 84, moradores: 168, sindico_nome: "Ricardo Gestor" })
    .select()
    .single();

  if (condErr) { console.error("❌ condominios error:", condErr.message); return; }
  const condId = cond.id;
  console.log("✅ Condomínio:", cond.nome, "(" + condId + ")");

  // 2. Sensores
  const sensores = [
    { sensor_id: "sensor_piscina", nome: "Tanque Piscina", local: "Área da Piscina", capacidade_litros: 8000, nivel_atual: 99, volume_litros: 7920 },
    { sensor_id: "sensor_agua", nome: "Caixa Torre A", local: "Telhado Torre A", capacidade_litros: 5000, nivel_atual: 72, volume_litros: 3600 },
    { sensor_id: "sensor_agua_b", nome: "Caixa Torre B", local: "Telhado Torre B", capacidade_litros: 5000, nivel_atual: 68, volume_litros: 3400 },
    { sensor_id: "sensor_cisterna", nome: "Cisterna Principal", local: "Subsolo", capacidade_litros: 10000, nivel_atual: 55, volume_litros: 5500 },
    { sensor_id: "sensor_incendio", nome: "Reservatório Incêndio", local: "Cobertura", capacidade_litros: 3000, nivel_atual: 91, volume_litros: 2730 },
  ];

  for (const s of sensores) {
    const { error } = await supabase.from("sensores").upsert({ ...s, condominio_id: condId }, { onConflict: "sensor_id" });
    if (error) console.error("  ❌ sensor err:", error.message);
    else console.log("  ✅ Sensor:", s.nome, s.nivel_atual + "%");
  }

  // 3. Ordens de Serviço
  const os = [
    { titulo: "Vazamento no banheiro", descricao: "Cano estourado no banheiro do apto 304", categoria: "hidraulica", prioridade: "urgente", unidade: "Apto 304 - Torre B" },
    { titulo: "Lâmpada queimada no hall", descricao: "Hall do 2º andar sem iluminação", categoria: "eletrica", prioridade: "media", unidade: "Hall 2º Andar" },
    { titulo: "Bomba da piscina com ruído", descricao: "Motor da bomba fazendo barulho anormal", categoria: "equipamento", prioridade: "urgente", unidade: "Área Piscina" },
    { titulo: "Portão da garagem travado", descricao: "Portão não abre normalmente", categoria: "seguranca", prioridade: "alta", unidade: "Garagem B1" },
    { titulo: "Limpeza da piscina", descricao: "Manutenção periódica programada", categoria: "limpeza", prioridade: "baixa", unidade: "Área Piscina" },
  ];

  for (const o of os) {
    const { error } = await supabase.from("ordens_servico").insert({ ...o, condominio_id: condId, status: "aberta" });
    if (error) console.error("  ❌ os err:", error.message);
    else console.log("  ✅ OS:", o.titulo, "–", o.prioridade);
  }

  // 4. Alertas MISP
  const alertas = [
    { origem: "CASAN", titulo: "Interrupção no abastecimento de água", descricao: "Manutenção programada na rede de distribuição. Previsão de retorno: 18h.", tipo: "abastecimento_agua", nivel: "alto", cidade: "Florianópolis", bairro: "Ingleses", ativo: true },
    { origem: "CELESC", titulo: "Queda de energia programada", descricao: "Manutenção preventiva na rede elétrica. Duração estimada: 4 horas.", tipo: "energia_eletrica", nivel: "medio", cidade: "Florianópolis", bairro: "Canasvieiras", ativo: true },
  ];

  for (const a of alertas) {
    const { error } = await supabase.from("alertas_publicos").insert(a);
    if (error) console.error("  ❌ alerta err:", error.message);
    else console.log("  ✅ Alerta MISP:", a.titulo, "–", a.origem);
  }

  // 5. Financeiro
  const { error: recErr } = await supabase.from("financeiro_receitas").insert({
    condominio_id: condId, descricao: "Taxa condominial – Março 2026", valor: 64800, categoria: "taxa_condominial", status: "pago",
  });
  if (recErr) console.error("  ❌ receita err:", recErr.message);
  else console.log("  ✅ Receita: Taxa condominial R$64.800");

  const despesas = [
    { descricao: "Manutenção elevadores", valor: 8200, categoria: "manutencao", fornecedor: "ElevaTech Ltda" },
    { descricao: "Energia CELESC – Fevereiro", valor: 5400, categoria: "energia", fornecedor: "CELESC" },
  ];
  for (const d of despesas) {
    const { error } = await supabase.from("financeiro_despesas").insert({ ...d, condominio_id: condId });
    if (error) console.error("  ❌ despesa err:", error.message);
    else console.log("  ✅ Despesa:", d.descricao);
  }

  // 6. Comunicado inicial
  const { error: comErr } = await supabase.from("comunicados").insert({
    condominio_id: condId,
    titulo: "Bem-vindo ao ImobCore v2 – Sistema de Gestão Inteligente",
    corpo: "Prezados condôminos, informamos que nosso condomínio agora conta com o sistema ImobCore v2, com Síndico Virtual IA, monitoramento de sensores IoT em tempo real e integração com alertas MISP. Qualquer dúvida, acione o Síndico Virtual disponível 24h.\n\nAtt., Ricardo Gestor – Síndico",
    gerado_por_ia: false,
  });
  if (comErr) console.error("  ❌ comunicado err:", comErr.message);
  else console.log("  ✅ Comunicado inicial criado");

  console.log("\n🎉 Setup completo! ImobCore v2 pronto para uso.");
}

run().catch(console.error);
