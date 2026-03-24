import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import bcrypt from "bcryptjs";
import {
  type Lancamento,
  calcularIndicadores,
  calcularFluxoMensal,
} from "../lib/financeiro.service.js";
import { carregarContextoDi } from "../di-engine/context.js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Always prefer Replit AI Integration proxy (works in dev + production, no credit issues)
// Falls back to direct ANTHROPIC_API_KEY only when proxy env vars are not set
const hasProxy = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const anthropic = hasProxy
  ? new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    })
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

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

    // Quando condominio_id é fornecido, retorna SOMENTE esse condomínio
    // (garante isolamento: usuários vinculados não enxergam outros condos)
    let condominiosQuery = supabase.from("condominios").select("*").order("created_at", { ascending: true });
    if (condominio_id) {
      condominiosQuery = condominiosQuery.eq("id", condominio_id) as typeof condominiosQuery;
    }
    const { data: condominios } = await condominiosQuery;
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

    // Todas as queries filtradas pelo condomínio do usuário quando disponível
    // Garante isolamento: cada usuário vê apenas os dados do seu condomínio
    const condQuery = condIdCtx
      ? supabase.from("condominios").select("*").eq("id", condIdCtx).limit(1).single()
      : supabase.from("condominios").select("*").limit(1).single();

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
      condQuery,
      condIdCtx
        ? supabase.from("ordens_servico").select("*").eq("condominio_id", condIdCtx).eq("status", "aberta").order("created_at", { ascending: false })
        : supabase.from("ordens_servico").select("*").eq("status", "aberta").order("created_at", { ascending: false }),
      condIdCtx
        ? supabase.from("sensores").select("*").eq("condominio_id", condIdCtx)
        : supabase.from("sensores").select("*"),
      supabase.from("alertas_publicos").select("*").eq("ativo", true),
      condIdCtx
        ? supabase.from("financeiro_receitas").select("*").eq("condominio_id", condIdCtx)
        : supabase.from("financeiro_receitas").select("*"),
      condIdCtx
        ? supabase.from("financeiro_despesas").select("*").eq("condominio_id", condIdCtx)
        : supabase.from("financeiro_despesas").select("*"),
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

    // Carregar identidade/personalidade da Di configurada pelo Master
    let diIdentidade = `Você é Di, a Síndica Virtual Inteligente do ImobCore.\nPersonalidade: direto e empático, próximo sem ser informal. Fale em português brasileiro natural com emojis moderados.\n`;
    let diNome = "Di";
    let diAtiva = true;
    try {
      const diCtx = await carregarContextoDi(
        condIdCtx || cond?.id || "",
        {
          condNome: cond?.nome,
          condCidade: cond?.cidade,
          sindico: cond?.sindico_nome,
          totalUnidades: cond?.unidades,
          osAbertas: (osAbertas || []).length,
          osUrgentes: osUrgentes.length,
          saldo,
        },
        "gestor"
      );
      diIdentidade = diCtx.systemPrompt + "\n\n";
      diNome = diCtx.nomeDi;
      diAtiva = diCtx.diAtiva;
    } catch { /* usa fallback */ }

    // Verificar se Di está ativa para este condomínio
    if (!diAtiva) {
      return res.json({
        reply: `${diNome} está temporariamente desativada para este condomínio pelo administrador. Por favor, entre em contato com o suporte.`,
        nome_di: diNome,
        tokens: { input: 0, output: 0 },
        di_ativa: false,
      });
    }

    const systemPrompt = diIdentidade + `Condomínio: ${cond?.nome || "condomínio"}, localizado em ${cond?.cidade || "Florianópolis"}.
Síndico responsável: ${cond?.sindico_nome || "Ricardo Gestor"}.
Unidades: ${cond?.unidades || 84} | Moradores: ${cond?.moradores || 168}.
Você — ${diNome} — tem acesso completo aos dados abaixo para responder com precisão.

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

    res.json({ reply, nome_di: diNome, di_ativa: true, tokens });
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
  const DEMO_CONDOS = [
    { id:"00000000-0000-0000-0000-000000000001", nome:"Copacabana Beach Residence", total_unidades:94, total_moradores:168, plano:"pro", cidade:"Rio de Janeiro / RJ", score_geral:91, ativo:true, created_at:new Date().toISOString() },
    { id:"00000000-0000-0000-0000-000000000002", nome:"Jardim Atlântico",            total_unidades:72, total_moradores:140, plano:"pro", cidade:"Niterói / RJ",       score_geral:84, ativo:true, created_at:new Date().toISOString() },
    { id:"00000000-0000-0000-0000-000000000003", nome:"Villa Serena",               total_unidades:38, total_moradores:71,  plano:"starter", cidade:"Florianópolis / SC", score_geral:68, ativo:true, created_at:new Date().toISOString() },
    { id:"00000000-0000-0000-0000-000000000004", nome:"Edifício Aurora",             total_unidades:120, total_moradores:230, plano:"enterprise", cidade:"São Paulo / SP", score_geral:77, ativo:true, created_at:new Date().toISOString() },
  ];
  try {
    const { data, error } = await supabase
      .from("condominios")
      .select("*")
      .order("created_at", { ascending: true });
    if (error || !data || data.length === 0) return res.json(DEMO_CONDOS);
    res.json(data);
  } catch {
    res.json(DEMO_CONDOS);
  }
});

// GET /api/os - Listar OSs (com filtros opcionais)
router.get("/os", async (req: Request, res: Response) => {
  try {
    const { condominio_id, status, categoria, prioridade, search } = req.query as Record<string, string>;
    let q = supabase.from("ordens_servico").select("*").order("created_at", { ascending: false });
    // MULTI-TENANCY: sempre filtrar por condominio_id
    if (condominio_id) q = q.eq("condominio_id", condominio_id);
    if (status && status !== "todos") q = q.eq("status", status);
    if (categoria && categoria !== "todos") q = q.eq("categoria", categoria);
    if (prioridade && prioridade !== "todos") q = q.eq("prioridade", prioridade);
    if (search) q = q.or(`titulo.ilike.%${search}%,local.ilike.%${search}%,responsavel.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/os - Criar OS
