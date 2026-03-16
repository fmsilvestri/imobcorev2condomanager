import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const tables = ["condominios", "ordens_servico", "sensores", "alertas_publicos",
    "financeiro_receitas", "financeiro_despesas", "comunicados", "sindico_historico"];
  
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      console.log(`❌ ${t}: ${error.message} (code: ${error.code})`);
    } else {
      console.log(`✅ ${t}: OK (${data?.length} rows)`);
    }
  }
}

check().catch(console.error);
