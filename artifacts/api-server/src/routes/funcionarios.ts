/**
 * ImobCore — Módulo Funcionários & Escala Inteligente
 * Adaptado ao schema real do Supabase:
 * - funcionarios: nome_completo, funcao, jornada_tipo, salario_base, condominio_id ...
 * - escala_funcionarios: funcionario_id, condominio_id, data, turno, status
 * - custos_funcionarios: salario_total, custo_total, ferias, fgts, passivo_rescisao
 * - score_funcionarios: produtividade, pontualidade, qualidade, score_geral
 * - alertas_escala: tipo, descricao, impacto
 */
import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Encargos CLT padrão (INSS + FGTS + férias + 13º + outros ≈ 70%)
function getEncargos(f: any): number {
  return Number(f.encargos_percentual ?? 70) / 100;
}

function calcPassivo(f: any): number {
  const salario = Number(f.salario_base) || 0;
  const meses = calcMesesAtivos(f.data_admissao);
  const encPerc = getEncargos(f);
  const fgts = salario * 0.08 * meses;
  const ferias = (salario / 12) * meses;
  const decimoTerceiro = (salario / 12) * meses;
  const multa = salario * 0.40; // multa FGTS
  return Math.round(fgts + ferias + decimoTerceiro + multa);
}

function calcMesesAtivos(dataAdmissao: string | null): number {
  if (!dataAdmissao) return 0;
  const admissao = new Date(dataAdmissao);
  const hoje = new Date();
  return Math.max(0, Math.round((hoje.getTime() - admissao.getTime()) / (1000 * 60 * 60 * 24 * 30)));
}

// Meta encoding em observacoes: [meta:{"he":5,"fa":0}] texto...
function parseMeta(observacoes: string | null): { he: number; fa: number; text: string } {
  if (!observacoes) return { he: 0, fa: 0, text: "" };
  const match = observacoes.match(/^\[meta:(\{[^}]+\})\]\s*(.*)/s);
  if (match) {
    try {
      const meta = JSON.parse(match[1]);
      return { he: Number(meta.he) || 0, fa: Number(meta.fa) || 0, text: match[2] || "" };
    } catch { /* fall through */ }
  }
  return { he: 0, fa: 0, text: observacoes };
}

function buildObs(he: number, fa: number, text: string): string {
  return `[meta:{"he":${he},"fa":${fa}}]${text ? " " + text : ""}`;
}

function preverRisco(f: any, meta: { he: number; fa: number }): {
  risco: "baixo" | "moderado" | "alto" | "critico";
  motivo: string;
  impacto: string;
  valor_estimado: number;
} {
  const passivo = calcPassivo(f);
  const he = meta.he;
  const fa = meta.fa;

  if (he > 30 || passivo > 50000) {
    return {
      risco: "critico",
      motivo: `${he > 30 ? `Excesso crítico: ${he}h extras/mês. ` : ""}${passivo > 50000 ? `Passivo R$${passivo.toLocaleString("pt-BR")}. ` : ""}`,
      impacto: "Risco de ação trabalhista. Ação imediata necessária.",
      valor_estimado: passivo,
    };
  }
  if (he > 15 || passivo > 20000 || fa > 3) {
    return {
      risco: "alto",
      motivo: `${he > 15 ? `${he}h extras/mês (recomendado ≤15h). ` : ""}${fa > 3 ? `${fa} faltas no mês. ` : ""}${passivo > 20000 ? `Passivo R$${passivo.toLocaleString("pt-BR")}. ` : ""}`,
      impacto: "Monitorar frequência e horas extras.",
      valor_estimado: passivo,
    };
  }
  if (he > 5 || passivo > 8000) {
    return { risco: "moderado", motivo: "Situação com pontos de atenção.", impacto: "Monitoramento recomendado.", valor_estimado: passivo };
  }
  return { risco: "baixo", motivo: "Dentro dos parâmetros normais.", impacto: "Nenhuma ação necessária.", valor_estimado: passivo };
}

