// financeiro.service.ts — Módulo Financeiro Inteligente
// Lógica pura (sem I/O) para cálculos financeiros de condomínios

export interface Lancamento {
  id?: string;
  condominio_id?: string;
  tipo: "receita" | "despesa";
  categoria: string;
  subcategoria?: string;
  descricao: string;
  valor: number;
  data: string;
  competencia?: string;
  status: "previsto" | "pago" | "atrasado";
  created_at?: string;
}

export interface Resumo {
  receitas: number;
  despesas: number;
  saldo: number;
}

export interface ScoreInput {
  saldo: number;
  inadimplencia: number;
  receitas: number;
  despesas: number;
}

export interface FluxoInput {
  receitas: number[];
  despesas: number[];
}

export interface FluxoPrevisao {
  receitas: number;
  despesas: number;
  saldo: number;
}

export interface Indicadores extends Resumo {
  txInad: number;
  vlrInad: number;
  score: number;
  risco: "baixo" | "moderado" | "alto" | "critico";
}

// ─── calcularResumo ────────────────────────────────────────────────────────────
export function calcularResumo(lancamentos: Lancamento[]): Resumo {
  let receitas = 0;
  let despesas = 0;

  lancamentos.forEach(l => {
    if (l.tipo === "receita") receitas += Number(l.valor);
    if (l.tipo === "despesa") despesas += Number(l.valor);
  });

  return {
    receitas,
    despesas,
    saldo: receitas - despesas,
  };
}

// ─── calcularScore ─────────────────────────────────────────────────────────────
export function calcularScore({ saldo, inadimplencia, receitas, despesas }: ScoreInput): number {
  let score = 100;

  if (inadimplencia > 10) score -= 30;
  if (saldo < 0) score -= 40;
  if (despesas > receitas) score -= 20;

  return Math.max(0, score);
}

// ─── preverFluxo ──────────────────────────────────────────────────────────────
export function preverFluxo(dados: FluxoInput): FluxoPrevisao {
  const mediaReceitas =
    dados.receitas.length > 0
      ? dados.receitas.reduce((a, b) => a + b, 0) / dados.receitas.length
      : 0;
  const mediaDespesas =
    dados.despesas.length > 0
      ? dados.despesas.reduce((a, b) => a + b, 0) / dados.despesas.length
      : 0;

  return {
    receitas: Math.round(mediaReceitas),
    despesas: Math.round(mediaDespesas),
    saldo: Math.round(mediaReceitas - mediaDespesas),
  };
}

// ─── calcularIndicadores ───────────────────────────────────────────────────────
// Versão completa com inadimplência e risco, usada nas rotas da API
export function calcularIndicadores(lancamentos: Lancamento[]): Indicadores {
  const { receitas, despesas, saldo } = calcularResumo(lancamentos);

  const inadimplentes = lancamentos.filter(l => l.tipo === "receita" && l.status === "atrasado");
  const vlrInad = inadimplentes.reduce((s, r) => s + Number(r.valor), 0);
  const txInad = receitas > 0 ? Math.round((vlrInad / receitas) * 100) : 0;

  const score = calcularScore({ saldo, inadimplencia: txInad, receitas, despesas });
  const risco: Indicadores["risco"] =
    score >= 80 ? "baixo" : score >= 60 ? "moderado" : score >= 40 ? "alto" : "critico";

  return { receitas, despesas, saldo, txInad, vlrInad, score, risco };
}

// ─── calcularFluxoMensal ──────────────────────────────────────────────────────
// Agrupa lançamentos por mês e retorna série histórica + projeção
export function calcularFluxoMensal(
  lancamentos: Lancamento[],
  mesesHistorico = 6,
  mesesProjecao = 3,
): {
  historico: { mes: string; Receitas: number; Despesas: number; Resultado: number }[];
  projecao: { mes: string; Receitas: number; Despesas: number; SaldoProjetado: number }[];
  avgRec: number;
  avgDesp: number;
} {
  const now = new Date();

  // Monta mapa dos meses passados
  const monthsMap: Record<string, { rec: number; desp: number }> = {};
  for (let i = mesesHistorico - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    monthsMap[key] = { rec: 0, desp: 0 };
  }

  lancamentos.forEach(l => {
    const key = (l.data || "").slice(0, 7);
    if (monthsMap[key]) {
      if (l.tipo === "receita") monthsMap[key].rec += Number(l.valor);
      else monthsMap[key].desp += Number(l.valor);
    }
  });

  const historico = Object.entries(monthsMap).map(([mes, v]) => ({
    mes: mes.slice(5) + "/" + mes.slice(2, 4),
    Receitas: Math.round(v.rec),
    Despesas: Math.round(v.desp),
    Resultado: Math.round(v.rec - v.desp),
  }));

  // Projeção com base nos últimos 3 meses do histórico
  const ultimos3 = historico.slice(-3);
  const { receitas: avgRec, despesas: avgDesp } = preverFluxo({
    receitas: ultimos3.map(m => m.Receitas),
    despesas: ultimos3.map(m => m.Despesas),
  });

  const { saldo: saldoAtual } = calcularResumo(lancamentos);
  let saldoProj = saldoAtual;

  const projecao = Array.from({ length: mesesProjecao }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const label = `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(2)} ▸`;
    saldoProj += avgRec - avgDesp;
    return {
      mes: label,
      Receitas: avgRec,
      Despesas: avgDesp,
      SaldoProjetado: Math.round(saldoProj),
    };
  });

  return { historico, projecao, avgRec, avgDesp };
}
