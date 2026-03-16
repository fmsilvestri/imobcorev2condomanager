// Creates missing tables via Supabase REST API using service role key
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Extract project ref from URL
const projectRef = url.replace("https://", "").split(".")[0];

async function execSQL(sql: string): Promise<void> {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SQL failed (${resp.status}): ${text}`);
  }
}

// Alternative: use the pg REST endpoint directly  
async function execSQLDirect(sql: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Use supabase-js with direct rpc or pg endpoint
    const supabase = createClient(url, key, {
      db: { schema: "public" }
    });
    
    // Try using pg_catalog approach
    const { data, error } = await supabase.rpc("query", { sql });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function main() {
  console.log("🔧 Creating missing ImobCore v2 tables via Supabase Management API...");
  console.log("Project ref:", projectRef);
  
  const statements = [
    // condominios - may need to add missing columns
    `ALTER TABLE IF EXISTS condominios 
     ADD COLUMN IF NOT EXISTS cidade TEXT,
     ADD COLUMN IF NOT EXISTS unidades INT DEFAULT 0,
     ADD COLUMN IF NOT EXISTS moradores INT DEFAULT 0,
     ADD COLUMN IF NOT EXISTS sindico_nome TEXT`,

    `CREATE TABLE IF NOT EXISTS ordens_servico (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      condominio_id UUID,
      numero SERIAL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      status TEXT DEFAULT 'aberta',
      prioridade TEXT DEFAULT 'media',
      unidade TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `ALTER TABLE IF EXISTS sensores
     ADD COLUMN IF NOT EXISTS condominio_id UUID,
     ADD COLUMN IF NOT EXISTS nome TEXT,
     ADD COLUMN IF NOT EXISTS local TEXT,
     ADD COLUMN IF NOT EXISTS capacidade_litros NUMERIC DEFAULT 0,
     ADD COLUMN IF NOT EXISTS nivel_atual NUMERIC DEFAULT 0,
     ADD COLUMN IF NOT EXISTS volume_litros NUMERIC DEFAULT 0,
     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    `CREATE TABLE IF NOT EXISTS alertas_publicos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      origem TEXT,
      titulo TEXT,
      descricao TEXT,
      tipo TEXT,
      nivel TEXT,
      cidade TEXT,
      bairro TEXT,
      ativo BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS financeiro_receitas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      condominio_id UUID,
      descricao TEXT,
      valor NUMERIC DEFAULT 0,
      categoria TEXT,
      status TEXT DEFAULT 'pago',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS financeiro_despesas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      condominio_id UUID,
      descricao TEXT,
      valor NUMERIC DEFAULT 0,
      categoria TEXT,
      fornecedor TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS comunicados (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      condominio_id UUID,
      titulo TEXT,
      corpo TEXT,
      gerado_por_ia BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS sindico_historico (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      condominio_id UUID,
      sessao_id TEXT,
      pergunta TEXT,
      resposta TEXT,
      tokens_input INT DEFAULT 0,
      tokens_output INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];
  
  for (const sql of statements) {
    const preview = sql.trim().substring(0, 60).replace(/\n/g, " ");
    try {
      const resp = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql }),
      });
      
      if (!resp.ok) {
        // Try management API
        const mgmtResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        });
        
        if (!mgmtResp.ok) {
          const errText = await mgmtResp.text().catch(() => "unknown");
          console.log(`  ⚠️  ${preview}... → ${errText.substring(0, 100)}`);
        } else {
          console.log(`  ✅ ${preview}...`);
        }
      } else {
        console.log(`  ✅ ${preview}...`);
      }
    } catch (e) {
      console.log(`  ❌ ${preview}... → ${String(e).substring(0, 80)}`);
    }
  }
  
  // Try to reload schema cache
  await fetch(`${url}/rest/v1/`, {
    method: "HEAD",
    headers: { "apikey": key, "Authorization": `Bearer ${key}` }
  }).catch(() => {});
  
  console.log("\n📋 SQL to run manually in Supabase SQL Editor if needed:");
  console.log("   https://supabase.com/dashboard/project/" + projectRef + "/sql/new\n");
  
  // Print the combined SQL for manual execution
  console.log("-- IMOBCORE V2 SCHEMA --");
  statements.forEach(s => console.log(s.trim() + ";\n"));
}

main().catch(console.error);
