/**
 * ImobCore — Módulo Funcionários & Escala Inteligente
 * CRUD funcionários · Escala automática · Briefings · Risco trabalhista · Di IA
 */
import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── HELPERS ──────────────────────────────────────────────────────────────────

const ENCARGOS_PERCENT = 0.68; // CLT: INSS + FGTS + férias + 13º + outros ≈ 68%

function calcPassivo(salario: number, mesesAtivos: number): number {
  const fgts = salario * 0.08 * mesesAtivos;
  const ferias = (salario / 12) * mesesAtivos;
  const decimoTerceiro = (salario / 12) * mesesAtivos;
  const avisoPrevio = salario * Math.min(1 + mesesAtivos * 0.03, 3);
  return Math.round(fgts + ferias + decimoTerceiro + avisoPrevio);
}

function calcMesesAtivos(dataAdmissao: string): number {
  const admissao = new Date(dataAdmissao);
  const hoje = new Date();
  return Math.max(0, Math.round((hoje.getTime() - admissao.getTime()) / (1000 * 60 * 60 * 24 * 30)));
}

function calcScoreDesempenho(func: any): number {
  let score = 70;
  const meses = calcMesesAtivos(func.data_admissao || new Date().toISOString());
  if (meses > 24) score += 10;
  if (meses > 60) score += 5;
  if (func.horas_extras_mes > 20) score -= 15;
  if (func.faltas_mes > 2) score -= 20;
  if (func.cargo === "zelador" || func.cargo === "porteiro_chefe") score += 5;
  return Math.min(100, Math.max(10, score));
}

function preverRisco(func: any): { risco: "baixo" | "moderado" | "alto" | "critico"; motivo: string; impacto: string; valor_estimado: number } {
  const meses = calcMesesAtivos(func.data_admissao || "");
  const passivo = calcPassivo(Number(func.salario) || 0, meses);
  const horasExtras = Number(func.horas_extras_mes) || 0;
  const faltas = Number(func.faltas_mes) || 0;

  if (horasExtras > 30 || passivo > 50000) {
    return { risco: "critico", motivo: `${horasExtras > 30 ? `Excesso crítico: ${horasExtras}h extras/mês. ` : ""}${passivo > 50000 ? `Passivo trabalhista de R$ ${passivo.toLocaleString("pt-BR")}. ` : ""}`, impacto: "Risco de ação trabalhista. Ação imediata necessária.", valor_estimado: passivo };
  }
  if (horasExtras > 15 || passivo > 20000 || faltas > 3) {
    return { risco: "alto", motivo: `${horasExtras > 15 ? `${horasExtras}h extras/mês (limite recomendado: 15h). ` : ""}${faltas > 3 ? `${faltas} faltas no mês. ` : ""}${passivo > 20000 ? `Passivo de R$ ${passivo.toLocaleString("pt-BR")}. ` : ""}`, impacto: "Atenção: monitorar frequência e horas.", valor_estimado: passivo };
  }
  if (horasExtras > 5 || passivo > 8000) {
    return { risco: "moderado", motivo: `Situação dentro dos parâmetros com pontos de atenção.`, impacto: "Monitoramento recomendado.", valor_estimado: passivo };
  }
  return { risco: "baixo", motivo: "Funcionário dentro dos parâmetros normais.", impacto: "Nenhuma ação necessária.", valor_estimado: passivo };
}

// ── GERADOR DE ESCALA INTELIGENTE ────────────────────────────────────────────

type Turno = { funcionario_id: string; nome: string; cargo: string; turno: string; horario_inicio: string; horario_fim: string; data: string };

