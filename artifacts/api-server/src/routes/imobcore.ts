import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  type Lancamento,
  calcularIndicadores,
  calcularFluxoMensal,
} from "../lib/financeiro.service.js";

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
    const {
      message,
      history = [],
      condominio_id,
      tipo,
      saldo: saldoCtx,
      score: scoreCtx,
      inadimplencia: inadCtx,
    } = req.body as {
      message?: string;
      history?: { role: string; content: string }[];
      condominio_id?: string;
      tipo?: string;
      saldo?: number;
      score?: number;
      inadimplencia?: number;
    };

    const condIdCtx = condominio_id || "";

    const [
      { data: cond },
      { data: osAbertas },
      { data: sensores },
      { data: alertas },
      { data: receitas },
      { data: despesas },
      { data: equipamentos },
      { data: planos },
    ] = await Promise.all([
      supabase.from("condominios").select("*").limit(1).single(),
      supabase.from("ordens_servico").select("*").eq("status", "aberta").order("created_at", { ascending: false }),
      supabase.from("sensores").select("*"),
      supabase.from("alertas_publicos").select("*").eq("ativo", true),
      supabase.from("financeiro_receitas").select("*"),
      supabase.from("financeiro_despesas").select("*"),
      condIdCtx
        ? supabase.from("equipamentos").select("*").eq("condominio_id", condIdCtx).order("created_at", { ascending: true })
        : supabase.from("equipamentos").select("*").order("created_at", { ascending: true }),
      condIdCtx
        ? supabase.from("planos_manutencao").select("*").eq("condominio_id", condIdCtx).order("created_at", { ascending: true })
        : supabase.from("planos_manutencao").select("*").order("created_at", { ascending: true }),
    ]);

    const totalReceitas = (receitas || []).reduce((s: number, r: { valor: number }) => s + Number(r.valor), 0);
    const totalDespesas = (despesas || []).reduce((s: number, d: { valor: number }) => s + Number(d.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    // ══════════════════════════════════════════════════════════════════════════
    // MODO: tipo === "financeiro"  — análise financeira completa via Síndico IA
    // Chamada: POST /api/sindico/chat { tipo:"financeiro", saldo, score, inadimplencia, condominio_id }
    // ══════════════════════════════════════════════════════════════════════════
    if (tipo === "financeiro") {
      // Busca dados reais de lancamentos para enriquecer o contexto
      const { all: lancs } = await fetchLancamentosDB(condominio_id);
      const ind = calcularIndicadores(lancs);
      const { historico } = calcularFluxoMensal(lancs, 6, 0);

      // Preferência: dados passados pelo cliente (calculados no frontend) ou dados do DB
      const saldoFinal = saldoCtx ?? ind.saldo;
      const scoreFinal = scoreCtx ?? ind.score;
      const inadFinal  = inadCtx  ?? ind.txInad;

      // Resumo por categoria de despesa
      const despCat: Record<string, number> = {};
      lancs.filter(l => l.tipo === "despesa").forEach(l => {
        const cat = l.categoria || "outros";
        despCat[cat] = (despCat[cat] || 0) + Number(l.valor);
      });
      const topDespesas = Object.entries(despCat)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([c, v]) => `  • ${c}: R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)
        .join("\n") || "  • Sem dados de despesas cadastrados";

      // Receitas em aberto (inadimplentes)
      const inadimplentes = lancs.filter(l => l.tipo === "receita" && l.status === "atrasado");

      // Fluxo histórico textual
      const fluxoTxt = historico
        .map(m => `  ${m.mes}: Receitas R$${m.Receitas.toLocaleString("pt-BR")} | Despesas R$${m.Despesas.toLocaleString("pt-BR")} | Resultado R$${m.Resultado.toLocaleString("pt-BR")}`)
        .join("\n") || "  Sem histórico de lançamentos";

      const cond = (await supabase.from("condominios").select("nome,cidade,sindico_nome,unidades").limit(1).single()).data;

      const riscoBadge = scoreFinal >= 80 ? "🟢 BAIXO" : scoreFinal >= 60 ? "🟡 MODERADO" : scoreFinal >= 40 ? "🔴 ALTO" : "⛔ CRÍTICO";

      const userMsg = message || "Analise a situação financeira do condomínio e forneça um relatório executivo completo com recomendações prioritárias.";

      const finSystemPrompt = `Você é o Síndico Virtual IA do ${cond?.nome || "condomínio"} em ${cond?.cidade || "Florianópolis"} — especialista em gestão financeira condominial.

MÓDULO FINANCEIRO INTELIGENTE — DADOS ATUAIS (${new Date().toLocaleDateString("pt-BR")}):

📊 INDICADORES PRINCIPAIS:
  • Score de Saúde Financeira: ${scoreFinal}/100 — Risco ${riscoBadge}
  • Saldo em Caixa: R$ ${saldoFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${saldoFinal >= 0 ? "✅" : "⚠️ NEGATIVO"}
  • Receitas Totais: R$ ${ind.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
  • Despesas Totais: R$ ${ind.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
  • Taxa de Inadimplência: ${inadFinal}% (R$ ${ind.vlrInad.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em aberto, ${inadimplentes.length} lançamentos)
  • Total de Lançamentos: ${lancs.length} (${lancs.filter(l=>l.tipo==="receita").length} receitas · ${lancs.filter(l=>l.tipo==="despesa").length} despesas)

💸 TOP CATEGORIAS DE DESPESA:
${topDespesas}

📈 FLUXO DE CAIXA — ÚLTIMOS 6 MESES:
${fluxoTxt}

🏢 CONTEXTO DO CONDOMÍNIO:
  • Unidades: ${cond?.unidades || "—"} | Síndico: ${cond?.sindico_nome || "—"}

INSTRUÇÕES:
- Seja o síndico financeiro ideal: preciso, direto, baseado nos dados reais acima
- Estruture com seções claras (ANÁLISE, RISCOS, RECOMENDAÇÕES quando pertinente)
- Priorize ações de maior impacto financeiro
- Use linguagem profissional com emojis moderados
- Máximo 600 palavras`;

      const aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: finSystemPrompt,
        messages: [
          ...(history || []).slice(-6).map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
          { role: "user" as const, content: userMsg },
        ],
      });

      const reply = aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";
      const tokens = { input: aiResponse.usage.input_tokens, output: aiResponse.usage.output_tokens };

      // Salva no histórico do Síndico (best-effort)
      try {
        await supabase.from("sindico_historico").insert({
          condominio_id: condominio_id || cond?.id,
          sessao_id: `fin_${Date.now()}`,
          pergunta: userMsg,
          resposta: reply,
          tokens_input: tokens.input,
          tokens_output: tokens.output,
        });
      } catch { /* ignore */ }

      broadcast("sindico_chat", { tipo: "financeiro", reply, timestamp: new Date().toISOString() });
      return res.json({ reply, tokens, score: scoreFinal, saldo: saldoFinal, inadimplencia: inadFinal, risco: riscoBadge });
    }
    // ══════════════════════════════════════════════════════════════════════════

    const osUrgentes = (osAbertas || []).filter((o: { prioridade: string }) => o.prioridade === "urgente");

    // ── Resumo de manutenção ────────────────────────────────────────────────────
    type EquipRow = { nome: string; categoria: string; status: string; local: string; consumo_eletrico_kwh: number; horas_uso_dia: number; custo_manutencao: number; prox_manutencao: string | null; vida_util_meses: number; instalado_ha: number; quantidade: number; descricao?: string };
    type PlanoRow = { nome: string; codigo: string; tipo: string; periodicidade: string; custo_total: number; tempo_estimado_min: number; proxima_execucao: string | null; instrucoes?: string; equipamentos_itens: { equipNome: string; custo_previsto: number }[]; status: string };

    const equips = (equipamentos || []) as EquipRow[];
    const planosList = (planos || []) as PlanoRow[];

    const equipPorStatus = equips.reduce((acc: Record<string, number>, e) => { acc[e.status] = (acc[e.status] || 0) + (e.quantidade || 1); return acc; }, {});
    const equipComProblema = equips.filter(e => e.status === "manutencao" || e.status === "atencao");
    const custoManutencaoTotal = equips.reduce((s, e) => s + (Number(e.custo_manutencao) || 0) * (Number(e.quantidade) || 1), 0);
    const consumoTotalKwh = equips.reduce((s, e) => s + (Number(e.consumo_eletrico_kwh) || 0) * (Number(e.horas_uso_dia) || 0) * (Number(e.quantidade) || 1), 0);
    const orcamentoPlanos = planosList.reduce((s, p) => s + (Number(p.custo_total) || 0), 0);

    // Equipamentos com manutenção próxima (próximos 30 dias)
    const hoje = new Date();
    const em30dias = new Date(hoje); em30dias.setDate(hoje.getDate() + 30);
    const equipManutProxima = equips.filter(e => {
      if (!e.prox_manutencao) return false;
      const d = new Date(e.prox_manutencao);
      return d >= hoje && d <= em30dias;
    });

    // Planos próximos (próximos 30 dias)
    const planosProximos = planosList.filter(p => {
      if (!p.proxima_execucao) return false;
      const d = new Date(p.proxima_execucao);
      return d >= hoje && d <= em30dias;
    });

    const manutencaoSection = `
🔧 MÓDULO MANUTENÇÃO — EQUIPAMENTOS (${equips.length} cadastrados, ${equips.reduce((s,e)=>s+(Number(e.quantidade)||1),0)} unidades totais):
Status: ${Object.entries(equipPorStatus).map(([s,n])=>`${s}: ${n}`).join(" | ") || "—"}
Custo manutenção total (ciclo): R$ ${custoManutencaoTotal.toLocaleString("pt-BR",{minimumFractionDigits:2})}
Consumo elétrico estimado: ${consumoTotalKwh.toFixed(1)} kWh/dia

${equipComProblema.length > 0 ? `⚠️ EQUIPAMENTOS COM PROBLEMA (${equipComProblema.length}):
${equipComProblema.map(e=>`- ${e.nome} (${e.categoria} | ${e.local}): STATUS ${e.status.toUpperCase()}${e.descricao?` — ${e.descricao.slice(0,80)}`:""}${e.prox_manutencao?` | Próx. manut: ${e.prox_manutencao}`:""}`).join("\n")}` : "✅ Todos os equipamentos operacionais"}

${equipManutProxima.length > 0 ? `📅 MANUTENÇÕES NOS PRÓXIMOS 30 DIAS (${equipManutProxima.length}):
${equipManutProxima.map(e=>`- ${e.nome} | ${e.prox_manutencao} | R$ ${Number(e.custo_manutencao).toLocaleString("pt-BR",{minimumFractionDigits:2})}`).join("\n")}` : ""}

📅 PLANOS DE MANUTENÇÃO (${planosList.length} planos, orçamento total R$ ${orcamentoPlanos.toLocaleString("pt-BR",{minimumFractionDigits:2})}):
${planosList.slice(0, 8).map(p=>`- [${p.codigo||"—"}] ${p.nome} | Tipo: ${p.tipo} | ${p.periodicidade} | R$ ${Number(p.custo_total).toLocaleString("pt-BR",{minimumFractionDigits:2})} | Próxima: ${p.proxima_execucao||"não definida"} | ${p.equipamentos_itens?.length||0} equips vinculados`).join("\n") || "Nenhum plano cadastrado"}
${planosProximos.length > 0 ? `\n⚡ PLANOS PARA EXECUTAR NOS PRÓXIMOS 30 DIAS:\n${planosProximos.map(p=>`- ${p.nome} (${p.tipo}) em ${p.proxima_execucao} | ${p.tempo_estimado_min}min estimados`).join("\n")}` : ""}`;

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
${manutencaoSection}

Você tem acesso completo aos dados de manutenção acima. Use-os para:
- Identificar equipamentos críticos e recomendar ações
- Calcular impacto financeiro de manutenções pendentes
- Sugerir otimização do cronograma de planos preventivos
- Alertar sobre equipamentos com vida útil próxima ao fim
- Estimar consumo energético e oportunidades de economia

Responda de forma profissional, objetiva e útil. Use emojis moderadamente. Máximo 500 palavras por resposta.`;

    if (!message) return res.status(400).json({ error: "Campo 'message' obrigatório para o chat geral do Síndico" });

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
    const { condominio_id, titulo, descricao, categoria, prioridade, unidade, responsavel, equipamento_ids } = req.body as {
      condominio_id?: string;
      titulo: string;
      descricao?: string;
      categoria: string;
      prioridade: string;
      unidade?: string;
      responsavel?: string;
      equipamento_ids?: string[];
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

    const baseInsert: Record<string, unknown> = {
      condominio_id: condominio_id || cond?.id,
      numero: nextNumero,
      titulo,
      descricao,
      categoria,
      prioridade: prioridade || "media",
      unidade,
      responsavel,
      status: "aberta",
      equipamento_ids: equipamento_ids ?? [],
    };

    let { data, error } = await supabase.from("ordens_servico").insert(baseInsert).select().single();
    // Retry sem equipamento_ids se coluna não existir
    if (error && error.message?.includes("equipamento_ids")) {
      const { equipamento_ids: _drop, ...fallback } = baseInsert;
      const r2 = await supabase.from("ordens_servico").insert(fallback).select().single();
      data = r2.data; error = r2.error;
    }

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

    const colErr = (e: { message?: string; code?: string } | null) =>
      !!(e && (e.code === "PGRST204" || e.message?.includes("schema cache") || e.message?.includes("Could not find")));

    let { data, error } = await supabase.from("ordens_servico").update(updates).eq("id", id).select().single();
    // Retry 1: sem equipamento_ids + updated_at
    if (colErr(error)) {
      const { equipamento_ids: _e, ...fallback } = updates as Record<string, unknown> & { equipamento_ids?: unknown };
      delete fallback.updated_at;
      const r2 = await supabase.from("ordens_servico").update(fallback).eq("id", id).select().single();
      data = r2.data; error = r2.error;
    }
    // Retry 2: apenas campos core garantidos
    if (colErr(error)) {
      const os_core = ["titulo","descricao","categoria","prioridade","unidade","status","responsavel","numero"];
      const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => os_core.includes(k)));
      const r3 = await supabase.from("ordens_servico").update(safe).eq("id", id).select().single();
      data = r3.data; error = r3.error;
    }

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

// GET /api/financeiro - Dados financeiros (legado — mantido para dashboard)
router.get("/financeiro", async (_req: Request, res: Response) => {
  const [{ data: receitas }, { data: despesas }] = await Promise.all([
    supabase.from("financeiro_receitas").select("*").order("created_at", { ascending: false }),
    supabase.from("financeiro_despesas").select("*").order("created_at", { ascending: false }),
  ]);
  res.json({ receitas: receitas || [], despesas: despesas || [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO INTELIGENTE — CRUD + Indicadores + IA
// ─────────────────────────────────────────────────────────────────────────────

// Helper: busca lançamentos do Supabase e calcula indicadores via financeiro.service
async function fetchLancamentosDB(condId?: string): Promise<{ all: Lancamento[]; missing: boolean }> {
  let q = supabase.from("lancamentos_financeiros").select("*").order("data", { ascending: false });
  if (condId) q = q.eq("condominio_id", condId);
  const { data, error } = await q;
  if (error && (error.message?.includes("does not exist") || error.message?.includes("schema cache"))) {
    return { all: [], missing: true };
  }
  return { all: (data || []) as Lancamento[], missing: false };
}

async function calcIndicadores(condId: string | undefined) {
  const { all, missing } = await fetchLancamentosDB(condId);
  if (missing) return { totalRec: 0, totalDesp: 0, saldo: 0, txInad: 0, vlrInad: 0, score: 100, risco: "baixo", all: [] };
  const ind = calcularIndicadores(all);
  return { totalRec: ind.receitas, totalDesp: ind.despesas, saldo: ind.saldo, txInad: ind.txInad, vlrInad: ind.vlrInad, score: ind.score, risco: ind.risco, all };
}

// GET /api/financeiro/lancamentos
router.get("/financeiro/lancamentos", async (req: Request, res: Response) => {
  try {
    const { condominio_id, tipo, mes, categoria } = req.query as Record<string, string>;
    let q = supabase.from("lancamentos_financeiros").select("*").order("data", { ascending: false });
    if (condominio_id) q = q.eq("condominio_id", condominio_id);
    if (tipo && tipo !== "") q = q.eq("tipo", tipo);
    if (categoria && categoria !== "") q = q.eq("categoria", categoria);
    if (mes && mes !== "") { // mes = "2026-03"
      q = q.gte("data", `${mes}-01`).lte("data", `${mes}-31`);
    }
    const { data, error } = await q;
    if (error) {
      // Graceful: table may not exist yet (migration pending)
      if (error.message?.includes("does not exist") || error.message?.includes("schema cache")) return res.json([]);
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// POST /api/financeiro/lancamentos
router.post("/financeiro/lancamentos", async (req: Request, res: Response) => {
  try {
    const { condominio_id, tipo, categoria, subcategoria, descricao, valor, data, competencia, status } = req.body as {
      condominio_id?: string; tipo: string; categoria: string; subcategoria?: string;
      descricao: string; valor: number; data: string; competencia?: string; status?: string;
    };
    if (!tipo || !descricao || !valor || !data) return res.status(400).json({ error: "Campos obrigatórios: tipo, descricao, valor, data" });
    const payload: Record<string, unknown> = { tipo, categoria, subcategoria, descricao, valor: Number(valor), data, status: status || "previsto" };
    if (condominio_id) payload.condominio_id = condominio_id;
    if (competencia) payload.competencia = competencia;
    const { data: row, error } = await supabase.from("lancamentos_financeiros").insert(payload).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(row);
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// PUT /api/financeiro/lancamentos/:id
router.put("/financeiro/lancamentos/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body as Partial<{ tipo: string; categoria: string; subcategoria: string; descricao: string; valor: number; data: string; competencia: string; status: string }>;
    if (fields.valor) fields.valor = Number(fields.valor);
    const { data: row, error } = await supabase.from("lancamentos_financeiros").update(fields).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(row);
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/financeiro/lancamentos/:id
router.delete("/financeiro/lancamentos/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("lancamentos_financeiros").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// GET /api/financeiro/resumo
router.get("/financeiro/resumo", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };
    const ind = await calcIndicadores(condominio_id);
    res.json({ totalRec: ind.totalRec, totalDesp: ind.totalDesp, saldo: ind.saldo, txInad: ind.txInad, vlrInad: ind.vlrInad, score: ind.score, risco: ind.risco });
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// GET /api/financeiro/fluxo  — últimos 6 meses (via financeiro.service)
router.get("/financeiro/fluxo", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };
    const { all, missing } = await fetchLancamentosDB(condominio_id);
    if (missing) return res.json({ historico: [] });
    const { historico } = calcularFluxoMensal(all, 6, 0);
    res.json({ historico });
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// GET /api/financeiro/previsao  — projeção 3 meses (via financeiro.service / preverFluxo)
router.get("/financeiro/previsao", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };
    const { all, missing } = await fetchLancamentosDB(condominio_id);
    if (missing) return res.json({ avgRec: 0, avgDesp: 0, projecao: [] });
    const { projecao, avgRec, avgDesp } = calcularFluxoMensal(all, 3, 3);
    res.json({ avgRec, avgDesp, projecao });
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// GET /api/financeiro/orcamento
router.get("/financeiro/orcamento", async (req: Request, res: Response) => {
  try {
    const { condominio_id, ano } = req.query as { condominio_id?: string; ano?: string };
    let q = supabase.from("orcamento_anual").select("*").order("mes", { ascending: true });
    if (condominio_id) q = q.eq("condominio_id", condominio_id);
    if (ano) q = q.eq("ano", Number(ano));
    const { data, error } = await q;
    if (error) {
      if (error.message?.includes("does not exist") || error.message?.includes("schema cache")) return res.json([]);
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// POST /api/financeiro/orcamento
router.post("/financeiro/orcamento", async (req: Request, res: Response) => {
  try {
    const { condominio_id, categoria, mes, ano, valor_previsto } = req.body as {
      condominio_id?: string; categoria: string; mes: number; ano: number; valor_previsto: number;
    };
    const payload: Record<string, unknown> = { categoria, mes, ano: ano || new Date().getFullYear(), valor_previsto: Number(valor_previsto) };
    if (condominio_id) payload.condominio_id = condominio_id;
    const { data: existing } = await supabase.from("orcamento_anual").select("id")
      .eq("categoria", categoria).eq("mes", mes).eq("ano", payload.ano as number).limit(1);
    let row, error;
    if (existing && existing.length > 0) {
      ({ data: row, error } = await supabase.from("orcamento_anual").update({ valor_previsto: Number(valor_previsto) }).eq("id", existing[0].id).select().single());
    } else {
      ({ data: row, error } = await supabase.from("orcamento_anual").insert(payload).select().single());
    }
    if (error) return res.status(500).json({ error: error.message });
    res.json(row);
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
});

// POST /api/financeiro/insights  — chama Síndico Virtual IA
router.post("/financeiro/insights", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.body as { condominio_id?: string };
    const ind = await calcIndicadores(condominio_id);

    // Compila categorias de despesas
    const despCat: Record<string, number> = {};
    ind.all.filter(l => l.tipo === "despesa").forEach((l: { tipo: string; valor: number; data: string; categoria?: string }) => {
      const cat = (l as unknown as { categoria?: string }).categoria || "outros";
      despCat[cat] = (despCat[cat] || 0) + Number(l.valor);
    });
    const topCats = Object.entries(despCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${c}: R$${v.toFixed(2)}`).join(", ");

    const prompt = `Você é o Síndico Virtual do ImobCore. Analise os indicadores financeiros do condomínio e gere um relatório completo.

DADOS FINANCEIROS:
- Score de saúde financeira: ${ind.score}/100 (${ind.risco})
- Saldo em caixa: R$ ${ind.saldo.toFixed(2)}
- Total receitas: R$ ${ind.totalRec.toFixed(2)}
- Total despesas: R$ ${ind.totalDesp.toFixed(2)}
- Resultado: R$ ${(ind.totalRec - ind.totalDesp).toFixed(2)}
- Taxa de inadimplência: ${ind.txInad}% (R$ ${ind.vlrInad.toFixed(2)} em aberto)
- Principais categorias de despesa: ${topCats || "sem dados"}

Responda com:
1. ANÁLISE: 2-3 frases sobre a situação financeira geral
2. RISCOS: principais riscos identificados (bullet points)
3. RECOMENDAÇÕES: ações concretas para melhorar (bullet points)

Seja objetivo, direto e use linguagem de síndico profissional.`;

    const anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";

    // Parse sections
    const analise = text.match(/ANÁLISE[:\s]+([\s\S]+?)(?=RISCOS|$)/i)?.[1]?.trim() || text.slice(0, 200);
    const riscos = text.match(/RISCOS[:\s]+([\s\S]+?)(?=RECOMENDAÇÕES|$)/i)?.[1]?.trim() || "";
    const recomendacoes = text.match(/RECOMENDAÇÕES[:\s]+([\s\S]+)/i)?.[1]?.trim() || "";

    res.json({
      score: ind.score, inadimplencia: ind.txInad, saldo: ind.saldo, risco: ind.risco,
      analise, riscos, recomendacoes, gerado_em: new Date().toISOString(),
    });
  } catch (e: unknown) { res.status(500).json({ error: String(e) }); }
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

// DELETE /api/condominios/:id — excluir condomínio e dados relacionados
router.delete("/condominios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID do condomínio é obrigatório" });

  try {
    // Remove dados relacionados em cascata (melhor esforço)
    const tables = [
      "score_condominio", "insights_ia",
      "sensores_agua", "leituras_agua",
      "comunicados", "ordens_servico",
      "financeiro", "moradores", "usuarios_condominio",
    ];
    for (const table of tables) {
      try { await supabase.from(table).delete().eq("condominio_id", id); } catch { /* tabela pode não existir */ }
    }

    const { error } = await supabase.from("condominios").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
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

// PUT /api/sensores/:sensor_id — editar sensor existente
router.put("/sensores/:sensor_id", async (req: Request, res: Response) => {
  const { sensor_id } = req.params;
  const { nome, local, capacidade_litros, nivel_atual } = req.body as {
    nome?: string; local?: string; capacidade_litros?: number; nivel_atual?: number;
  };
  const nivel = Math.min(100, Math.max(0, Number(nivel_atual) || 0));
  const cap = Number(capacidade_litros) || 5000;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (nome !== undefined) updates.nome = nome.trim();
  if (local !== undefined) updates.local = local;
  if (capacidade_litros !== undefined) updates.capacidade_litros = cap;
  if (nivel_atual !== undefined) {
    updates.nivel_atual = nivel;
    updates.volume_litros = Math.round(nivel / 100 * cap);
  }
  const { error } = await supabase.from("sensores").update(updates).eq("sensor_id", sensor_id);
  if (error) {
    console.error("[sensores PUT] error:", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.json({ ok: true });
});

// DELETE /api/sensores/:sensor_id — excluir sensor
router.delete("/sensores/:sensor_id", async (req: Request, res: Response) => {
  const { sensor_id } = req.params;
  const { error } = await supabase.from("sensores").delete().eq("sensor_id", sensor_id);
  if (error) {
    console.error("[sensores DELETE] error:", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.json({ ok: true });
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
    condominio_id: existingId,
    nome, cidade, unidades, moradores, sindico_nome, sindico_email, sindico_tel,
    taxa_mensal, vencimento_dia, bairro, ia_persona, ia_auto_com,
    sensores: sensorList,
    saldo_inicial,
    reset,
  } = req.body as {
    condominio_id?: string;
    nome: string; cidade?: string; unidades?: number; moradores?: number;
    sindico_nome?: string; sindico_email?: string; sindico_tel?: string;
    taxa_mensal?: number; vencimento_dia?: number; bairro?: string;
    ia_persona?: string; ia_auto_com?: boolean;
    sensores?: { sensor_id: string; nome: string; local: string; capacidade_litros: number; nivel_atual: number }[];
    saldo_inicial?: number;
    reset?: boolean;
  };

  if (!nome?.trim()) return res.status(400).json({ error: "Nome do condomínio é obrigatório" });

  try {
    // Optionally wipe existing data for reconfiguration (scoped to the condo if possible)
    if (reset) {
      if (existingId) {
        await Promise.all([
          supabase.from("sindico_historico").delete().eq("condominio_id", existingId),
          supabase.from("comunicados").delete().eq("condominio_id", existingId),
          supabase.from("financeiro_despesas").delete().eq("condominio_id", existingId),
          supabase.from("financeiro_receitas").delete().eq("condominio_id", existingId),
          supabase.from("sensores").delete().eq("condominio_id", existingId),
          supabase.from("ordens_servico").delete().eq("condominio_id", existingId),
        ]);
      } else {
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
    }

    let condId: string;
    let condData: Record<string, unknown>;

    // Extra fields to persist (best-effort — columns may not exist yet)
    const extraFields: Record<string, unknown> = {};
    if (taxa_mensal !== undefined) extraFields["taxa_mensal"] = Number(taxa_mensal);
    if (vencimento_dia !== undefined) extraFields["vencimento_dia"] = Number(vencimento_dia);
    if (bairro) extraFields["bairro"] = bairro;
    if (ia_persona) extraFields["ia_persona"] = ia_persona;
    if (ia_auto_com !== undefined) extraFields["ia_auto_com"] = ia_auto_com;
    if (sindico_email) extraFields["sindico_email"] = sindico_email;
    if (sindico_tel) extraFields["sindico_tel"] = sindico_tel;

    if (existingId && !reset) {
      // Condo already created in wizard step 1 — just update extra fields
      const updatePayload: Record<string, unknown> = {
        nome: nome.trim(), cidade: cidade || "",
        unidades: Number(unidades) || 0, moradores: Number(moradores) || 0,
        sindico_nome: sindico_nome || "",
        ...extraFields,
      };
      const { data: updated, error: updErr } = await supabase
        .from("condominios").update(updatePayload).eq("id", existingId).select().single();
      if (updErr) {
        // Fallback: update only safe base columns if schema columns missing
        const { data: fallback, error: fbErr } = await supabase
          .from("condominios")
          .update({ nome: nome.trim(), cidade: cidade || "", unidades: Number(unidades) || 0, moradores: Number(moradores) || 0, sindico_nome: sindico_nome || "" })
          .eq("id", existingId).select().single();
        if (fbErr) return res.status(500).json({ error: fbErr.message });
        condData = fallback as Record<string, unknown>;
      } else {
        condData = updated as Record<string, unknown>;
      }
      condId = existingId;
    } else {
      // Create brand new condomínio
      const insertPayload: Record<string, unknown> = {
        nome: nome.trim(), cidade: cidade || "",
        unidades: Number(unidades) || 0, moradores: Number(moradores) || 0,
        sindico_nome: sindico_nome || "",
        ...extraFields,
      };
      const { data: cond, error: condErr } = await supabase
        .from("condominios").insert(insertPayload).select().single();
      if (condErr) {
        // Fallback without extra columns
        const { data: cond2, error: err2 } = await supabase
          .from("condominios")
          .insert({ nome: nome.trim(), cidade: cidade || "", unidades: Number(unidades) || 0, moradores: Number(moradores) || 0, sindico_nome: sindico_nome || "" })
          .select().single();
        if (err2) return res.status(500).json({ error: err2.message });
        condData = cond2 as Record<string, unknown>;
      } else {
        condData = cond as Record<string, unknown>;
      }
      condId = condData["id"] as string;
    }

    // Create sensors if provided and not yet saved by wizard steps
    if (sensorList && sensorList.length > 0) {
      // Only insert sensors that don't already exist for this condo
      const { data: existingSensors } = await supabase.from("sensores").select("sensor_id").eq("condominio_id", condId);
      const existingIds = new Set((existingSensors || []).map((s: { sensor_id: string }) => s.sensor_id));
      const newSensors = sensorList.filter(s => !existingIds.has(s.sensor_id));
      if (newSensors.length > 0) {
        const rows = newSensors.map((s, i) => ({
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
    }

    // Create initial financial entry if saldo_inicial provided (only if none exists yet)
    if (saldo_inicial && Number(saldo_inicial) > 0) {
      const { count } = await supabase.from("financeiro_receitas")
        .select("id", { count: "exact", head: true })
        .eq("condominio_id", condId).eq("descricao", "Saldo inicial");
      if ((count ?? 0) === 0) {
        await supabase.from("financeiro_receitas").insert({
          condominio_id: condId,
          descricao: "Saldo inicial",
          valor: Number(saldo_inicial),
          categoria: "taxa_condominio",
          status: "pago",
        });
      }
    }

    // Create welcome comunicado (only if none exists yet for this condo)
    const { count: comCount } = await supabase.from("comunicados")
      .select("id", { count: "exact", head: true }).eq("condominio_id", condId);
    if ((comCount ?? 0) === 0) {
      await supabase.from("comunicados").insert({
        condominio_id: condId,
        titulo: `Bem-vindo ao ${nome}!`,
        corpo: `O sistema ImobCore foi ativado com sucesso para o ${nome}. Síndico: ${sindico_nome || "não informado"}.`,
        gerado_por_ia: false,
      });
    }

    broadcast("onboarding_completo", { condominio_id: condId, nome });

    res.json({ ok: true, condominio: condData });
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

// ─── Webhook receptor de sensores IoT (Cloudflare Worker → ImobCore) ─────────
// Aceita tanto /api/webhook quanto /api/webhook/sensor (alias para compatibilidade)
async function handleSensorWebhook(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as {
      sensor_id?: string; nivel?: number; distancia_cm?: number;
      temperatura?: number; pressao?: number; timestamp?: string;
      mac_address?: string; [key: string]: unknown;
    };
    if (!payload || !payload.sensor_id) {
      res.status(400).json({ ok: false, error: "sensor_id required" });
      return;
    }
    const doc = { ...payload, received_at: new Date().toISOString() };
    try {
      await supabase.from("sensor_leituras").insert(doc);
    } catch { /* table may not exist yet — continue */ }
    // Atualiza nivel_atual e condominio_id no sensor (lookup via reservatorios)
    try {
      const { data: resRow } = await supabase
        .from("reservatorios")
        .select("condominio_id, capacidade_litros")
        .eq("sensor_id", payload.sensor_id)
        .single();
      if (resRow) {
        const nivel = Math.min(100, Math.max(0, Number(payload.nivel) || 0));
        const capacidade = Number(resRow.capacidade_litros) || 0;
        await supabase.from("sensores").update({
          nivel_atual: nivel,
          volume_litros: Math.round(nivel / 100 * capacidade),
          condominio_id: resRow.condominio_id,
        }).eq("sensor_id", payload.sensor_id);
      }
    } catch { /* silently ignore — sensors table update is non-critical */ }
    broadcast("sensor_leitura", doc);
    console.log(`[webhook] sensor ${payload.sensor_id} recebido — nivel: ${payload.nivel ?? "—"}`);
    res.json({ ok: true, received_at: doc.received_at });
  } catch (err) {
    console.error("webhook/sensor error:", err);
    res.status(500).json({ ok: false, error: "internal error" });
  }
}

router.post("/webhook/sensor", handleSensorWebhook);
// Alias: /api/webhook (sem /sensor) — compatível com URL salva nos reservatórios
router.post("/webhook", handleSensorWebhook);

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
// Cache in-memory por condominio_id (chave "_all" para sem filtro)
const reservatoriosCache: Record<string, object[]> = {};

router.get("/reservatorios", async (req: Request, res: Response) => {
  const condId = (req.query.condominio_id as string | undefined) || null;
  const cacheKey = condId || "_all";
  try {
    const base = supabase.from("reservatorios").select("*").order("created_at", { ascending: false });
    const { data, error } = condId ? await base.eq("condominio_id", condId) : await base;
    if (!error && data) {
      reservatoriosCache[cacheKey] = data;
      return res.json({ reservatorios: data });
    }
  } catch { /* use in-memory cache */ }
  res.json({ reservatorios: reservatoriosCache[cacheKey] || [] });
});

// Retorna o último nível conhecido por sensor_id (para pre-popular gauges no frontend)
router.get("/reservatorios/niveis", async (_req: Request, res: Response) => {
  const niveis: Record<string, { nivel: number; volume: number; ts: string }> = {};
  // 1. Tenta sensor_leituras (mais recente — pode não existir)
  try {
    const { data: leituras, error: lErr } = await supabase
      .from("sensor_leituras")
      .select("sensor_id, nivel, volume_litros, received_at")
      .order("received_at", { ascending: false })
      .limit(500);
    if (!lErr && leituras) {
      for (const row of leituras) {
        if (row.sensor_id && !niveis[row.sensor_id]) {
          niveis[row.sensor_id] = {
            nivel: Math.min(100, Math.max(0, Number(row.nivel) || 0)),
            volume: Number(row.volume_litros) || 0,
            ts: row.received_at,
          };
        }
      }
    }
  } catch { /* sensor_leituras may not exist */ }
  // 2. Fallback: tabela sensores (principal — usada pelo dashboard)
  try {
    const { data: sens, error: sErr } = await supabase
      .from("sensores")
      .select("sensor_id, nivel_atual, volume_litros, updated_at, capacidade_litros");
    if (!sErr && sens) {
      for (const s of sens) {
        if (s.sensor_id && !niveis[s.sensor_id]) {
          const cap = Number(s.capacidade_litros) || 0;
          const nivel = Math.min(100, Math.max(0, Number(s.nivel_atual) || 0));
          niveis[s.sensor_id] = {
            nivel,
            volume: Number(s.volume_litros) || Math.round(nivel / 100 * cap),
            ts: s.updated_at || new Date().toISOString(),
          };
        }
      }
    }
  } catch { /* ignore */ }
  res.json({ niveis });
});

// Helper: remove entry by id from all cache keys
function resEvictFromCache(id: string) {
  for (const key of Object.keys(reservatoriosCache)) {
    reservatoriosCache[key] = (reservatoriosCache[key] as { id: string }[]).filter(r => r.id !== id);
  }
}

router.post("/reservatorios", async (req: Request, res: Response) => {
  const { id: _clientId, ...body } = req.body;
  const condId: string | null = body.condominio_id || null;
  const localDoc = { ...req.body, created_at: new Date().toISOString() };
  // Optimistic: insert into per-cond cache
  const cacheKey = condId || "_all";
  if (!reservatoriosCache[cacheKey]) reservatoriosCache[cacheKey] = [];
  (reservatoriosCache[cacheKey] as object[]).unshift(localDoc);
  const { data: inserted, error } = await supabase
    .from("reservatorios")
    .insert({ ...body, created_at: localDoc.created_at })
    .select()
    .single();
  if (error) {
    console.error("[reservatorios POST] Supabase error:", error.message, error.code);
    return res.json({ ok: true, doc: localDoc });
  }
  // Replace optimistic doc with real record
  reservatoriosCache[cacheKey] = (reservatoriosCache[cacheKey] as { id: string }[]).map(r =>
    (r as { id: string }).id === _clientId ? inserted : r
  );
  res.json({ ok: true, doc: inserted });
});

router.put("/reservatorios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  for (const key of Object.keys(reservatoriosCache)) {
    reservatoriosCache[key] = (reservatoriosCache[key] as { id: string }[]).map(r =>
      r.id === id ? { ...r, ...updates } : r
    );
  }
  const { error } = await supabase.from("reservatorios").update(updates).eq("id", id);
  if (error) console.error("[reservatorios PUT] Supabase error:", error.message, error.code);
  res.json({ ok: true });
});

router.delete("/reservatorios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  resEvictFromCache(id);
  const { error } = await supabase.from("reservatorios").delete().eq("id", id);
  if (error) console.error("[reservatorios DELETE] Supabase error:", error.message, error.code);
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

// ─── EQUIPAMENTOS (Módulo Manutenção) ────────────────────────────────────────

// Mapeia row do Supabase → objeto frontend (Equipamento)
function dbToEquip(row: Record<string, unknown>) {
  return {
    id:                String(row.id),
    nome:              String(row.nome || ""),
    categoria:         String(row.categoria || "elevador"),
    catIcon:           String(row.cat_icon || "⚙️"),
    local:             String(row.localizacao || ""),
    fabricante:        String(row.fabricante || ""),
    modelo:            String(row.modelo || ""),
    serie:             String(row.serie || ""),
    dataInstalacao:    row.data_instalacao ? String(row.data_instalacao) : "",
    vidaUtilAnos:      row.vida_util_meses ? Math.round(Number(row.vida_util_meses) / 12) : Number(row.vida_util_anos || 0),
    instaladoHa:       Number(row.instalado_ha || 0),
    consumoKwh:        Number(row.consumo_eletrico_kwh ?? row.consumo_kwh ?? 0),
    horasDia:          Number(row.horas_uso_dia ?? row.horas_dia ?? 8),
    status:            String(row.status || "operacional").toLowerCase().replace(" ", "") as "operacional"|"atencao"|"manutencao"|"inativo",
    proxManutencao:    row.prox_manutencao ? String(row.prox_manutencao) : "",
    ultimaManutencao:  row.ultima_manutencao ? String(row.ultima_manutencao) : "",
    custoManutencao:   Number(row.custo_manutencao || 0),
    descricao:         String(row.descricao || ""),
    fornecedor_id:     row.fornecedor_id ? String(row.fornecedor_id) : undefined,
    quantidade:        Number(row.quantidade ?? 1),
  };
}

// Mapeia objeto frontend → payload Supabase
function equipToDb(body: Record<string, unknown>, condominioId: string) {
  const payload: Record<string, unknown> = { condominio_id: condominioId };
  if (body.nome           !== undefined) payload.nome                = body.nome;
  if (body.categoria      !== undefined) payload.categoria           = body.categoria;
  if (body.catIcon        !== undefined) payload.cat_icon            = body.catIcon;
  if (body.local          !== undefined) payload.localizacao         = body.local;
  if (body.fabricante     !== undefined) payload.fabricante          = body.fabricante;
  if (body.modelo         !== undefined) payload.modelo              = body.modelo;
  if (body.serie          !== undefined) payload.serie               = body.serie;
  if (body.dataInstalacao !== undefined) payload.data_instalacao     = body.dataInstalacao || null;
  if (body.vidaUtilAnos   !== undefined) payload.vida_util_meses     = Math.round(Number(body.vidaUtilAnos) * 12);
  if (body.instaladoHa    !== undefined) payload.instalado_ha        = body.instaladoHa;
  if (body.consumoKwh     !== undefined) payload.consumo_eletrico_kwh= body.consumoKwh;
  if (body.horasDia       !== undefined) payload.horas_uso_dia       = body.horasDia;
  if (body.status         !== undefined) payload.status              = body.status;
  if (body.proxManutencao !== undefined) payload.prox_manutencao     = body.proxManutencao || null;
  if (body.ultimaManutencao!== undefined)payload.ultima_manutencao   = body.ultimaManutencao || null;
  if (body.custoManutencao!== undefined) payload.custo_manutencao    = body.custoManutencao;
  if (body.descricao      !== undefined) payload.descricao           = body.descricao;
  if (body.fornecedor_id  !== undefined) payload.fornecedor_id       = body.fornecedor_id || null;
  if (body.quantidade     !== undefined) payload.quantidade          = Math.max(1, Number(body.quantidade) || 1);
  payload.updated_at = new Date().toISOString();
  return payload;
}

// GET /api/equipamentos?condominio_id=X
router.get("/equipamentos", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase.from("equipamentos").select("*").eq("condominio_id", condId).order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(r => dbToEquip(r as Record<string, unknown>)));
});

// Colunas garantidas na tabela equipamentos original
const EQUIP_CORE_COLS = new Set([
  "condominio_id", "nome", "categoria", "localizacao", "status",
  "horas_uso_dia", "consumo_eletrico_kwh", "vida_util_meses",
  "fabricante", "data_instalacao", "descricao",
]);

// Detecta qualquer erro de coluna inexistente (PostgREST PGRST204 ou schema cache)
function isColError(e: { message?: string; code?: string } | null): boolean {
  if (!e) return false;
  return (
    e.code === "PGRST204" ||
    (e.message?.includes("schema cache") ?? false) ||
    (e.message?.includes("Could not find") ?? false)
  );
}

// Payload mínimo: apenas colunas core garantidas
function stripToCore(p: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(p).filter(([k]) => EQUIP_CORE_COLS.has(k)));
}

// POST /api/equipamentos — criar novo
router.post("/equipamentos", async (req: Request, res: Response) => {
  const { condominio_id, ...body } = req.body as Record<string, unknown>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  if (!body.nome) return res.status(400).json({ error: "nome obrigatório" });
  const payload = equipToDb(body, String(condominio_id));
  let { data, error } = await supabase.from("equipamentos").insert(payload).select().single();
  // Retry progressivo: primeiro sem colunas opcionais novas, depois apenas core
  if (isColError(error)) {
    const p2 = { ...payload };
    delete p2.fornecedor_id; delete p2.quantidade; delete p2.updated_at;
    ({ data, error } = await supabase.from("equipamentos").insert(p2).select().single());
  }
  if (isColError(error)) {
    ({ data, error } = await supabase.from("equipamentos").insert(stripToCore(payload)).select().single());
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, equipamento: dbToEquip(data as Record<string, unknown>) });
});

// PUT /api/equipamentos/:id — atualizar
router.put("/equipamentos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id, ...body } = req.body as Record<string, unknown>;
  if (!id) return res.status(400).json({ error: "id obrigatório" });
  const payload = equipToDb(body, String(condominio_id || ""));
  delete payload.condominio_id; // não sobrescrever o dono
  let { data, error } = await supabase.from("equipamentos").update(payload).eq("id", id).select().single();
  // Retry progressivo: primeiro sem colunas opcionais novas, depois apenas core
  if (isColError(error)) {
    const p2 = { ...payload };
    delete p2.fornecedor_id; delete p2.quantidade; delete p2.updated_at;
    ({ data, error } = await supabase.from("equipamentos").update(p2).eq("id", id).select().single());
  }
  if (isColError(error)) {
    const core = stripToCore(payload);
    ({ data, error } = await supabase.from("equipamentos").update(core).eq("id", id).select().single());
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, equipamento: dbToEquip(data as Record<string, unknown>) });
});

// DELETE /api/equipamentos/:id
router.delete("/equipamentos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id obrigatório" });
  const { error } = await supabase.from("equipamentos").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── FORNECEDORES E CONTATOS ──────────────────────────────────────────────────

// GET /api/fornecedores?condominio_id=X
router.get("/fornecedores", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase.from("fornecedores").select("*").eq("condominio_id", condId).order("nome", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/fornecedores
router.post("/fornecedores", async (req: Request, res: Response) => {
  const { condominio_id, ...body } = req.body as Record<string, unknown>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  if (!body.nome) return res.status(400).json({ error: "nome obrigatório" });
  const { data, error } = await supabase.from("fornecedores").insert({ condominio_id, ...body, updated_at: new Date().toISOString() }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, fornecedor: data });
});

// PUT /api/fornecedores/:id
router.put("/fornecedores/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id: _cid, id: _id, created_at: _ca, ...body } = req.body as Record<string, unknown>;
  const { data, error } = await supabase.from("fornecedores").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, fornecedor: data });
});

// DELETE /api/fornecedores/:id
router.delete("/fornecedores/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── PLANOS DE MANUTENÇÃO ─────────────────────────────────────────────────────

// GET /api/planos?condominio_id=X
router.get("/planos", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase.from("planos_manutencao").select("*").eq("condominio_id", condId).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/planos
router.post("/planos", async (req: Request, res: Response) => {
  const { condominio_id, ...body } = req.body as Record<string, unknown>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  if (!body.nome) return res.status(400).json({ error: "nome obrigatório" });
  const itens = Array.isArray(body.equipamentos_itens) ? body.equipamentos_itens : [];
  const custoTotal = itens.reduce((s: number, it: Record<string,unknown>) => s + (Number(it.custo_previsto) || 0), 0);
  const { data, error } = await supabase.from("planos_manutencao").insert({
    condominio_id, ...body, equipamentos_itens: itens, custo_total: custoTotal, updated_at: new Date().toISOString()
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, plano: data });
});

// PUT /api/planos/:id
router.put("/planos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id: _cid, ...body } = req.body as Record<string, unknown>;
  const itens = Array.isArray(body.equipamentos_itens) ? body.equipamentos_itens : [];
  const custoTotal = itens.reduce((s: number, it: Record<string,unknown>) => s + (Number(it.custo_previsto) || 0), 0);
  const { data, error } = await supabase.from("planos_manutencao").update({
    ...body, equipamentos_itens: itens, custo_total: custoTotal, updated_at: new Date().toISOString()
  }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, plano: data });
});

// DELETE /api/planos/:id
router.delete("/planos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("planos_manutencao").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── DIAGNÓSTICO INTELIGENTE ─────────────────────────────────────────────────

// GET /api/diagnostico/ultimo?condominio_id=X — último resultado salvo para este condomínio
router.get("/diagnostico/ultimo", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data, error } = await supabase
      .from("score_condominio")
      .select("*")
      .eq("condominio_id", condId)
      .single();
    if (error || !data) return res.json({ ok: true, resultado: null });
    res.json({
      ok: true,
      resultado: {
        score: { total: data.score_total, nivel: data.nivel, financeiro: data.financeiro, manutencao: data.manutencao, iot: data.iot, gestao: data.gestao },
        dados: data.dados || {},
        insights: data.insights || [],
        ia_analise: data.ia_analise || "",
        calculado_em: data.updated_at,
      }
    });
  } catch (err) {
    console.error("GET /diagnostico/ultimo error:", err);
    res.status(500).json({ error: "Erro ao carregar diagnóstico" });
  }
});

// GET /api/diagnostico/historico?condominio_id=X — histórico completo de diagnósticos
router.get("/diagnostico/historico", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data, error } = await supabase
      .from("diagnostico_historico")
      .select("*")
      .eq("condominio_id", condId)
      .order("calculado_em", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    console.error("GET /diagnostico/historico error:", err);
    res.status(500).json({ error: "Erro ao carregar histórico" });
  }
});

// GET /api/diagnostico/dados?condominio_id=X — métricas reais para o diagnóstico
router.get("/diagnostico/dados", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const [osRes, senRes, recRes, despRes] = await Promise.all([
      supabase.from("ordens_servico").select("id,status,prioridade,created_at").eq("condominio_id", condId),
      supabase.from("sensores").select("id,nome,nivel_atual,status").eq("condominio_id", condId),
      supabase.from("financeiro_receitas").select("id,valor,status").eq("condominio_id", condId),
      supabase.from("financeiro_despesas").select("id,valor,status").eq("condominio_id", condId),
    ]);
    const os = osRes.data || [];
    const sensores = senRes.data || [];
    const receitas = recRes.data || [];
    const despesas = despRes.data || [];

    const os_total = os.length;
    const os_abertas = os.filter(o => o.status === "aberta").length;
    const os_atrasadas = os.filter(o => {
      if (o.status === "fechada") return false;
      const days = (Date.now() - new Date(o.created_at).getTime()) / 86400000;
      return days > 7;
    }).length;
    const sensores_total = sensores.length;
    const sensores_offline = sensores.filter(s => s.nivel_atual < 10 || s.status === "offline").length;
    const nivel_medio = sensores_total > 0 ? Math.round(sensores.reduce((a, s) => a + (s.nivel_atual || 0), 0) / sensores_total) : 0;
    const total_receitas = receitas.reduce((a, r) => a + (Number(r.valor) || 0), 0);
    const total_despesas = despesas.reduce((a, d) => a + (Number(d.valor) || 0), 0);
    const inadimplentes = receitas.filter(r => r.status === "pendente" || r.status === "atrasado").length;
    const inadimplencia_pct = receitas.length > 0 ? Math.round((inadimplentes / receitas.length) * 100) : 0;
    const saldo = total_receitas - total_despesas;

    res.json({
      os: { total: os_total, abertas: os_abertas, atrasadas: os_atrasadas },
      sensores: { total: sensores_total, offline: sensores_offline, nivel_medio },
      financeiro: { total_receitas, total_despesas, saldo, inadimplencia_pct },
    });
  } catch (err) {
    console.error("GET /diagnostico/dados error:", err);
    res.status(500).json({ error: "Erro ao calcular dados" });
  }
});

// POST /api/diagnostico/calcular — calcula score real + gera insights IA
router.post("/diagnostico/calcular", async (req: Request, res: Response) => {
  const { condominio_id: condId } = req.body as { condominio_id: string };
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });

  try {
    // ── 1. Coletar dados reais ───────────────────────────────────────────────
    const [osRes, senRes, recRes, despRes, condRes] = await Promise.all([
      supabase.from("ordens_servico").select("id,status,prioridade,created_at").eq("condominio_id", condId),
      supabase.from("sensores").select("id,nome,nivel_atual,status").eq("condominio_id", condId),
      supabase.from("financeiro_receitas").select("id,valor,status").eq("condominio_id", condId),
      supabase.from("financeiro_despesas").select("id,valor,status").eq("condominio_id", condId),
      supabase.from("condominios").select("nome,sindico_nome,unidades").eq("id", condId).single(),
    ]);

    const os = osRes.data || [];
    const sensores = senRes.data || [];
    const receitas = recRes.data || [];
    const despesas = despRes.data || [];
    const condo = condRes.data;

    // ── 2. Calcular scores por categoria (0-100) ─────────────────────────────
    // Financeiro
    const inadimplentes = receitas.filter(r => r.status === "pendente" || r.status === "atrasado").length;
    const inadimpPct = receitas.length > 0 ? (inadimplentes / receitas.length) * 100 : 0;
    const totalRec = receitas.reduce((a, r) => a + (Number(r.valor) || 0), 0);
    const totalDesp = despesas.reduce((a, d) => a + (Number(d.valor) || 0), 0);
    const saldoPositivo = totalRec >= totalDesp;
    let scoreFinanceiro = 100;
    if (inadimpPct > 30) scoreFinanceiro -= 40;
    else if (inadimpPct > 20) scoreFinanceiro -= 25;
    else if (inadimpPct > 10) scoreFinanceiro -= 15;
    if (!saldoPositivo) scoreFinanceiro -= 25;
    scoreFinanceiro = Math.max(0, scoreFinanceiro);

    // Manutenção/OS
    const osAbertas = os.filter(o => o.status === "aberta").length;
    const osAtrasadas = os.filter(o => {
      if (o.status === "fechada") return false;
      return (Date.now() - new Date(o.created_at).getTime()) / 86400000 > 7;
    }).length;
    const osUrgentes = os.filter(o => o.prioridade === "urgente" && o.status !== "fechada").length;
    let scoreOS = 100;
    if (osAtrasadas > 5) scoreOS -= 35;
    else if (osAtrasadas > 2) scoreOS -= 20;
    else if (osAtrasadas > 0) scoreOS -= 10;
    if (osUrgentes > 3) scoreOS -= 25;
    else if (osUrgentes > 0) scoreOS -= 10;
    if (osAbertas > 10) scoreOS -= 15;
    scoreOS = Math.max(0, scoreOS);

    // IoT/Sensores
    const sensoresTotal = sensores.length;
    const sensoresOffline = sensores.filter(s => s.nivel_atual < 10 || s.status === "offline").length;
    const nivelMedio = sensoresTotal > 0 ? Math.round(sensores.reduce((a, s) => a + (s.nivel_atual || 0), 0) / sensoresTotal) : 100;
    let scoreIoT = sensoresTotal === 0 ? 75 : 100;
    if (sensoresOffline > 0) scoreIoT -= Math.min(40, sensoresOffline * 15);
    if (nivelMedio < 20) scoreIoT -= 30;
    else if (nivelMedio < 40) scoreIoT -= 15;
    scoreIoT = Math.max(0, scoreIoT);

    // Gestão geral (baseado nas outras métricas)
    const scoreGestao = Math.round((scoreFinanceiro * 0.4 + scoreOS * 0.35 + scoreIoT * 0.25));

    // Score total ponderado
    const scoreTotal = Math.round(scoreFinanceiro * 0.35 + scoreOS * 0.30 + scoreIoT * 0.20 + scoreGestao * 0.15);
    const nivel = scoreTotal >= 80 ? "Excelente" : scoreTotal >= 60 ? "Bom" : scoreTotal >= 40 ? "Atenção" : "Crítico";

    // ── 3. Gerar insights baseados nos dados ─────────────────────────────────
    const insights: { tipo: string; mensagem: string; prioridade: string }[] = [];
    if (inadimpPct > 10) insights.push({ tipo: "financeiro", mensagem: `Inadimplência elevada: ${inadimpPct.toFixed(0)}% das taxas pendentes`, prioridade: inadimpPct > 25 ? "alta" : "media" });
    if (!saldoPositivo) insights.push({ tipo: "financeiro", mensagem: "Saldo negativo: despesas superam receitas", prioridade: "alta" });
    if (osAtrasadas > 0) insights.push({ tipo: "manutencao", mensagem: `${osAtrasadas} OS(s) com mais de 7 dias sem atualização`, prioridade: osAtrasadas > 3 ? "alta" : "media" });
    if (osUrgentes > 0) insights.push({ tipo: "operacao", mensagem: `${osUrgentes} OS(s) urgentes em aberto`, prioridade: "alta" });
    if (sensoresOffline > 0) insights.push({ tipo: "iot", mensagem: `${sensoresOffline} sensor(es) offline ou com nível crítico`, prioridade: "media" });
    if (nivelMedio < 30) insights.push({ tipo: "iot", mensagem: `Nível médio dos reservatórios crítico: ${nivelMedio}%`, prioridade: "alta" });
    if (scoreTotal >= 80) insights.push({ tipo: "geral", mensagem: "Condomínio em excelente condição de saúde", prioridade: "baixa" });

    // ── 4. Chamar Síndico Virtual IA ─────────────────────────────────────────
    let iaAnalise = "";
    try {
      const prompt = `Você é o Síndico Virtual do ImobCore. Analise o diagnóstico de saúde do condomínio ${condo?.nome || ""} e gere uma análise concisa em 3 seções:

1. **Diagnóstico Resumido** (2-3 linhas)
2. **Principais Problemas** (lista com bullet points)
3. **Ações Recomendadas** (lista priorizada)

Score Geral: ${scoreTotal}/100 (${nivel})
Financeiro: ${scoreFinanceiro}/100 | Inadimplência: ${inadimpPct.toFixed(0)}% | Saldo: ${saldoPositivo ? "positivo" : "negativo"}
OS/Manutenção: ${scoreOS}/100 | OS atrasadas: ${osAtrasadas} | OS urgentes: ${osUrgentes}
IoT/Sensores: ${scoreIoT}/100 | Sensores offline: ${sensoresOffline} | Nível médio água: ${nivelMedio}%

Use linguagem direta e profissional. Use emojis estrategicamente.`;

      const aiRes = await fetch(`http://localhost:${process.env.PORT || 8080}/api/sindico/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history: [], condominio_id: condId }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json() as { reply?: string };
        iaAnalise = aiData.reply || "";
      }
    } catch (e) {
      console.error("IA call error:", e);
    }

    // ── 5. Salvar no Supabase ────────────────────────────────────────────────
    const dadosPayload = { inadimplencia_pct: inadimpPct, os_atrasadas: osAtrasadas, os_urgentes: osUrgentes, sensores_offline: sensoresOffline, nivel_medio_agua: nivelMedio, saldo_positivo: saldoPositivo };
    try {
      await supabase.from("score_condominio").upsert({
        condominio_id: condId,
        score_total: scoreTotal,
        financeiro: scoreFinanceiro,
        manutencao: scoreOS,
        operacao: scoreOS,
        iot: scoreIoT,
        gestao: scoreGestao,
        nivel,
        dados: dadosPayload,
        insights,
        ia_analise: iaAnalise,
        updated_at: new Date().toISOString(),
      }, { onConflict: "condominio_id" });
    } catch (err) { console.error("score_condominio upsert error:", err); }

    try {
      if (insights.length > 0) {
        // Delete old insights for this condo before inserting new ones
        await supabase.from("insights_ia").delete().eq("condominio_id", condId);
        await supabase.from("insights_ia").insert(insights.map(i => ({
          condominio_id: condId,
          tipo: i.tipo,
          mensagem: i.mensagem,
          prioridade: i.prioridade,
          status: "ativo",
        })));
      }
    } catch (err) { console.error("insights_ia insert error:", err); }

    // ── 6. Salvar no histórico ───────────────────────────────────────────────
    const calculadoEm = new Date().toISOString();
    const dadosPayloadFinal = { inadimplencia_pct: inadimpPct, os_atrasadas: osAtrasadas, os_urgentes: osUrgentes, sensores_offline: sensoresOffline, nivel_medio_agua: nivelMedio, saldo_positivo: saldoPositivo };
    try {
      await supabase.from("diagnostico_historico").insert({
        condominio_id: condId,
        score_total: scoreTotal,
        nivel,
        score_financeiro: scoreFinanceiro,
        score_manutencao: scoreOS,
        score_iot: scoreIoT,
        score_gestao: scoreGestao,
        dados: dadosPayloadFinal,
        insights,
        ia_analise: iaAnalise,
        calculado_em: calculadoEm,
      });
    } catch (err) { console.error("diagnostico_historico insert error:", err); }

    res.json({
      ok: true,
      score: { total: scoreTotal, nivel, financeiro: scoreFinanceiro, manutencao: scoreOS, iot: scoreIoT, gestao: scoreGestao },
      dados: dadosPayloadFinal,
      insights,
      ia_analise: iaAnalise,
      calculado_em: calculadoEm,
    });
  } catch (err) {
    console.error("POST /diagnostico/calcular error:", err);
    res.status(500).json({ error: "Erro ao calcular diagnóstico" });
  }
});

// ─── PISCINA E QUALIDADE DA ÁGUA ─────────────────────────────────────────────

const calcPiscinaStatus = (ph: number, cloro: number, temp?: number, alc?: number, dur?: number): "ok" | "alerta" => {
  const ok = ph >= 7.2 && ph <= 7.6 && cloro >= 1.0 && cloro <= 3.0
    && (!temp || (temp >= 24 && temp <= 30))
    && (!alc  || (alc  >= 80  && alc  <= 120))
    && (!dur  || (dur  >= 200 && dur  <= 400));
  return ok ? "ok" : "alerta";
};

// GET /api/piscina?condominio_id=X
router.get("/piscina", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase.from("piscina_leituras").select("*").eq("condominio_id", condId).order("created_at", { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/piscina
router.post("/piscina", async (req: Request, res: Response) => {
  const { condominio_id, ph, cloro, temperatura, alcalinidade, dureza_calcica, observacoes } = req.body as Record<string, unknown>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  if (ph === undefined || cloro === undefined) return res.status(400).json({ error: "pH e cloro são obrigatórios" });
  const phN = Number(ph), cloroN = Number(cloro);
  const tempN = temperatura ? Number(temperatura) : undefined;
  const alcN  = alcalinidade  ? Number(alcalinidade)  : undefined;
  const durN  = dureza_calcica ? Number(dureza_calcica) : undefined;
  const status = calcPiscinaStatus(phN, cloroN, tempN, alcN, durN);
  const { data, error } = await supabase.from("piscina_leituras").insert({
    condominio_id, ph: phN, cloro: cloroN,
    temperatura: tempN ?? null, alcalinidade: alcN ?? null, dureza_calcica: durN ?? null,
    observacoes: observacoes || null, status,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, leitura: data });
});

// PUT /api/piscina/:id
router.put("/piscina/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id: _cid, id: _id, created_at: _ca, ...body } = req.body as Record<string, unknown>;
  const ph = Number(body.ph), cloro = Number(body.cloro);
  const temp = body.temperatura ? Number(body.temperatura) : undefined;
  const alc  = body.alcalinidade ? Number(body.alcalinidade) : undefined;
  const dur  = body.dureza_calcica ? Number(body.dureza_calcica) : undefined;
  const status = calcPiscinaStatus(ph, cloro, temp, alc, dur);
  const { data, error } = await supabase.from("piscina_leituras").update({
    ...body, ph, cloro, status,
  }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, leitura: data });
});

// DELETE /api/piscina/:id
router.delete("/piscina/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("piscina_leituras").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
export { broadcast };