function calcScore(f: any, meta: { he: number; fa: number }): number {
  let score = 70;
  const meses = calcMesesAtivos(f.data_admissao);
  if (meses > 24) score += 10;
  if (meses > 60) score += 5;
  if (meta.he > 20) score -= 15;
  if (meta.fa > 2) score -= 20;
  const cargosAltos = ["zelador", "porteiro chefe", "supervisor", "administrador"];
  if (cargosAltos.some(c => (f.funcao || "").toLowerCase().includes(c))) score += 5;
  return Math.min(100, Math.max(10, score));
}

// ── ENRIQUECER FUNCIONÁRIO ────────────────────────────────────────────────────

function enriquece(f: any) {
  const meta = parseMeta(f.observacoes);
  const meses = calcMesesAtivos(f.data_admissao);
  const passivo = calcPassivo(f);
  const encPerc = getEncargos(f);
  const salario = Number(f.salario_base) || 0;
  const beneficios = Number(f.beneficios) || 0;
  const custo_total = Math.round(salario * (1 + encPerc) + beneficios);
  const risco = preverRisco(f, meta);
  const score = calcScore(f, meta);
  return {
    ...f,
    // Campos normalizados para o frontend (mantém compatibilidade)
    nome: f.nome_completo,
    cargo: f.funcao,
    jornada: f.jornada_tipo,
    salario: salario,
    turno_padrao: f.horario_trabalho,
    horas_extras_mes: meta.he,
    faltas_mes: meta.fa,
    observacoes_texto: meta.text,
    // Calculados
    meses_ativo: meses,
    passivo_trabalhista: passivo,
    custo_total,
    score_desempenho: score,
    risco_trabalhista: risco,
  };
}

// ── GERADOR DE ESCALA ─────────────────────────────────────────────────────────