function gerarEscala(funcionarios: any[], diasAFrente: number = 7): Turno[] {
  const turnos: Turno[] = [];
  const hoje = new Date();

  const porteiros = funcionarios.filter(f => f.cargo === "porteiro" || f.cargo === "porteiro_chefe");
  const faxineiros = funcionarios.filter(f => f.cargo === "faxineiro" || f.cargo === "limpeza");
  const zeladores = funcionarios.filter(f => f.cargo === "zelador");
  const outros = funcionarios.filter(f => !["porteiro","porteiro_chefe","faxineiro","limpeza","zelador"].includes(f.cargo));

  for (let d = 0; d < diasAFrente; d++) {
    const data = new Date(hoje);
    data.setDate(data.getDate() + d);
    const dataStr = data.toISOString().slice(0, 10);
    const diaSemana = data.getDay();
    const fimDeSemana = diaSemana === 0 || diaSemana === 6;

    // Portaria 24h — 12x36 ou 2 turnos de 12h
    if (porteiros.length >= 2) {
      const idx = d % porteiros.length;
      const porteiroDia = porteiros[idx];
      const porteiroNoite = porteiros[(idx + 1) % porteiros.length];
      turnos.push({
        funcionario_id: porteiroDia.id, nome: porteiroDia.nome, cargo: porteiroDia.cargo,
        turno: "diurno", horario_inicio: "07:00", horario_fim: "19:00", data: dataStr,
      });
      turnos.push({
        funcionario_id: porteiroNoite.id, nome: porteiroNoite.nome, cargo: porteiroNoite.cargo,
        turno: "noturno", horario_inicio: "19:00", horario_fim: "07:00", data: dataStr,
      });
    } else if (porteiros.length === 1) {
      if (d % 2 === 0) {
        turnos.push({
          funcionario_id: porteiros[0].id, nome: porteiros[0].nome, cargo: porteiros[0].cargo,
          turno: "diurno", horario_inicio: "07:00", horario_fim: "19:00", data: dataStr,
        });
      }
    }

    // Limpeza diária (exceto domingo)
    if (diaSemana !== 0 && faxineiros.length > 0) {
      const fax = faxineiros[d % faxineiros.length];
      turnos.push({
        funcionario_id: fax.id, nome: fax.nome, cargo: fax.cargo,
        turno: "manha", horario_inicio: "08:00", horario_fim: "17:00", data: dataStr,
      });
    }

    // Zelador (dias úteis)
    if (!fimDeSemana && zeladores.length > 0) {
      const zel = zeladores[d % zeladores.length];
      turnos.push({
        funcionario_id: zel.id, nome: zel.nome, cargo: zel.cargo,
        turno: "comercial", horario_inicio: "08:00", horario_fim: "17:00", data: dataStr,
      });
    }

    // Outros (dias úteis)
    for (const func of outros) {
      if (!fimDeSemana) {
        turnos.push({
          funcionario_id: func.id, nome: func.nome, cargo: func.cargo,
          turno: "comercial", horario_inicio: "08:00", horario_fim: "17:00", data: dataStr,
        });
      }
    }
  }

  return turnos;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — FUNCIONÁRIOS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/funcionarios
router.get("/funcionarios", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };

    let query = supabase.from("funcionarios").select("*").order("nome");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);

    const { data, error } = await query;
    if (error) {
      if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
        return res.json({ funcionarios: [], missing_table: true });
      }
      return res.status(400).json({ error: error.message });
    }

    const funcionariosComCalc = (data || []).map(f => {
      const meses = calcMesesAtivos(f.data_admissao || new Date().toISOString());
      const passivo = calcPassivo(Number(f.salario) || 0, meses);
      const custo_total = Math.round(Number(f.salario || 0) * (1 + ENCARGOS_PERCENT));
      const risco = preverRisco(f);
      const score = calcScoreDesempenho(f);
      return { ...f, meses_ativo: meses, passivo_trabalhista: passivo, custo_total, risco_trabalhista: risco, score_desempenho: score };
    });

    // Totais
    const custo_folha_total = funcionariosComCalc.reduce((s, f) => s + (f.custo_total || 0), 0);
    const passivo_total = funcionariosComCalc.reduce((s, f) => s + (f.passivo_trabalhista || 0), 0);
    const ativos = funcionariosComCalc.filter(f => f.status === "ativo");

    res.json({
      funcionarios: funcionariosComCalc,
      totais: {
        total: funcionariosComCalc.length,
        ativos: ativos.length,
        custo_folha_total,
        passivo_total,
        risco_alto: funcionariosComCalc.filter(f => ["alto","critico"].includes(f.risco_trabalhista?.risco)).length,
      },
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/funcionarios
router.post("/funcionarios", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const { data, error } = await supabase.from("funcionarios").insert({
      condominio_id: body.condominio_id || null,
      nome: body.nome,
      cargo: body.cargo,
      jornada: body.jornada || "5x2",
      salario: Number(body.salario) || 0,
      data_admissao: body.data_admissao || new Date().toISOString().slice(0, 10),
      status: body.status || "ativo",
      telefone: body.telefone || null,
      cpf: body.cpf || null,
      horas_extras_mes: Number(body.horas_extras_mes) || 0,
      faltas_mes: Number(body.faltas_mes) || 0,
      turno_padrao: body.turno_padrao || "comercial",
      observacoes: body.observacoes || null,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, funcionario: data });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PUT /api/funcionarios/:id
router.put("/funcionarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const { data, error } = await supabase.from("funcionarios").update({
      nome: body.nome,
      cargo: body.cargo,
      jornada: body.jornada,
      salario: Number(body.salario) || 0,
      data_admissao: body.data_admissao,
      status: body.status,
      telefone: body.telefone,
      horas_extras_mes: Number(body.horas_extras_mes) || 0,
      faltas_mes: Number(body.faltas_mes) || 0,
      turno_padrao: body.turno_padrao,
      observacoes: body.observacoes,
    }).eq("id", id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, funcionario: data });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/funcionarios/:id
router.delete("/funcionarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("funcionarios").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — ESCALA
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/escala — escala da semana atual (do banco ou gerada)
router.get("/escala", async (req: Request, res: Response) => {
  try {
    const { condominio_id, semana_inicio } = req.query as { condominio_id?: string; semana_inicio?: string };

    const inicio = semana_inicio || new Date().toISOString().slice(0, 10);
    const fimDate = new Date(inicio);
    fimDate.setDate(fimDate.getDate() + 7);
    const fim = fimDate.toISOString().slice(0, 10);

    let query = supabase.from("escala_turnos").select("*, funcionarios(nome,cargo)").gte("data", inicio).lt("data", fim).order("data").order("horario_inicio");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);

    const { data, error } = await query;
    if (error && (error.message.includes("does not exist") || error.message.includes("schema cache"))) {
      return res.json({ turnos: [], missing_table: true });
    }

    res.json({ turnos: data || [], semana: { inicio, fim } });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/escala/gerar — IA gera e salva escala inteligente
router.post("/escala/gerar", async (req: Request, res: Response) => {
  try {
    const { condominio_id, dias = 7, salvar = false } = req.body as { condominio_id?: string; dias?: number; salvar?: boolean };

    // Buscar funcionários ativos
    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);
    const { data: funcs, error: funcErr } = await query;

    if (funcErr && !funcErr.message.includes("does not exist")) {
      return res.status(400).json({ error: funcErr.message });
    }

    const funcionarios = funcs || [];
    const turnos = gerarEscala(funcionarios, Number(dias));

    // Análises
    const semanaStr = new Date().toISOString().slice(0, 10);
    const portariasCoberta = [...new Set(turnos.filter(t => ["diurno","noturno"].includes(t.turno)).map(t => t.data))];
    const limpezaCoberta = [...new Set(turnos.filter(t => t.turno === "manha" && ["faxineiro","limpeza"].includes(t.cargo)).map(t => t.data))];

    const alertas = [];
    if (portariasCoberta.length < dias) alertas.push({ tipo: "cobertura", msg: `⚠️ Portaria sem cobertura em ${dias - portariasCoberta.length} dia(s)` });
    if (limpezaCoberta.length < Math.floor(dias * 0.7)) alertas.push({ tipo: "limpeza", msg: `⚠️ Limpeza insuficiente: ${limpezaCoberta.length}/${dias} dias cobertos` });

    // Contar horas por funcionário
    const horasPorFunc: Record<string, number> = {};
    for (const t of turnos) {
      const h = t.turno === "diurno" || t.turno === "noturno" ? 12 : 9;
      horasPorFunc[t.funcionario_id] = (horasPorFunc[t.funcionario_id] || 0) + h;
    }
    for (const [fid, horas] of Object.entries(horasPorFunc)) {
      if (horas > 60) {
        const func = funcionarios.find(f => f.id === fid);
        alertas.push({ tipo: "sobrecarga", msg: `🔴 ${func?.nome || "Funcionário"}: ${horas}h na semana (limite 60h)` });
      }
    }

    // Salvar no banco se solicitado
    if (salvar && condominio_id) {
      const rows = turnos.map(t => ({
        condominio_id,
        funcionario_id: t.funcionario_id,
        data: t.data,
        turno: t.turno,
        horario_inicio: t.horario_inicio,
        horario_fim: t.horario_fim,
        status: "previsto",
      }));
      // Deletar semana atual antes
      const fimDate = new Date(); fimDate.setDate(fimDate.getDate() + dias);
      await supabase.from("escala_turnos").delete().eq("condominio_id", condominio_id).gte("data", semanaStr).lt("data", fimDate.toISOString().slice(0, 10));
      await supabase.from("escala_turnos").insert(rows);
    }

    res.json({ turnos, alertas, cobertura: { portaria: portariasCoberta.length, limpeza: limpezaCoberta.length, dias }, horas_por_func: horasPorFunc, gerado_em: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — BRIEFINGS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/briefings/gerar — gera briefings diários para todos os funcionários
router.get("/briefings/gerar", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);
    const { data: funcs } = await query;

    const hoje = new Date().toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" });

    const TAREFAS_POR_CARGO: Record<string, string[]> = {
      porteiro: ["Verificar registro de visitas", "Controlar entrada e saída de veículos", "Receber correspondências e encomendas", "Realizar ronda do perímetro"],
      porteiro_chefe: ["Supervisionar equipe de portaria", "Verificar livro de ocorrências", "Coordenar equipe do turno", "Reportar anomalias ao síndico"],
      faxineiro: ["Limpeza das áreas comuns", "Sanitização dos corredores", "Limpeza da academia/salão de festas", "Recolhimento de resíduos nas lixeiras"],
      limpeza: ["Limpeza das áreas comuns", "Higienização de banheiros coletivos", "Limpeza do hall e recepção", "Varrição e lavagem de calçadas"],
      zelador: ["Verificar equipamentos e sistemas", "Inspecionar áreas comuns", "Verificar reservatórios de água", "Acompanhar serviços de manutenção"],
      jardineiro: ["Irrigação dos jardins", "Poda e manutenção de plantas", "Limpeza das áreas verdes", "Adubar e cuidar do paisagismo"],
      administrador: ["Verificar recebimento de taxas", "Atualizar relatórios gerenciais", "Responder comunicados de moradores", "Registrar ocorrências"],
    };

    const briefings = (funcs || []).map(f => {
      const tarefas = TAREFAS_POR_CARGO[f.cargo] || ["Cumprir jornada normal", "Reportar ocorrências ao supervisor", "Seguir protocolo do condomínio"];
      const risco = preverRisco(f);
      const pontosCriticos = [];
      if (Number(f.horas_extras_mes) > 15) pontosCriticos.push(`Atenção: você já possui ${f.horas_extras_mes}h extras este mês`);
      if (Number(f.faltas_mes) > 1) pontosCriticos.push(`Controle de frequência: ${f.faltas_mes} falta(s) registrada(s)`);
      if (risco.risco === "critico" || risco.risco === "alto") pontosCriticos.push("Atenção: conversar com RH sobre situação atual");

      const prioridade = f.cargo === "porteiro" || f.cargo === "porteiro_chefe" ? "Segurança do condomínio e controle de acesso" :
        f.cargo === "zelador" ? "Inspeção dos equipamentos e sistemas críticos" :
        "Manutenção e apresentação das áreas comuns";

      return {
        funcionario_id: f.id,
        nome: f.nome,
        cargo: f.cargo,
        turno: f.turno_padrao || "comercial",
        texto: `🌅 Bom dia, ${f.nome.split(" ")[0]}!\n\nHoje é ${hoje}.\nSeu turno: ${f.turno_padrao || "comercial"} | Jornada: ${f.jornada || "5x2"}\n\n📋 SUAS TAREFAS HOJE:\n${tarefas.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n${pontosCriticos.length ? `\n⚠️ ATENÇÃO:\n${pontosCriticos.map(p => `• ${p}`).join("\n")}` : ""}\n\n🎯 FOCO PRINCIPAL:\n${prioridade}\n\nBom trabalho! 💪`,
        tarefas,
        pontos_criticos: pontosCriticos,
        prioridade,
        gerado_em: new Date().toISOString(),
      };
    });

    res.json({ briefings, total: briefings.length, data: hoje });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — ALERTAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/alertas/escala
router.get("/alertas/escala", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);
    const { data: funcs } = await query;

    const alertas = [];

    for (const f of (funcs || [])) {
      const risco = preverRisco(f);
      if (risco.risco === "critico") {
        alertas.push({ tipo: "critico", funcionario: f.nome, cargo: f.cargo, msg: risco.motivo, impacto: risco.impacto, valor: risco.valor_estimado });
      } else if (risco.risco === "alto") {
        alertas.push({ tipo: "alto", funcionario: f.nome, cargo: f.cargo, msg: risco.motivo, impacto: risco.impacto, valor: risco.valor_estimado });
      }
      if (Number(f.horas_extras_mes) > 20) {
        alertas.push({ tipo: "sobrecarga", funcionario: f.nome, cargo: f.cargo, msg: `${f.horas_extras_mes}h extras este mês — redistribuir tarefas`, impacto: "Risco de burnout e ação trabalhista", valor: 0 });
      }
      if (Number(f.faltas_mes) > 3) {
        alertas.push({ tipo: "frequencia", funcionario: f.nome, cargo: f.cargo, msg: `${f.faltas_mes} faltas registradas no mês`, impacto: "Verificar situação e aplicar procedimento cabível", valor: 0 });
      }
    }

    // Verificar cobertura mínima
    const porteiros = (funcs || []).filter(f => f.cargo === "porteiro" || f.cargo === "porteiro_chefe");
    if (porteiros.length < 2) {
      alertas.push({ tipo: "cobertura", funcionario: "PORTARIA", cargo: "porteiro", msg: `Apenas ${porteiros.length} porteiro(s) cadastrado(s). Cobertura 24h em risco`, impacto: "Portaria pode ficar descoberta", valor: 0 });
    }

    const zeladores = (funcs || []).filter(f => f.cargo === "zelador");
    if (zeladores.length === 0) {
      alertas.push({ tipo: "cobertura", funcionario: "ZELADORIA", cargo: "zelador", msg: "Nenhum zelador ativo cadastrado", impacto: "Equipamentos sem supervisão", valor: 0 });
    }

    res.json({ alertas, total: alertas.length, criticos: alertas.filter(a => a.tipo === "critico").length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — DI ANÁLISE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/funcionarios/analise-di
router.get("/funcionarios/analise-di", async (req: Request, res: Response) => {
  try {
    const { condominio_id, pergunta } = req.query as { condominio_id?: string; pergunta?: string };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);
    const { data: funcs } = await query;

    const { data: cond } = condominio_id
      ? await supabase.from("condominios").select("nome,sindico_nome").eq("id", condominio_id).single()
      : { data: null };

    const equipe = (funcs || []);
    const totalFolha = equipe.reduce((s, f) => s + Number(f.salario || 0) * (1 + ENCARGOS_PERCENT), 0);
    const totalPassivo = equipe.reduce((s, f) => s + calcPassivo(Number(f.salario || 0), calcMesesAtivos(f.data_admissao || "")), 0);
    const emRisco = equipe.filter(f => ["alto","critico"].includes(preverRisco(f).risco));
    const sobrecarregados = equipe.filter(f => Number(f.horas_extras_mes || 0) > 15);

    const cargosCount: Record<string, number> = {};
    equipe.forEach(f => { cargosCount[f.cargo] = (cargosCount[f.cargo] || 0) + 1; });

    const contexto = `
MÓDULO RH — ${cond?.nome || "Condomínio"}
Síndico: ${cond?.sindico_nome || "N/A"}
Data: ${new Date().toLocaleDateString("pt-BR")}

━━━ EQUIPE ━━━
• Total: ${equipe.length} funcionários ativos
• Custo mensal (com encargos): R$ ${Math.round(totalFolha).toLocaleString("pt-BR")}
• Passivo trabalhista estimado: R$ ${Math.round(totalPassivo).toLocaleString("pt-BR")}
• Em risco trabalhista: ${emRisco.length} funcionário(s)
• Sobrecarregados: ${sobrecarregados.length} funcionário(s)

━━━ COMPOSIÇÃO ━━━
${Object.entries(cargosCount).map(([c, n]) => `• ${c}: ${n}`).join("\n")}

━━━ RISCOS ━━━
${emRisco.length ? emRisco.map(f => { const r = preverRisco(f); return `• ${f.nome} (${f.cargo}): ${r.risco.toUpperCase()} — ${r.motivo.slice(0,80)}`; }).join("\n") : "• Nenhum risco crítico identificado"}

━━━ SOBRECARGA ━━━
${sobrecarregados.length ? sobrecarregados.map(f => `• ${f.nome}: ${f.horas_extras_mes}h extras`).join("\n") : "• Nenhum sobrecarregado"}

━━━ PORTARIA ━━━
• Porteiros: ${cargosCount["porteiro"] || 0} + Chefes: ${cargosCount["porteiro_chefe"] || 0} (24h requer mínimo 2)
• Zeladores: ${cargosCount["zelador"] || 0}
• Limpeza: ${(cargosCount["faxineiro"] || 0) + (cargosCount["limpeza"] || 0)}`;

    const prompt = `Você é Di, a Síndica Virtual Estratégica. Analise a equipe de funcionários do condomínio.

${contexto}

${pergunta ? `PERGUNTA DO GESTOR: ${pergunta}\n\n` : ""}Gere uma análise executiva com:
1. DIAGNÓSTICO — estado atual da equipe
2. RISCOS — trabalhistas e operacionais (classifique: CRÍTICO / RISCO / OPORTUNIDADE)
3. ESCALA — falhas de cobertura identificadas
4. RECOMENDAÇÕES — 3 ações concretas e prioritárias

Seja objetiva, direta e use dados concretos. Máx 400 palavras.`;

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await ai.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const texto = msg.content[0].type === "text" ? msg.content[0].text : "";
    const diagnostico   = texto.match(/DIAGNÓSTICO[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|RISCO|ESCALA|RECOM|$)/i)?.[1]?.trim() || texto.slice(0, 300);
    const riscos        = texto.match(/RISCO[S]?[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|ESCALA|RECOM|$)/i)?.[1]?.trim() || "";
    const escalaAnalise = texto.match(/ESCALA[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|RECOM|$)/i)?.[1]?.trim() || "";
    const recomendacoes = texto.match(/RECOM[^:]*[:\s]+([\s\S]+)/i)?.[1]?.trim() || "";

    res.json({
      diagnostico, riscos, escala: escalaAnalise, recomendacoes,
      dados: { total: equipe.length, custo_folha: Math.round(totalFolha), passivo_total: Math.round(totalPassivo), em_risco: emRisco.length, sobrecarregados: sobrecarregados.length },
      gerado_em: new Date().toISOString(),
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/funcionarios/migration-sql — SQL para criar tabelas
router.get("/funcionarios/migration-sql", (_req: Request, res: Response) => {
  res.json({
    sql: `-- ImobCore — Módulo Funcionários & Escala Inteligente
CREATE TABLE IF NOT EXISTS funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  jornada TEXT DEFAULT '5x2',
  salario NUMERIC DEFAULT 0,
  data_admissao DATE,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','ferias','afastado')),
  telefone TEXT,
  cpf TEXT,
  horas_extras_mes NUMERIC DEFAULT 0,
  faltas_mes NUMERIC DEFAULT 0,
  turno_padrao TEXT DEFAULT 'comercial',
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escala_turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  funcionario_id UUID REFERENCES funcionarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  turno TEXT NOT NULL,
  horario_inicio TEXT,
  horario_fim TEXT,
  status TEXT DEFAULT 'previsto' CHECK (status IN ('previsto','realizado','falta','substituicao')),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_cond ON funcionarios(condominio_id);
CREATE INDEX IF NOT EXISTS idx_escala_data ON escala_turnos(data);
CREATE INDEX IF NOT EXISTS idx_escala_func ON escala_turnos(funcionario_id);`,
  });
});

export default router;
