import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const useDirectKey = !!process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({
  apiKey: useDirectKey
    ? process.env.ANTHROPIC_API_KEY!
    : (process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""),
  ...(useDirectKey ? {} : { baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL }),
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
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [
      { data: condominios },
      { data: os },
      { data: sensores },
      { data: alertas },
      { data: receitas },
      { data: despesas },
      { data: comunicados },
    ] = await Promise.all([
      supabase.from("condominios").select("*"),
      supabase.from("ordens_servico").select("*").order("created_at", { ascending: false }),
      supabase.from("sensores").select("*"),
      supabase.from("alertas_publicos").select("*").eq("ativo", true),
      supabase.from("financeiro_receitas").select("*"),
      supabase.from("financeiro_despesas").select("*"),
      supabase.from("comunicados").select("*").order("created_at", { ascending: false }),
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

// GET /api/os - Listar OSs
router.get("/os", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/os - Criar OS
router.post("/os", async (req: Request, res: Response) => {
  try {
    const { condominio_id, titulo, descricao, categoria, prioridade, unidade } = req.body as {
      condominio_id?: string;
      titulo: string;
      descricao?: string;
      categoria: string;
      prioridade: string;
      unidade?: string;
    };

    const { data: cond } = await supabase.from("condominios").select("id").limit(1).single();

    const { data, error } = await supabase
      .from("ordens_servico")
      .insert({
        condominio_id: condominio_id || cond?.id,
        titulo,
        descricao,
        categoria,
        prioridade: prioridade || "media",
        unidade,
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

export default router;
export { broadcast };
