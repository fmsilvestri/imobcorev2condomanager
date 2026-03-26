import { Router, type Request, type Response } from "express";
import { supabase } from "../lib/supabase.js";
import { anthropic } from "../lib/anthropic.js";
import { CATALOGO_MODULOS, getModuloPorId, getModulosPorPerfil, type Perfil } from "../di-engine/modulos.js";
import { carregarContextoDi, type DiSnapshot } from "../di-engine/context.js";

const router = Router();

// GET /api/modulos — lista módulos disponíveis (por perfil opcional)
router.get("/modulos", (req: Request, res: Response) => {
  try {
    const perfil = (req.query.perfil as Perfil) || "gestor";
    const modulos = getModulosPorPerfil(perfil);
    res.json({ ok: true, modulos });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/modulos/:id/dados — dados reais do módulo para snapshot
router.get("/modulos/:id/dados", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const condoId = (req.query.condominio_id as string) || "";

    const modulo = getModuloPorId(id);
    if (!modulo) {
      return res.status(404).json({ ok: false, error: `Módulo '${id}' não encontrado` });
    }

    const dados = await buscarDadosModulo(id, condoId);
    res.json({ ok: true, modulo, dados });
  } catch (err) {
    console.error(`[modulos/${req.params.id}/dados]`, err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/modulos/:id/di-analise — Di analisa módulo específico
router.post("/modulos/:id/di-analise", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      condominio_id: condoId = "",
      perfil = "gestor",
      nome_usuario: nomeUsuario = "Usuário",
      unidade_id: unidadeId,
    } = req.body as {
      condominio_id?: string;
      perfil?: Perfil;
      nome_usuario?: string;
      unidade_id?: string;
    };

    const modulo = getModuloPorId(id);
    if (!modulo) {
      return res.status(404).json({ ok: false, error: `Módulo '${id}' não encontrado` });
    }

    const dados = await buscarDadosModulo(id, condoId);
    const snapshot = await buildSnapshot(condoId);

    const diCtx = await carregarContextoDi(condoId, snapshot, perfil, nomeUsuario, unidadeId);

    // Verificar se Di está ativa para este condomínio
    if (!diCtx.diAtiva) {
      return res.json({
        ok: true,
        modulo: id,
        analise: {
          status: "info",
          emoji: "⏸️",
          pontos: [`${diCtx.nomeDi} está desativada para este condomínio pelo administrador.`],
          recomendacao: "Ative a Di nas configurações do Master para habilitar a análise.",
        },
        dados,
        nome_di: diCtx.nomeDi,
        di_ativa: false,
      });
    }

    const analisePrompt = `Você está analisando o módulo "${modulo.nome}" (${modulo.icone}) do condomínio.

DADOS ATUAIS DO MÓDULO:
${JSON.stringify(dados, null, 2)}

Gere uma análise concisa com:
1. Status geral do módulo (🟢 ok / 🟡 atenção / 🔴 crítico)
2. Principais pontos observados (máximo 3)
3. Recomendação prioritária

Responda em JSON: { "status": "ok|atencao|critico", "emoji": "🟢|🟡|🔴", "pontos": ["..."], "recomendacao": "..." }`;

    const aiResp = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: diCtx.systemPrompt,
      messages: [{ role: "user", content: analisePrompt }],
    });

    const raw = (aiResp.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    let analise = { status: "ok", emoji: "🟢", pontos: [] as string[], recomendacao: "" };
    if (jsonMatch) {
      try {
        analise = { ...analise, ...JSON.parse(jsonMatch[0]) };
      } catch { /* usa fallback */ }
    }

    res.json({ ok: true, modulo: id, analise, dados, nome_di: diCtx.nomeDi, di_ativa: true });
  } catch (err) {
    console.error(`[modulos/${req.params.id}/di-analise]`, err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/modulos/:id/di-chat — chat contextualizado no módulo
router.post("/modulos/:id/di-chat", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      condominio_id: condoId = "",
      message = "",
      history = [],
      perfil = "gestor",
      nome_usuario: nomeUsuario = "Usuário",
      unidade_id: unidadeId,
    } = req.body as {
      condominio_id?: string;
      message?: string;
      history?: { role: string; content: string }[];
      perfil?: Perfil;
      nome_usuario?: string;
      unidade_id?: string;
    };

    if (!message.trim()) {
      return res.status(400).json({ ok: false, error: "Mensagem não pode ser vazia" });
    }

    const modulo = getModuloPorId(id);
    if (!modulo) {
      return res.status(404).json({ ok: false, error: `Módulo '${id}' não encontrado` });
    }

    const [snapshot, dados] = await Promise.all([
      buildSnapshot(condoId),
      buscarDadosModulo(id, condoId),
    ]);

    const diCtx = await carregarContextoDi(condoId, snapshot, perfil, nomeUsuario, unidadeId);

    // Verificar se Di está ativa para este condomínio
    if (!diCtx.diAtiva) {
      return res.json({
        ok: true,
        reply: `${diCtx.nomeDi} está desativada para este condomínio pelo administrador. Ative-a nas configurações do Master.`,
        nome_di: diCtx.nomeDi,
        di_ativa: false,
        tokens: { input: 0, output: 0 },
        modulo: id,
      });
    }

    const moduloContexto = `\n\nVocê está operando no módulo "${modulo.nome}" (${modulo.icone}).
DADOS ATUAIS: ${JSON.stringify(dados).slice(0, 800)}`;

    const systemPromptFull = diCtx.systemPrompt + moduloContexto;

    const msgs = [
      ...history.slice(-10).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    const aiResp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPromptFull,
      messages: msgs,
    });

    const reply = (aiResp.content[0] as { type: string; text: string }).text.trim();
    const tokens = {
      input: aiResp.usage.input_tokens,
      output: aiResp.usage.output_tokens,
    };

    // Salva no histórico da Di (best-effort)
    try {
      await supabase.from("di_historico").insert({
        condominio_id: condoId || null,
        tipo: "chat",
        prioridade: "normal",
        resumo: message.slice(0, 200),
        mensagem_gestor: reply.slice(0, 500),
        score_impacto: 1,
        modulo: id,
        modo_execucao: "chat",
        payload: { perfil, pergunta: message.slice(0, 500), resposta: reply.slice(0, 1000), tokens_input: tokens.input, tokens_output: tokens.output },
      });
    } catch { /* silencia */ }

    res.json({ ok: true, reply, nome_di: diCtx.nomeDi, di_ativa: true, tokens, modulo: id });
  } catch (err) {
    console.error(`[modulos/${req.params.id}/di-chat]`, err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN: Di Configurações — CRUD via painel admin (X-Admin-Token required)
// ══════════════════════════════════════════════════════════════════════════════

const ADMIN_TOKEN = "imobcore-admin-2026";

function checkAdminToken(req: Request, res: Response): boolean {
  const tok = (req.headers["x-admin-token"] as string) || "";
  if (tok !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "Não autorizado" });
    return false;
  }
  return true;
}

// GET /api/admin/di/configuracoes — lista todas as di_configuracoes com nome do condo
router.get("/admin/di/configuracoes", async (req: Request, res: Response) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const { data: condos, error: ce } = await supabase.from("condominios").select("id,nome,cidade");
    if (ce) return res.status(500).json({ ok: false, error: ce.message });
    const { data: configs, error: dce } = await supabase.from("di_configuracoes").select("*");
    if (dce) return res.status(500).json({ ok: false, error: dce.message });
    const merged = (condos || []).map((c: { id: string; nome: string; cidade: string }) => {
      const cfg = (configs || []).find((x: { condominio_id: string }) => x.condominio_id === c.id) || null;
      return { ...c, di_config: cfg };
    });
    res.json({ ok: true, condos: merged });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// PATCH /api/admin/di/configuracoes/:condoId — atualiza di_configuracoes de um condo
router.patch("/admin/di/configuracoes/:condoId", async (req: Request, res: Response) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const { condoId } = req.params;
    const allowed = ["nome_di","tom_comunicacao","modulos_ativos","limite_financeiro","identidade_persona","system_prompt","regras_de_ouro","di_ativa","modo_ciclo","ciclo_minutos","plano_limite_tokens","idioma","concierge_ativo","concierge_saudacao","concierge_cor_tema","concierge_tts_provider","concierge_idle_seg","concierge_horarios","concierge_contatos","concierge_regras","concierge_avatar_url"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    const { error } = await supabase
      .from("di_configuracoes")
      .upsert({ condominio_id: condoId, ...patch }, { onConflict: "condominio_id" });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, updated: condoId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/admin/di/system-prompt — lista todos os blocos di_system_prompt globais
router.get("/admin/di/system-prompt", async (req: Request, res: Response) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const { data, error } = await supabase
      .from("di_system_prompt")
      .select("*")
      .is("condominio_id", null)
      .order("bloco", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, blocos: data || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// PATCH /api/admin/di/system-prompt/:bloco — atualiza conteúdo de um bloco global
router.patch("/admin/di/system-prompt/:bloco", async (req: Request, res: Response) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const { bloco } = req.params;
    const { conteudo, titulo } = req.body as { conteudo?: string; titulo?: string };
    const patch: Record<string, unknown> = {};
    if (conteudo !== undefined) patch.conteudo = conteudo;
    if (titulo !== undefined) patch.titulo = titulo;
    const { error } = await supabase
      .from("di_system_prompt")
      .update(patch)
      .eq("bloco", bloco)
      .is("condominio_id", null);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, bloco });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN: Seed tabelas Di (executar uma vez após criar as tabelas no Supabase)
// POST /api/admin/migrate-di
// ══════════════════════════════════════════════════════════════════════════════
router.post("/admin/migrate-di", async (_req: Request, res: Response) => {
  const results: Record<string, string> = {};

  // 1. Seed/upsert dos blocos do system prompt (usa coluna "bloco" e "fixo" — schema real)
  const conteudoIdentidade = "Você é {{nome_di}}, a Síndica Virtual Inteligente do ImobCore — especialista em gestão condominial.\n"
    + "Personalidade: {{tom_comunicacao}}, simpática, direta, proativa e eficiente.\n"
    + "Fale em português brasileiro natural. Use emojis com moderação.\n"
    + "Nunca invente informações. Baseie suas respostas em dados reais fornecidos.";

  const conteudoRegras = "REGRAS FUNDAMENTAIS:\n"
    + "1. NUNCA invente dados, valores financeiros ou informações não fornecidas.\n"
    + "2. Quando não souber algo, diga claramente e sugira como obter a informação.\n"
    + "3. Priorize sempre a segurança e o bem-estar dos moradores.\n"
    + "4. Em emergências, oriente a acionar SAMU, Bombeiros ou Polícia.\n"
    + "5. Respeite a legislação condominial (Lei 4.591/64 e Código Civil).";

  const conteudoPrioridades = "P1 Segurança > P2 Financeiro > P3 Operações > P4 Convívio\n"
    + "CRÍTICO: vazamentos, falhas elétricas, invasões, incêndios, emergências médicas.\n"
    + "URGENTE: OSs de alta prioridade, inadimplência crítica, sensores em nível crítico.\n"
    + "NORMAL: consultas gerais, agendamentos, comunicados, sugestões.";

  const conteudoDados = "Nome: {{nome_condominio}} | Unidades: {{total_unidades}} | Moradores: {{total_moradores}}\n"
    + "OSs={{os_abertas}} urgentes={{os_urgentes}} | Saldo=R${{saldo}} | Inadimp={{inadimplencia_pct}}%";

  const conteudoLimites = "PODE: criar OS, notificação individual, registrar encomenda, fechar OS confirmada.\n"
    + "PRECISA aprovação: qualquer gasto acima de {{limite_financeiro}}, comunicado massivo, contratos.\n"
    + "NAO compartilhe dados pessoais de moradores com outros moradores.";

  const conteudoFormato = "FORMATACAO:\n"
    + "- Respostas curtas (até 3 linhas) para perguntas diretas.\n"
    + "- Use bullet points para listas de ações ou problemas.\n"
    + "- Inclua sempre uma Próxima Ação sugerida quando identificar problema.\n"
    + "- Para relatórios, use cabeçalhos com emoji para facilitar leitura.";

  const blocos = [
    { bloco: "1_identidade", titulo: "Identidade e Personalidade", conteudo: conteudoIdentidade, fixo: true, condominio_id: null },
    { bloco: "2_regras_ouro", titulo: "Regras de Ouro", conteudo: conteudoRegras, fixo: true, condominio_id: null },
    { bloco: "3_prioridades", titulo: "Hierarquia de Prioridades", conteudo: conteudoPrioridades, fixo: true, condominio_id: null },
    { bloco: "4_dados", titulo: "Dados do condomínio", conteudo: conteudoDados, fixo: false, condominio_id: null },
    { bloco: "5_limites", titulo: "Limites de autonomia", conteudo: conteudoLimites, fixo: false, condominio_id: null },
    { bloco: "6_formato", titulo: "Formato de saída", conteudo: conteudoFormato, fixo: true, condominio_id: null },
  ];

  try {
    const blocoIds = blocos.map((b) => b.bloco);
    // Remove blocos globais antigos para recriar (delete + insert)
    await supabase
      .from("di_system_prompt")
      .delete()
      .in("bloco", blocoIds)
      .is("condominio_id", null);

    const { error } = await supabase.from("di_system_prompt").insert(blocos);
    results.blocos_system_prompt = error ? `ERRO: ${error.message}` : "OK — 6 blocos inseridos";
  } catch (e) {
    results.blocos_system_prompt = `EXCEÇÃO: ${String(e)}`;
  }

  // 2. Inicializa di_configuracoes padrão para condos sem config (tom válido: direto_empatico)
  try {
    const { data: condos } = await supabase.from("condominios").select("id").limit(50);
    if (condos && condos.length > 0) {
      const configs = condos.map((c: { id: string }) => ({
        condominio_id: c.id,
        nome_di: "Di",
        tom_comunicacao: "direto_empatico",
        modulos_ativos: CATALOGO_MODULOS.map((m) => m.id),
        limite_financeiro: 1000,
        di_ativa: true,
        idioma: "pt_BR",
        modo_ciclo: "sequential",
        ciclo_minutos: 15,
        plano_limite_tokens: 100000,
        notificacoes_canais: ["push"],
      }));
      const { error } = await supabase
        .from("di_configuracoes")
        .upsert(configs, { onConflict: "condominio_id", ignoreDuplicates: true });
      results.di_configuracoes = error ? `ERRO: ${error.message}` : `OK — ${condos.length} condos inicializados`;
    } else {
      results.di_configuracoes = "SKIP — nenhum condomínio encontrado";
    }
  } catch (e) {
    results.di_configuracoes = `EXCEÇÃO: ${String(e)}`;
  }

  res.json({ ok: true, results, msg: "Blocos semeados. Tabelas já existem no Supabase." });
});

// ══════════════════════════════════════════════════════════════════════════════
// Helpers internos
// ══════════════════════════════════════════════════════════════════════════════

async function buildSnapshot(condoId: string): Promise<Partial<DiSnapshot>> {
  try {
    const [
      { data: cond },
      { data: osAbertas },
      { data: receitas },
      { data: despesas },
      { data: sensores },
    ] = await Promise.all([
      condoId
        ? supabase.from("condominios").select("nome,cidade,sindico_nome,total_unidades,total_moradores").eq("id", condoId).single()
        : supabase.from("condominios").select("nome,cidade,sindico_nome,total_unidades,total_moradores").limit(1).single(),
      condoId
        ? supabase.from("ordens_servico").select("status,prioridade").in("status", ["aberta", "em_andamento"]).eq("condominio_id", condoId)
        : supabase.from("ordens_servico").select("status,prioridade").in("status", ["aberta", "em_andamento"]),
      condoId
        ? supabase.from("financeiro_receitas").select("valor,status").eq("condominio_id", condoId)
        : supabase.from("financeiro_receitas").select("valor,status"),
      condoId
        ? supabase.from("financeiro_despesas").select("valor").eq("condominio_id", condoId)
        : supabase.from("financeiro_despesas").select("valor"),
      supabase.from("sensores").select("nivel_atual").limit(10),
    ]);

    const totalRec = (receitas || []).reduce((s: number, r: { valor: number }) => s + Number(r.valor), 0);
    const totalDesp = (despesas || []).reduce((s: number, d: { valor: number }) => s + Number(d.valor), 0);
    const saldo = totalRec - totalDesp;

    const totalRecCount = (receitas || []).length;
    const inadCount = (receitas || []).filter((r: { status: string }) => r.status === "atrasado").length;
    const inadPct = totalRecCount > 0 ? Math.round((inadCount / totalRecCount) * 100) : 0;

    const osArr = osAbertas || [];
    const osUrgentes = osArr.filter((o: { prioridade: string }) => ["urgente", "alta"].includes(o.prioridade)).length;

    const niveisAgua = (sensores || [])
      .map((s: { nivel_atual: number }) => Number(s.nivel_atual))
      .filter((v: number) => !isNaN(v) && v >= 0);
    const nivelAgua = niveisAgua.length
      ? Math.round(niveisAgua.reduce((a: number, b: number) => a + b, 0) / niveisAgua.length)
      : null;

    return {
      condNome: cond?.nome || "Condomínio",
      condCidade: cond?.cidade || "",
      sindico: cond?.sindico_nome || "",
      totalUnidades: cond?.total_unidades || 0,
      totalMoradores: cond?.total_moradores || 0,
      osAbertas: osArr.length,
      osUrgentes,
      saldo,
      inadPct,
      nivelAgua,
    };
  } catch {
    return {};
  }
}

type DadosModulo = Record<string, unknown>;

async function buscarDadosModulo(id: string, condoId: string): Promise<DadosModulo> {
  try {
    switch (id) {
      case "os": {
        const q = condoId
          ? supabase.from("ordens_servico").select("titulo,status,prioridade,responsavel,created_at").eq("condominio_id", condoId).order("created_at", { ascending: false }).limit(20)
          : supabase.from("ordens_servico").select("titulo,status,prioridade,responsavel,created_at").order("created_at", { ascending: false }).limit(20);
        const { data } = await q;
        const total = (data || []).length;
        const abertas = (data || []).filter((o: { status: string }) => o.status === "aberta").length;
        const urgentes = (data || []).filter((o: { prioridade: string }) => ["urgente", "alta"].includes(o.prioridade)).length;
        return { total, abertas, urgentes, lista: (data || []).slice(0, 5) };
      }
      case "financeiro": {
        const [{ data: rec }, { data: desp }] = await Promise.all([
          condoId
            ? supabase.from("financeiro_receitas").select("valor,status,categoria").eq("condominio_id", condoId)
            : supabase.from("financeiro_receitas").select("valor,status,categoria"),
          condoId
            ? supabase.from("financeiro_despesas").select("valor,categoria").eq("condominio_id", condoId)
            : supabase.from("financeiro_despesas").select("valor,categoria"),
        ]);
        const totalRec = (rec || []).reduce((s: number, r: { valor: number }) => s + Number(r.valor), 0);
        const totalDesp = (desp || []).reduce((s: number, d: { valor: number }) => s + Number(d.valor), 0);
        return { saldo: totalRec - totalDesp, receitas: totalRec, despesas: totalDesp, registros_rec: (rec || []).length, registros_desp: (desp || []).length };
      }
      case "iot": {
        const { data } = await supabase.from("sensores").select("nome,local,nivel_atual,status").limit(20);
        return { sensores: data || [], total: (data || []).length };
      }
      case "misp": {
        const [{ data: equip }, { data: planos }] = await Promise.all([
          condoId
            ? supabase.from("equipamentos").select("nome,status,prox_manutencao").eq("condominio_id", condoId).limit(10)
            : supabase.from("equipamentos").select("nome,status,prox_manutencao").limit(10),
          condoId
            ? supabase.from("planos_manutencao").select("nome,periodicidade,proxima_execucao,status").eq("condominio_id", condoId).limit(10)
            : supabase.from("planos_manutencao").select("nome,periodicidade,proxima_execucao,status").limit(10),
        ]);
        return { equipamentos: equip || [], planos: planos || [] };
      }
      case "comunicados": {
        const { data } = condoId
          ? await supabase.from("comunicados").select("titulo,criado_em,publicado").eq("condominio_id", condoId).order("criado_em", { ascending: false }).limit(10)
          : await supabase.from("comunicados").select("titulo,criado_em,publicado").order("criado_em", { ascending: false }).limit(10);
        return { comunicados: data || [], total: (data || []).length };
      }
      case "diagnostico": {
        const { data } = condoId
          ? await supabase.from("diagnosticos").select("score,data_calculo,status").eq("condominio_id", condoId).order("data_calculo", { ascending: false }).limit(1).single()
          : await supabase.from("diagnosticos").select("score,data_calculo,status").order("data_calculo", { ascending: false }).limit(1).single();
        return { ultimo_diagnostico: data || null };
      }
      default:
        return { modulo: id, mensagem: "Dados específicos não disponíveis para este módulo" };
    }
  } catch {
    return { modulo: id, erro: "Não foi possível carregar dados" };
  }
}

export default router;