function gerarEscala(funcionarios: any[], dias: number) {
  const turnos: any[] = [];
  const hoje = new Date();

  const porteiros = funcionarios.filter(f => (f.funcao || "").toLowerCase().includes("porteiro"));
  const limpeza   = funcionarios.filter(f => /(faxin|limpeza|conserv)/i.test(f.funcao || ""));
  const zeladores = funcionarios.filter(f => (f.funcao || "").toLowerCase().includes("zelador"));
  const outros    = funcionarios.filter(f => !porteiros.includes(f) && !limpeza.includes(f) && !zeladores.includes(f));

  for (let d = 0; d < dias; d++) {
    const data = new Date(hoje);
    data.setDate(data.getDate() + d);
    const dataStr = data.toISOString().slice(0, 10);
    const diaSemana = data.getDay();
    const fimSemana = diaSemana === 0 || diaSemana === 6;

    // Portaria 24h
    if (porteiros.length >= 2) {
      const idx = d % porteiros.length;
      turnos.push({ funcionario_id: porteiros[idx].id, nome: porteiros[idx].nome_completo, funcao: porteiros[idx].funcao, turno: "Diurno (07-19h)", data: dataStr, horario_inicio: "07:00", horario_fim: "19:00" });
      turnos.push({ funcionario_id: porteiros[(idx + 1) % porteiros.length].id, nome: porteiros[(idx + 1) % porteiros.length].nome_completo, funcao: porteiros[(idx + 1) % porteiros.length].funcao, turno: "Noturno (19-07h)", data: dataStr, horario_inicio: "19:00", horario_fim: "07:00" });
    } else if (porteiros.length === 1 && d % 2 === 0) {
      turnos.push({ funcionario_id: porteiros[0].id, nome: porteiros[0].nome_completo, funcao: porteiros[0].funcao, turno: "Diurno (07-19h)", data: dataStr, horario_inicio: "07:00", horario_fim: "19:00" });
    }

    // Limpeza (exceto domingo)
    if (diaSemana !== 0 && limpeza.length > 0) {
      const f = limpeza[d % limpeza.length];
      turnos.push({ funcionario_id: f.id, nome: f.nome_completo, funcao: f.funcao, turno: "Manhã (08-17h)", data: dataStr, horario_inicio: "08:00", horario_fim: "17:00" });
    }

    // Zelador (dias úteis)
    if (!fimSemana && zeladores.length > 0) {
      const f = zeladores[d % zeladores.length];
      turnos.push({ funcionario_id: f.id, nome: f.nome_completo, funcao: f.funcao, turno: "Comercial (08-17h)", data: dataStr, horario_inicio: "08:00", horario_fim: "17:00" });
    }

    // Outros (dias úteis)
    if (!fimSemana) {
      for (const f of outros) {
        turnos.push({ funcionario_id: f.id, nome: f.nome_completo, funcao: f.funcao, turno: "Comercial (08-17h)", data: dataStr, horario_inicio: "08:00", horario_fim: "17:00" });
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

    let query = supabase.from("funcionarios").select("*").order("nome_completo");

    if (condominio_id) {
      // Suporta tanto condominio_id (novo) quanto condominium_id (legado)
      query = query.or(`condominio_id.eq.${condominio_id},condominium_id.eq.${condominio_id}`);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const funcionariosComCalc = (data || []).map(enriquece);

    const custo_folha_total = funcionariosComCalc.filter(f => f.status === "ativo").reduce((s, f) => s + (f.custo_total || 0), 0);
    const passivo_total     = funcionariosComCalc.reduce((s, f) => s + (f.passivo_trabalhista || 0), 0);
    const ativos            = funcionariosComCalc.filter(f => f.status === "ativo");
    const risco_alto        = funcionariosComCalc.filter(f => ["alto", "critico"].includes(f.risco_trabalhista?.risco)).length;

    res.json({
      funcionarios: funcionariosComCalc,
      totais: { total: funcionariosComCalc.length, ativos: ativos.length, custo_folha_total, passivo_total, risco_alto },
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/funcionarios
router.post("/funcionarios", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const he = Number(b.horas_extras_mes) || 0;
    const fa = Number(b.faltas_mes) || 0;
    const obs = buildObs(he, fa, b.observacoes || "");

    // Gerar matrícula automática
    const { count } = await supabase.from("funcionarios").select("id", { count: "exact", head: true });
    const matricula = `FUNC-${String((count || 0) + 1).padStart(4, "0")}`;

    const row: any = {
      condominio_id:      b.condominio_id || null,
      condominium_id:     b.condominio_id || null, // campo legado
      matricula,
      nome_completo:      b.nome,
      cpf:                b.cpf || null,
      telefone:           b.telefone || null,
      funcao:             b.cargo,
      departamento:       b.departamento || null,
      data_admissao:      b.data_admissao || null,
      tipo_contrato:      b.tipo_contrato || "CLT",
      carga_horaria_semanal: Number(b.carga_horaria_semanal) || 44,
      horario_trabalho:   b.turno_padrao || b.horario_trabalho || null,
      salario_base:       Number(b.salario) || 0,
      vale_transporte:    Number(b.vale_transporte) || 0,
      vale_alimentacao:   Number(b.vale_alimentacao) || 0,
      beneficios:         Number(b.beneficios) || 0,
      encargos_percentual: Number(b.encargos_percentual) || 70,
      jornada_tipo:       b.jornada || null,
      status:             b.status || "ativo",
      observacoes:        obs,
      updated_at:         new Date().toISOString(),
    };

    const { data, error } = await supabase.from("funcionarios").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Salvar custos calculados na tabela custos_funcionarios
    const f = data;
    const meses = calcMesesAtivos(f.data_admissao);
    const salario = Number(f.salario_base) || 0;
    const encPerc = getEncargos(f);
    const custo_total = Math.round(salario * (1 + encPerc) + Number(f.beneficios || 0));
    const fgts = salario * 0.08 * meses;
    const ferias = (salario / 12) * meses;
    const decimoTerceiro = (salario / 12) * meses;
    const passivo = Math.round(fgts + ferias + decimoTerceiro + salario * 0.40);

    await supabase.from("custos_funcionarios").delete().eq("funcionario_id", data.id);
    await supabase.from("custos_funcionarios").insert({
      funcionario_id: data.id,
      salario_total: salario,
      custo_total,
      ferias_proporcionais: Math.round(ferias),
      decimo_terceiro: Math.round(decimoTerceiro),
      fgts: Math.round(fgts),
      multa_fgts: Math.round(salario * 0.40),
      passivo_rescisao: passivo,
      updated_at: new Date().toISOString(),
    });

    // Score inicial
    await supabase.from("score_funcionarios").delete().eq("funcionario_id", data.id);
    await supabase.from("score_funcionarios").insert({
      funcionario_id: data.id,
      produtividade: 70,
      pontualidade: 80,
      qualidade: 75,
      score_geral: 75,
      updated_at: new Date().toISOString(),
    });

    res.json({ ok: true, funcionario: enriquece(data) });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PUT /api/funcionarios/:id
router.put("/funcionarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const he = Number(b.horas_extras_mes) || 0;
    const fa = Number(b.faltas_mes) || 0;
    const obs = buildObs(he, fa, b.observacoes || "");

    const updates: any = {
      nome_completo:      b.nome,
      funcao:             b.cargo,
      jornada_tipo:       b.jornada,
      salario_base:       Number(b.salario) || 0,
      data_admissao:      b.data_admissao,
      status:             b.status,
      telefone:           b.telefone,
      cpf:                b.cpf,
      horario_trabalho:   b.turno_padrao || b.horario_trabalho,
      tipo_contrato:      b.tipo_contrato || "CLT",
      carga_horaria_semanal: Number(b.carga_horaria_semanal) || 44,
      departamento:       b.departamento,
      vale_transporte:    Number(b.vale_transporte) || 0,
      vale_alimentacao:   Number(b.vale_alimentacao) || 0,
      beneficios:         Number(b.beneficios) || 0,
      encargos_percentual: Number(b.encargos_percentual) || 70,
      observacoes:        obs,
      updated_at:         new Date().toISOString(),
    };

    const { data, error } = await supabase.from("funcionarios").update(updates).eq("id", id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Atualizar custos
    const f = data;
    const meses = calcMesesAtivos(f.data_admissao);
    const salario = Number(f.salario_base) || 0;
    const encPerc = getEncargos(f);
    const custo_total = Math.round(salario * (1 + encPerc) + Number(f.beneficios || 0));
    const fgts = salario * 0.08 * meses;
    const ferias = (salario / 12) * meses;
    const passivo = Math.round(fgts + ferias + (salario / 12) * meses + salario * 0.40);

    await supabase.from("custos_funcionarios").delete().eq("funcionario_id", id);
    await supabase.from("custos_funcionarios").insert({
      funcionario_id: id,
      salario_total: salario,
      custo_total,
      ferias_proporcionais: Math.round(ferias),
      decimo_terceiro: Math.round((salario / 12) * meses),
      fgts: Math.round(fgts),
      multa_fgts: Math.round(salario * 0.40),
      passivo_rescisao: passivo,
      updated_at: new Date().toISOString(),
    });

    // Atualizar score baseado em horas extras e faltas
    const novoScore = Math.min(100, Math.max(10, 70 - (he > 20 ? 15 : 0) - (fa > 2 ? 20 : 0) + (meses > 24 ? 10 : 0)));
    await supabase.from("score_funcionarios").delete().eq("funcionario_id", id);
    await supabase.from("score_funcionarios").insert({
      funcionario_id: id,
      produtividade: he > 15 ? 60 : 75,
      pontualidade: fa > 2 ? 50 : 80,
      qualidade: 75,
      score_geral: novoScore,
      updated_at: new Date().toISOString(),
    });

    res.json({ ok: true, funcionario: enriquece(data) });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/funcionarios/:id
router.delete("/funcionarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Deletar registros relacionados primeiro
    await supabase.from("custos_funcionarios").delete().eq("funcionario_id", id);
    await supabase.from("score_funcionarios").delete().eq("funcionario_id", id);
    await supabase.from("escala_funcionarios").delete().eq("funcionario_id", id);
    const { error } = await supabase.from("funcionarios").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — ESCALA
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/escala
router.get("/escala", async (req: Request, res: Response) => {
  try {
    const { condominio_id, semana_inicio } = req.query as { condominio_id?: string; semana_inicio?: string };
    const inicio = semana_inicio || new Date().toISOString().slice(0, 10);
    const fimDate = new Date(inicio); fimDate.setDate(fimDate.getDate() + 7);
    const fim = fimDate.toISOString().slice(0, 10);

    let query = supabase.from("escala_funcionarios")
      .select("*, funcionarios(nome_completo, funcao)")
      .gte("data", inicio).lt("data", fim)
      .order("data").order("created_at");
    if (condominio_id) query = query.eq("condominio_id", condominio_id);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Também buscar da tabela escala_turnos se existir dados
    let query2 = supabase.from("escala_turnos")
      .select("*").gte("data", inicio).lt("data", fim).order("data");
    if (condominio_id) query2 = query2.eq("condominio_id", condominio_id);
    const { data: turnos2 } = await query2;

    res.json({ turnos: data || [], turnos_extra: turnos2 || [], semana: { inicio, fim } });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/escala/gerar
router.post("/escala/gerar", async (req: Request, res: Response) => {
  try {
    const { condominio_id, dias = 7, salvar = false } = req.body as { condominio_id?: string; dias?: number; salvar?: boolean };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.or(`condominio_id.eq.${condominio_id},condominium_id.eq.${condominio_id}`);
    const { data: funcs } = await query;
    const funcionarios = funcs || [];

    const turnos = gerarEscala(funcionarios, Number(dias));

    // Análise de cobertura
    const portariasCob = [...new Set(turnos.filter(t => t.turno.toLowerCase().includes("diurno") || t.turno.toLowerCase().includes("noturno")).map(t => t.data))];
    const limpezaCob   = [...new Set(turnos.filter(t => t.turno.toLowerCase().includes("manhã") && /(faxin|limpeza|conserv)/i.test(t.funcao || "")).map(t => t.data))];

    const alertas = [];
    if (portariasCob.length < dias) alertas.push({ tipo: "cobertura", msg: `⚠️ Portaria sem cobertura em ${dias - portariasCob.length} dia(s)` });
    if (limpezaCob.length < Math.floor(dias * 0.7)) alertas.push({ tipo: "limpeza", msg: `⚠️ Limpeza insuficiente: ${limpezaCob.length}/${dias} dias` });

    const horasFunc: Record<string, number> = {};
    for (const t of turnos) {
      const h = t.turno.includes("19-07") || t.turno.includes("07-19") ? 12 : 9;
      horasFunc[t.funcionario_id] = (horasFunc[t.funcionario_id] || 0) + h;
    }
    for (const [fid, h] of Object.entries(horasFunc)) {
      if (h > 60) {
        const f = funcionarios.find((x: any) => x.id === fid);
        alertas.push({ tipo: "sobrecarga", msg: `🔴 ${f?.nome_completo || "Funcionário"}: ${h}h na semana` });
      }
    }

    // Salvar na tabela escala_funcionarios
    if (salvar && condominio_id) {
      const hoje = new Date().toISOString().slice(0, 10);
      const fimDate = new Date(); fimDate.setDate(fimDate.getDate() + Number(dias));
      await supabase.from("escala_funcionarios").delete().eq("condominio_id", condominio_id).gte("data", hoje).lt("data", fimDate.toISOString().slice(0, 10));
      const rows = turnos.map(t => ({
        condominio_id,
        funcionario_id: t.funcionario_id,
        data: t.data,
        turno: t.turno,
        status: "previsto",
      }));
      await supabase.from("escala_funcionarios").insert(rows);

      // Salvar alertas
      if (alertas.length > 0) {
        await supabase.from("alertas_escala").insert(alertas.map(a => ({
          condominio_id,
          tipo: a.tipo,
          descricao: a.msg,
          impacto: "Verificar cobertura da escala",
        })));
      }
    }

    res.json({ turnos, alertas, cobertura: { portaria: portariasCob.length, limpeza: limpezaCob.length, dias }, horas_por_func: horasFunc, gerado_em: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — BRIEFINGS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/briefings/gerar", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.or(`condominio_id.eq.${condominio_id},condominium_id.eq.${condominio_id}`);
    const { data: funcs } = await query;

    const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

    const TAREFAS: Record<string, string[]> = {
      porteiro: ["Verificar registro de visitas", "Controlar entrada e saída de veículos", "Receber correspondências", "Realizar ronda do perímetro"],
      zelador: ["Verificar equipamentos e sistemas", "Inspecionar áreas comuns", "Verificar reservatórios de água", "Acompanhar serviços de manutenção"],
      faxineiro: ["Limpeza das áreas comuns", "Sanitização dos corredores", "Recolhimento de resíduos", "Limpeza da academia e salões"],
      limpeza: ["Higienização de banheiros coletivos", "Limpeza do hall e recepção", "Varrição e lavagem de calçadas", "Manutenção de áreas verdes"],
      jardineiro: ["Irrigação dos jardins", "Poda e manutenção de plantas", "Limpeza das áreas verdes", "Adubação e paisagismo"],
      administrador: ["Verificar recebimento de taxas", "Atualizar relatórios gerenciais", "Responder moradores", "Registrar ocorrências"],
    };

    const briefings = (funcs || []).map(f => {
      const meta = parseMeta(f.observacoes);
      const funcaoLower = (f.funcao || "").toLowerCase();
      const tipoTarefa = Object.keys(TAREFAS).find(k => funcaoLower.includes(k)) || "zelador";
      const tarefas = TAREFAS[tipoTarefa] || ["Cumprir jornada", "Reportar ocorrências", "Seguir protocolo"];

      const pontos: string[] = [];
      if (meta.he > 15) pontos.push(`Você possui ${meta.he}h extras este mês — atenção ao limite`);
      if (meta.fa > 1) pontos.push(`${meta.fa} falta(s) registrada(s) neste mês`);

      const prioridade = funcaoLower.includes("porteiro") ? "Segurança e controle de acesso" :
        funcaoLower.includes("zelador") ? "Inspeção de equipamentos críticos" :
        "Manutenção das áreas comuns";

      const nome = f.nome_completo?.split(" ")[0] || "Funcionário";
      const turno = f.horario_trabalho || f.jornada_tipo || "Horário padrão";

      return {
        funcionario_id: f.id,
        nome: f.nome_completo,
        cargo: f.funcao,
        turno,
        texto: `🌅 Bom dia, ${nome}!\n\nHoje é ${hoje}.\nSeu turno: ${turno}\n\n📋 SUAS TAREFAS HOJE:\n${tarefas.map((t, i) => `${i + 1}. ${t}`).join("\n")}${pontos.length ? `\n\n⚠️ ATENÇÃO:\n${pontos.map(p => `• ${p}`).join("\n")}` : ""}\n\n🎯 FOCO PRINCIPAL:\n${prioridade}\n\nBom trabalho! 💪`,
        tarefas,
        pontos_criticos: pontos,
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

router.get("/alertas/escala", async (req: Request, res: Response) => {
  try {
    const { condominio_id } = req.query as { condominio_id?: string };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.or(`condominio_id.eq.${condominio_id},condominium_id.eq.${condominio_id}`);
    const { data: funcs } = await query;

    const alertas: any[] = [];
    for (const f of (funcs || [])) {
      const meta = parseMeta(f.observacoes);
      const risco = preverRisco(f, meta);
      if (risco.risco === "critico" || risco.risco === "alto") {
        alertas.push({ tipo: risco.risco, funcionario: f.nome_completo, cargo: f.funcao, msg: risco.motivo, impacto: risco.impacto, valor: risco.valor_estimado });
      }
      if (meta.he > 20) alertas.push({ tipo: "sobrecarga", funcionario: f.nome_completo, cargo: f.funcao, msg: `${meta.he}h extras — redistribuir tarefas`, impacto: "Risco de burnout e ação trabalhista", valor: 0 });
      if (meta.fa > 3) alertas.push({ tipo: "frequencia", funcionario: f.nome_completo, cargo: f.funcao, msg: `${meta.fa} faltas registradas no mês`, impacto: "Verificar situação", valor: 0 });
    }

    const porteiros = (funcs || []).filter(f => (f.funcao || "").toLowerCase().includes("porteiro"));
    if (porteiros.length < 2) alertas.push({ tipo: "cobertura", funcionario: "PORTARIA", cargo: "porteiro", msg: `Apenas ${porteiros.length} porteiro(s). Cobertura 24h em risco`, impacto: "Portaria pode ficar descoberta", valor: 0 });
    const zeladores = (funcs || []).filter(f => (f.funcao || "").toLowerCase().includes("zelador"));
    if (zeladores.length === 0) alertas.push({ tipo: "cobertura", funcionario: "ZELADORIA", cargo: "zelador", msg: "Nenhum zelador ativo", impacto: "Equipamentos sem supervisão", valor: 0 });

    // Salvar alertas no banco
    if (condominio_id && alertas.length > 0) {
      await supabase.from("alertas_escala").delete().eq("condominio_id", condominio_id);
      await supabase.from("alertas_escala").insert(alertas.slice(0, 10).map(a => ({
        condominio_id,
        tipo: a.tipo,
        descricao: a.msg,
        impacto: a.impacto,
      })));
    }

    res.json({ alertas, total: alertas.length, criticos: alertas.filter(a => a.tipo === "critico").length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — DI ANÁLISE
// ══════════════════════════════════════════════════════════════════════════════

router.get("/funcionarios/analise-di", async (req: Request, res: Response) => {
  try {
    const { condominio_id, pergunta } = req.query as { condominio_id?: string; pergunta?: string };

    let query = supabase.from("funcionarios").select("*").eq("status", "ativo");
    if (condominio_id) query = query.or(`condominio_id.eq.${condominio_id},condominium_id.eq.${condominio_id}`);
    const { data: funcs } = await query;

    const { data: cond } = condominio_id
      ? await supabase.from("condominios").select("nome,sindico_nome").eq("id", condominio_id).single()
      : { data: null };

    const equipe = funcs || [];
    const enriched = equipe.map(f => enriquece(f));
    const totalFolha  = enriched.filter(f => f.status === "ativo").reduce((s, f) => s + (f.custo_total || 0), 0);
    const totalPassivo = enriched.reduce((s, f) => s + (f.passivo_trabalhista || 0), 0);
    const emRisco      = enriched.filter(f => ["alto", "critico"].includes(f.risco_trabalhista?.risco));
    const sobrecarreg  = enriched.filter(f => (f.horas_extras_mes || 0) > 15);

    const cargosCount: Record<string, number> = {};
    equipe.forEach(f => { const fn = f.funcao || "outro"; cargosCount[fn] = (cargosCount[fn] || 0) + 1; });

    const contexto = `
MÓDULO RH — ${cond?.nome || "Condomínio"}
Síndico: ${cond?.sindico_nome || "N/A"} | Data: ${new Date().toLocaleDateString("pt-BR")}

EQUIPE (${equipe.length} funcionários ativos)
• Custo mensal total: R$ ${Math.round(totalFolha).toLocaleString("pt-BR")}
• Passivo trabalhista: R$ ${Math.round(totalPassivo).toLocaleString("pt-BR")}
• Em risco: ${emRisco.length} | Sobrecarregados: ${sobrecarreg.length}

COMPOSIÇÃO: ${Object.entries(cargosCount).map(([c, n]) => `${c}:${n}`).join(" | ")}

RISCOS: ${emRisco.length ? emRisco.map(f => `${f.nome_completo}(${f.funcao}): ${f.risco_trabalhista.risco.toUpperCase()} — ${f.risco_trabalhista.motivo.slice(0, 80)}`).join("; ") : "Nenhum risco crítico"}

PORTARIA: ${cargosCount["Porteiro"] || (cargosCount["porteiro"] || 0)} porteiros (necessário ≥2 para cobertura 24h)
ZELADORES: ${cargosCount["Zelador"] || (cargosCount["zelador"] || 0)}`;

    const prompt = `Você é Di, a Síndica Virtual Estratégica. Analise a equipe de funcionários.

${contexto}
${pergunta ? `\nPERGUNTA DO GESTOR: ${pergunta}` : ""}

Gere análise executiva com:
1. DIAGNÓSTICO — estado atual da equipe
2. RISCOS — trabalhistas e operacionais (CRÍTICO / RISCO / OPORTUNIDADE)
3. ESCALA — falhas de cobertura identificadas
4. RECOMENDAÇÕES — 3 ações concretas e prioritárias

Seja objetiva, direta e use dados concretos. Máx 400 palavras.`;

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ai.messages.create({ model: "claude-sonnet-4-5", max_tokens: 800, messages: [{ role: "user", content: prompt }] });
    const texto = msg.content[0].type === "text" ? msg.content[0].text : "";

    const diagnostico   = texto.match(/DIAGNÓSTICO[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|RISCO|ESCALA|RECOM|$)/i)?.[1]?.trim() || texto.slice(0, 300);
    const riscos        = texto.match(/RISCO[S]?[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|ESCALA|RECOM|$)/i)?.[1]?.trim() || "";
    const escalaAnalise = texto.match(/ESCALA[^:]*[:\s]+([\s\S]+?)(?=\n\s*\d+\.|RECOM|$)/i)?.[1]?.trim() || "";
    const recomendacoes = texto.match(/RECOM[^:]*[:\s]+([\s\S]+)/i)?.[1]?.trim() || "";

    res.json({
      diagnostico, riscos, escala: escalaAnalise, recomendacoes,
      dados: { total: equipe.length, custo_folha: Math.round(totalFolha), passivo_total: Math.round(totalPassivo), em_risco: emRisco.length, sobrecarregados: sobrecarreg.length },
      gerado_em: new Date().toISOString(),
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Informações do schema real
router.get("/funcionarios/schema-info", (_req: Request, res: Response) => {
  res.json({
    tabelas: ["funcionarios", "escala_funcionarios", "escala_turnos", "custos_funcionarios", "score_funcionarios", "alertas_escala"],
    campos_principais: {
      funcionarios: "nome_completo, funcao, jornada_tipo, salario_base, condominio_id, tipo_contrato, status",
      escala_funcionarios: "funcionario_id, condominio_id, data, turno, status",
      custos_funcionarios: "funcionario_id, salario_total, custo_total, passivo_rescisao",
      score_funcionarios: "funcionario_id, produtividade, pontualidade, qualidade, score_geral",
    },
    nota: "horas_extras_mes e faltas_mes são armazenados em observacoes com meta-encoding [meta:{\"he\":N,\"fa\":M}]",
  });
});

export default router;
