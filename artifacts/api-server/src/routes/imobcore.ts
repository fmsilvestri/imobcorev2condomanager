import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Prefer user's direct ANTHROPIC_API_KEY; fall back to Replit AI integration
const directKey = process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-") ? process.env.ANTHROPIC_API_KEY : null;
const anthropic = directKey
  ? new Anthropic({ apiKey: directKey })
  : new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "",
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

// SSE clients set
const sseClients = new Set<Response>();

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  });
}

// GET /api/stream - SSE endpoint
router.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  sseClients.add(res);
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(`:ping\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 25000);

  req.on("close", () => {
    sseClients.delete(res);
    clearInterval(keepAlive);
  });
});

// GET /api/dashboard
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };
    // Load all condominios for the selector
    const { data: condominios } = await supabase.from("condominios").select("*").order("created_at", { ascending: true });
    // Use requested condo or fall back to first
    const primaryId = condominio_id || (condominios || [])[0]?.id;

    const [
      { data: os },
      { data: sensores },
      { data: alertas },
      { data: receitas },
      { data: despesas },
      { data: comunicados },
    ] = await Promise.all([
      primaryId
        ? supabase.from("ordens_servico").select("*").eq("condominio_id", primaryId).order("created_at", { ascending: false })
        : supabase.from("ordens_servico").select("*").order("created_at", { ascending: false }),
      primaryId
        ? supabase.from("sensores").select("*").eq("condominio_id", primaryId)
        : supabase.from("sensores").select("*"),
      supabase.from("alertas_publicos").select("*").eq("ativo", true),
      primaryId
        ? supabase.from("financeiro_receitas").select("*").eq("condominio_id", primaryId).order("created_at", { ascending: true })
        : supabase.from("financeiro_receitas").select("*").order("created_at", { ascending: true }),
      primaryId
        ? supabase.from("financeiro_despesas").select("*").eq("condominio_id", primaryId).order("created_at", { ascending: true })
        : supabase.from("financeiro_despesas").select("*").order("created_at", { ascending: true }),
      primaryId
        ? supabase.from("comunicados").select("*").eq("condominio_id", primaryId).order("created_at", { ascending: false })
        : supabase.from("comunicados").select("*").order("created_at", { ascending: false }),
    ]);

    const totalReceitas = (receitas || []).reduce((s: number, r: { valor: number }) => s + Number(r.valor), 0);
    const totalDespesas = (despesas || []).reduce((s: number, d: { valor: number }) => s + Number(d.valor), 0);

    res.json({
      condominios: condominios || [],
      ordens_servico: os || [],
      sensores: sensores || [],
      alertas_publicos: alertas || [],
      receitas: receitas || [],
      despesas: despesas || [],
      comunicados: comunicados || [],
      totais: {
        os_abertas: (os || []).filter((o: { status: string }) => o.status === "aberta").length,
        os_urgentes: (os || []).filter((o: { prioridade: string; status: string }) => o.prioridade === "urgente" && o.status === "aberta").length,
        saldo: totalReceitas - totalDespesas,
        total_receitas: totalReceitas,
        total_despesas: totalDespesas,
        alertas_ativos: (alertas || []).length,
        nivel_medio_agua: sensores && sensores.length > 0
          ? Math.round((sensores as { nivel_atual: number }[]).reduce((s, x) => s + Number(x.nivel_atual), 0) / sensores.length)
          : 0,
      },
    });
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).json({ error: "Erro ao buscar dashboard" });
  }
});

// POST /api/sindico/chat - Coração do Síndico Virtual IA
router.post("/sindico/chat", async (req: Request, res: Response) => {
  try {
    const { message, history = [], condominio_id } = req.body as {
      message: string;
      history: { role: string; content: string }[];
      condominio_id?: string;
    };

    const [
      { data: cond },
      { data: osAbertas },
      { data: sensores },
      { data: alertas },
      { data: receitas },
      { data: despesas },
    ] = await Promise.all([
      supabase.from("condominios").select("*").limit(1).single(),
      supabase.from("ordens_servico").select("*").eq("status", "aberta").order("created_at", { ascending: false }),
      supabase.from("sensores").select("*"),
      supabase.from("alertas_publicos").select("*").eq("ativo", true),
      supabase.from("financeiro_receitas").select("*"),
      supabase.from("financeiro_despesas").select("*"),
    ]);

    const totalReceitas = (receitas || []).reduce((s: number, r: { valor: number }) => s + Number(r.valor), 0);
    const totalDespesas = (despesas || []).reduce((s: number, d: { valor: number }) => s + Number(d.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    const osUrgentes = (osAbertas || []).filter((o: { prioridade: string }) => o.prioridade === "urgente");

    const systemPrompt = `Você é o Síndico Virtual IA do ${cond?.nome || "condomínio"}, localizado em ${cond?.cidade || "Florianópolis"}.
Síndico responsável: ${cond?.sindico_nome || "Ricardo Gestor"}.
Unidades: ${cond?.unidades || 84} | Moradores: ${cond?.moradores || 168}.

SITUAÇÃO ATUAL (${new Date().toLocaleString("pt-BR")}):

📋 ORDENS DE SERVIÇO ABERTAS (${(osAbertas || []).length} total, ${osUrgentes.length} urgentes):
${(osAbertas || []).slice(0, 10).map((o: { numero: number; titulo: string; prioridade: string; unidade?: string; categoria: string }) =>
  `- OS #${o.numero}: ${o.titulo} | Prioridade: ${o.prioridade} | Unidade: ${o.unidade || "Área comum"} | Categoria: ${o.categoria}`
).join("\n") || "Nenhuma OS aberta"}

💧 SENSORES IoT:
${(sensores || []).map((s: { nome: string; local: string; nivel_atual: number; capacidade_litros: number; volume_litros: number }) =>
  `- ${s.nome} (${s.local}): ${s.nivel_atual}% | ${s.volume_litros?.toFixed(0)}L de ${s.capacidade_litros}L${s.nivel_atual < 30 ? " ⚠️ CRÍTICO" : s.nivel_atual < 60 ? " ⚠️ ATENÇÃO" : " ✅"}`
).join("\n") || "Sem sensores"}

🚨 ALERTAS MISP ATIVOS (${(alertas || []).length}):
${(alertas || []).map((a: { titulo: string; nivel: string; cidade: string; bairro: string; tipo: string }) =>
  `- ${a.titulo} | Nível: ${a.nivel} | ${a.cidade} - ${a.bairro} | Tipo: ${a.tipo}`
).join("\n") || "Nenhum alerta ativo"}

💰 FINANCEIRO:
- Receitas: R$ ${totalReceitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Despesas: R$ ${totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Saldo: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${saldo >= 0 ? "✅" : "⚠️ NEGATIVO"}

Responda de forma profissional, objetiva e útil. Use emojis moderadamente. Máximo 400 palavras por resposta.`;

    const messages = [
      ...history.slice(-10).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: systemPrompt,
      messages,
    });

    const reply = aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";
    const tokens = {
      input: aiResponse.usage.input_tokens,
      output: aiResponse.usage.output_tokens,
    };

    // Save to history
    const sessaoId = `sess_${Date.now()}`;
    await supabase.from("sindico_historico").insert({
      condominio_id: condominio_id || cond?.id,
      sessao_id: sessaoId,
      pergunta: message,
      resposta: reply,
      tokens_input: tokens.input,
      tokens_output: tokens.output,
    });

    broadcast("sindico_chat", { message, reply, timestamp: new Date().toISOString() });

    res.json({ reply, tokens });
  } catch (err) {
    console.error("sindico chat error:", err);
    res.status(500).json({ error: "Erro ao processar mensagem" });
  }
});

// POST /api/sindico/comunicado - Gerar comunicado via IA
router.post("/sindico/comunicado", async (req: Request, res: Response) => {
  try {
    const { tema, condominio_id } = req.body as { tema: string; condominio_id?: string };

    const { data: cond } = await supabase.from("condominios").select("*").limit(1).single();

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `Crie um comunicado formal para o condomínio "${cond?.nome || "Residencial Parque das Flores"}" sobre o seguinte tema: ${tema}. 
          
          Inclua:
          - Título claro e objetivo
          - Corpo do comunicado profissional
          - Data: ${new Date().toLocaleDateString("pt-BR")}
          - Assinatura: Síndico ${cond?.sindico_nome || "Ricardo Gestor"}
          
          Formato: retorne um JSON com { "titulo": "...", "corpo": "..." }`,
        },
      ],
    });

    let titulo = `Comunicado - ${tema}`;
    let corpo = "";

    const text = aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "{}";
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { titulo?: string; corpo?: string };
        titulo = parsed.titulo || titulo;
        corpo = parsed.corpo || text;
      } else {
        corpo = text;
      }
    } catch {
      corpo = text;
    }

    const { data: comunicado } = await supabase
      .from("comunicados")
      .insert({
        condominio_id: condominio_id || cond?.id,
        titulo,
        corpo,
        gerado_por_ia: true,
      })
      .select()
      .single();

    broadcast("novo_comunicado", comunicado);
    res.json(comunicado);
  } catch (err) {
    console.error("comunicado error:", err);
    res.status(500).json({ error: "Erro ao gerar comunicado" });
  }
});

// GET /api/condominios - Listar todos os condomínios
router.get("/condominios", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("condominios")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/os - Listar OSs (com filtros opcionais)
router.get("/os", async (req: Request, res: Response) => {
  try {
    const { status, categoria, prioridade, search } = req.query as Record<string, string>;
    let q = supabase.from("ordens_servico").select("*").order("created_at", { ascending: false });
    if (status && status !== "todos") q = q.eq("status", status);
    if (categoria && categoria !== "todos") q = q.eq("categoria", categoria);
    if (prioridade && prioridade !== "todos") q = q.eq("prioridade", prioridade);
    if (search) q = q.ilike("titulo", `%${search}%`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/os - Criar OS
router.post("/os", async (req: Request, res: Response) => {
  try {
    const { condominio_id, titulo, descricao, categoria, prioridade, unidade, responsavel } = req.body as {
      condominio_id?: string;
      titulo: string;
      descricao?: string;
      categoria: string;
      prioridade: string;
      unidade?: string;
      responsavel?: string;
    };

    const { data: cond } = await supabase.from("condominios").select("id").limit(1).single();

    // Auto-numeração: pega o maior numero existente e incrementa
    const { data: lastOs } = await supabase
      .from("ordens_servico")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .single();
    const nextNumero = ((lastOs?.numero as number) || 0) + 1;

    const { data, error } = await supabase
      .from("ordens_servico")
      .insert({
        condominio_id: condominio_id || cond?.id,
        numero: nextNumero,
        titulo,
        descricao,
        categoria,
        prioridade: prioridade || "media",
        unidade,
        responsavel,
        status: "aberta",
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    broadcast("nova_os", data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/os/:id - Atualizar OS
router.put("/os/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body as Record<string, unknown>;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("ordens_servico")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    broadcast("os_atualizada", data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/os/:id - Excluir OS
router.delete("/os/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("ordens_servico").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    broadcast("os_excluida", { id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/sensores/dados - Atualizar sensor
router.post("/sensores/dados", async (req: Request, res: Response) => {
  try {
    const { sensor_id, nivel_atual, volume_litros } = req.body as {
      sensor_id: string;
      nivel_atual: number;
      volume_litros?: number;
    };

    const { data, error } = await supabase
      .from("sensores")
      .update({ nivel_atual, volume_litros, updated_at: new Date().toISOString() })
      .eq("sensor_id", sensor_id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    broadcast("sensor_update", data);

    if (nivel_atual < 30) {
      broadcast("alerta_sensor", {
        sensor_id,
        nivel_atual,
        message: `⚠️ Sensor ${(data as { nome: string }).nome} com nível crítico: ${nivel_atual}%`,
      });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/misp - Alertas MISP
router.get("/misp", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("alertas_publicos")
    .select("*")
    .eq("ativo", true)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/financeiro - Dados financeiros
router.get("/financeiro", async (_req: Request, res: Response) => {
  const [{ data: receitas }, { data: despesas }] = await Promise.all([
    supabase.from("financeiro_receitas").select("*").order("created_at", { ascending: false }),
    supabase.from("financeiro_despesas").select("*").order("created_at", { ascending: false }),
  ]);
  res.json({ receitas: receitas || [], despesas: despesas || [] });
});

// GET /api/comunicados - Comunicados
router.get("/comunicados", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("comunicados")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/condominios — criar ou actualizar condomínio (wizard step 1)
router.post("/condominios", async (req: Request, res: Response) => {
  const { id, nome, cnpj, endereco, cidade, estado, sindico_nome, sindico_email, sindico_tel, unidades } = req.body as {
    id?: string; nome: string; cnpj?: string; endereco?: string; cidade?: string; estado?: string;
    sindico_nome?: string; sindico_email?: string; sindico_tel?: string; unidades?: number;
  };

  if (!nome?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
  if (!sindico_nome?.trim()) return res.status(400).json({ error: "Nome do síndico é obrigatório" });
  if (!sindico_email?.trim()) return res.status(400).json({ error: "E-mail do síndico é obrigatório" });
  if (!unidades || unidades < 1) return res.status(400).json({ error: "Total de unidades é obrigatório" });

  // Build payload — try full schema first, fallback to base columns
  const fullPayload: Record<string, unknown> = {
    nome: nome.trim(), cnpj: cnpj || null, endereco: endereco || null,
    cidade: cidade || "", estado: estado || "SC",
    sindico_nome: sindico_nome || "", sindico_email: sindico_email || "",
    sindico_tel: sindico_tel || "", unidades: Number(unidades) || 0,
  };

  const basePayload: Record<string, unknown> = {
    nome: nome.trim(), cidade: cidade || "", estado: estado || "SC",
    sindico_nome: sindico_nome || "", unidades: Number(unidades) || 0,
  };

  try {
    let result;
    if (id) {
      // Update existing
      const { data, error } = await supabase.from("condominios").update(fullPayload).eq("id", id).select().single();
      if (error?.message.includes("does not exist")) {
        const { data: d2, error: e2 } = await supabase.from("condominios").update(basePayload).eq("id", id).select().single();
        if (e2) return res.status(500).json({ error: e2.message });
        result = d2;
      } else if (error) return res.status(500).json({ error: error.message });
      else result = data;
    } else {
      // Insert new
      const { data, error } = await supabase.from("condominios").insert(fullPayload).select().single();
      if (error?.message.includes("does not exist")) {
        const { data: d2, error: e2 } = await supabase.from("condominios").insert(basePayload).select().single();
        if (e2) return res.status(500).json({ error: e2.message });
        result = d2;
      } else if (error) return res.status(500).json({ error: error.message });
      else result = data;
    }
    res.json({ ok: true, condominio: result });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/condominios/:id — atualizar estrutura/infra (wizard step 2)
router.patch("/condominios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { torres_config, torres, andares, unidades } = req.body as {
    torres_config?: unknown[]; torres?: number; andares?: number; unidades?: number;
  };

  if (!id) return res.status(400).json({ error: "ID do condomínio é obrigatório" });

  // Try with torres_config JSONB column first; fallback to base columns only
  const fullPayload: Record<string, unknown> = {};
  if (torres_config !== undefined) fullPayload["torres_config"] = torres_config;
  if (torres !== undefined) fullPayload["torres"] = torres;
  if (andares !== undefined) fullPayload["andares"] = andares;
  if (unidades !== undefined) fullPayload["unidades"] = unidades;

  // Fallback payload uses only columns guaranteed to exist in base schema
  const safePayload: Record<string, unknown> = {};
  if (unidades !== undefined) safePayload["unidades"] = unidades;

  const isSchemaErr = (msg?: string) =>
    msg?.includes("does not exist") || msg?.includes("schema cache");

  try {
    // Attempt 1: full payload (requires all new columns via migration)
    const { data, error } = await supabase.from("condominios").update(fullPayload).eq("id", id).select().single();
    if (isSchemaErr(error?.message)) {
      // Attempt 2: intermediate payload without torres_config (torres + andares only)
      const midPayload: Record<string, unknown> = { ...safePayload };
      if (torres !== undefined) midPayload["torres"] = torres;
      if (andares !== undefined) midPayload["andares"] = andares;
      const { data: d2, error: e2 } = await supabase.from("condominios").update(midPayload).eq("id", id).select().single();
      if (isSchemaErr(e2?.message)) {
        // Attempt 3: safest fallback — only guaranteed base columns
        const { data: d3, error: e3 } = await supabase.from("condominios").update(safePayload).eq("id", id).select().single();
        if (e3) return res.status(500).json({ error: e3.message });
        return res.json({ ok: true, condominio: d3, note: "Run migration to add torres/andares/torres_config columns" });
      }
      if (e2) return res.status(500).json({ error: e2.message });
      return res.json({ ok: true, condominio: d2, note: "torres_config column missing — run migration" });
    }
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, condominio: data });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/sensor - Salvar/upsert sensor individual
router.post("/sensor", async (req: Request, res: Response) => {
  const { condominio_id, sensor_id, nome, local, capacidade_litros, nivel_atual } = req.body as {
    condominio_id?: string; sensor_id?: string; nome?: string;
    local?: string; capacidade_litros?: number; nivel_atual?: number;
  };
  if (!sensor_id || !nome) return res.status(400).json({ error: "sensor_id e nome são obrigatórios" });
  try {
    const row = {
      condominio_id: condominio_id || null,
      sensor_id: sensor_id.trim(),
      nome: nome.trim(),
      local: local || "",
      capacidade_litros: Number(capacidade_litros) || 5000,
      nivel_atual: Math.min(100, Math.max(0, Number(nivel_atual) || 80)),
      volume_litros: Math.round((Number(capacidade_litros) || 5000) * (Number(nivel_atual) || 80) / 100),
    };
    const { data, error } = await supabase.from("sensores").upsert(row, { onConflict: "sensor_id" }).select().single();
    if (error) {
      console.warn("[sensor] upsert warning:", error.message);
      return res.json({ ok: true, sensor: row, warning: error.message });
    }
    return res.json({ ok: true, sensor: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/moradores - Salvar moradores do onboarding
router.post("/moradores", async (req: Request, res: Response) => {
  const { condominio_id, moradores } = req.body as {
    condominio_id?: string;
    moradores: { unidade: string; nome: string; email: string; telefone: string; tipo: string; cpf?: string; nascimento?: string; veiculos?: string }[];
  };
  if (!moradores || !Array.isArray(moradores) || moradores.length === 0)
    return res.status(400).json({ error: "Lista de moradores vazia" });

  try {
    // Try to upsert into moradores table; fallback gracefully if table doesn't exist
    const rows = moradores.map(m => ({
      condominio_id: condominio_id || null,
      unidade: m.unidade,
      nome: m.nome,
      email: m.email || null,
      telefone: m.telefone || null,
      tipo: m.tipo || "proprietario",
      cpf: m.cpf || null,
      nascimento: m.nascimento || null,
      veiculos: m.veiculos ? parseInt(m.veiculos) || 0 : 0,
    }));

    const { error } = await supabase
      .from("moradores")
      .upsert(rows, { onConflict: "condominio_id,unidade" });

    if (error) {
      // Table may not exist yet — return soft success
      console.warn("[moradores] Supabase upsert warning:", error.message);
      return res.json({ ok: true, saved: 0, warning: error.message });
    }

    return res.json({ ok: true, saved: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/onboarding - Configurar condomínio do zero
router.post("/onboarding", async (req: Request, res: Response) => {
  const {
    nome, cidade, unidades, moradores, sindico_nome,
    sensores: sensorList,
    saldo_inicial,
    reset,
  } = req.body as {
    nome: string; cidade?: string; unidades?: number; moradores?: number; sindico_nome?: string;
    sensores?: { sensor_id: string; nome: string; local: string; capacidade_litros: number; nivel_atual: number }[];
    saldo_inicial?: number;
    reset?: boolean;
  };

  if (!nome?.trim()) return res.status(400).json({ error: "Nome do condomínio é obrigatório" });

  try {
    // Optionally wipe existing data for reconfiguration
    if (reset) {
      await Promise.all([
        supabase.from("sindico_historico").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("comunicados").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("financeiro_despesas").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("financeiro_receitas").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("alertas_publicos").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("sensores").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("ordens_servico").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("condominios").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
    }

    // Create condomínio
    const { data: cond, error: condErr } = await supabase
      .from("condominios")
      .insert({ nome: nome.trim(), cidade: cidade || "", unidades: Number(unidades) || 0, moradores: Number(moradores) || 0, sindico_nome: sindico_nome || "" })
      .select().single();
    if (condErr) return res.status(500).json({ error: condErr.message });

    const condId = cond.id;

    // Create sensors if provided
    if (sensorList && sensorList.length > 0) {
      const rows = sensorList.map((s, i) => ({
        condominio_id: condId,
        sensor_id: s.sensor_id || `sensor_${i + 1}`,
        nome: s.nome || `Sensor ${i + 1}`,
        local: s.local || "",
        capacidade_litros: Number(s.capacidade_litros) || 5000,
        nivel_atual: Math.min(100, Math.max(0, Number(s.nivel_atual) || 80)),
        volume_litros: Math.round((Number(s.capacidade_litros) || 5000) * (Number(s.nivel_atual) || 80) / 100),
      }));
      await supabase.from("sensores").insert(rows);
    }

    // Create initial financial entry if saldo_inicial provided
    if (saldo_inicial && Number(saldo_inicial) > 0) {
      await supabase.from("financeiro_receitas").insert({
        condominio_id: condId,
        descricao: "Saldo inicial",
        valor: Number(saldo_inicial),
        categoria: "taxa_condominio",
        status: "pago",
      });
    }

    // Create welcome comunicado
    await supabase.from("comunicados").insert({
      condominio_id: condId,
      titulo: `Bem-vindo ao ${nome}!`,
      corpo: `O sistema ImobCore foi ativado com sucesso para o ${nome}. Síndico: ${sindico_nome || "não informado"}.`,
      gerado_por_ia: false,
    });

    broadcast("onboarding_completo", { condominio_id: condId, nome });

    res.json({ ok: true, condominio: cond });
  } catch (err) {
    console.error("onboarding error:", err);
    res.status(500).json({ error: "Erro no onboarding" });
  }
});

// ── ENCOMENDAS ──────────────────────────────────────────────────────────────
let encomendas: Encomenda[] = [];

router.get("/encomendas", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from("encomendas").select("*").order("created_at", { ascending: false });
    if (!error && data?.length) encomendas = data;
  } catch { /* use in-memory */ }
  res.json({ encomendas });
});

router.post("/encomendas", async (req: Request, res: Response) => {
  const enc: Encomenda = req.body;
  encomendas.unshift(enc);
  try { await supabase.from("encomendas").insert(enc); } catch { /* local only */ }
  broadcast("encomenda_nova", enc);
  res.json({ ok: true, enc });
});

router.put("/encomendas/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  encomendas = encomendas.map(e => e.id === id ? { ...e, ...updates } : e);
  try { await supabase.from("encomendas").update(updates).eq("id", id); } catch { /* local only */ }
  const enc = encomendas.find(e => e.id === id);
  broadcast("encomenda_atualizada", enc);
  res.json({ ok: true, enc });
});

router.delete("/encomendas/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  encomendas = encomendas.filter(e => e.id !== id);
  try { await supabase.from("encomendas").delete().eq("id", id); } catch { /* local only */ }
  broadcast("encomenda_removida", { id });
  res.json({ ok: true });
});

// ─── Reservatórios: proxy URL tester (avoids CORS on client) ──────────────
router.post("/reservatorios/test-url", async (req: Request, res: Response) => {
  const { url, method = "POST", payload } = req.body as { url: string; method: string; payload: object };
  if (!url) { res.status(400).json({ ok: false, error: "url required" }); return; }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "User-Agent": "ImobCore/2.0 Sensor-Test" },
      body: method !== "GET" ? JSON.stringify(payload ?? {}) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    res.json({ ok: r.ok, status: r.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    res.json({ ok: false, status: 0, error: msg });
  }
});

// ─── Reservatórios ────────────────────────────────────────────────────────
let reservatorios: object[] = [];

router.get("/reservatorios", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from("reservatorios").select("*").order("created_at", { ascending: false });
    if (!error && data?.length) reservatorios = data;
  } catch { /* use in-memory */ }
  res.json({ reservatorios });
});

router.post("/reservatorios", async (req: Request, res: Response) => {
  const doc = { ...req.body, created_at: new Date().toISOString() };
  reservatorios.unshift(doc);
  try { await supabase.from("reservatorios").insert(doc); } catch { /* local only */ }
  res.json({ ok: true, doc });
});

router.put("/reservatorios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  reservatorios = (reservatorios as { id: string }[]).map((r) => r.id === id ? { ...r, ...updates } : r);
  try { await supabase.from("reservatorios").update(updates).eq("id", id); } catch { /* local only */ }
  res.json({ ok: true });
});

router.delete("/reservatorios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  reservatorios = (reservatorios as { id: string }[]).filter(r => r.id !== id);
  try { await supabase.from("reservatorios").delete().eq("id", id); } catch { /* local only */ }
  res.json({ ok: true });
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

// GET /api/usuarios?condominio_id=X&perfil=X&status=X
router.get("/usuarios", async (req: Request, res: Response) => {
  try {
    const { condominio_id, perfil, status } = req.query as Record<string, string | undefined>;
    let q = supabase.from("usuarios").select("id,condominio_id,nome,email,telefone,perfil,unidade,status,permissoes_customizadas,ultimo_acesso,created_at").order("nome", { ascending: true });
    if (condominio_id) q = q.eq("condominio_id", condominio_id);
    if (perfil && perfil !== "todos") q = q.eq("perfil", perfil);
    if (status && status !== "todos") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("GET /usuarios error:", err);
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

// POST /api/usuarios
router.post("/usuarios", async (req: Request, res: Response) => {
  try {
    const { condominio_id, nome, email, telefone, perfil, unidade, status, permissoes_customizadas } = req.body as {
      condominio_id: string; nome: string; email: string; telefone?: string;
      perfil: "gestor" | "sindico" | "morador" | "zelador";
      unidade?: string; status?: string; permissoes_customizadas?: Record<string, unknown>;
    };
    if (!condominio_id || !nome || !email || !perfil) {
      res.status(400).json({ error: "condominio_id, nome, email e perfil são obrigatórios" });
      return;
    }
    const { data, error } = await supabase.from("usuarios").insert({
      condominio_id, nome, email, telefone: telefone || null,
      perfil, unidade: unidade || null,
      status: status || "ativo",
      permissoes_customizadas: permissoes_customizadas || null,
      senha_hash: null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("POST /usuarios error:", err);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// PUT /api/usuarios/:id
router.put("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, email, telefone, perfil, unidade, status, permissoes_customizadas } = req.body as {
      nome?: string; email?: string; telefone?: string;
      perfil?: "gestor" | "sindico" | "morador" | "zelador";
      unidade?: string; status?: string; permissoes_customizadas?: Record<string, unknown>;
    };
    const updates: Record<string, unknown> = {};
    if (nome !== undefined) updates.nome = nome;
    if (email !== undefined) updates.email = email;
    if (telefone !== undefined) updates.telefone = telefone;
    if (perfil !== undefined) updates.perfil = perfil;
    if (unidade !== undefined) updates.unidade = unidade;
    if (status !== undefined) updates.status = status;
    if (permissoes_customizadas !== undefined) updates.permissoes_customizadas = permissoes_customizadas;
    const { data, error } = await supabase.from("usuarios").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("PUT /usuarios/:id error:", err);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

// DELETE /api/usuarios/:id — soft delete (status = inativo)
router.delete("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("usuarios").update({ status: "inativo" }).eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /usuarios/:id error:", err);
    res.status(500).json({ error: "Erro ao desativar usuário" });
  }
});

export default router;
export { broadcast };
