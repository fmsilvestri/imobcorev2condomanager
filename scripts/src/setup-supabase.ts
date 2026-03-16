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

  console.log();
}

function printSQL() {
  const sql = `
CREATE TABLE IF NOT EXISTS condominios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL, cnpj TEXT, endereco TEXT, cidade TEXT, estado TEXT DEFAULT 'SC',
  unidades INT DEFAULT 0, moradores INT DEFAULT 0,
  sindico_nome TEXT, sindico_email TEXT, sindico_tel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Migration for existing installs:
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'SC';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS sindico_email TEXT;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS sindico_tel TEXT;
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