router.post("/os", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const { condominio_id, titulo, descricao, categoria, prioridade, unidade, responsavel,
            equipamento_ids, prestador_nome, fornecedor_id, custo_estimado, data_prevista, sla_horas,
            checklist, aprovacao_necessaria, local } = body;

    const { data: cond } = await supabase.from("condominios").select("id").limit(1).single();

    // Auto-numeração: pega o maior numero existente e incrementa
    const { data: lastOs } = await supabase
      .from("ordens_servico")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .single();
    const nextNumero = ((lastOs?.numero as number) || 0) + 1;

    // SLA automático por prioridade
    const slaDefault: Record<string, number> = { urgente: 4, alta: 24, media: 48, baixa: 168 };
    const slaFinal = Number(sla_horas) || slaDefault[String(prioridade || "media")] || 48;

    // Aprovação necessária: urgente ou custo > 500
    const aprovNecessaria = Boolean(aprovacao_necessaria) ||
      String(prioridade) === "urgente" ||
      Number(custo_estimado) > 500;

    const baseInsert: Record<string, unknown> = {
      condominio_id: condominio_id || cond?.id,
      numero: nextNumero,
      titulo,
      descricao,
      categoria,
      prioridade: prioridade || "media",
      unidade,
      local,
      responsavel,
      prestador_nome,
      fornecedor_id: fornecedor_id || null,
      custo_estimado: Number(custo_estimado) || 0,
      data_prevista: data_prevista || null,
      sla_horas: slaFinal,
      checklist: checklist ?? [],
      aprovacao_necessaria: aprovNecessaria,
      status: "aberta",
      equipamento_ids: equipamento_ids ?? [],
    };

    let { data, error } = await supabase.from("ordens_servico").insert(baseInsert).select().single();
    // Retry progressivo se colunas não existirem
    if (error && (error.message?.includes("equipamento_ids") || error.message?.includes("column"))) {
      const safe: Record<string, unknown> = { condominio_id: baseInsert.condominio_id, numero: nextNumero, titulo, descricao, categoria, prioridade: prioridade || "media", unidade, responsavel, status: "aberta" };
      const r2 = await supabase.from("ordens_servico").insert(safe).select().single();
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
    // Retry 2: apenas campos core garantidos (inclui novos campos v2)
    if (colErr(error)) {
      const os_core = ["titulo","descricao","categoria","prioridade","unidade","status","responsavel","numero",
                       "prestador_nome","fornecedor_id","custo_estimado","custo_real","data_prevista","sla_horas",
                       "foto_antes","foto_depois","checklist","aprovacao_necessaria","aprovado_por","aprovado_em","di_sugestao","local",
                       "equipamento_ids"];
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

// POST /api/os/:id/foto — Upload foto_antes ou foto_depois para bucket os-fotos
const _osUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
router.post("/os/:id/foto", _osUpload.single("foto"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tipo = (req.body as { tipo?: string }).tipo || "antes"; // "antes" | "depois"
  if (!id) return res.status(400).json({ error: "OS ID obrigatório" });
  if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
  if (!["antes", "depois"].includes(tipo)) return res.status(400).json({ error: "tipo deve ser 'antes' ou 'depois'" });

  try {
    const ext = (req.file.originalname.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const filePath = `os-${id}/foto_${tipo}_${Date.now()}.${ext}`;
    const bucket = "os-fotos";

    const tryUpload = async () =>
      supabase.storage.from(bucket).upload(filePath, req.file!.buffer, { contentType: req.file!.mimetype, upsert: true });

    let { error: upErr } = await tryUpload();

    if (upErr) {
      if (upErr.message?.includes("not found") || upErr.message?.toLowerCase().includes("bucket")) {
        await supabase.storage.createBucket(bucket, { public: true });
        const retry = await tryUpload();
        if (retry.error) return res.status(500).json({ error: retry.error.message });
      } else {
        return res.status(500).json({ error: upErr.message });
      }
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const url = urlData.publicUrl;

    const campo = tipo === "antes" ? "foto_antes" : "foto_depois";
    await supabase.from("ordens_servico").update({ [campo]: url, updated_at: new Date().toISOString() }).eq("id", id);

    broadcast("os_atualizada", { id, [campo]: url });
    res.json({ ok: true, url, campo });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/os-comentarios?os_id=X — listar comentários
router.get("/os-comentarios", async (req: Request, res: Response) => {
  try {
    const { os_id } = req.query as { os_id: string };
    if (!os_id) return res.status(400).json({ error: "os_id required" });
    const { data, error } = await supabase
      .from("os_comentarios").select("*").eq("os_id", os_id).order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/os-comentarios — adicionar comentário
router.post("/os-comentarios", async (req: Request, res: Response) => {
  try {
    const { os_id, condominio_id, autor, mensagem, foto_url } = req.body as Record<string, string>;
    const { data, error } = await supabase
      .from("os_comentarios").insert({ os_id, condominio_id, autor, mensagem, foto_url }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/os/:id/di — Di analisa uma OS (Claude)
router.post("/os/:id/di", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { condominio_nome, historico } = req.body as { condominio_nome?: string; historico?: unknown[] };

    const { data: os, error: osErr } = await supabase.from("ordens_servico").select("*").eq("id", id).single();
    if (osErr || !os) return res.status(404).json({ error: "OS não encontrada" });

    const condNome = condominio_nome || "o condomínio";
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 600,
      system: `Você é Di, síndica virtual de ${condNome} em Florianópolis, SC. Analise a OS em 2-3 parágrafos curtos e objetivos. Sugira prestador baseado no histórico, estime risco de recorrência e recomende prazo. Seja direta e prática. Use emojis com moderação.`,
      messages: [{
        role: "user",
        content: `OS a analisar:\n${JSON.stringify(os, null, 2)}\n\nHistórico de OSs desta categoria (últimas 5):\n${JSON.stringify((historico || []).slice(-5), null, 2)}`
      }]
    });

    const texto = (msg.content[0] as { type: string; text: string }).type === "text"
      ? (msg.content[0] as { text: string }).text : "";

    // Salvar sugestão na OS
    await supabase.from("ordens_servico").update({ di_sugestao: { texto, gerado_em: new Date().toISOString() } }).eq("id", id);

    res.json({ texto });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/sindico/relatorio-executivo — Coleta dados + gera análise Di via Claude
router.post("/sindico/relatorio-executivo", async (req: Request, res: Response) => {
  try {
    const { condominio_id, periodo = "mes", condominio_nome, sindico_nome } = req.body as {
      condominio_id: string; periodo?: string; condominio_nome?: string; sindico_nome?: string;
    };
    if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });

    const condNome = condominio_nome || "o condomínio";

    // ── Coletar dados em paralelo ─────────────────────────────────────────────
    const [osRes, moradoresRes, lancRes, resRes] = await Promise.all([
      supabase.from("ordens_servico").select("*").eq("condominio_id", condominio_id).order("created_at", { ascending: false }),
      supabase.from("moradores").select("id, unidade, bloco, status").eq("condominio_id", condominio_id),
      supabase.from("lancamentos_financeiros").select("*").eq("condominio_id", condominio_id).order("data", { ascending: false }).limit(200),
      supabase.from("reservatorios").select("*, sensor_readings(nivel_atual, volume_litros, created_at)").eq("condominio_id", condominio_id).limit(4),
    ]);

    const osList   = osRes.data   || [];
    const moradores = moradoresRes.data || [];
    const lancs    = lancRes.data  || [];
    const reservs  = resRes.data   || [];

    // ── Calcular KPIs ────────────────────────────────────────────────────────
    const osAberta    = osList.filter(o => o.status === "aberta").length;
    const osAndamento = osList.filter(o => o.status === "em_andamento").length;
    const osConcluida = osList.filter(o => o.status === "fechada").length;
    const osUrgentes  = osList.filter(o => o.prioridade === "urgente" && o.status !== "fechada").length;
    const osList5     = osList.filter(o => o.status !== "fechada").slice(0, 5).map(o => ({
      numero: o.numero, titulo: o.titulo, prioridade: o.prioridade,
      status: o.status, responsavel: o.responsavel || "–",
      custo_estimado: o.custo_estimado || 0, local: o.local || "–",
    }));

    const receitas  = lancs.filter(l => l.tipo === "receita");
    const despesas  = lancs.filter(l => l.tipo === "despesa");
    const totalReceita  = receitas.reduce((s: number, l: {valor?: number}) => s + (l.valor || 0), 0);
    const totalDespesa  = despesas.reduce((s: number, l: {valor?: number}) => s + (l.valor || 0), 0);
    const saldo = totalReceita - totalDespesa;

    const totalMoradores = moradores.length;
    const moradoresAtivos = moradores.filter((m: {status?: string}) => m.status !== "inativo").length;

    const iotData = reservs.map((r: {nome?: string; capacidade_litros?: number; sensor_readings?: {nivel_atual?: number; volume_litros?: number}[]}) => {
      const latest = r.sensor_readings && r.sensor_readings.length > 0 ? r.sensor_readings[r.sensor_readings.length - 1] : null;
      return {
        nome: r.nome, capacidade: r.capacidade_litros,
        nivel: latest?.nivel_atual || null,
        volume: latest?.volume_litros || null,
      };
    });

    // ── Gerar análise Di com Claude ───────────────────────────────────────────
    const client = hasProxy
      ? new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL })
      : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

    const periodoLabel = periodo === "tri" ? "1º Trimestre 2026" : periodo === "ano" ? "Ano 2026" :
      periodo === "jan" ? "Janeiro 2026" : periodo === "fev" ? "Fevereiro 2026" :
      periodo === "abr" ? "Abril 2026" : "Março 2026";

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `Você é Di, síndica virtual IA do ${condNome} no ImobCore v2. Gere uma análise executiva concisa (3 parágrafos) com: 1) situação atual com destaques positivos e alertas críticos, 2) análise financeira e ocupação, 3) recomendações prioritárias e score estimado de saúde do condomínio (0-100). Use linguagem direta e profissional. Mencione números concretos. Use **negrito** para dados importantes.`,
      messages: [{
        role: "user",
        content: `Analise os dados do período ${periodoLabel} do ${condNome}:

ORDENS DE SERVIÇO:
- Total abertas: ${osAberta}
- Em andamento: ${osAndamento}
- Concluídas: ${osConcluida}
- Urgentes pendentes: ${osUrgentes}
- OS abertas: ${JSON.stringify(osList5, null, 2)}

FINANCEIRO:
- Total receitas: R$ ${totalReceita.toLocaleString("pt-BR")}
- Total despesas: R$ ${totalDespesa.toLocaleString("pt-BR")}
- Saldo: R$ ${saldo.toLocaleString("pt-BR")}
- Total lançamentos: ${lancs.length}

MORADORES:
- Total cadastrados: ${totalMoradores}
- Ativos: ${moradoresAtivos}

IoT / RESERVATÓRIOS:
${iotData.map((r: {nome?: string; nivel?: number | null; capacidade?: number}) => `- ${r.nome}: ${r.nivel !== null ? r.nivel + "%" : "sem leitura"} (cap. ${(r.capacidade || 0).toLocaleString()} L)`).join("\n")}

Gere a análise executiva:`
      }]
    });

    const diAnalysis = (msg.content[0] as { type: string; text: string }).type === "text"
      ? (msg.content[0] as { text: string }).text : "";

    // ── Calcular score ────────────────────────────────────────────────────────
    let score = 80;
    if (osUrgentes > 0) score -= osUrgentes * 8;
    if (saldo < 0) score -= 15;
    if (saldo > 0) score += 5;
    if (osConcluida > osAberta) score += 5;
    score = Math.max(20, Math.min(100, score));

    res.json({
      ok: true,
      periodo: periodoLabel,
      condNome,
      sindNome: sindico_nome || "Síndico",
      score,
      kpis: {
        osAberta, osAndamento, osConcluida, osUrgentes,
        totalReceita, totalDespesa, saldo,
        totalMoradores, moradoresAtivos,
      },
      osList: osList5,
      iot: iotData,
      financeiro: {
        receitas: receitas.slice(0, 5).map((l: {descricao?: string; valor?: number; categoria?: string; created_at?: string}) => ({ descricao: l.descricao, valor: l.valor, categoria: l.categoria, data: l.created_at })),
        despesas: despesas.slice(0, 5).map((l: {descricao?: string; valor?: number; categoria?: string; created_at?: string}) => ({ descricao: l.descricao, valor: l.valor, categoria: l.categoria, data: l.created_at })),
      },
      diAnalysis,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/os/:id/notificacao-moradores — Gera comunicado para moradores via Di
router.post("/os/:id/notificacao-moradores", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      condominio_nome, sindico_nome,
      tem_interrupcao, prazo_interrupcao, detalhes_interrupcao
    } = req.body as {
      condominio_nome?: string; sindico_nome?: string;
      tem_interrupcao?: boolean; prazo_interrupcao?: string; detalhes_interrupcao?: string;
    };

    const { data: os, error: osErr } = await supabase.from("ordens_servico").select("*").eq("id", id).single();
    if (osErr || !os) return res.status(404).json({ error: "OS não encontrada" });

    const condNome   = condominio_nome || "o condomínio";
    const sindNome   = sindico_nome || "O Síndico";
    const dataPrev   = os.data_prevista ? new Date(os.data_prevista).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" }) : "data a confirmar";

    let interrupcaoInfo = "";
    if (tem_interrupcao) {
      const prazo = prazo_interrupcao || "";
      const det   = detalhes_interrupcao || "";
      interrupcaoInfo = `Haverá interrupção do serviço/equipamento durante a manutenção. Prazo estimado de interrupção: ${prazo}. ${det}`;
    } else {
      interrupcaoInfo = "Não haverá interrupção dos serviços durante a manutenção. O funcionamento normal será mantido.";
    }

    const client = hasProxy
      ? new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL })
      : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

    const msg = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 700,
      system: `Você é Di, síndica virtual IA do ImobCore. Seu papel é redigir comunicados profissionais, claros e acolhedores para os moradores do condomínio ${condNome}. Use linguagem respeitosa e direta. Inclua emojis com moderação (1-2 no máximo). Assine sempre em nome do síndico e mencione Di no final como geradora do comunicado.`,
      messages: [{
        role: "user",
        content: `Redija um comunicado formal aos moradores do ${condNome} sobre a seguinte ordem de serviço:

Título: ${os.titulo}
Categoria: ${os.categoria}
Prioridade: ${os.prioridade}
Local/Área: ${os.local || "área comum"}
Data prevista: ${dataPrev}
Descrição: ${os.descricao || "(sem descrição adicional)"}
Prestador: ${os.prestador_nome || "equipe de manutenção"}

Informação sobre interrupção:
${interrupcaoInfo}

Sindico: ${sindNome}

O comunicado deve:
1. Iniciar com "📢 Aviso aos Moradores" e o motivo
2. Informar a data e local da manutenção
3. Explicar claramente se há ou não interrupção dos serviços (com prazo se houver)
4. Mencionar que é parte do plano preventivo gerenciado pela Di — Síndica Virtual IA do ImobCore
5. Terminar com saudações do síndico e nome do condomínio
6. Linha final: "🤖 Comunicado gerado por Di — Síndica Virtual ImobCore"

Seja conciso (máx 3 parágrafos centrais) mas completo.`
      }]
    });

    const texto = (msg.content[0] as { type: string; text: string }).type === "text"
      ? (msg.content[0] as { text: string }).text : "";

    res.json({ texto });
  } catch (err) { res.status(500).json({ error: String(err) }); }
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

// ─── COMUNICADOS META ENCODING ────────────────────────────────────────────────
// New columns (canais, categoria, etc.) stored as JSON inside `corpo` until Migration 14 applied
const COM_META_SEP = "\u001FIMB_COM_META\u001F";
const COM_META_KEYS = ["canais","categoria","publico_alvo","prioridade","agendado_para","enviado_em","status","total_destinatarios","total_entregues","total_lidos","di_gerado","template_key","wa_message_id","tg_message_id"];

function encodeComunicadoMeta(fields: Record<string, unknown>): Record<string, unknown> {
  const { corpo, ...rest } = fields;
  const metaKeys = COM_META_KEYS.filter(k => rest[k] !== undefined);
  if (metaKeys.length === 0) return { corpo };
  const meta: Record<string, unknown> = {};
  metaKeys.forEach(k => { meta[k] = rest[k]; });
  const corpoPure = typeof corpo === "string" ? corpo : (rest.instrucoes as string || "");
  return { corpo: `${corpoPure}${COM_META_SEP}${JSON.stringify(meta)}` };
}

function decodeComunicadoMeta(row: Record<string, unknown>): Record<string, unknown> {
  if (!row) return row;
  const corpo = (row.corpo as string) || "";
  const idx = corpo.lastIndexOf(COM_META_SEP);
  if (idx === -1) {
    // Return with defaults for new fields
    return { ...row, corpo, canais: ["app"], categoria: "aviso_geral", publico_alvo: "todos", prioridade: "normal", status: "enviado", total_destinatarios: 0, total_entregues: 0, total_lidos: 0, di_gerado: row.gerado_por_ia || false, template_key: null };
  }
  const corpoReal = corpo.substring(0, idx);
  try {
    const meta = JSON.parse(corpo.substring(idx + COM_META_SEP.length));
    return { ...row, corpo: corpoReal, ...meta, di_gerado: meta.di_gerado ?? row.gerado_por_ia ?? false };
  } catch {
    return { ...row, corpo };
  }
}

// GET /api/comunicados - Comunicados
router.get("/comunicados", async (req: Request, res: Response) => {
  const { condominio_id } = req.query as { condominio_id?: string };
  let q = supabase.from("comunicados").select("*").order("created_at", { ascending: false });
  if (condominio_id) q = q.eq("condominio_id", condominio_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(r => decodeComunicadoMeta(r as Record<string, unknown>)));
});

// POST /api/comunicados — criar/salvar comunicado
router.post("/comunicados", async (req: Request, res: Response) => {
  const { condominio_id, titulo, corpo, categoria, publico_alvo, prioridade, canais, agendado_para, template_key, di_gerado } = req.body as Record<string, unknown>;
  if (!condominio_id || !titulo || !corpo) return res.status(400).json({ error: "condominio_id, titulo e corpo obrigatórios" });
  const status = agendado_para ? "agendado" : "rascunho";
  // Try full schema first
  const baseRow = { condominio_id, titulo, gerado_por_ia: di_gerado || false };
  const metaEncoded = encodeComunicadoMeta({ corpo, canais: canais || ["app"], categoria: categoria || "aviso_geral", publico_alvo: publico_alvo || "todos", prioridade: prioridade || "normal", status, total_destinatarios: 0, total_entregues: 0, total_lidos: 0, di_gerado: di_gerado || false, template_key: template_key || null, agendado_para: agendado_para || null });
  let { data, error } = await supabase.from("comunicados").insert({ ...baseRow, ...metaEncoded }).select().single();
  if (error) {
    // Fallback: plain corpo
    const fb = await supabase.from("comunicados").insert({ ...baseRow, corpo: corpo as string }).select().single();
    if (fb.error) return res.status(500).json({ error: fb.error.message });
    data = fb.data;
  }
  res.json({ ok: true, comunicado: decodeComunicadoMeta(data as Record<string, unknown>) });
});

// PUT /api/comunicados/:id — atualizar comunicado
router.put("/comunicados/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const fields = req.body as Record<string, unknown>;
  const { titulo, corpo, categoria, publico_alvo, prioridade, canais, agendado_para, status, template_key, di_gerado, total_entregues, total_lidos, total_destinatarios, enviado_em } = fields;
  const baseUpd: Record<string, unknown> = {};
  if (titulo !== undefined) baseUpd.titulo = titulo;
  if (di_gerado !== undefined) baseUpd.gerado_por_ia = di_gerado;
  // Get current row to preserve meta
  const { data: cur } = await supabase.from("comunicados").select("*").eq("id", id).single();
  if (!cur) return res.status(404).json({ error: "not found" });
  const curDecoded = decodeComunicadoMeta(cur as Record<string, unknown>);
  const merged = { ...curDecoded, ...(corpo !== undefined ? { corpo } : {}), ...(categoria !== undefined ? { categoria } : {}), ...(publico_alvo !== undefined ? { publico_alvo } : {}), ...(prioridade !== undefined ? { prioridade } : {}), ...(canais !== undefined ? { canais } : {}), ...(agendado_para !== undefined ? { agendado_para } : {}), ...(status !== undefined ? { status } : {}), ...(template_key !== undefined ? { template_key } : {}), ...(di_gerado !== undefined ? { di_gerado } : {}), ...(total_entregues !== undefined ? { total_entregues } : {}), ...(total_lidos !== undefined ? { total_lidos } : {}), ...(total_destinatarios !== undefined ? { total_destinatarios } : {}), ...(enviado_em !== undefined ? { enviado_em } : {}) };
  const metaEncoded = encodeComunicadoMeta(merged);
  const { data, error } = await supabase.from("comunicados").update({ ...baseUpd, ...metaEncoded }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, comunicado: decodeComunicadoMeta(data as Record<string, unknown>) });
});

// DELETE /api/comunicados/:id
router.delete("/comunicados/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("comunicados").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/comunicados/gerar-com-di — gerar texto via Claude
router.post("/comunicados/gerar-com-di", async (req: Request, res: Response) => {
  const { condominio_id, condominio_nome, sindico_nome, categoria, contexto, oss_abertas, titulo_base } = req.body as Record<string, unknown>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const condNome = condominio_nome || "Condomínio";
    const sindNome = sindico_nome || "Síndico";
    const cat = categoria || "aviso_geral";
    const prompt = `Você é Di, síndica virtual do ${condNome} em Florianópolis.
Categoria do comunicado: ${cat}
Assunto/Contexto: ${titulo_base || ""}
OSs abertas relevantes: ${JSON.stringify(oss_abertas || [])}
Dados adicionais: ${JSON.stringify(contexto || {})}

Escreva um comunicado profissional e cordial para os moradores. Máx 200 palavras. Tom claro, sem jargão técnico. NÃO use markdown, asteriscos ou formatação especial. Termine com: Atenciosamente, ${sindNome} - Síndico / Di - Síndica Virtual ImobCore.`;
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
    const msg = await ai.messages.create({ model: "claude-sonnet-4-5", max_tokens: 700, messages: [{ role: "user", content: prompt }] });
    const texto = (msg.content[0] as { text: string }).text;
    // Also generate a title
    const tituloMsg = await ai.messages.create({ model: "claude-sonnet-4-5", max_tokens: 50, messages: [{ role: "user", content: `Crie um título conciso (máx 8 palavras) para este comunicado condominial:\n\n${texto}` }] });
    const titulo = (tituloMsg.content[0] as { text: string }).text.replace(/["*]/g, "").trim();
    res.json({ ok: true, titulo, corpo: texto });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/comunicados/:id/enviar — envio multicanal (WA + TG + App)
router.post("/comunicados/:id/enviar", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id, canais } = req.body as { condominio_id: string; canais: string[] };
  if (!condominio_id || !canais?.length) return res.status(400).json({ error: "condominio_id e canais obrigatórios" });
  try {
    // Load comunicado
    const { data: com } = await supabase.from("comunicados").select("*").eq("id", id).single();
    if (!com) return res.status(404).json({ error: "comunicado não encontrado" });
    const decoded = decodeComunicadoMeta(com as Record<string, unknown>) as { titulo: string; corpo: string; [key: string]: unknown };
    // Load canal config
    const { data: cfg } = await supabase.from("canal_config").select("*").eq("condominio_id", condominio_id).single().catch(() => ({ data: null, error: null }));
    // Load moradores for WA
    const { data: moradores } = await supabase.from("moradores").select("telefone,nome").eq("condominio_id", condominio_id).limit(200);
    const numeros = (moradores || []).map((m: Record<string, unknown>) => m.telefone as string).filter(Boolean);
    const condo = { nome: "Condomínio" };
    const { data: condData } = await supabase.from("condominios").select("nome").eq("id", condominio_id).single().catch(() => ({ data: null, error: null }));
    if (condData) Object.assign(condo, condData);
    const resultados: Record<string, unknown> = {};
    // WhatsApp via Z-API
    if (canais.includes("whatsapp") && cfg?.wa_token && cfg?.wa_instance) {
      const msg = `📢 *${condo.nome}*\n\n*${decoded.titulo}*\n\n${decoded.corpo}\n\n_via ImobCore · Síndica Virtual Di_`;
      let waOk = 0;
      for (const num of numeros.slice(0, 100)) {
        try {
          const r = await fetch(`https://api.z-api.io/instances/${cfg.wa_instance}/token/${cfg.wa_token}/send-text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: num, message: msg }) });
          if (r.ok) waOk++;
        } catch { /* continue */ }
      }
      resultados.whatsapp = { ok: waOk, total: numeros.length };
    } else if (canais.includes("whatsapp")) {
      resultados.whatsapp = { ok: 0, total: 0, erro: "WhatsApp não configurado" };
    }
    // Telegram via Bot API
    if (canais.includes("telegram") && cfg?.tg_bot_token && cfg?.tg_chat_id) {
      const msg = `🏢 *${condo.nome}*\n\n*${decoded.titulo}*\n\n${decoded.corpo}\n\n_ImobCore v2 · Di - Síndica Virtual_`;
      const tgUrl = `https://api.telegram.org/bot${cfg.tg_bot_token}/sendMessage`;
      const r = await fetch(tgUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cfg.tg_chat_id, text: msg, parse_mode: "Markdown" }) });
      const tgRes = await r.json() as { ok?: boolean; description?: string };
      resultados.telegram = { ok: tgRes.ok, message_id: (tgRes as Record<string, unknown>)?.result ? ((tgRes as Record<string, unknown>).result as Record<string, unknown>)?.message_id : null };
    } else if (canais.includes("telegram")) {
      resultados.telegram = { ok: false, erro: "Telegram não configurado" };
    }
    // Mark as sent + update stats
    const agora = new Date().toISOString();
    const entregues = (resultados.whatsapp as { ok?: number })?.ok || 0;
    const updEncoded = encodeComunicadoMeta({ corpo: decoded.corpo, canais, categoria: decoded.categoria, publico_alvo: decoded.publico_alvo, prioridade: decoded.prioridade, status: "enviado", total_destinatarios: numeros.length || 1, total_entregues: entregues, total_lidos: 0, di_gerado: decoded.di_gerado, template_key: decoded.template_key, enviado_em: agora, wa_message_id: null, tg_message_id: (resultados.telegram as { message_id?: string })?.message_id || null });
    await supabase.from("comunicados").update(updEncoded).eq("id", id);
    res.json({ ok: true, resultados, enviado_em: agora });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/comunicados/canal-config — config de canais do condomínio
router.get("/comunicados/canal-config", async (req: Request, res: Response) => {
  const { condominio_id } = req.query as { condominio_id?: string };
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data, error } = await supabase.from("canal_config").select("*").eq("condominio_id", condominio_id).single();
    if (error || !data) return res.json({ condominio_id, wa_token: null, wa_numero: null, wa_instance: null, wa_provider: "zapi", tg_bot_token: null, tg_chat_id: null, email_from: null, email_smtp: null });
    res.json(data);
  } catch { res.json({ condominio_id, wa_token: null, wa_numero: null, wa_instance: null, wa_provider: "zapi", tg_bot_token: null, tg_chat_id: null, email_from: null, email_smtp: null }); }
});

// PUT /api/comunicados/canal-config — salvar config de canais
router.put("/comunicados/canal-config", async (req: Request, res: Response) => {
  const { condominio_id, wa_token, wa_numero, wa_instance, wa_provider, tg_bot_token, tg_chat_id, email_from, email_smtp } = req.body as Record<string, string>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const row = { condominio_id, wa_token: wa_token || null, wa_numero: wa_numero || null, wa_instance: wa_instance || null, wa_provider: wa_provider || "zapi", tg_bot_token: tg_bot_token || null, tg_chat_id: tg_chat_id || null, email_from: email_from || null, email_smtp: email_smtp || null, updated_at: new Date().toISOString() };
    const { data: existing } = await supabase.from("canal_config").select("id").eq("condominio_id", condominio_id).single();
    if (existing?.id) {
      const { error } = await supabase.from("canal_config").update(row).eq("condominio_id", condominio_id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabase.from("canal_config").insert(row);
      if (error) return res.status(500).json({ error: error.message });
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/comunicados/regras — regras automáticas do condomínio
router.get("/comunicados/regras", async (req: Request, res: Response) => {
  const { condominio_id } = req.query as { condominio_id?: string };
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data, error } = await supabase.from("comunicado_regras").select("*").eq("condominio_id", condominio_id);
    if (error || !data) return res.json([]);
    res.json(data);
  } catch { res.json([]); }
});

// POST /api/condominios — criar ou actualizar condomínio (wizard step 1)
router.post("/condominios", async (req: Request, res: Response) => {
  const { id, nome, cnpj, endereco, cidade, estado, sindico_nome, sindico_email, sindico_tel, unidades, total_unidades, total_moradores } = req.body as {
    id?: string; nome: string; cnpj?: string; endereco?: string; cidade?: string; estado?: string;
    sindico_nome?: string; sindico_email?: string; sindico_tel?: string;
    unidades?: number; total_unidades?: number; total_moradores?: number;
  };

  if (!nome?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
  const numUnidades = Number(total_unidades || unidades || 0);
  if (numUnidades < 1) return res.status(400).json({ error: "Total de unidades é obrigatório" });

  // Colunas reais da tabela condominios: id, nome, total_unidades, total_moradores, plano, endereco, cidade, score_geral, ativo
  const fullPayload: Record<string, unknown> = {
    nome: nome.trim(),
    endereco: endereco || null,
    cidade: cidade ? `${cidade}${estado ? " / " + estado : ""}` : "",
    total_unidades: numUnidades,
    total_moradores: Number(total_moradores || 0),
    plano: "starter",
    ativo: true,
  };

  const basePayload: Record<string, unknown> = {
    nome: nome.trim(),
    cidade: cidade ? `${cidade}${estado ? " / " + estado : ""}` : "",
    total_unidades: numUnidades,
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
      // Auto-criar config Di padrão para novos condomínios
      if (result?.id) {
        await supabase.from("di_configuracoes").upsert({
          condominio_id: result.id,
          nome_di: "Di",
          tom_comunicacao: "direto_empatico",
          limite_financeiro: 500,
          di_ativa: true,
          modulos_ativos: ["os","financeiro","iot","misp","encomendas","portaria","reservas","comunicados"],
        }, { onConflict: "condominio_id" });
      }
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

// POST /api/condominios/:id/photo - Upload photo to Supabase Storage
const _multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post("/condominios/:id/photo", _multerUpload.single("photo"), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Condomínio ID obrigatório" });
  if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });

  try {
    const ext = req.file.originalname.split(".").pop() ?? "jpg";
    const path = `condo-${id}/photo-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("condo-photos")
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (upErr) {
      // Bucket may not exist yet — create it and retry
      if (upErr.message?.includes("not found") || upErr.message?.includes("Bucket")) {
        await supabase.storage.createBucket("condo-photos", { public: true });
        const { error: upErr2 } = await supabase.storage
          .from("condo-photos")
          .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
        if (upErr2) return res.status(500).json({ error: upErr2.message });
      } else {
        return res.status(500).json({ error: upErr.message });
      }
    }

    const { data: urlData } = supabase.storage.from("condo-photos").getPublicUrl(path);
    const photo_url = urlData.publicUrl;

    // Persist to condominios table (best-effort; column may not exist yet)
    try {
      await supabase.from("condominios").update({ photo_url }).eq("id", id);
    } catch { /* ignore if column missing */ }

    res.json({ ok: true, photo_url });
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
// ─────────────────────────────────────────────────────────────────────────────
// Webhook: aceita formato legado { sensor_id, nivel } e formato Cloudflare Worker
// { device_id, nivel_percent, distancia_cm, volume_litros, bateria, raw }
// ─────────────────────────────────────────────────────────────────────────────
const WEBHOOK_SECRET = "imobcore-webhook-secret";

async function handleSensorWebhook(req: Request, res: Response): Promise<void> {
  // ── 0. Autenticação por secret header (opcional — aceita sem header em dev) ─
  const secret = req.headers["x-webhook-secret"];
  if (secret && secret !== WEBHOOK_SECRET) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    const body = req.body as Record<string, unknown>;
    const { device_id: rawDeviceId, distancia_cm, nivel_percent, volume_litros: rawVol, bateria, raw } = body;

    // ── 1. Identificar device ──────────────────────────────────────────────
    const device_id = String(rawDeviceId || body.sensor_id || "").trim();
    if (!device_id) {
      res.status(400).json({ ok: false, error: "device_id ausente" });
      return;
    }

    // ── 2. Buscar reservoir pelo iot_sensor_id ─────────────────────────────
    const { data: reservoir, error: rErr } = await supabase
      .from("reservoirs")
      .select("id, name, capacity_liters, condominium_id, iot_sensor_id")
      .eq("iot_sensor_id", device_id)
      .maybeSingle();

    if (rErr || !reservoir) {
      // Fallback: buscar pelo mac_address (ignora erro se coluna não existir)
      let byMac: { id: string; name: string; capacity_liters: number; condominium_id?: string; iot_sensor_id: string } | null = null;
      try {
        const { data: macResult, error: macErr } = await supabase
          .from("reservoirs")
          .select("id, name, capacity_liters, condominium_id, iot_sensor_id")
          .eq("mac_address", device_id)
          .maybeSingle();
        if (!macErr) byMac = macResult;
      } catch { /* coluna mac_address pode não existir */ }

      if (!byMac) {
        console.error("[webhook] Reservoir não encontrado:", device_id, rErr?.message);
        // Não retorna 404 — registra mesmo sem reservatório (fallback para sensor_leituras legado)
        const nivelFb = nivel_percent != null ? Math.min(100, Math.max(0, Number(nivel_percent))) : (body.nivel != null ? Number(body.nivel) : null);
        const volFb = rawVol != null ? Number(rawVol) : 0;
        broadcast("sensor_leitura", { sensor_id: device_id, device_id, nivel: nivelFb, volume_litros: volFb, received_at: new Date().toISOString() });
        res.json({ ok: false, warn: "Reservoir not found — broadcast only", device_id });
        return;
      }
      // Usa o encontrado pelo mac
      return handleWithReservoir(req, res, device_id, byMac, distancia_cm, nivel_percent, rawVol, bateria, raw, body);
    }

    return handleWithReservoir(req, res, device_id, reservoir, distancia_cm, nivel_percent, rawVol, bateria, raw, body);

  } catch (err) {
    console.error("[webhook] error:", err);
    res.status(500).json({ ok: false, error: "internal error" });
  }
}

async function handleWithReservoir(
  _req: Request, res: Response,
  device_id: string,
  reservoir: { id: string; name: string; capacity_liters: number; condominium_id?: string; iot_sensor_id: string },
  distancia_cm: unknown, nivel_percent: unknown, rawVol: unknown, bateria: unknown, raw: unknown,
  fullBody: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString();
  const capacidade = Number(reservoir.capacity_liters) || 0;

  // ── 3. Calcular nivel e volume ─────────────────────────────────────────
  let nivelFinal: number | null = null;
  let volFinal = rawVol != null ? Number(rawVol) : 0;

  if (nivel_percent != null) {
    nivelFinal = Math.min(100, Math.max(0, Number(nivel_percent)));
  } else if (fullBody.nivel != null) {
    nivelFinal = Math.min(100, Math.max(0, Number(fullBody.nivel)));
  }

  if (!volFinal && distancia_cm != null && capacidade > 0) {
    const distNum = Number(distancia_cm);
    const alturaAgua = 200 - distNum;
    const pct = Math.max(0, Math.min(alturaAgua / 200, 1));
    volFinal = Math.round(pct * capacidade);
    if (nivelFinal == null) nivelFinal = Math.round(pct * 100);
  } else if (!volFinal && nivelFinal != null && capacidade > 0) {
    volFinal = Math.round((nivelFinal / 100) * capacidade);
  }

  // ── 4. INSERT em sensor_readings ──────────────────────────────────────
  const { error: insErr } = await supabase
    .from("sensor_readings")
    .insert({
      condominium_id: reservoir.condominium_id ?? null,
      reservoir_id:   reservoir.id,
      device_id,
      nivel:          nivelFinal,
      distancia:      distancia_cm != null ? Number(distancia_cm) : null,
      volume:         volFinal,
      bateria:        bateria != null ? Number(bateria) : null,
      raw_payload:    raw ?? fullBody,
      created_at:     now,
    });

  if (insErr) {
    console.error("[webhook] Erro INSERT sensor_readings:", insErr.message);
    // Não aborta — continua com broadcast SSE mesmo sem persistência
  }

  // ── 5. Atualizar reservoirs (iot_last_reading, iot_last_sync, iot_status) ──
  try {
    await supabase
      .from("reservoirs")
      .update({
        iot_last_reading: nivelFinal,
        iot_last_sync:    now,
        iot_status:       "online",
      })
      .eq("id", reservoir.id);
  } catch { /* não-crítico */ }

  // ── 6. Broadcast SSE para o frontend ──────────────────────────────────
  // Emite 'water_reading' (novo) E 'sensor_leitura' (legado) para compatibilidade
  const ssePayload = {
    type:         "water_reading",
    reservoir_id: reservoir.id,
    sensor_id:    reservoir.iot_sensor_id,   // para compatibilidade com resNivels no frontend
    device_id,
    nivel:        nivelFinal,
    volume_litros: volFinal,
    volume:       volFinal,
    timestamp:    now,
    received_at:  now,
  };
  broadcast("water_reading", ssePayload);
  broadcast("sensor_leitura", ssePayload);   // evento legado — frontend antigo recebe

  console.log(`✅ [webhook] ${reservoir.name} (${device_id}) | nivel:${nivelFinal ?? "—"}% | vol:${volFinal}L`);
  res.json({ ok: true, reservoir_id: reservoir.id, nivel: nivelFinal, volume: volFinal });
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

// ── Mapeamento de campos: DB inglês ↔ frontend português ──────────────────
// reservoirs (DB)        ↔  reservatorios (frontend)
//   iot_sensor_id        ↔  sensor_id
//   name                 ↔  nome
//   capacity_liters      ↔  capacidade_litros
// Demais campos permanecem iguais (id, condominio_id, mac_address, etc.)
function resFromDB(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  if ("iot_sensor_id" in row)  { out.sensor_id        = row.iot_sensor_id;    delete out.iot_sensor_id; }
  if ("name" in row && !("nome" in row)) { out.nome   = row.name;             delete out.name; }
  if ("capacity_liters" in row){ out.capacidade_litros = row.capacity_liters; delete out.capacity_liters; }
  if ("condominium_id" in row && !("condominio_id" in row)) { out.condominio_id = row.condominium_id; }
  return out;
}
function resToDB(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if ("sensor_id" in body)        { out.iot_sensor_id   = body.sensor_id;        delete out.sensor_id; }
  if ("nome" in body)             { out.name             = body.nome;             delete out.nome; }
  if ("capacidade_litros" in body){ out.capacity_liters  = body.capacidade_litros; delete out.capacidade_litros; }
  if ("condominio_id" in body)    { out.condominium_id   = body.condominio_id;    delete out.condominio_id; }
  return out;
}

router.get("/reservatorios", async (req: Request, res: Response) => {
  const condId = (req.query.condominio_id as string | undefined) || null;
  const cacheKey = condId || "_all";
  try {
    // ► Tenta tabela 'reservoirs' (schema inglês)
    const base = supabase.from("reservoirs").select("*").order("created_at", { ascending: false });
    const { data, error } = condId ? await base.eq("condominio_id", condId) : await base;
    if (!error && data) {
      const mapped = data.map(r => resFromDB(r as Record<string, unknown>));
      reservatoriosCache[cacheKey] = mapped;
      return res.json({ reservatorios: mapped });
    }
  } catch { /* fall through */ }
  try {
    // ► Fallback: tabela 'reservatorios' (schema português)
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
  // 1. Tenta sensor_readings (schema inglês novo — reservoir_id / device_id / volume / nivel)
  try {
    const { data: readings, error: rErr } = await supabase
      .from("sensor_readings")
      .select("device_id, nivel, volume, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!rErr && readings) {
      for (const row of readings) {
        const key = String(row.device_id || "");
        if (key && !niveis[key]) {
          niveis[key] = {
            nivel: Math.min(100, Math.max(0, Number(row.nivel) || 0)),
            volume: Number(row.volume) || 0,
            ts: row.created_at,
          };
        }
      }
    }
  } catch { /* sensor_readings may not exist yet */ }

  // 2. Tenta sensor_leituras (schema português legado)
  try {
    const { data: leituras, error: lErr } = await supabase
      .from("sensor_leituras")
      .select("sensor_id, nivel, volume_litros, received_at")
      .order("received_at", { ascending: false })
      .limit(500);
    if (!lErr && leituras) {
      for (const row of leituras) {
        const key = String(row.sensor_id || "");
        if (key && !niveis[key]) {
          niveis[key] = {
            nivel: Math.min(100, Math.max(0, Number(row.nivel) || 0)),
            volume: Number(row.volume_litros) || 0,
            ts: row.received_at,
          };
        }
      }
    }
  } catch { /* sensor_leituras may not exist */ }

  // 3. Fallback: iot_last_reading em reservoirs
  try {
    const { data: reservs } = await supabase
      .from("reservoirs")
      .select("iot_sensor_id, iot_last_reading, capacity_liters, iot_last_sync");
    if (reservs) {
      for (const r of reservs) {
        const key = String(r.iot_sensor_id || "");
        if (key && !niveis[key] && r.iot_last_reading != null) {
          const nivel = Math.min(100, Math.max(0, Number(r.iot_last_reading) || 0));
          niveis[key] = {
            nivel,
            volume: Math.round(nivel / 100 * (Number(r.capacity_liters) || 0)),
            ts: r.iot_last_sync || new Date().toISOString(),
          };
        }
      }
    }
  } catch { /* ignore */ }

  // 4. Fallback: tabela sensores (dashboard legado)
  try {
    const { data: sens, error: sErr } = await supabase
      .from("sensores")
      .select("sensor_id, nivel_atual, volume_litros, updated_at, capacidade_litros");
    if (!sErr && sens) {
      for (const s of sens) {
        const key = String(s.sensor_id || "");
        if (key && !niveis[key]) {
          const cap = Number(s.capacidade_litros) || 0;
          const nivel = Math.min(100, Math.max(0, Number(s.nivel_atual) || 0));
          niveis[key] = {
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

// Retorna histórico de leituras por sensor_id(s)
// GET /api/sensor-leituras/historico?sensor_ids=id1,id2&limit=60
router.get("/sensor-leituras/historico", async (req: Request, res: Response) => {
  const rawIds = String(req.query.sensor_ids || "");
  const sensorIds = rawIds.split(",").map(s => s.trim()).filter(Boolean);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
  if (!sensorIds.length) return res.json({ historico: {} });

  const historico: Record<string, { nivel: number; volume_litros: number; received_at: string }[]> = {};

  // ► 1. sensor_readings (schema inglês: device_id / volume / created_at)
  try {
    const { data: readings, error: rErr } = await supabase
      .from("sensor_readings")
      .select("device_id, nivel, volume, created_at")
      .in("device_id", sensorIds)
      .order("created_at", { ascending: false })
      .limit(limit * sensorIds.length);
    if (!rErr && readings) {
      for (const row of readings as Record<string, unknown>[]) {
        const sid = String(row.device_id || "");
        if (!sid) continue;
        if (!historico[sid]) historico[sid] = [];
        if (historico[sid].length < limit) {
          historico[sid].push({
            nivel: Math.min(100, Math.max(0, Number(row.nivel) || 0)),
            volume_litros: Number(row.volume) || 0,
            received_at: String(row.created_at || ""),
          });
        }
      }
    }
  } catch { /* sensor_readings may not exist */ }

  // ► 2. Fallback: sensor_leituras (schema português: sensor_id / volume_litros / received_at)
  //    Só busca sensor_ids que ainda não têm dados
  const missingIds = sensorIds.filter(id => !historico[id]);
  if (missingIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("sensor_leituras")
        .select("sensor_id, nivel, volume_litros, received_at")
        .in("sensor_id", missingIds)
        .order("received_at", { ascending: false })
        .limit(limit * missingIds.length);
      if (!error && data) {
        for (const row of data as Record<string, unknown>[]) {
          const sid = String(row.sensor_id || "");
          if (!sid) continue;
          if (!historico[sid]) historico[sid] = [];
          if (historico[sid].length < limit) {
            historico[sid].push({
              nivel: Math.min(100, Math.max(0, Number(row.nivel) || 0)),
              volume_litros: Number(row.volume_litros) || 0,
              received_at: String(row.received_at || ""),
            });
          }
        }
      }
    } catch { /* sensor_leituras may not exist */ }
  }

  return res.json({ historico });
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
  const cacheKey = condId || "_all";
  if (!reservatoriosCache[cacheKey]) reservatoriosCache[cacheKey] = [];
  (reservatoriosCache[cacheKey] as object[]).unshift(localDoc);

  // ► Tenta inserir na tabela 'reservoirs' (schema inglês)
  const dbBody = resToDB({ ...body, created_at: localDoc.created_at });
  let inserted: Record<string, unknown> | null = null;
  let insertErr: { message: string; code: string } | null = null;

  const { data: ins1, error: e1 } = await supabase
    .from("reservoirs")
    .insert(dbBody)
    .select()
    .single();
  if (!e1 && ins1) {
    inserted = resFromDB(ins1 as Record<string, unknown>);
  } else {
    // ► Fallback: tabela 'reservatorios' (schema português)
    const { data: ins2, error: e2 } = await supabase
      .from("reservatorios")
      .insert({ ...body, created_at: localDoc.created_at })
      .select()
      .single();
    if (!e2 && ins2) {
      inserted = ins2 as Record<string, unknown>;
    } else {
      insertErr = e2 || e1;
    }
  }

  if (insertErr || !inserted) {
    console.error("[reservatorios POST] Supabase error:", insertErr?.message, insertErr?.code);
    return res.json({ ok: true, doc: localDoc });
  }
  reservatoriosCache[cacheKey] = (reservatoriosCache[cacheKey] as { id: string }[]).map(r =>
    (r as { id: string }).id === _clientId ? inserted : r
  );
  res.json({ ok: true, doc: inserted });
});

router.put("/reservatorios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body as Record<string, unknown>;
  for (const key of Object.keys(reservatoriosCache)) {
    reservatoriosCache[key] = (reservatoriosCache[key] as { id: string }[]).map(r =>
      r.id === id ? { ...r, ...updates } : r
    );
  }
  // ► Tenta atualizar em 'reservoirs' (schema inglês)
  const dbUpdates = resToDB(updates);
  const { error: e1 } = await supabase.from("reservoirs").update(dbUpdates).eq("id", id);
  if (e1) {
    // ► Fallback: 'reservatorios' (schema português)
    const { error: e2 } = await supabase.from("reservatorios").update(updates).eq("id", id);
    if (e2) console.error("[reservatorios PUT] Supabase error:", e2.message, e2.code);
  }
  res.json({ ok: true });
});

router.delete("/reservatorios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  resEvictFromCache(id);
  // ► Tenta deletar em 'reservoirs' (schema inglês), depois fallback
  const { error: e1 } = await supabase.from("reservoirs").delete().eq("id", id);
  if (e1) {
    const { error: e2 } = await supabase.from("reservatorios").delete().eq("id", id);
    if (e2) console.error("[reservatorios DELETE] Supabase error:", e2.message, e2.code);
  }
  res.json({ ok: true });
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

// Normaliza row do banco para o formato esperado pelo frontend
// Colunas reais: id, email, nome, senha_hash, perfil, condominio_id, unidade_id, ativo, ultimo_login, created_at, updated_at
function normUsuario(row: Record<string, unknown>) {
  return {
    id:                    row.id,
    condominio_id:         row.condominio_id,
    nome:                  row.nome,
    email:                 row.email,
    perfil:                row.perfil,
    unidade:               row.unidade_id || null,   // frontend usa "unidade"
    status:                row.ativo === false ? "inativo" : "ativo",
    telefone:              row.telefone || null,
    ultimo_acesso:         row.ultimo_login || null,
    permissoes_customizadas: row.permissoes_customizadas || null,
    created_at:            row.created_at,
  };
}

// GET /api/usuarios?condominio_id=X&perfil=X&status=X
router.get("/usuarios", async (req: Request, res: Response) => {
  try {
    const { condominio_id, perfil, status } = req.query as Record<string, string | undefined>;
    let q = supabase
      .from("usuarios")
      .select("id,condominio_id,nome,email,perfil,unidade_id,ativo,ultimo_login,created_at")
      .order("nome", { ascending: true });
    if (condominio_id) q = q.eq("condominio_id", condominio_id);
    if (perfil && perfil !== "todos") q = q.eq("perfil", perfil);
    if (status === "ativo")   q = q.eq("ativo", true);
    if (status === "inativo") q = q.eq("ativo", false);
    const { data, error } = await q;
    if (error) throw error;
    res.json((data || []).map(r => normUsuario(r as Record<string, unknown>)));
  } catch (err) {
    console.error("GET /usuarios error:", err);
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

// POST /api/usuarios — cria novo usuário vinculado ao condomínio
router.post("/usuarios", async (req: Request, res: Response) => {
  try {
    const { condominio_id, nome, email, perfil, unidade, status } = req.body as {
      condominio_id: string; nome: string; email: string;
      perfil: "gestor" | "sindico" | "morador" | "zelador";
      unidade?: string; status?: string;
    };
    if (!condominio_id || !nome?.trim() || !email?.trim() || !perfil) {
      res.status(400).json({ error: "condominio_id, nome, email e perfil são obrigatórios" });
      return;
    }
    const { data, error } = await supabase.from("usuarios").insert({
      condominio_id,
      nome:       nome.trim(),
      email:      email.trim().toLowerCase(),
      perfil,
      unidade_id: unidade || null,
      ativo:      status !== "inativo",
      senha_hash: null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(normUsuario(data as Record<string, unknown>));
  } catch (err) {
    console.error("POST /usuarios error:", err);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// PUT /api/usuarios/:id — atualiza campos do usuário
router.put("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, email, perfil, unidade, status } = req.body as {
      nome?: string; email?: string;
      perfil?: "gestor" | "sindico" | "morador" | "zelador";
      unidade?: string; status?: string;
    };
    const updates: Record<string, unknown> = {};
    if (nome    !== undefined) updates.nome       = nome.trim();
    if (email   !== undefined) updates.email      = email.trim().toLowerCase();
    if (perfil  !== undefined) updates.perfil     = perfil;
    if (unidade !== undefined) updates.unidade_id = unidade || null;
    if (status  !== undefined) updates.ativo      = status !== "inativo";
    if (!Object.keys(updates).length) return res.status(400).json({ error: "Nenhum campo enviado" });
    const { data, error } = await supabase.from("usuarios").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json(normUsuario(data as Record<string, unknown>));
  } catch (err) {
    console.error("PUT /usuarios/:id error:", err);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

// DELETE /api/usuarios/:id — soft delete (ativo = false)
router.delete("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("usuarios").update({ ativo: false }).eq("id", id);
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

// ─── Planos helpers ───────────────────────────────────────────────────────────
// New columns (setor, frequencia_tipo, etc.) may not exist in older Supabase schemas.
// We encode them as JSON inside the existing `instrucoes` TEXT field and decode on read.
const META_PREFIX = "\u001FIMB_META\u001F"; // invisible separator

function encodePlanoMeta(body: Record<string, unknown>): Record<string, unknown> {
  const META_KEYS = ["setor","frequencia_tipo","frequencia_valor","prestador_nome","prestador_contato",
    "custo_estimado","gerar_os_automatica","dias_antecedencia","ativo","template_checklist",
    "execucoes_realizadas","execucoes_total","di_gerado","ultima_execucao"];
  const meta: Record<string, unknown> = {};
  const safeBody: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (META_KEYS.includes(k)) meta[k] = v;
    else safeBody[k] = v;
  }
  // Map compatible fields
  if (meta.frequencia_tipo && !safeBody.periodicidade) safeBody.periodicidade = meta.frequencia_tipo;
  if (meta.custo_estimado !== undefined) safeBody.custo_total = Number(meta.custo_estimado) || 0;
  // Encode meta into instrucoes
  const realInstrucoes = String(safeBody.instrucoes || "");
  const instrucoes = META_PREFIX + JSON.stringify(meta) + (realInstrucoes ? "\n" + realInstrucoes : "");
  return { ...safeBody, instrucoes };
}

function decodePlanoMeta(row: Record<string, unknown>): Record<string, unknown> {
  const instrucoes = String(row.instrucoes || "");
  if (!instrucoes.startsWith(META_PREFIX)) return row;
  const rest = instrucoes.slice(META_PREFIX.length);
  const nlIdx = rest.indexOf("\n");
  const jsonStr = nlIdx >= 0 ? rest.slice(0, nlIdx) : rest;
  const realText = nlIdx >= 0 ? rest.slice(nlIdx + 1) : "";
  try {
    const meta = JSON.parse(jsonStr);
    return { ...row, ...meta, instrucoes: realText, custo_estimado: meta.custo_estimado ?? row.custo_total };
  } catch { return row; }
}

// GET /api/planos?condominio_id=X
router.get("/planos", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase.from("planos_manutencao").select("*").eq("condominio_id", condId).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(row => decodePlanoMeta(row as Record<string, unknown>)));
});

// POST /api/planos
router.post("/planos", async (req: Request, res: Response) => {
  const { condominio_id, ...body } = req.body as Record<string, unknown>;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  if (!body.nome) return res.status(400).json({ error: "nome obrigatório" });
  const itens = Array.isArray(body.equipamentos_itens) ? body.equipamentos_itens : [];
  const bodyWithMeta = encodePlanoMeta(body);
  const custoTotal = itens.reduce((s: number, it: Record<string,unknown>) => s + (Number(it.custo_previsto) || 0), 0) || Number(bodyWithMeta.custo_total) || 0;
  const { data, error } = await supabase.from("planos_manutencao").insert({
    condominio_id, ...bodyWithMeta, equipamentos_itens: itens, custo_total: custoTotal, updated_at: new Date().toISOString()
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, plano: decodePlanoMeta(data as Record<string, unknown>) });
});

// PUT /api/planos/:id
router.put("/planos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id: _cid, ...body } = req.body as Record<string, unknown>;
  const itens = Array.isArray(body.equipamentos_itens) ? body.equipamentos_itens : [];
  const bodyWithMeta = encodePlanoMeta(body);
  const custoTotal = itens.reduce((s: number, it: Record<string,unknown>) => s + (Number(it.custo_previsto) || 0), 0) || Number(bodyWithMeta.custo_total) || 0;
  const { data, error } = await supabase.from("planos_manutencao").update({
    ...bodyWithMeta, equipamentos_itens: itens, custo_total: custoTotal, updated_at: new Date().toISOString()
  }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, plano: decodePlanoMeta(data as Record<string, unknown>) });
});

// DELETE /api/planos/:id
router.delete("/planos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("planos_manutencao").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/plano-templates — templates predefinidos por setor
router.get("/plano-templates", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from("plano_templates").select("*").order("setor");
    if (error) {
      // Table may not exist yet — return built-in defaults
      const defaults = [
        { setor:"hidraulico", nome:"Revisão bombas piscina", tipo:"preventiva", frequencia_tipo:"mensal", frequencia_valor:1, custo_estimado:2500, prestador_sugerido:"Jacuzzi" },
        { setor:"elevador", nome:"Manutenção elevadores NR-13", tipo:"preventiva", frequencia_tipo:"mensal", frequencia_valor:1, custo_estimado:800, prestador_sugerido:"Neomot" },
        { setor:"eletrico", nome:"Inspeção quadros elétricos", tipo:"preventiva", frequencia_tipo:"semestral", frequencia_valor:6, custo_estimado:650, prestador_sugerido:"EletroTec" },
        { setor:"hidraulico", nome:"Limpeza reservatórios água", tipo:"preventiva", frequencia_tipo:"semestral", frequencia_valor:6, custo_estimado:480, norma_tecnica:"ABNT NBR 5626" },
        { setor:"seguranca", nome:"Inspeção câmeras e portões", tipo:"inspecao", frequencia_tipo:"mensal", frequencia_valor:1, custo_estimado:220 },
        { setor:"incendio", nome:"Revisão sistema incêndio", tipo:"corretiva", frequencia_tipo:"anual", frequencia_valor:12, custo_estimado:1800, norma_tecnica:"IT-21 CBPMESP" },
        { setor:"jardinagem", nome:"Manutenção áreas verdes", tipo:"preventiva", frequencia_tipo:"mensal", frequencia_valor:1, custo_estimado:380 },
        { setor:"piscina", nome:"Tratamento água piscina", tipo:"inspecao", frequencia_tipo:"semanal", frequencia_valor:7, custo_estimado:120, norma_tecnica:"ABNT NBR 10339" },
        { setor:"estrutural", nome:"Inspeção fachada e lajes", tipo:"inspecao", frequencia_tipo:"anual", frequencia_valor:12, custo_estimado:2200, norma_tecnica:"ABNT NBR 16747" },
        { setor:"limpeza", nome:"Limpeza caixas gordura", tipo:"preventiva", frequencia_tipo:"semestral", frequencia_valor:6, custo_estimado:3600 },
      ];
      return res.json(defaults);
    }
    res.json(data || []);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/planos/gerar-com-di — gerar planos com Claude IA
router.post("/planos/gerar-com-di", async (req: Request, res: Response) => {
  const { condominio_id, condominio_nome, setores, mes_inicio, tipo, gerar_os_automatica, equipamentos } = req.body as {
    condominio_id: string; condominio_nome: string; setores: string[]; mes_inicio: number; tipo: string; gerar_os_automatica: boolean; equipamentos: string[];
  };
  if (!condominio_id || !setores?.length) return res.status(400).json({ error: "condominio_id e setores obrigatórios" });
  try {
    // Fetch templates for selected sectors
    const { data: tpls } = await supabase.from("plano_templates").select("*").in("setor", setores);
    const templates = tpls || [];
    const mesNome = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][(mes_inicio||1)-1];
    const prompt = `Você é Di, síndica virtual IA do condomínio ${condominio_nome}. Crie planos de manutenção personalizados para os setores: ${setores.join(", ")}.
Tipo principal: ${tipo}. Início: ${mesNome}.
Equipamentos cadastrados no condomínio: ${(equipamentos||[]).slice(0,20).join(", ") || "não informados"}.
Templates base disponíveis: ${JSON.stringify(templates.slice(0,8))}.

Responda APENAS com um array JSON válido (sem markdown, sem explicações) com objetos contendo:
nome, setor, tipo, frequencia_tipo (semanal|mensal|trimestral|semestral|anual), frequencia_valor (número), custo_estimado (número), prestador_nome, instrucoes (string curta com orientações).

Gere 1-2 planos por setor selecionado, priorizando manutenções preventivas e normas técnicas brasileiras.`;
    const aiResp = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 2000,
      messages: [{ role:"user", content: prompt }],
    });
    const rawText = (aiResp.content[0] as { type: string; text: string }).text.replace(/```json|```/g, "").trim();
    let planos: unknown[];
    try { planos = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: "Resposta inválida da IA", raw: rawText.slice(0, 300) }); }
    if (!Array.isArray(planos)) return res.status(500).json({ error: "IA não retornou array" });
    res.json({ ok: true, planos });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/planos/:id/gerar-os — criar OS a partir de um plano
router.post("/planos/:id/gerar-os", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { condominio_id } = req.body as { condominio_id: string };
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    // Load plano
    const { data: plano, error: pErr } = await supabase.from("planos_manutencao").select("*").eq("id", id).single();
    if (pErr || !plano) return res.status(404).json({ error: "Plano não encontrado" });
    // Generate OS number
    const { count } = await supabase.from("ordens_servico").select("*", { count:"exact", head:true }).eq("condominio_id", condominio_id);
    const numero = (count || 0) + 1;
    // Calc next date
    const ft = plano.frequencia_tipo || plano.periodicidade || "mensal";
    const fv = plano.frequencia_valor || 1;
    const dias = ft === "semanal" ? 7*fv : ft === "mensal" ? 30*fv : ft === "bimestral" ? 60 : ft === "trimestral" ? 90 : ft === "semestral" ? 180 : 365;
    const proxData = new Date(Date.now() + dias * 86_400_000).toISOString().split("T")[0];
    // Insert OS (only columns that exist in ordens_servico table)
    const { data: os, error: osErr } = await supabase.from("ordens_servico").insert({
      condominio_id, numero,
      titulo: plano.nome,
      descricao: `[Plano ${plano.frequencia_tipo||"mensal"}] ${plano.instrucoes || plano.nome}. Prestador: ${plano.prestador_nome || "—"}. Próxima exec: ${proxData}.`,
      categoria: plano.setor || "manutencao",
      status: "aberta", prioridade: "media",
      responsavel: plano.prestador_nome || null,
      created_at: new Date().toISOString(),
    }).select().single();
    if (osErr) return res.status(500).json({ error: osErr.message });
    // Update plano meta: increment execucoes_realizadas + ultima_execucao (via instrucoes encoding)
    const decodedPlano = decodePlanoMeta(plano as Record<string, unknown>);
    const updateBody = encodePlanoMeta({
      ultima_execucao: new Date().toISOString(),
      execucoes_realizadas: (Number(decodedPlano.execucoes_realizadas) || 0) + 1,
      instrucoes: decodedPlano.instrucoes,
      // preserve other meta fields
      setor: decodedPlano.setor, frequencia_tipo: decodedPlano.frequencia_tipo,
      frequencia_valor: decodedPlano.frequencia_valor, prestador_nome: decodedPlano.prestador_nome,
      custo_estimado: decodedPlano.custo_estimado, gerar_os_automatica: decodedPlano.gerar_os_automatica,
      dias_antecedencia: decodedPlano.dias_antecedencia, ativo: decodedPlano.ativo,
      execucoes_total: decodedPlano.execucoes_total, di_gerado: decodedPlano.di_gerado,
    });
    await supabase.from("planos_manutencao").update(updateBody).eq("id", id);
    res.json({ ok: true, os });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/di   body: { condominio_id? }
// Di — Síndica Virtual executiva com cards inteligentes acionáveis
// 4 tipos: critico | atencao | info | insight
// ─────────────────────────────────────────────────────────────────────────────

type DiCardType = "critico" | "atencao" | "info" | "insight";
interface DiSmartCard {
  tipo: DiCardType;
  titulo: string;
  mensagem: string;
  acao: string;
  badge?: string;
}

// Gerador determinístico de cards a partir dos dados reais
function gerarCardsInteligentes(d: {
  aguaSensores: { nome: string; nivel: number | null; status: string }[];
  nivelMedioAgua: number | null;
  saldo: number;
  txInad: number;
  totalRec: number;
  totalDesp: number;
  osTotal: number;
  osUrgentes: number;
  osAbertas: { titulo: string; prioridade: string }[];
  condNome: string;
}): DiSmartCard[] {
  const cards: DiSmartCard[] = [];

  // ── 🚨 ÁGUA CRÍTICA (< 25%) ────────────────────────────────────────────────
  const sensoresCriticos = d.aguaSensores.filter(s => s.nivel != null && s.nivel < 25);
  const sensoresAtencao  = d.aguaSensores.filter(s => s.nivel != null && s.nivel >= 25 && s.nivel < 50);
  const sensoresOffline  = d.aguaSensores.filter(s => s.status === "offline" || s.status === "critical" || s.status === "error");

  if (sensoresCriticos.length > 0) {
    cards.push({
      tipo: "critico",
      titulo: "💧 Água Crítica",
      mensagem: `${sensoresCriticos.map(s => `${s.nome}: ${s.nivel}%`).join(", ")}. Risco iminente de desabastecimento.`,
      acao: "Acionar manutenção imediata e alertar moradores",
      badge: `${sensoresCriticos.length} reservatório${sensoresCriticos.length > 1 ? "s" : ""}`,
    });
  } else if (sensoresAtencao.length > 0) {
    cards.push({
      tipo: "atencao",
      titulo: "💧 Nível de Água Baixo",
      mensagem: `${sensoresAtencao.map(s => `${s.nome}: ${s.nivel}%`).join(", ")}. Monitorar reposição.`,
      acao: "Verificar programação do sistema de reposição",
      badge: `${sensoresAtencao.length} alerta${sensoresAtencao.length > 1 ? "s" : ""}`,
    });
  } else if (d.aguaSensores.length > 0 && d.nivelMedioAgua != null) {
    cards.push({
      tipo: "info",
      titulo: "💧 Água Normal",
      mensagem: `Nível médio em ${d.nivelMedioAgua}%. Todos os reservatórios dentro do padrão operacional.`,
      acao: "Continuar monitoramento automático",
    });
  }

  // ── 🔌 SENSORES OFFLINE ─────────────────────────────────────────────────────
  if (sensoresOffline.length > 0) {
    cards.push({
      tipo: "critico",
      titulo: "🔌 Sensor Offline",
      mensagem: `${sensoresOffline.map(s => s.nome).join(", ")} sem comunicação. Leitura de nível comprometida.`,
      acao: "Verificar conectividade e bateria do sensor IoT",
      badge: "IoT",
    });
  }

  // ── 🚨 OS URGENTES ──────────────────────────────────────────────────────────
  if (d.osUrgentes > 0) {
    const urgTitles = d.osAbertas.filter(o => o.prioridade === "urgente" || o.prioridade === "alta").slice(0, 2).map(o => o.titulo).join(", ");
    cards.push({
      tipo: "critico",
      titulo: "🔧 OSs Urgentes",
      mensagem: `${d.osUrgentes} ordem${d.osUrgentes > 1 ? "ns" : ""} urgente${d.osUrgentes > 1 ? "s" : ""}: ${urgTitles || "aguardando triagem"}.`,
      acao: "Atribuir responsável e iniciar atendimento imediato",
      badge: `${d.osUrgentes} urgente${d.osUrgentes > 1 ? "s" : ""}`,
    });
  } else if (d.osTotal > 3) {
    cards.push({
      tipo: "atencao",
      titulo: "🔧 Backlog de OSs",
      mensagem: `${d.osTotal} ordens de serviço abertas. Backlog acima do ideal para o porte do condomínio.`,
      acao: "Priorizar e distribuir para equipe de manutenção",
      badge: `${d.osTotal} abertas`,
    });
  } else if (d.osTotal > 0) {
    cards.push({
      tipo: "info",
      titulo: "🔧 Manutenção",
      mensagem: `${d.osTotal} OS${d.osTotal > 1 ? "s" : ""} em andamento, sem urgências. Operação dentro do normal.`,
      acao: "Acompanhar evolução no painel de OSs",
    });
  } else {
    cards.push({
      tipo: "info",
      titulo: "🔧 Manutenção OK",
      mensagem: "Nenhuma ordem de serviço aberta. Estrutura do condomínio em dia.",
      acao: "Registrar próxima preventiva no calendário",
    });
  }

  // ── 💰 FINANCEIRO ───────────────────────────────────────────────────────────
  if (d.txInad > 20) {
    cards.push({
      tipo: "critico",
      titulo: "💰 Inadimplência Alta",
      mensagem: `Taxa de ${d.txInad}% representa risco ao fluxo de caixa. Saldo atual: R$ ${d.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
      acao: "Enviar comunicados e acionar cobrança amigável",
      badge: `${d.txInad}% inad.`,
    });
  } else if (d.txInad > 10) {
    cards.push({
      tipo: "atencao",
      titulo: "💰 Inadimplência Moderada",
      mensagem: `${d.txInad}% de inadimplência. Saldo R$ ${d.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Monitorar evolução.`,
      acao: "Emitir boletos e enviar lembretes automáticos",
      badge: `${d.txInad}%`,
    });
  } else if (d.saldo < 0) {
    cards.push({
      tipo: "critico",
      titulo: "💸 Saldo Negativo",
      mensagem: `Saldo em R$ ${d.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Despesas (R$ ${d.totalDesp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) superam receitas.`,
      acao: "Renegociar contratos e revisar orçamento urgente",
      badge: "Saldo negativo",
    });
  } else {
    cards.push({
      tipo: "info",
      titulo: "💰 Financeiro Saudável",
      mensagem: `Saldo positivo de R$ ${d.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Inadimplência em ${d.txInad}%.`,
      acao: "Manter reserva de emergência atualizada",
    });
  }

  // ── 🧠 INSIGHT DA DI (sempre presente) ────────────────────────────────────
  const totalProblemas = sensoresCriticos.length + (d.osUrgentes > 0 ? 1 : 0) + (d.txInad > 20 ? 1 : 0);
  if (totalProblemas >= 2) {
    cards.push({
      tipo: "insight",
      titulo: "🧠 Análise de Risco",
      mensagem: `Detectei ${totalProblemas} indicadores críticos simultâneos. Recomendo reunião emergencial com síndico e equipe de manutenção.`,
      acao: "Agendar reunião de crise nas próximas 24h",
      badge: "Risco elevado",
    });
  } else if (d.aguaSensores.length === 0) {
    cards.push({
      tipo: "insight",
      titulo: "🧠 IoT não configurado",
      mensagem: "Nenhum sensor de água conectado. O monitoramento em tempo real não está ativo para este condomínio.",
      acao: "Cadastrar reservatórios e sensores IoT no módulo Água",
      badge: "Oportunidade",
    });
  } else {
    cards.push({
      tipo: "insight",
      titulo: "🧠 Insight da Di",
      mensagem: `Padrão operacional estável em ${d.condNome}. Boa gestão preventiva evita 73% das emergências condominiais.`,
      acao: "Agendar próxima vistoria preventiva",
      badge: "Estável",
    });
  }

  return cards;
}

// Gera o resumo executivo (fala da Di) com base nos cards
function gerarResumoExecutivo(cards: DiSmartCard[], condNome: string): string {
  const criticos = cards.filter(c => c.tipo === "critico");
  const atencoes = cards.filter(c => c.tipo === "atencao");

  if (criticos.length > 0) {
    return `Oi! Analisei o ${condNome} e encontrei ${criticos.length} situação${criticos.length > 1 ? "ões críticas" : " crítica"} que exige${criticos.length > 1 ? "m" : ""} ação imediata. ${criticos[0].mensagem.split(".")[0]}. Confira os cards abaixo!`;
  }
  if (atencoes.length > 0) {
    return `Olá! O ${condNome} está operacional, mas há ${atencoes.length} ponto${atencoes.length > 1 ? "s" : ""} de atenção que ${atencoes.length > 1 ? "precisam" : "precisa"} de acompanhamento. ${atencoes[0].mensagem.split(".")[0]}. Veja os detalhes nos cards!`;
  }
  return `Oi! Boa notícia: o ${condNome} está com todos os sistemas dentro do normal. Nível de água, financeiro e manutenção estão OK. Continue assim!`;
}

router.post("/di", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.body as { condominio_id?: string };

    // ── Coletar dados reais do condomínio ──────────────────────────────────
    const [
      { data: cond },
      { data: reservoirRows },
      { data: sensoreRows },
      { data: osAbertas },
      { data: lancamentos },
    ] = await Promise.all([
      condominio_id
        ? supabase.from("condominios").select("*").eq("id", condominio_id).single()
        : supabase.from("condominios").select("*").limit(1).single(),
      condominio_id
        ? supabase.from("reservoirs").select("iot_sensor_id,name,iot_last_reading,capacity_liters,iot_status").eq("condominio_id", condominio_id).limit(20)
        : supabase.from("reservoirs").select("iot_sensor_id,name,iot_last_reading,capacity_liters,iot_status").limit(20),
      condominio_id
        ? supabase.from("sensores").select("nome,local,nivel_atual,capacidade_litros,volume_litros").eq("condominio_id", condominio_id).limit(20)
        : supabase.from("sensores").select("nome,local,nivel_atual,capacidade_litros,volume_litros").limit(20),
      condominio_id
        ? supabase.from("ordens_servico").select("titulo,prioridade,status").in("status", ["aberta","em_andamento"]).eq("condominio_id", condominio_id).limit(20)
        : supabase.from("ordens_servico").select("titulo,prioridade,status").in("status", ["aberta","em_andamento"]).limit(20),
      condominio_id
        ? supabase.from("lancamentos").select("tipo,valor,status").eq("condominio_id", condominio_id)
        : supabase.from("lancamentos").select("tipo,valor,status"),
    ]);

    // ── Consolidar sensores de água ────────────────────────────────────────
    type SensorSummary = { nome: string; nivel: number | null; status: string };
    const aguaSensores: SensorSummary[] = [];

    if (reservoirRows?.length) {
      for (const r of reservoirRows) {
        aguaSensores.push({
          nome: r.name || r.iot_sensor_id,
          nivel: r.iot_last_reading != null ? Number(r.iot_last_reading) : null,
          status: r.iot_status || "unknown",
        });
      }
    }
    if (!aguaSensores.length && sensoreRows?.length) {
      for (const s of sensoreRows) {
        aguaSensores.push({
          nome: s.nome || s.local,
          nivel: s.nivel_atual != null ? Number(s.nivel_atual) : null,
          status: s.nivel_atual < 25 ? "critical" : s.nivel_atual < 60 ? "warning" : "online",
        });
      }
    }

    // ── Calcular indicadores financeiros ──────────────────────────────────
    const totalRec  = (lancamentos || []).filter(l => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0);
    const totalDesp = (lancamentos || []).filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0);
    const saldo = totalRec - totalDesp;
    const inadimplentes = (lancamentos || []).filter(l => l.tipo === "receita" && l.status === "atrasado").length;
    const totalRecCount = (lancamentos || []).filter(l => l.tipo === "receita").length;
    const txInad = totalRecCount > 0 ? Math.round((inadimplentes / totalRecCount) * 100) : 0;

    // ── OS urgentes ────────────────────────────────────────────────────────
    const osUrgentes = (osAbertas || []).filter(o => o.prioridade === "urgente" || o.prioridade === "alta");
    const niveisConhecidos = aguaSensores.filter(s => s.nivel != null);
    const nivelMedioAgua   = niveisConhecidos.length
      ? Math.round(niveisConhecidos.reduce((s, r) => s + (r.nivel ?? 0), 0) / niveisConhecidos.length)
      : null;

    const condNome = cond?.nome || "ImobCore";

    // ── Gerar cards inteligentes (determinístico) ─────────────────────────
    const cardsBase = gerarCardsInteligentes({
      aguaSensores, nivelMedioAgua, saldo, txInad, totalRec, totalDesp,
      osTotal: (osAbertas || []).length, osUrgentes: osUrgentes.length,
      osAbertas: (osAbertas || []) as { titulo: string; prioridade: string }[],
      condNome,
    });

    // ── Enriquecer com Claude (gera fala personalizada + pode adicionar cards extra) ──
    let fala = gerarResumoExecutivo(cardsBase, condNome);
    let cards: DiSmartCard[] = cardsBase;

    try {
      const criticos  = cardsBase.filter(c => c.tipo === "critico").length;
      const atencoes  = cardsBase.filter(c => c.tipo === "atencao").length;

      // Carregar nome, tom e status da Di configurados pelo Master
      let diNomeBriefing = "Di";
      let diSystemBriefing = "Você é Di, a Síndica Virtual do ImobCore. Personalidade: direta e empática, próxima sem ser informal. Português brasileiro com emojis moderados.";
      let diAtivaBriefing = true;
      try {
        const diCtxBriefing = await carregarContextoDi(
          condominio_id || cond?.id || "",
          { condNome, saldo, inadPct: txInad, osAbertas: (osAbertas||[]).length, osUrgentes: osUrgentes.length, nivelAgua: nivelMedioAgua },
          "gestor"
        );
        diNomeBriefing = diCtxBriefing.nomeDi;
        diSystemBriefing = diCtxBriefing.systemPrompt;
        diAtivaBriefing = diCtxBriefing.diAtiva;
      } catch { /* usa fallback */ }

      // Se Di estiver desativada pelo Master, retornar briefing vazio sem chamar Claude
      if (!diAtivaBriefing) {
        return res.json({
          fala: `${diNomeBriefing} está desativada para este condomínio. Ative-a nas configurações do Master.`,
          cards: cardsBase,
          nome_di: diNomeBriefing,
          di_ativa: false,
          dados: { nivelMedioAgua, saldo, txInad, osTotal: (osAbertas || []).length, osUrgentes: osUrgentes.length },
        });
      }

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 700,
        system: diSystemBriefing,
        messages: [{
          role: "user",
          content: `SITUAÇÃO ATUAL de "${condNome}":
- Água: nível médio ${nivelMedioAgua != null ? nivelMedioAgua + "%" : "desconhecido"} | ${aguaSensores.length} sensor(es)
- Financeiro: saldo R$ ${saldo.toFixed(2)} | inadimplência ${txInad}%
- Manutenção: ${(osAbertas||[]).length} OSs abertas, ${osUrgentes.length} urgentes
- Alertas: ${criticos} crítico(s), ${atencoes} atenção

Como ${diNomeBriefing}, gere SOMENTE a sua "fala" de briefing (máximo 2 frases naturais, direto ao ponto).
Responda com JSON: { "fala": "..." }
Sem markdown, sem explicação.`,
        }],
      });
      const raw = (completion.content[0] as { type: string; text: string }).text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.fala) fala = parsed.fala;
      }
    } catch {
      // Mantém fala determinística gerada acima
    }

    return res.json({
      fala,
      cards,
      nome_di: diNomeBriefing,
      di_ativa: true,
      dados: { nivelMedioAgua, saldo, txInad, osTotal: (osAbertas || []).length, osUrgentes: osUrgentes.length },
    });

  } catch (err) {
    console.error("[di] erro:", err);
    res.status(500).json({ error: "Erro interno da Di" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES MULTICANAL — Telegram | WhatsApp | Expo Push
// Tabelas: notificacoes_config (config por condo) + notificacoes_log (histórico)
// ─────────────────────────────────────────────────────────────────────────────

interface NotifConfig {
  telegram_ativo: boolean;
  telegram_token: string;
  telegram_chat_id: string;
  whatsapp_ativo: boolean;
  whatsapp_token: string;
  whatsapp_phone_id: string;
  whatsapp_numero: string;
  push_ativo: boolean;
  push_token: string;
}

interface NotifCard {
  tipo: "critico" | "atencao" | "info" | "insight";
  titulo: string;
  mensagem: string;
  acao: string;
  badge?: string;
}

function montarMensagem(card: NotifCard): string {
  const icon = { critico: "🚨", atencao: "⚠️", info: "📊", insight: "🧠" }[card.tipo] || "📩";
  return `${icon} *Di — ImobCore*\n\n*${card.titulo}*\n${card.mensagem}\n\n👉 _Ação: ${card.acao}_`;
}

function montarMensagemTexto(card: NotifCard): string {
  const icon = { critico: "🚨", atencao: "⚠️", info: "📊", insight: "🧠" }[card.tipo] || "📩";
  return `${icon} Di — ImobCore\n\n${card.titulo}\n${card.mensagem}\n\n👉 Ação: ${card.acao}`;
}

// Canais por tipo de card
function canaisPorTipo(tipo: string): ("telegram" | "whatsapp" | "push")[] {
  if (tipo === "critico")  return ["telegram", "whatsapp", "push"];
  if (tipo === "atencao")  return ["telegram", "push"];
  if (tipo === "info")     return ["push"];
  if (tipo === "insight")  return ["push"];
  return ["push"];
}

// ── Senders ───────────────────────────────────────────────────────────────────
async function enviarTelegram(token: string, chatId: string, msg: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
    });
    const json = await r.json() as { ok: boolean; description?: string };
    return json.ok ? { ok: true } : { ok: false, error: json.description || "Telegram error" };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

async function enviarWhatsApp(token: string, phoneId: string, numero: string, msg: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "text", text: { body: msg } }),
    });
    const json = await r.json() as { messages?: unknown[]; error?: { message: string } };
    return json.messages ? { ok: true } : { ok: false, error: json.error?.message || "WhatsApp error" };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

async function enviarPush(pushToken: string, titulo: string, msg: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: pushToken, sound: "default", title: titulo, body: msg }),
    });
    const json = await r.json() as { data?: { status: string; message?: string } };
    const status = json.data?.status;
    return status === "ok" ? { ok: true } : { ok: false, error: json.data?.message || "Push error" };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

// ── Salvar log de notificação ──────────────────────────────────────────────────
async function salvarLogNotif(condId: string, card: NotifCard, canal: string, status: string, erro?: string) {
  try {
    await supabase.from("notificacoes_log").insert({
      condominio_id: condId,
      tipo_card: card.tipo,
      titulo: card.titulo,
      mensagem: card.mensagem,
      canal,
      status,
      erro: erro || null,
      created_at: new Date().toISOString(),
    });
  } catch { /* tabela pode não existir ainda */ }
}

// GET /api/notificacoes/config?condominio_id=X
router.get("/notificacoes/config", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data } = await supabase
      .from("notificacoes_config")
      .select("*")
      .eq("condominio_id", condId)
      .maybeSingle();
    return res.json({ config: data || null });
  } catch {
    return res.json({ config: null });
  }
});

// POST /api/notificacoes/config
router.post("/notificacoes/config", async (req: Request, res: Response) => {
  const { condominio_id, ...config } = req.body as { condominio_id: string } & NotifConfig;
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data: existing } = await supabase
      .from("notificacoes_config")
      .select("id")
      .eq("condominio_id", condominio_id)
      .maybeSingle();
    if (existing) {
      await supabase.from("notificacoes_config").update({ ...config, updated_at: new Date().toISOString() }).eq("condominio_id", condominio_id);
    } else {
      await supabase.from("notificacoes_config").insert({ condominio_id, ...config, created_at: new Date().toISOString() });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/notificacoes/disparar   — roda Di + envia notificações pelos canais configurados
router.post("/notificacoes/disparar", async (req: Request, res: Response) => {
  const { condominio_id } = req.body as { condominio_id?: string };
  if (!condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });

  try {
    // Busca config de canais
    const { data: cfgRow } = await supabase.from("notificacoes_config").select("*").eq("condominio_id", condominio_id).maybeSingle();
    const cfg = cfgRow as NotifConfig | null;
    if (!cfg) return res.status(400).json({ error: "Nenhum canal configurado. Configure os canais primeiro." });

    // Gera cards via Di (reutiliza lógica do /api/di)
    const diResp = await fetch(`http://localhost:${process.env.PORT || 8080}/api/notificacoes/_gerar_cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ condominio_id }),
    });
    const { cards } = await diResp.json() as { cards: NotifCard[] };

    const resultado: { canal: string; card: string; status: string; erro?: string }[] = [];
    const cardsParaEnviar = cards.filter(c => c.tipo === "critico" || c.tipo === "atencao");

    if (cardsParaEnviar.length === 0) {
      return res.json({ ok: true, enviados: 0, resultado: [], mensagem: "Nenhum alerta crítico ou de atenção para disparar." });
    }

    for (const card of cardsParaEnviar) {
      const canais = canaisPorTipo(card.tipo);
      const msgMd   = montarMensagem(card);
      const msgText = montarMensagemTexto(card);

      for (const canal of canais) {
        if (canal === "telegram" && cfg.telegram_ativo && cfg.telegram_token && cfg.telegram_chat_id) {
          const r = await enviarTelegram(cfg.telegram_token, cfg.telegram_chat_id, msgMd);
          await salvarLogNotif(condominio_id, card, "telegram", r.ok ? "enviado" : "erro", r.error);
          resultado.push({ canal: "telegram", card: card.titulo, status: r.ok ? "enviado" : "erro", erro: r.error });
        }
        if (canal === "whatsapp" && cfg.whatsapp_ativo && cfg.whatsapp_token && cfg.whatsapp_phone_id && cfg.whatsapp_numero) {
          const r = await enviarWhatsApp(cfg.whatsapp_token, cfg.whatsapp_phone_id, cfg.whatsapp_numero, msgText);
          await salvarLogNotif(condominio_id, card, "whatsapp", r.ok ? "enviado" : "erro", r.error);
          resultado.push({ canal: "whatsapp", card: card.titulo, status: r.ok ? "enviado" : "erro", erro: r.error });
        }
        if (canal === "push" && cfg.push_ativo && cfg.push_token) {
          const r = await enviarPush(cfg.push_token, card.titulo, msgText);
          await salvarLogNotif(condominio_id, card, "push", r.ok ? "enviado" : "erro", r.error);
          resultado.push({ canal: "push", card: card.titulo, status: r.ok ? "enviado" : "erro", erro: r.error });
        }
      }
    }

    return res.json({ ok: true, enviados: resultado.length, resultado });
  } catch (err) {
    console.error("[notificacoes/disparar]", err);
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/notificacoes/_gerar_cards (interno — gera cards da Di sem Claude)
router.post("/notificacoes/_gerar_cards", async (req: Request, res: Response) => {
  const { condominio_id } = req.body as { condominio_id?: string };
  try {
    const [
      { data: reservoirRows },
      { data: osAbertas },
      { data: lancamentos },
    ] = await Promise.all([
      supabase.from("reservoirs").select("name,iot_sensor_id,iot_last_reading,iot_status").limit(20),
      condominio_id
        ? supabase.from("ordens_servico").select("titulo,prioridade").in("status", ["aberta","em_andamento"]).eq("condominio_id", condominio_id).limit(20)
        : supabase.from("ordens_servico").select("titulo,prioridade").in("status", ["aberta","em_andamento"]).limit(20),
      condominio_id
        ? supabase.from("lancamentos").select("tipo,valor,status").eq("condominio_id", condominio_id)
        : supabase.from("lancamentos").select("tipo,valor,status"),
    ]);

    type SensorSummary = { nome: string; nivel: number | null; status: string };
    const aguaSensores: SensorSummary[] = (reservoirRows || []).map(r => ({
      nome: r.name || r.iot_sensor_id,
      nivel: r.iot_last_reading != null ? Number(r.iot_last_reading) : null,
      status: r.iot_status || "unknown",
    }));

    const totalRec  = (lancamentos || []).filter(l => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0);
    const totalDesp = (lancamentos || []).filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0);
    const saldo = totalRec - totalDesp;
    const inadimplentes = (lancamentos || []).filter(l => l.tipo === "receita" && l.status === "atrasado").length;
    const totalRecCount = (lancamentos || []).filter(l => l.tipo === "receita").length;
    const txInad = totalRecCount > 0 ? Math.round((inadimplentes / totalRecCount) * 100) : 0;
    const osUrgentes = (osAbertas || []).filter(o => o.prioridade === "urgente" || o.prioridade === "alta");
    const niveisConhecidos = aguaSensores.filter(s => s.nivel != null);
    const nivelMedioAgua   = niveisConhecidos.length
      ? Math.round(niveisConhecidos.reduce((s, r) => s + (r.nivel ?? 0), 0) / niveisConhecidos.length)
      : null;

    const cards = gerarCardsInteligentes({
      aguaSensores, nivelMedioAgua, saldo, txInad, totalRec, totalDesp,
      osTotal: (osAbertas || []).length, osUrgentes: osUrgentes.length,
      osAbertas: (osAbertas || []) as { titulo: string; prioridade: string }[],
      condNome: "ImobCore",
    });

    return res.json({ cards });
  } catch (err) {
    return res.status(500).json({ error: String(err), cards: [] });
  }
});

// POST /api/notificacoes/teste  — envia mensagem de teste em um canal específico
router.post("/notificacoes/teste", async (req: Request, res: Response) => {
  const { canal, telegram_token, telegram_chat_id, whatsapp_token, whatsapp_phone_id, whatsapp_numero, push_token } = req.body as {
    canal: string;
    telegram_token?: string; telegram_chat_id?: string;
    whatsapp_token?: string; whatsapp_phone_id?: string; whatsapp_numero?: string;
    push_token?: string;
  };

  const cardTeste: NotifCard = {
    tipo: "info",
    titulo: "✅ Teste de Conexão",
    mensagem: "Este é um teste do sistema de notificações ImobCore. Tudo funcionando!",
    acao: "Nenhuma ação necessária — apenas confirmação de conectividade.",
  };
  const msgMd   = montarMensagem(cardTeste);
  const msgText = montarMensagemTexto(cardTeste);

  try {
    let result: { ok: boolean; error?: string };
    if (canal === "telegram") {
      if (!telegram_token || !telegram_chat_id) return res.status(400).json({ error: "token e chat_id obrigatórios" });
      result = await enviarTelegram(telegram_token, telegram_chat_id, msgMd);
    } else if (canal === "whatsapp") {
      if (!whatsapp_token || !whatsapp_phone_id || !whatsapp_numero) return res.status(400).json({ error: "token, phone_id e número obrigatórios" });
      result = await enviarWhatsApp(whatsapp_token, whatsapp_phone_id, whatsapp_numero, msgText);
    } else if (canal === "push") {
      if (!push_token) return res.status(400).json({ error: "push_token obrigatório" });
      result = await enviarPush(push_token, cardTeste.titulo, msgText);
    } else {
      return res.status(400).json({ error: "canal inválido" });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/notificacoes/historico?condominio_id=X
router.get("/notificacoes/historico", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  try {
    const { data } = await supabase
      .from("notificacoes_log")
      .select("*")
      .eq("condominio_id", condId)
      .order("created_at", { ascending: false })
      .limit(50);
    return res.json({ historico: data || [] });
  } catch {
    return res.json({ historico: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Placa Solar — CRUD (tabela: placa_solar)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/placa-solar?condominio_id=xxx
router.get("/placa-solar", async (req: Request, res: Response) => {
  const condId = String(req.query.condominio_id || "");
  if (!condId) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase
    .from("placa_solar")
    .select("*")
    .eq("condominio_id", condId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Se tabela não existe ainda, retorna null sem 500
  if (error) {
    const isTableMissing = (error.message || "").includes("Could not find") || (error.message || "").includes("schema cache") || error.code === "PGRST200";
    if (isTableMissing) return res.json({ data: null });
    return res.status(500).json({ error: error.message });
  }
  res.json({ data: data || null });
});

// POST /api/placa-solar
router.post("/placa-solar", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.condominio_id) return res.status(400).json({ error: "condominio_id obrigatório" });
  const { data, error } = await supabase
    .from("placa_solar")
    .insert({ ...body, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// PUT /api/placa-solar/:id
router.put("/placa-solar/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { id: _id, created_at: _ca, condominio_id: _cid, ...body } = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("placa_solar")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// DELETE /api/placa-solar/:id
router.delete("/placa-solar/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("placa_solar").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN GLOBAL
// ── LOGIN DE USUÁRIOS ─────────────────────────────────────────────────────────

// POST /api/login — autentica gestor / síndico / morador / zelador
// Verifica: usuário existe, está ativo, condomínio ativo, senha (quando definida)
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, senha, perfil } = req.body as { email?: string; senha?: string; perfil?: string };
    if (!email?.trim()) {
      return res.status(400).json({ error: "E-mail obrigatório" });
    }

    let q = supabase
      .from("usuarios")
      .select("id, nome, email, perfil, condominio_id, unidade_id, ativo, senha_hash")
      .eq("email", email.trim().toLowerCase());
    if (perfil) q = q.eq("perfil", perfil);

    const { data: users, error } = await q;
    if (error) throw error;

    if (!users || users.length === 0) {
      return res.status(403).json({
        error: "Usuário não encontrado. Verifique o e-mail informado.",
        code: "USER_NOT_FOUND",
      });
    }

    const user = users[0] as Record<string, unknown>;

    // Bloqueia usuário inativo
    if (user.ativo === false) {
      return res.status(403).json({
        error: "Usuário inativo. Contate o administrador do condomínio.",
        code: "USER_INACTIVE",
      });
    }

    // Verifica senha quando estiver definida
    if (user.senha_hash) {
      if (!senha?.trim()) {
        return res.status(401).json({
          error: "Senha obrigatória para este usuário.",
          code: "PASSWORD_REQUIRED",
        });
      }
      const senhaOk = await bcrypt.compare(senha.trim(), user.senha_hash as string);
      if (!senhaOk) {
        return res.status(401).json({
          error: "Senha incorreta. Tente novamente.",
          code: "WRONG_PASSWORD",
        });
      }
    }

    // Valida condomínio
    if (user.condominio_id) {
      const { data: condo } = await supabase
        .from("condominios")
        .select("id, ativo, nome")
        .eq("id", user.condominio_id as string)
        .single();
      if (!condo) {
        return res.status(403).json({
          error: "Condomínio não encontrado.",
          code: "CONDO_NOT_FOUND",
        });
      }
      if ((condo as Record<string, unknown>).ativo === false) {
        return res.status(403).json({
          error: "Condomínio inativo. Contate o administrador.",
          code: "CONDO_INACTIVE",
        });
      }
    }

    // Atualiza último login
    await supabase
      .from("usuarios")
      .update({ ultimo_login: new Date().toISOString() })
      .eq("id", user.id as string);

    res.json({
      ok:            true,
      id:            user.id,
      nome:          user.nome,
      email:         user.email,
      perfil:        user.perfil,
      condominio_id: user.condominio_id,
      unidade_id:    user.unidade_id || null,
      tem_senha:     !!user.senha_hash,
    });
  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ error: "Erro ao autenticar. Tente novamente." });
  }
});

// ══════════════════════════════════════════════════════════════════════════════

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "imobcore-admin-2026";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@imobcore.com";
const ADMIN_PASS  = process.env.ADMIN_PASS  || "ImobCore@Admin2026";

// Middleware: valida token no header X-Admin-Token
const checkAdminGlobal = (req: Request, res: Response, next: () => void) => {
  const token = req.headers["x-admin-token"];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Acesso negado — apenas admin_global" });
  }
  next();
};

// POST /api/admin/login  — autentica admin global
router.post("/admin/login", (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (email?.trim() === ADMIN_EMAIL && password === ADMIN_PASS) {
    return res.json({ ok: true, token: ADMIN_TOKEN, role: "admin_global" });
  }
  return res.status(401).json({ error: "Credenciais inválidas" });
});

// GET /api/admin/dashboard  — métricas globais
router.get("/admin/dashboard", checkAdminGlobal, async (_req: Request, res: Response) => {
  try {
    const [
      { data: condos, error: e1 },
      { data: lancamentos, error: e2 },
      { data: osRows, error: e3 },
      { data: moradores, error: e4 },
    ] = await Promise.all([
      supabase.from("condominios").select("id, nome, plano, status, created_at, total_unidades, cidade, estado"),
      supabase.from("lancamentos").select("tipo, valor, condominio_id"),
      supabase.from("ordens_servico").select("status, condominio_id"),
      supabase.from("moradores").select("id, condominio_id"),
    ]);

    if (e1) return res.status(500).json({ error: e1.message });

    const totalCondos   = condos?.length ?? 0;
    const totalMoradores= moradores?.length ?? 0;
    const osAbertas     = osRows?.filter(o => o.status === "aberta" || o.status === "em_andamento").length ?? 0;
    const osConcluidas  = osRows?.filter(o => o.status === "concluida").length ?? 0;

    // inadimplência média por condomínio
    let somaInad = 0;
    let condosComDados = 0;
    if (lancamentos && condos) {
      for (const c of condos) {
        const lan = lancamentos.filter(l => l.condominio_id === c.id);
        const totalRec = lan.filter(l => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0);
        const totalDesp = lan.filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0);
        if (totalRec > 0) { somaInad += Math.max(0, (totalDesp / totalRec) * 100); condosComDados++; }
      }
    }
    const inadMedia = condosComDados > 0 ? (somaInad / condosComDados).toFixed(1) : "0.0";

    const planoCounts = { free: 0, pro: 0, enterprise: 0 };
    for (const c of condos ?? []) {
      const p = (c.plano || "free").toLowerCase() as "free" | "pro" | "enterprise";
      if (p in planoCounts) planoCounts[p]++;
    }

    res.json({
      totalCondos, totalMoradores, osAbertas, osConcluidas,
      inadMedia, planoCounts,
      condosAtivos:    condos?.filter(c => c.status !== "suspenso").length ?? 0,
      condosSuspensos: condos?.filter(c => c.status === "suspenso").length ?? 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/admin/condominios  — lista todos os condomínios
router.get("/admin/condominios", checkAdminGlobal, async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("condominios")
    .select("id, nome, plano, ativo, created_at, total_unidades, cidade, endereco")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  // Mapear ativo (boolean) → status (string) para compatibilidade com o frontend
  const mapped = (data || []).map(c => ({ ...c, status: c.ativo === false ? "suspenso" : "ativo" }));
  // Fallback para dados demo se banco vazio
  const DEMO = [
    { id:"00000000-0000-0000-0000-000000000001", nome:"Copacabana Beach Residence", plano:"pro",        ativo:true, status:"ativo", created_at:new Date().toISOString(), total_unidades:94,  cidade:"Rio de Janeiro / RJ" },
    { id:"00000000-0000-0000-0000-000000000002", nome:"Villa Serena",               plano:"starter",    ativo:true, status:"ativo", created_at:new Date().toISOString(), total_unidades:38,  cidade:"Florianópolis / SC" },
    { id:"00000000-0000-0000-0000-000000000003", nome:"Jardim Atlântico",            plano:"pro",        ativo:true, status:"ativo", created_at:new Date().toISOString(), total_unidades:72,  cidade:"Niterói / RJ"       },
    { id:"00000000-0000-0000-0000-000000000004", nome:"Edifício Aurora",             plano:"enterprise", ativo:true, status:"ativo", created_at:new Date().toISOString(), total_unidades:120, cidade:"São Paulo / SP"      },
  ];
  res.json({ data: mapped.length > 0 ? mapped : DEMO });
});

// PATCH /api/admin/condominio/:id  — atualiza campos do condomínio (plano, status, nome, cidade, unidades...)
router.patch("/admin/condominio/:id", checkAdminGlobal, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { plano, status, nome, cidade, estado, total_unidades, total_moradores, endereco } =
    req.body as { plano?: string; status?: string; nome?: string; cidade?: string; estado?: string; total_unidades?: number; total_moradores?: number; endereco?: string };
  const updates: Record<string, unknown> = {};
  if (plano           !== undefined) updates.plano           = plano;
  if (nome            !== undefined) updates.nome            = nome;
  if (endereco        !== undefined) updates.endereco        = endereco;
  if (total_unidades  !== undefined) updates.total_unidades  = Number(total_unidades);
  if (total_moradores !== undefined) updates.total_moradores = Number(total_moradores);
  // Cidade e estado combinados em um único campo
  if (cidade !== undefined || estado !== undefined) {
    const cidadeAtual = cidade ?? "";
    const estadoAtual = estado ?? "";
    updates.cidade = estadoAtual ? `${cidadeAtual} / ${estadoAtual}` : cidadeAtual;
  }
  // "status" do frontend ("suspenso"/"ativo") → "ativo" boolean no banco
  if (status !== undefined) updates.ativo = status !== "suspenso";
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nenhum campo enviado" });
  const { data, error } = await supabase.from("condominios").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// GET /api/admin/usuarios?condominio_id=X&perfil=X&status=X
// Lista usuários de todos (ou de um) condomínio(s), com nome do condomínio embutido
router.get("/admin/usuarios", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { condominio_id, perfil, status } = req.query as Record<string, string | undefined>;
    let q = supabase
      .from("usuarios")
      .select("id, nome, email, perfil, unidade_id, ativo, ultimo_login, created_at, condominio_id, condominios(nome)")
      .order("nome", { ascending: true });
    if (condominio_id) q = q.eq("condominio_id", condominio_id);
    if (perfil && perfil !== "todos") q = q.eq("perfil", perfil);
    if (status === "ativo")   q = q.eq("ativo", true);
    if (status === "inativo") q = q.eq("ativo", false);
    const { data, error } = await q;
    if (error) throw error;
    const normalized = (data || []).map((r: Record<string, unknown>) => ({
      id:               r.id,
      condominio_id:    r.condominio_id,
      condominio_nome:  (r.condominios as { nome?: string } | null)?.nome || "—",
      nome:             r.nome,
      email:            r.email,
      perfil:           r.perfil,
      unidade:          r.unidade_id || null,
      status:           r.ativo === false ? "inativo" : "ativo",
      ultimo_acesso:    r.ultimo_login || null,
      created_at:       r.created_at,
    }));
    res.json({ data: normalized });
  } catch (err) {
    console.error("GET /admin/usuarios error:", err);
    res.status(500).json({ error: "Erro ao listar usuários" });
  }
});

// POST /api/admin/usuarios — cria usuário vinculado a um condomínio
router.post("/admin/usuarios", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { condominio_id, nome, email, perfil, unidade, status } = req.body as {
      condominio_id: string; nome: string; email: string;
      perfil: "gestor" | "sindico" | "morador" | "zelador";
      unidade?: string; status?: string;
    };
    if (!condominio_id || !nome?.trim() || !email?.trim() || !perfil) {
      return res.status(400).json({ error: "condominio_id, nome, email e perfil são obrigatórios" });
    }
    const { data, error } = await supabase.from("usuarios").insert({
      condominio_id,
      nome:       nome.trim(),
      email:      email.trim().toLowerCase(),
      perfil,
      unidade_id: unidade || null,
      ativo:      status !== "inativo",
      senha_hash: null,
    }).select("id, nome, email, perfil, unidade_id, ativo, condominio_id, created_at").single();
    if (error) throw error;
    res.status(201).json({ ok: true, data: normUsuario(data as Record<string, unknown>) });
  } catch (err) {
    console.error("POST /admin/usuarios error:", err);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// PUT /api/admin/usuarios/:id — edita usuário
router.put("/admin/usuarios/:id", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, email, perfil, unidade, status, condominio_id } = req.body as {
      nome?: string; email?: string; perfil?: string; unidade?: string; status?: string; condominio_id?: string;
    };
    const updates: Record<string, unknown> = {};
    if (nome          !== undefined) updates.nome         = nome.trim();
    if (email         !== undefined) updates.email        = email.trim().toLowerCase();
    if (perfil        !== undefined) updates.perfil       = perfil;
    if (unidade       !== undefined) updates.unidade_id   = unidade || null;
    if (status        !== undefined) updates.ativo        = status !== "inativo";
    if (condominio_id !== undefined) updates.condominio_id = condominio_id;
    if (!Object.keys(updates).length) return res.status(400).json({ error: "Nenhum campo enviado" });
    const { data, error } = await supabase.from("usuarios").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json({ ok: true, data: normUsuario(data as Record<string, unknown>) });
  } catch (err) {
    console.error("PUT /admin/usuarios/:id error:", err);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

// DELETE /api/admin/usuarios/:id — soft delete (ativo = false)
router.delete("/admin/usuarios/:id", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("usuarios").update({ ativo: false }).eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/usuarios/:id error:", err);
    res.status(500).json({ error: "Erro ao desativar usuário" });
  }
});

// PATCH /api/admin/usuarios/:id/status — ativar ou desativar usuário
router.patch("/admin/usuarios/:id/status", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body as { ativo: boolean };
    if (typeof ativo !== "boolean") {
      return res.status(400).json({ error: "ativo deve ser boolean" });
    }
    const { error } = await supabase
      .from("usuarios")
      .update({ ativo, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    const acao = ativo ? "ativado" : "desativado";
    res.json({ ok: true, ativo, message: `Usuário ${acao} com sucesso` });
  } catch (err) {
    console.error("PATCH /admin/usuarios/:id/status error:", err);
    res.status(500).json({ error: "Erro ao atualizar status do usuário" });
  }
});

// PATCH /api/admin/usuarios/:id/senha — define ou gera senha de acesso
// Body: { senha?: string }  → se omitido, gera senha aleatória
// Retorna a senha em plain-text UMA ÚNICA VEZ para o admin repassar ao usuário
function gerarSenhaAleatoria(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!";
  let senha = "";
  // Garante ao menos 1 maiúscula, 1 número, 1 símbolo
  senha += chars[Math.floor(Math.random() * 24) + 24]; // maiúscula
  senha += chars[Math.floor(Math.random() * 8) + 48];  // número
  senha += chars[Math.floor(Math.random() * 4) + 56];  // símbolo
  for (let i = 0; i < 5; i++) senha += chars[Math.floor(Math.random() * 56)];
  // Embaralha
  return senha.split("").sort(() => Math.random() - 0.5).join("");
}

router.patch("/admin/usuarios/:id/senha", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { senha: senhaRaw } = req.body as { senha?: string };

    // Valida que usuário existe
    const { data: existente, error: findErr } = await supabase
      .from("usuarios")
      .select("id, nome, email")
      .eq("id", id)
      .single();
    if (findErr || !existente) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const senhaPlain = senhaRaw?.trim() || gerarSenhaAleatoria();

    if (senhaPlain.length < 6) {
      return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });
    }

    const hash = await bcrypt.hash(senhaPlain, 10);

    const { error: updErr } = await supabase
      .from("usuarios")
      .update({ senha_hash: hash, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({
      ok:     true,
      senha:  senhaPlain,
      gerada: !senhaRaw?.trim(),
      nome:   (existente as Record<string, unknown>).nome,
      email:  (existente as Record<string, unknown>).email,
      message: !senhaRaw?.trim()
        ? "Senha gerada automaticamente. Repasse ao usuário com segurança."
        : "Senha definida com sucesso.",
    });
  } catch (err) {
    console.error("PATCH /admin/usuarios/:id/senha error:", err);
    res.status(500).json({ error: "Erro ao definir senha" });
  }
});

// GET /api/admin/planos  — configuração de planos SaaS
router.get("/admin/planos", checkAdminGlobal, (_req: Request, res: Response) => {
  res.json({
    data: [
      {
        id: "free",
        nome: "FREE",
        color: "#10B981",
        preco: 0,
        limites: { condominios: 1, unidades: 50, usuarios: 10, ia_mensagens: 50 },
        features: ["Dashboard básico", "1 condomínio", "Chat IA (50 msgs/mês)", "Notificações básicas"],
      },
      {
        id: "pro",
        nome: "PRO",
        color: "#6366F1",
        preco: 297,
        limites: { condominios: 5, unidades: 500, usuarios: 100, ia_mensagens: 1000 },
        features: ["Tudo do FREE", "Até 5 condomínios", "IoT avançado", "Relatórios PDF", "Chat IA ilimitado", "Di — Síndica Virtual"],
      },
      {
        id: "enterprise",
        nome: "ENTERPRISE",
        color: "#F59E0B",
        preco: 997,
        limites: { condominios: -1, unidades: -1, usuarios: -1, ia_mensagens: -1 },
        features: ["Tudo do PRO", "Condomínios ilimitados", "White-label", "API dedicada", "SLA garantido", "Suporte 24/7", "Integração ERP"],
      },
    ],
  });
});

// GET /api/admin/sistema  — saúde do sistema
router.get("/admin/sistema", checkAdminGlobal, async (_req: Request, res: Response) => {
  try {
    const start = Date.now();
    const { error } = await supabase.from("condominios").select("id").limit(1);
    const latency = Date.now() - start;
    res.json({
      status: error ? "degraded" : "ok",
      supabase_latency_ms: latency,
      api_uptime_s: Math.floor(process.uptime()),
      node_version: process.version,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      sse_clients: sseClients.size,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  BI EXECUTIVO
// ══════════════════════════════════════════════════════════════════════════════

// ── Forecast engine (moving average + trend) ──────────────────────────────────
function biForecast(values: number[]): { next: number; trend: "up" | "down" | "stable"; variacao: string } {
  if (!values || values.length === 0) return { next: 0, trend: "stable", variacao: "0%" };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const last = values[values.length - 1];
  const next = avg > 0 ? avg * 1.1 : last * 1.05;
  const delta = avg > 0 ? ((last - avg) / avg) * 100 : 0;
  const trend: "up" | "down" | "stable" = delta > 2 ? "up" : delta < -2 ? "down" : "stable";
  return { next: Math.round(next * 100) / 100, trend, variacao: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` };
}

// MRR por plano
const PLAN_MRR: Record<string, number> = { free: 0, pro: 297, enterprise: 997 };

// GET /api/bi/overview  — KPIs globais
router.get("/bi/overview", checkAdminGlobal, async (_req: Request, res: Response) => {
  try {
    const [
      { data: condos },
      { data: moradores },
      { data: lancamentos },
      { data: osRows },
    ] = await Promise.all([
      supabase.from("condominios").select("id, plano, status, created_at"),
      supabase.from("moradores").select("id"),
      supabase.from("lancamentos").select("tipo, valor, data, condominio_id"),
      supabase.from("ordens_servico").select("status, prioridade, created_at"),
    ]);

    const totalCondos   = condos?.length ?? 0;
    const condosAtivos  = condos?.filter(c => c.status !== "suspenso").length ?? 0;
    const condosSusp    = condos?.filter(c => c.status === "suspenso").length ?? 0;
    const totalMoradores = moradores?.length ?? 0;
    const osAbertas     = osRows?.filter(o => o.status === "aberta" || o.status === "em_andamento").length ?? 0;
    const osUrgentes    = osRows?.filter(o => o.prioridade === "urgente").length ?? 0;

    const mrr = (condos ?? []).reduce((s, c) => s + (PLAN_MRR[(c.plano||"free").toLowerCase()] || 0), 0);
    const arr = mrr * 12;

    const totalReceitas = (lancamentos ?? []).filter(l => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0);
    const totalDespesas = (lancamentos ?? []).filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0);
    const inadimplencia = totalReceitas > 0 ? ((totalDespesas / totalReceitas) * 100).toFixed(1) : "0.0";

    // crescimento: condos criados nos últimos 30 dias
    const cutoff30  = new Date(Date.now() - 30  * 86400000).toISOString();
    const cutoff60  = new Date(Date.now() - 60  * 86400000).toISOString();
    const novos30   = condos?.filter(c => c.created_at >= cutoff30).length ?? 0;
    const novos60   = condos?.filter(c => c.created_at >= cutoff60 && c.created_at < cutoff30).length ?? 0;
    const crescimento = novos60 > 0 ? `+${Math.round(((novos30 - novos60) / novos60) * 100)}%` : novos30 > 0 ? "+∞%" : "0%";

    const planoCounts = { free: 0, pro: 0, enterprise: 0 };
    for (const c of condos ?? []) {
      const p = (c.plano || "free").toLowerCase() as "free" | "pro" | "enterprise";
      if (p in planoCounts) planoCounts[p]++;
    }

    res.json({ totalCondos, condosAtivos, condosSusp, totalMoradores, osAbertas, osUrgentes, mrr, arr, inadimplencia, crescimento, planoCounts, totalReceitas, totalDespesas });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/charts  — séries temporais
router.get("/bi/charts", checkAdminGlobal, async (_req: Request, res: Response) => {
  try {
    const [
      { data: lancamentos },
      { data: osRows },
      { data: condos },
    ] = await Promise.all([
      supabase.from("lancamentos").select("tipo, valor, data, condominio_id, categoria").order("data"),
      supabase.from("ordens_servico").select("status, categoria, created_at").order("created_at"),
      supabase.from("condominios").select("id, plano, created_at").order("created_at"),
    ]);

    // ── Receita/Despesa mensal ──────────────────────────────────────────────
    const finByMonth: Record<string, { mes: string; receita: number; despesa: number; saldo: number }> = {};
    for (const l of lancamentos ?? []) {
      const mes = l.data ? l.data.slice(0, 7) : "2026-01";
      if (!finByMonth[mes]) finByMonth[mes] = { mes: mes.replace("-", "/"), receita: 0, despesa: 0, saldo: 0 };
      if (l.tipo === "receita") finByMonth[mes].receita += Number(l.valor);
      else finByMonth[mes].despesa += Number(l.valor);
    }
    const receitaMensal = Object.values(finByMonth)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map(m => ({ ...m, receita: Math.round(m.receita), despesa: Math.round(m.despesa), saldo: Math.round(m.receita - m.despesa) }));

    // ── OS por categoria ────────────────────────────────────────────────────
    const osCatMap: Record<string, number> = {};
    for (const o of osRows ?? []) {
      const cat = o.categoria || "outros";
      osCatMap[cat] = (osCatMap[cat] || 0) + 1;
    }
    const osPorCategoria = Object.entries(osCatMap)
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // ── Crescimento de condos por mês ────────────────────────────────────
    const condoByMonth: Record<string, number> = {};
    for (const c of condos ?? []) {
      const mes = c.created_at ? c.created_at.slice(0, 7) : "2026-01";
      condoByMonth[mes] = (condoByMonth[mes] || 0) + 1;
    }
    let acumulado = 0;
    const crescimentoCondos = Object.entries(condoByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, novos]) => { acumulado += novos; return { mes: mes.replace("-", "/"), novos, total: acumulado }; });

    // ── MRR por mês (estimado por cadastros) ─────────────────────────────
    const mrrByMonth: Record<string, number> = {};
    let mrrAcum = 0;
    for (const entry of crescimentoCondos) {
      const condosMes = condos?.filter(c => c.created_at?.slice(0,7) === entry.mes.replace("/","-")) ?? [];
      mrrAcum += condosMes.reduce((s, c) => s + (PLAN_MRR[(c.plano||"free").toLowerCase()] || 0), 0);
      mrrByMonth[entry.mes] = mrrAcum;
    }
    const mrrMensal = Object.entries(mrrByMonth).map(([mes, mrr]) => ({ mes, mrr }));

    // ── OS status distribution ────────────────────────────────────────────
    const osStatus = [
      { name: "Abertas",    value: osRows?.filter(o => o.status === "aberta").length ?? 0 },
      { name: "Em Andamento", value: osRows?.filter(o => o.status === "em_andamento").length ?? 0 },
      { name: "Concluídas", value: osRows?.filter(o => o.status === "concluida").length ?? 0 },
    ];

    res.json({ receitaMensal, osPorCategoria, crescimentoCondos, mrrMensal, osStatus });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/forecast  — previsões
router.get("/bi/forecast", checkAdminGlobal, async (_req: Request, res: Response) => {
  try {
    const { data: lancamentos } = await supabase
      .from("lancamentos")
      .select("tipo, valor, data")
      .order("data");

    // Agrupa por mês
    const recByMonth: Record<string, number> = {};
    const despByMonth: Record<string, number> = {};
    for (const l of lancamentos ?? []) {
      const mes = l.data ? l.data.slice(0, 7) : "2026-01";
      if (l.tipo === "receita") recByMonth[mes] = (recByMonth[mes] || 0) + Number(l.valor);
      else despByMonth[mes] = (despByMonth[mes] || 0) + Number(l.valor);
    }
    const recValues  = Object.values(recByMonth).map(Number);
    const despValues = Object.values(despByMonth).map(Number);

    const recForecast  = biForecast(recValues);
    const despForecast = biForecast(despValues);

    // Forecast inadimplência
    const inadByMonth = Object.keys(recByMonth).map(mes => {
      const r = recByMonth[mes] || 1;
      const d = despByMonth[mes] || 0;
      return (d / r) * 100;
    });
    const inadForecast = biForecast(inadByMonth);

    // Horizon de 3 meses projetados
    const now = new Date();
    const horizon = [1, 2, 3].map(offset => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const label = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`;
      const factor = 1 + (offset * 0.05);
      return {
        mes: label,
        receita:     Math.round((recForecast.next  || 0) * factor),
        despesa:     Math.round((despForecast.next || 0) * factor),
        inadimplencia: Math.round((inadForecast.next || 0) * factor * 10) / 10,
      };
    });

    res.json({
      receita:      recForecast,
      despesa:      despForecast,
      inadimplencia: inadForecast,
      horizon,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bi/insights  — Claude gera insights estratégicos
router.post("/bi/insights", checkAdminGlobal, async (req: Request, res: Response) => {
  try {
    const { overview, forecast } = req.body as Record<string, unknown>;
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Você é Di, analista estratégica de dados do ImobCore SaaS. Analise os dados abaixo e retorne JSON:
{
  "insights": [
    {"tipo":"alerta"|"oportunidade"|"risco"|"positivo", "titulo":"...", "descricao":"...", "acao":"..."},
    ...máximo 6 insights
  ],
  "resumo": "frase curta de 1 linha resumindo a saúde da plataforma"
}
Dados: ${JSON.stringify({ overview, forecast })}
Responda SOMENTE com JSON válido, sem markdown.`,
      }],
    });
    const raw = (msg.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.replace(/^```json?\n?/, "").replace(/```$/, "").trim());
    res.json(json);
  } catch (err: unknown) {
    // Fallback com insights genéricos
    res.json({
      insights: [
        { tipo: "positivo",     titulo: "Plataforma estável",         descricao: "Todos os sistemas operacionais.",                                acao: "Manter monitoramento" },
        { tipo: "oportunidade", titulo: "Upgrade FREE → PRO",         descricao: "Condos no plano FREE podem ser convertidos para PRO.",           acao: "Acionar campanha de upgrade" },
        { tipo: "alerta",       titulo: "Verificar inadimplência",    descricao: "Monitore a evolução da inadimplência mensal.",                   acao: "Gerar relatório detalhado" },
      ],
      resumo: "Plataforma operacional — monitore crescimento e conversão de planos.",
    });
  }
});

export default router;
export { broadcast };
