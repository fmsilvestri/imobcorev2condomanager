import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanoManut = {
  id: string; condominio_id: string; codigo?: string; nome: string;
  tipo: string; setor?: string; periodicidade?: string;
  frequencia_tipo?: string; frequencia_valor?: number;
  prestador_nome?: string; prestador_contato?: string;
  custo_estimado?: number; custo_total?: number;
  gerar_os_automatica?: boolean; dias_antecedencia?: number; ativo?: boolean;
  template_checklist?: { item: string; done: boolean }[];
  execucoes_realizadas?: number; execucoes_total?: number; di_gerado?: boolean;
  equipamentos_itens?: { equipId: string; equipNome: string; custo_previsto: number }[];
  proxima_execucao?: string; ultima_execucao?: string;
  instrucoes?: string; status?: string; tempo_estimado_min?: number; created_at?: string;
};

type Equipamento = { id: string; nome: string; categoria: string; catIcon: string; local: string; status: string };

type Props = {
  condId: string; condNome: string;
  equipList: Equipamento[];
  showToast: (msg: string, type?: string) => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const SETOR_COLORS: Record<string, string> = {
  hidraulico:"#0ea5e9", elevador:"#8b5cf6", eletrico:"#f59e0b",
  seguranca:"#10b981", incendio:"#ef4444", jardinagem:"#22c55e",
  garagem:"#f97316", estrutural:"#6b7280", limpeza:"#a78bfa",
  piscina:"#06b6d4", geral:"#94a3b8",
};
const SETOR_ICONS: Record<string, string> = {
  hidraulico:"💧", elevador:"🛗", eletrico:"⚡", seguranca:"🔒",
  incendio:"🔥", jardinagem:"🌿", garagem:"🚗", estrutural:"🏗️",
  limpeza:"🧹", piscina:"🏊", geral:"🏢",
};
const SETOR_LABELS: Record<string, string> = {
  hidraulico:"Hidráulico", elevador:"Elevador", eletrico:"Elétrico",
  seguranca:"Segurança", incendio:"Incêndio", jardinagem:"Jardinagem",
  garagem:"Garagem", estrutural:"Estrutural", limpeza:"Limpeza",
  piscina:"Piscina", geral:"Geral",
};
const TODOS_SETORES = ["hidraulico","elevador","eletrico","seguranca","incendio","jardinagem","garagem","estrutural","limpeza","piscina"];
const TIPOS_PLANO = ["preventiva","corretiva","preditiva","inspecao"];
const TIPO_LABELS: Record<string, string> = { preventiva:"Preventiva", corretiva:"Corretiva", preditiva:"Preditiva", inspecao:"Inspeção" };
const TIPO_COLORS: Record<string, string> = { preventiva:"#10B981", corretiva:"#EF4444", preditiva:"#3B82F6", inspecao:"#F59E0B" };
const TIPO_ICONS: Record<string, string> = { preventiva:"🛡️", corretiva:"🔧", preditiva:"🔮", inspecao:"🔍" };
const FREQ_TIPOS = ["semanal","mensal","bimestral","trimestral","semestral","anual"];
const FREQ_LABELS: Record<string, string> = { semanal:"Semanal", mensal:"Mensal", bimestral:"Bimestral", trimestral:"Trimestral", semestral:"Semestral", anual:"Anual" };
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => (v || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
const fmtDate = (s: string | undefined) => s ? new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "—";

function calcProxima(p: PlanoManut): Date {
  const base = p.ultima_execucao ? new Date(p.ultima_execucao)
    : p.proxima_execucao ? new Date(p.proxima_execucao + "T12:00:00")
    : new Date(p.created_at || Date.now());
  const ft = p.frequencia_tipo || p.periodicidade || "mensal";
  const fv = p.frequencia_valor || 1;
  const dias = ft === "semanal" ? 7 * fv : ft === "mensal" ? 30 * fv : ft === "bimestral" ? 60 : ft === "trimestral" ? 90 : ft === "semestral" ? 180 : 365;
  return new Date(base.getTime() + dias * 86_400_000);
}

function urgencia(proxima: Date): "vencido" | "urgente" | "ok" {
  const diff = (proxima.getTime() - Date.now()) / 86_400_000;
  return diff < 0 ? "vencido" : diff <= 7 ? "urgente" : "ok";
}

function custoAnual(p: PlanoManut): number {
  const c = p.custo_estimado || p.custo_total || 0;
  const ft = p.frequencia_tipo || p.periodicidade || "mensal";
  const fv = p.frequencia_valor || 1;
  const vezesAno = ft === "semanal" ? Math.round(52 / fv) : ft === "mensal" ? Math.round(12 / fv) : ft === "bimestral" ? 6 : ft === "trimestral" ? 4 : ft === "semestral" ? 2 : 1;
  return c * vezesAno;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PlanosModule({ condId, condNome, equipList, showToast }: Props) {
  const [planoList, setPlanoList] = useState<PlanoManut[]>([]);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<"visao"|"setor"|"gerador"|"calendario">("visao");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const [gerandoOsId, setGerandoOsId] = useState<string|null>(null);

  // form
  const emptyForm = () => ({
    nome:"", tipo:"preventiva", setor:"hidraulico", periodicidade:"mensal",
    frequencia_tipo:"mensal", frequencia_valor:1,
    prestador_nome:"", prestador_contato:"",
    custo_estimado:0, gerar_os_automatica:true, dias_antecedencia:7,
    ativo:true, instrucoes:"", proxima_execucao:"", execucoes_total:12,
    equipamentos_itens:[] as {equipId:string;equipNome:string;custo_previsto:number}[],
  });
  const [form, setForm] = useState(emptyForm());

  // Di generator state
  const [diSetores, setDiSetores] = useState<string[]>(["hidraulico","elevador","eletrico"]);
  const [diMes, setDiMes] = useState(String(new Date().getMonth() + 1));
  const [diTipo, setDiTipo] = useState("preventiva");
  const [diGerarOs, setDiGerarOs] = useState(true);
  const [diLoading, setDiLoading] = useState(false);
  const [diPreview, setDiPreview] = useState<PlanoManut[]>([]);
  const [diImporting, setDiImporting] = useState(false);

  const loadPlanos = useCallback(async () => {
    if (!condId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/planos?condominio_id=${condId}`);
      const d = await r.json();
      setPlanoList(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [condId]);

  useEffect(() => { loadPlanos(); }, [loadPlanos]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const orcamentoAnual = planoList.reduce((s, p) => s + custoAnual(p), 0);
  const equipCobertos = new Set(planoList.flatMap(p => (p.equipamentos_itens || []).map(e => e.equipId))).size;
  const planosSorted = [...planoList].filter(p => p.proxima_execucao || p.ultima_execucao);
  planosSorted.sort((a, b) => calcProxima(a).getTime() - calcProxima(b).getTime());
  const proxExec = planosSorted[0] ? calcProxima(planosSorted[0]) : null;

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const url = editId ? `/api/planos/${editId}` : `/api/planos`;
      const method = editId ? "PUT" : "POST";
      const body = editId ? form : { ...form, condominio_id: condId };
      const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const d = await r.json();
      if (r.ok) { showToast(editId ? "Plano atualizado!" : "Plano criado!", "success"); await loadPlanos(); setShowForm(false); setEditId(null); setForm(emptyForm()); }
      else showToast("Erro: " + d.error, "error");
    } catch { showToast("Erro ao salvar plano", "error"); }
    setSaving(false);
  };

  const del = async (id: string, nome: string) => {
    if (!confirm(`Excluir plano "${nome}"?`)) return;
    await fetch(`/api/planos/${id}`, { method:"DELETE" });
    await loadPlanos();
    showToast("Plano excluído", "success");
  };

  const editPlano = (p: PlanoManut) => {
    setEditId(p.id);
    setForm({
      nome: p.nome || "", tipo: p.tipo || "preventiva", setor: p.setor || "hidraulico",
      periodicidade: p.periodicidade || "mensal", frequencia_tipo: p.frequencia_tipo || "mensal",
      frequencia_valor: p.frequencia_valor || 1, prestador_nome: p.prestador_nome || "",
      prestador_contato: p.prestador_contato || "", custo_estimado: p.custo_estimado || 0,
      gerar_os_automatica: p.gerar_os_automatica ?? true, dias_antecedencia: p.dias_antecedencia || 7,
      ativo: p.ativo ?? true, instrucoes: p.instrucoes || "",
      proxima_execucao: p.proxima_execucao || "", execucoes_total: p.execucoes_total || 12,
      equipamentos_itens: Array.isArray(p.equipamentos_itens) ? p.equipamentos_itens : [],
    });
    setShowForm(true);
  };

  const toggleEquip = (eq: Equipamento) => {
    const ex = form.equipamentos_itens.find(e => e.equipId === eq.id);
    setForm(f => ({
      ...f, equipamentos_itens: ex
        ? f.equipamentos_itens.filter(e => e.equipId !== eq.id)
        : [...f.equipamentos_itens, { equipId: eq.id, equipNome: eq.nome, custo_previsto: 0 }],
    }));
  };

  const gerarOS = async (plano: PlanoManut) => {
    setGerandoOsId(plano.id);
    try {
      const r = await fetch(`/api/planos/${plano.id}/gerar-os`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ condominio_id: condId }),
      });
      const d = await r.json();
      if (r.ok) showToast(`OS-${String(d.os?.numero || "").padStart(3,"0")} criada com sucesso!`, "success");
      else showToast("Erro ao gerar OS: " + d.error, "error");
    } catch { showToast("Erro ao gerar OS", "error"); }
    setGerandoOsId(null);
  };

  // ── Gerador Di ─────────────────────────────────────────────────────────────
  const gerarComDi = async () => {
    if (!diSetores.length) { showToast("Selecione ao menos um setor", "error"); return; }
    setDiLoading(true); setDiPreview([]);
    try {
      const r = await fetch("/api/planos/gerar-com-di", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ condominio_id: condId, condominio_nome: condNome, setores: diSetores, mes_inicio: parseInt(diMes), tipo: diTipo, gerar_os_automatica: diGerarOs, equipamentos: equipList.map(e => e.nome) }),
      });
      const d = await r.json();
      if (r.ok && Array.isArray(d.planos)) { setDiPreview(d.planos); showToast(`${d.planos.length} planos gerados por Di!`, "success"); }
      else showToast("Erro: " + (d.error || "Resposta inválida"), "error");
    } catch { showToast("Erro ao chamar Di", "error"); }
    setDiLoading(false);
  };

  const importarDiPlanos = async () => {
    if (!diPreview.length) return;
    setDiImporting(true);
    try {
      const inserts = diPreview.map(p => ({
        condominio_id: condId, nome: p.nome, tipo: p.tipo, setor: p.setor,
        frequencia_tipo: p.frequencia_tipo, frequencia_valor: p.frequencia_valor,
        custo_estimado: p.custo_estimado, prestador_nome: p.prestador_nome,
        instrucoes: p.instrucoes, gerar_os_automatica: diGerarOs, di_gerado: true, ativo: true,
        execucoes_total: 12, execucoes_realizadas: 0,
      }));
      for (const ins of inserts) {
        await fetch("/api/planos", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(ins) });
      }
      await loadPlanos();
      setDiPreview([]); setSubTab("visao");
      showToast(`${inserts.length} planos importados com sucesso!`, "success");
    } catch { showToast("Erro ao importar planos", "error"); }
    setDiImporting(false);
  };

  // ── Calendar data ───────────────────────────────────────────────────────────
  const calcCalendario = () => {
    const ano = new Date().getFullYear();
    const custoPorMes = Array(12).fill(0);
    const eventosPorMes: { nome: string; setor: string; cor: string }[][] = Array.from({length:12}, () => []);
    planoList.filter(p => p.ativo !== false).forEach(p => {
      const ft = p.frequencia_tipo || p.periodicidade || "mensal";
      const fv = p.frequencia_valor || 1;
      const diasFreq = ft === "semanal" ? 7 * fv : ft === "mensal" ? 30 * fv : ft === "bimestral" ? 60 : ft === "trimestral" ? 90 : ft === "semestral" ? 180 : 365;
      const custo = p.custo_estimado || p.custo_total || 0;
      const cor = SETOR_COLORS[p.setor || "geral"] || "#94a3b8";
      let data = new Date(ano, 0, 1);
      while (data.getFullYear() === ano) {
        const mes = data.getMonth();
        custoPorMes[mes] += custo;
        eventosPorMes[mes].push({ nome: p.nome, setor: p.setor || "geral", cor });
        data = new Date(data.getTime() + diasFreq * 86_400_000);
      }
    });
    return { custoPorMes, eventosPorMes };
  };
  const { custoPorMes, eventosPorMes } = calcCalendario();

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = filtroSetor === "todos" ? planoList : planoList.filter(p => p.setor === filtroSetor);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inp = { width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" as const };
  const sel = { ...inp, background:"#1E2132" };
  const lbl = { fontSize:10, fontWeight:700 as const, color:"#64748B", marginBottom:5, display:"block" as const };
  const tabSt = (t: string) => ({
    padding:"8px 16px", fontSize:12, fontWeight:700 as const, cursor:"pointer" as const, borderRadius:8,
    background: subTab === t ? "rgba(99,102,241,.35)" : "rgba(255,255,255,.04)",
    color: subTab === t ? "#C4B5FD" : "#94A3B8",
    border: subTab === t ? "1px solid rgba(99,102,241,.6)" : "1px solid rgba(255,255,255,.08)",
    transition:"all .15s",
  });

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:"#E2E8F0" }}>📅 Planos de Manutenção</div>
          <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>Gestão completa de planos preventivos, corretivos e preditivos com Di IA</div>
        </div>
        {subTab === "visao" && (
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm()); }}
            style={{ background:"linear-gradient(135deg,#7C5CFC,#A78BFA)", border:"none", borderRadius:10, padding:"9px 20px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(124,92,252,.35)" }}>
            ＋ Novo Plano
          </button>
        )}
      </div>

      {/* KPI cards */}
      {planoList.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18 }}>
          {[
            { label:"Total Planos", val:String(planoList.length), icon:"📋", color:"#A78BFA", bg:"rgba(167,139,250,.12)", border:"rgba(167,139,250,.25)" },
            { label:"Orçamento Anual", val:"R$ "+orcamentoAnual.toLocaleString("pt-BR",{maximumFractionDigits:0}), icon:"💰", color:"#34D399", bg:"rgba(52,211,153,.1)", border:"rgba(52,211,153,.25)" },
            { label:"Equip. Cobertos", val:String(equipCobertos), icon:"⚙️", color:"#FBBF24", bg:"rgba(251,191,36,.1)", border:"rgba(251,191,36,.25)" },
            { label:"Próxima Execução", val: proxExec ? proxExec.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}) : "—", icon:"📅", color:"#38BDF8", bg:"rgba(56,189,248,.1)", border:"rgba(56,189,248,.25)" },
          ].map(k => (
            <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.border}`, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
              <div style={{ fontSize:18, fontWeight:800, color:k.color, lineHeight:1.1 }}>{k.val}</div>
              <div style={{ fontSize:10, color:"#64748B", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em", marginTop:2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tab bar */}
      <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
        {([["visao","📋 Visão Geral"],["setor","🏗️ Por Setor"],["gerador","✨ Gerador Di"],["calendario","📅 Calendário Anual"]] as [typeof subTab, string][]).map(([k,l]) => (
          <button key={k} style={tabSt(k)} onClick={() => setSubTab(k)}>{l}</button>
        ))}
      </div>

      {/* ══ SUB-TAB 1: VISÃO GERAL ══════════════════════════════════════════ */}
      {subTab === "visao" && (
        <div>
          {/* Filter by setor */}
          {planoList.length > 0 && (
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}
                style={{ background:"#1E2132", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", color:"#94A3B8", fontSize:12 }}>
                <option value="todos">🗂️ Todos os setores</option>
                {TODOS_SETORES.map(s => <option key={s} value={s}>{SETOR_ICONS[s]} {SETOR_LABELS[s]}</option>)}
              </select>
              <span style={{ fontSize:11, color:"#475569", alignSelf:"center" }}>{filtered.length} plano{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          {loading && <div style={{ color:"#475569", textAlign:"center", padding:24 }}>Carregando planos...</div>}

          {!loading && planoList.length === 0 && !showForm && (
            <div style={{ background:"rgba(255,255,255,.02)", border:"1px dashed rgba(255,255,255,.1)", borderRadius:12, padding:40, textAlign:"center" }}>
              <div style={{ fontSize:42, marginBottom:10 }}>📋</div>
              <div style={{ color:"#64748B", fontSize:14, fontWeight:600 }}>Nenhum plano de manutenção criado</div>
              <div style={{ color:"#334155", fontSize:12, marginTop:4 }}>Clique em "＋ Novo Plano" ou use o "✨ Gerador Di" para começar</div>
            </div>
          )}

          {/* Plan cards */}
          {!showForm && filtered.map(p => {
            const setorCor = SETOR_COLORS[p.setor || "geral"] || "#94a3b8";
            const tipoCor = TIPO_COLORS[p.tipo] || "#94A3B8";
            const tipoIcon = TIPO_ICONS[p.tipo] || "📋";
            const proxima = calcProxima(p);
            const urg = urgencia(proxima);
            const progPct = p.execucoes_total ? Math.round(((p.execucoes_realizadas || 0) / p.execucoes_total) * 100) : 0;
            const progColor = progPct >= 75 ? "#10B981" : progPct >= 40 ? "#F59E0B" : "#6366F1";
            const urgColors = { vencido:{ bg:"#EF444422", col:"#EF4444", border:"#EF444455" }, urgente:{ bg:"#F59E0B22", col:"#F59E0B", border:"#F59E0B55" }, ok:{ bg:"#10B98122", col:"#10B981", border:"#10B98155" } };
            const uc = urgColors[urg];
            const itvens = Array.isArray(p.equipamentos_itens) ? p.equipamentos_itens : [];
            const isExpanded = expandedId === p.id;
            return (
              <div key={p.id} style={{ background:"rgba(255,255,255,.025)", border:`1px solid ${setorCor}33`, borderLeft:`4px solid ${setorCor}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start", flex:1 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:`${tipoCor}22`, border:`1px solid ${tipoCor}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                      {tipoIcon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:5 }}>
                        <span style={{ fontSize:14, fontWeight:800, color:"#F1F5F9" }}>{p.nome}</span>
                        {p.di_gerado && <span style={{ fontSize:9, background:"rgba(139,92,246,.25)", color:"#C4B5FD", border:"1px solid rgba(139,92,246,.4)", borderRadius:10, padding:"1px 7px", fontWeight:700 }}>✨ Di</span>}
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <span style={{ background:`${tipoCor}25`, color:tipoCor, fontSize:10, borderRadius:20, padding:"2px 9px", fontWeight:700, border:`1px solid ${tipoCor}55` }}>{tipoIcon} {TIPO_LABELS[p.tipo] || p.tipo}</span>
                        <span style={{ background:`${setorCor}20`, color:setorCor, fontSize:10, borderRadius:20, padding:"2px 9px", fontWeight:700, border:`1px solid ${setorCor}50` }}>{SETOR_ICONS[p.setor||"geral"]} {SETOR_LABELS[p.setor||"geral"]||p.setor}</span>
                        <span style={{ background:"rgba(148,163,184,.1)", color:"#94A3B8", fontSize:10, borderRadius:20, padding:"2px 9px", fontWeight:600, border:"1px solid rgba(148,163,184,.2)" }}>
                          {FREQ_LABELS[p.frequencia_tipo || p.periodicidade || "mensal"]}
                        </span>
                        <span style={{ background:uc.bg, color:uc.col, fontSize:10, borderRadius:20, padding:"2px 9px", fontWeight:700, border:`1px solid ${uc.border}` }}>
                          {urg === "vencido" ? "⚠ VENCIDO" : urg === "urgente" ? "⚡ URGENTE" : "✅ OK"} · {fmtDate(proxima.toISOString())}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:5, flexShrink:0, alignItems:"center" }}>
                    <button onClick={() => gerarOS(p)} disabled={gerandoOsId === p.id}
                      style={{ background:"rgba(16,185,129,.2)", border:"1px solid rgba(16,185,129,.4)", borderRadius:8, padding:"5px 10px", color:"#34D399", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      {gerandoOsId === p.id ? "⏳" : "🔧 Gerar OS"}
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"5px 10px", color:"#94A3B8", fontSize:11, cursor:"pointer" }}>
                      {isExpanded ? "▲" : "▼"}
                    </button>
                    <button onClick={() => editPlano(p)}
                      style={{ background:"rgba(99,102,241,.18)", border:"1px solid rgba(99,102,241,.35)", borderRadius:8, padding:"5px 10px", color:"#A5B4FC", fontSize:11, fontWeight:700, cursor:"pointer" }}>✏️</button>
                    <button onClick={() => del(p.id, p.nome)}
                      style={{ background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.25)", borderRadius:8, padding:"5px 8px", color:"#F87171", fontSize:11, cursor:"pointer" }}>🗑️</button>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:10, color:"#475569" }}>Progresso: {p.execucoes_realizadas || 0}/{p.execucoes_total || 12} execuções</span>
                    <span style={{ fontSize:10, color:progColor, fontWeight:700 }}>{progPct}%</span>
                  </div>
                  <div style={{ height:6, background:"rgba(255,255,255,.06)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:`${progPct}%`, height:"100%", background:progColor, borderRadius:3, transition:"width .4s" }} />
                  </div>
                </div>

                {/* Equipment chips */}
                {itvens.length > 0 && (
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                    {itvens.slice(0,6).map(it => (
                      <span key={it.equipId} style={{ background:`${setorCor}12`, border:`1px solid ${setorCor}30`, borderRadius:8, padding:"2px 8px", fontSize:10, color:"#CBD5E1" }}>
                        ⚙️ {it.equipNome}{it.custo_previsto > 0 ? ` · ${fmtBRL(it.custo_previsto)}` : ""}
                      </span>
                    ))}
                    {itvens.length > 6 && <span style={{ fontSize:10, color:"#475569" }}>+{itvens.length - 6} mais</span>}
                  </div>
                )}

                {/* Footer */}
                <div style={{ display:"flex", gap:12, fontSize:11, color:"#475569", borderTop:`1px solid ${setorCor}22`, paddingTop:8, alignItems:"center", flexWrap:"wrap" }}>
                  {p.prestador_nome && <span>👤 {p.prestador_nome}</span>}
                  {p.instrucoes && <span style={{ maxWidth:300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📝 {p.instrucoes}</span>}
                  <span style={{ marginLeft:"auto", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.25)", borderRadius:8, padding:"3px 10px", color:"#34D399", fontWeight:800, fontSize:13 }}>
                    {fmtBRL(p.custo_estimado || p.custo_total || 0)} / execução
                  </span>
                  <span style={{ background:"rgba(56,189,248,.1)", border:"1px solid rgba(56,189,248,.25)", borderRadius:8, padding:"3px 10px", color:"#38BDF8", fontWeight:700, fontSize:12 }}>
                    {fmtBRL(custoAnual(p))} / ano
                  </span>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ marginTop:12, background:"rgba(0,0,0,.2)", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>Informações</div>
                        {[
                          ["Prestador", p.prestador_nome || "—"],
                          ["Contato", p.prestador_contato || "—"],
                          ["Gerar OS auto", p.gerar_os_automatica ? `Sim (${p.dias_antecedencia || 7}d antes)` : "Não"],
                          ["Última execução", p.ultima_execucao ? fmtDate(p.ultima_execucao) : "Nunca"],
                          ["Próxima execução", fmtDate(proxima.toISOString())],
                        ].map(([l, v]) => (
                          <div key={l} style={{ display:"flex", gap:6, padding:"3px 0", fontSize:11, borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                            <span style={{ color:"#475569", minWidth:120 }}>{l}:</span>
                            <span style={{ color:"#94A3B8", fontWeight:600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      {p.template_checklist && p.template_checklist.length > 0 && (
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>Checklist</div>
                          {p.template_checklist.slice(0, 8).map((item, i) => (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0", fontSize:11, borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                              <span>{item.done ? "✅" : "⬜"}</span>
                              <span style={{ color: item.done ? "#10B981" : "#94A3B8" }}>{item.item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {p.instrucoes && (
                      <div style={{ marginTop:10, background:"rgba(255,255,255,.03)", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#94A3B8", lineHeight:1.6 }}>
                        📝 {p.instrucoes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Plan form */}
          {showForm && (
            <div style={{ background:"rgba(255,255,255,.025)", border:"1px solid rgba(99,102,241,.2)", borderRadius:14, padding:"20px 20px 24px" }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#E2E8F0", marginBottom:16 }}>
                {editId ? "✏️ Editar Plano" : "➕ Criar Plano de Manutenção"}
              </div>

              {/* Row 1: nome + setor */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, marginBottom:12 }}>
                <div><label style={lbl}>NOME *</label>
                  <input value={form.nome} onChange={e => setForm(f => ({...f,nome:e.target.value}))} placeholder="Ex: Revisão bombas piscina" style={inp}/></div>
                <div><label style={lbl}>SETOR</label>
                  <select value={form.setor} onChange={e => setForm(f => ({...f,setor:e.target.value}))} style={sel}>
                    {TODOS_SETORES.map(s => <option key={s} value={s}>{SETOR_ICONS[s]} {SETOR_LABELS[s]}</option>)}
                  </select></div>
              </div>

              {/* Row 2: tipo + freq_tipo + freq_valor */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                <div><label style={lbl}>TIPO</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({...f,tipo:e.target.value}))} style={sel}>
                    {TIPOS_PLANO.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
                  </select></div>
                <div><label style={lbl}>FREQUÊNCIA</label>
                  <select value={form.frequencia_tipo} onChange={e => setForm(f => ({...f,frequencia_tipo:e.target.value}))} style={sel}>
                    {FREQ_TIPOS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
                  </select></div>
                <div><label style={lbl}>INTERVALO (x)</label>
                  <input type="number" min="1" value={form.frequencia_valor} onChange={e => setForm(f => ({...f,frequencia_valor:Number(e.target.value)}))} style={inp}/></div>
              </div>

              {/* Row 3: prestador + contato */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div><label style={lbl}>PRESTADOR / EMPRESA</label>
                  <input value={form.prestador_nome} onChange={e => setForm(f => ({...f,prestador_nome:e.target.value}))} placeholder="Ex: Jacuzzi Brasil" style={inp}/></div>
                <div><label style={lbl}>CONTATO</label>
                  <input value={form.prestador_contato} onChange={e => setForm(f => ({...f,prestador_contato:e.target.value}))} placeholder="Telefone ou e-mail" style={inp}/></div>
              </div>

              {/* Row 4: custo + dias_antecedencia + proxima_execucao */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                <div><label style={lbl}>CUSTO / EXECUÇÃO (R$)</label>
                  <input type="number" min="0" step="0.01" value={form.custo_estimado || ""} onChange={e => setForm(f => ({...f,custo_estimado:Number(e.target.value)}))} placeholder="0,00" style={inp}/></div>
                <div><label style={lbl}>ANTECEDÊNCIA OS (dias)</label>
                  <input type="number" min="1" value={form.dias_antecedencia} onChange={e => setForm(f => ({...f,dias_antecedencia:Number(e.target.value)}))} style={inp}/></div>
                <div><label style={lbl}>PRÓXIMA EXECUÇÃO</label>
                  <input type="date" value={form.proxima_execucao} onChange={e => setForm(f => ({...f,proxima_execucao:e.target.value}))} style={{ ...inp, colorScheme:"dark" }}/></div>
              </div>

              {/* Row 5: gerar OS auto toggle */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.15)", borderRadius:10, padding:"10px 14px" }}>
                <input type="checkbox" id="gerar-os-auto" checked={form.gerar_os_automatica} onChange={e => setForm(f => ({...f,gerar_os_automatica:e.target.checked}))} style={{ accentColor:"#10B981", width:15, height:15 }}/>
                <label htmlFor="gerar-os-auto" style={{ fontSize:13, color:"#34D399", fontWeight:600, cursor:"pointer" }}>
                  🤖 Gerar OS automaticamente {form.dias_antecedencia}d antes da próxima execução
                </label>
              </div>

              {/* Equipment selector */}
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>EQUIPAMENTOS VINCULADOS</label>
                <div style={{ maxHeight:180, overflowY:"auto", background:"rgba(0,0,0,.15)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, padding:"6px 10px" }}>
                  {equipList.length === 0 ? <div style={{ color:"#334155", fontSize:11 }}>Nenhum equipamento cadastrado</div> : equipList.map(eq => {
                    const sel2 = form.equipamentos_itens.find(e => e.equipId === eq.id);
                    return (
                      <div key={eq.id} style={{ borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 2px" }}>
                          <input type="checkbox" checked={!!sel2} onChange={() => toggleEquip(eq)} style={{ accentColor:"#7C5CFC", width:14, height:14, cursor:"pointer", flexShrink:0 }}/>
                          <span style={{ fontSize:12, color:sel2?"#E2E8F0":"#64748B", fontWeight:sel2?600:400 }}>{eq.catIcon} {eq.nome}</span>
                          <span style={{ fontSize:10, color:"#334155", marginLeft:"auto" }}>{eq.local}</span>
                        </div>
                        {sel2 && (
                          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 24px 7px", background:"rgba(124,92,252,.06)", borderRadius:6, marginBottom:3 }}>
                            <span style={{ fontSize:11, color:"#64748B" }}>Custo (R$):</span>
                            <input type="number" min="0" step="0.01" value={sel2.custo_previsto || ""}
                              onChange={e => setForm(f => ({...f, equipamentos_itens: f.equipamentos_itens.map(ei => ei.equipId === eq.id ? {...ei, custo_previsto: Number(e.target.value)} : ei)}))}
                              placeholder="0,00" style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(99,102,241,.25)", borderRadius:6, padding:"4px 8px", color:"#F59E0B", fontSize:12, width:100, fontWeight:600 }}/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Instruções */}
              <div style={{ marginBottom:18 }}>
                <label style={lbl}>INSTRUÇÕES / OBSERVAÇÕES</label>
                <textarea value={form.instrucoes} onChange={e => setForm(f => ({...f,instrucoes:e.target.value}))} rows={3}
                  placeholder="Procedimentos, EPIs, normas técnicas, observações..."
                  style={{ ...inp, resize:"vertical" as const }}/>
              </div>

              {/* Buttons */}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()); }}
                  style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:9, padding:"9px 18px", color:"#94A3B8", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                <button onClick={save} disabled={saving || !form.nome.trim()}
                  style={{ background: saving || !form.nome.trim() ? "#334155" : "linear-gradient(135deg,#7C5CFC,#A78BFA)", border:"none", borderRadius:9, padding:"9px 20px", color:"#fff", fontSize:13, fontWeight:700, cursor: saving || !form.nome.trim() ? "not-allowed":"pointer" }}>
                  {saving ? "Salvando..." : editId ? "💾 Salvar" : "✅ Criar Plano"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ SUB-TAB 2: POR SETOR ════════════════════════════════════════════ */}
      {subTab === "setor" && (
        <div>
          <div style={{ fontSize:13, color:"#475569", marginBottom:16 }}>Clique em um setor para filtrar os planos na aba Visão Geral.</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))", gap:12 }}>
            {TODOS_SETORES.map(setor => {
              const cor = SETOR_COLORS[setor];
              const icone = SETOR_ICONS[setor];
              const planosSetor = planoList.filter(p => p.setor === setor);
              const equipsSetor = new Set(planosSetor.flatMap(p => (p.equipamentos_itens||[]).map(e=>e.equipId))).size;
              const custoSetor = planosSetor.reduce((s,p) => s + custoAnual(p), 0);
              const tipos = [...new Set(planosSetor.map(p=>p.tipo))];
              return (
                <div key={setor}
                  onClick={() => { setFiltroSetor(setor); setSubTab("visao"); }}
                  style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${cor}33`, borderLeft:`4px solid ${cor}`, borderRadius:12, padding:"14px 16px", cursor:"pointer", transition:"all .2s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${cor}10`)}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,.03)")}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:24 }}>{icone}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:"#F1F5F9" }}>{SETOR_LABELS[setor]}</div>
                      <div style={{ fontSize:10, color:cor, fontWeight:600 }}>{planosSetor.length} plano{planosSetor.length!==1?"s":""}</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                    {tipos.map(t => (
                      <span key={t} style={{ background:`${TIPO_COLORS[t]}22`, color:TIPO_COLORS[t], fontSize:9, borderRadius:10, padding:"2px 7px", fontWeight:700, border:`1px solid ${TIPO_COLORS[t]}44` }}>{TIPO_ICONS[t]} {TIPO_LABELS[t]||t}</span>
                    ))}
                    {planosSetor.length === 0 && <span style={{ fontSize:10, color:"#334155" }}>Nenhum plano</span>}
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748B" }}>
                    <span>⚙️ {equipsSetor} equip{equipsSetor!==1?"s":""}</span>
                    {custoSetor > 0 && <span style={{ color:"#34D399", fontWeight:700 }}>{fmtBRL(custoSetor)}/ano</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ SUB-TAB 3: GERADOR DI ═══════════════════════════════════════════ */}
      {subTab === "gerador" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {/* Left: config panel */}
            <div style={{ background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.2)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#C4B5FD", marginBottom:4 }}>✨ Gerador Di</div>
              <div style={{ fontSize:12, color:"#64748B", marginBottom:18, lineHeight:1.6 }}>
                Selecione os setores e a Di gerará planos personalizados para {condNome} usando IA.
              </div>

              <label style={lbl}>SETORES (selecione um ou mais)</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16 }}>
                {TODOS_SETORES.map(s => {
                  const sel3 = diSetores.includes(s);
                  const cor3 = SETOR_COLORS[s];
                  return (
                    <label key={s} style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 10px", background: sel3 ? `${cor3}18` : "rgba(255,255,255,.03)", border:`1px solid ${sel3?cor3+"55":"rgba(255,255,255,.08)"}`, borderRadius:8, cursor:"pointer", fontSize:12, color: sel3 ? "#F1F5F9" : "#64748B", fontWeight: sel3 ? 600 : 400 }}>
                      <input type="checkbox" checked={sel3}
                        onChange={() => setDiSetores(prev => sel3 ? prev.filter(x=>x!==s) : [...prev,s])}
                        style={{ accentColor:cor3, width:13, height:13 }}/>
                      {SETOR_ICONS[s]} {SETOR_LABELS[s]}
                    </label>
                  );
                })}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label style={lbl}>MÊS DE INÍCIO</label>
                  <select value={diMes} onChange={e => setDiMes(e.target.value)} style={sel}>
                    {MESES.map((m,i) => <option key={i} value={String(i+1)}>{m}</option>)}
                  </select></div>
                <div><label style={lbl}>TIPO PADRÃO</label>
                  <select value={diTipo} onChange={e => setDiTipo(e.target.value)} style={sel}>
                    {TIPOS_PLANO.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
                  </select></div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.15)", borderRadius:10, padding:"10px 14px" }}>
                <input type="checkbox" id="di-gerar-os" checked={diGerarOs} onChange={e => setDiGerarOs(e.target.checked)} style={{ accentColor:"#10B981", width:14, height:14 }}/>
                <label htmlFor="di-gerar-os" style={{ fontSize:12, color:"#34D399", fontWeight:600, cursor:"pointer" }}>Gerar OSs automáticas para os planos criados</label>
              </div>

              <button onClick={gerarComDi} disabled={diLoading || !diSetores.length}
                style={{ width:"100%", background: diLoading || !diSetores.length ? "#334155" : "linear-gradient(135deg,#7C5CFC,#A78BFA)", border:"none", borderRadius:10, padding:"12px", color:"#fff", fontSize:14, fontWeight:800, cursor: diLoading||!diSetores.length?"not-allowed":"pointer", boxShadow:"0 4px 14px rgba(124,92,252,.35)" }}>
                {diLoading ? "⏳ Di está gerando os planos..." : "✨ Gerar planos com Di"}
              </button>
            </div>

            {/* Right: preview */}
            <div>
              {diPreview.length === 0 && !diLoading && (
                <div style={{ background:"rgba(255,255,255,.02)", border:"1px dashed rgba(255,255,255,.08)", borderRadius:14, padding:40, textAlign:"center", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🤖</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#64748B" }}>Pré-visualização</div>
                  <div style={{ fontSize:12, color:"#334155", marginTop:6 }}>Os planos gerados por Di aparecerão aqui antes da importação.</div>
                </div>
              )}
              {diLoading && (
                <div style={{ background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.2)", borderRadius:14, padding:40, textAlign:"center", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🧠</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#C4B5FD" }}>Di está analisando o condomínio...</div>
                  <div style={{ fontSize:12, color:"#64748B", marginTop:6 }}>Aguarde enquanto a IA gera os planos personalizados.</div>
                </div>
              )}
              {diPreview.length > 0 && (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#C4B5FD" }}>✅ {diPreview.length} planos gerados</div>
                    <button onClick={importarDiPlanos} disabled={diImporting}
                      style={{ background:"linear-gradient(135deg,#059669,#10B981)", border:"none", borderRadius:9, padding:"8px 16px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      {diImporting ? "Importando..." : `⬇️ Importar todos (${diPreview.length})`}
                    </button>
                  </div>
                  <div style={{ maxHeight:500, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
                    {diPreview.map((p, i) => {
                      const cor4 = SETOR_COLORS[p.setor||"geral"] || "#94a3b8";
                      return (
                        <div key={i} style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${cor4}33`, borderLeft:`3px solid ${cor4}`, borderRadius:10, padding:"10px 14px" }}>
                          <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:"#F1F5F9" }}>{SETOR_ICONS[p.setor||"geral"]} {p.nome}</span>
                            <span style={{ fontSize:9, background:"rgba(139,92,246,.25)", color:"#C4B5FD", border:"1px solid rgba(139,92,246,.4)", borderRadius:10, padding:"1px 7px", fontWeight:700 }}>✨ Di</span>
                          </div>
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:4 }}>
                            <span style={{ fontSize:10, color:TIPO_COLORS[p.tipo||"preventiva"]||"#94A3B8" }}>{TIPO_ICONS[p.tipo||"preventiva"]} {TIPO_LABELS[p.tipo||"preventiva"]}</span>
                            <span style={{ fontSize:10, color:"#64748B" }}>·</span>
                            <span style={{ fontSize:10, color:"#94A3B8" }}>{FREQ_LABELS[p.frequencia_tipo||"mensal"]}</span>
                            {p.prestador_nome && <><span style={{ fontSize:10, color:"#64748B" }}>·</span><span style={{ fontSize:10, color:"#64748B" }}>👤 {p.prestador_nome}</span></>}
                            {(p.custo_estimado||0) > 0 && <><span style={{ fontSize:10, color:"#64748B" }}>·</span><span style={{ fontSize:10, color:"#34D399", fontWeight:700 }}>{fmtBRL(p.custo_estimado||0)}</span></>}
                          </div>
                          {p.instrucoes && <div style={{ fontSize:10, color:"#475569", lineHeight:1.5 }}>{p.instrucoes}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ SUB-TAB 4: CALENDÁRIO ANUAL ════════════════════════════════════ */}
      {subTab === "calendario" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:"#E2E8F0" }}>📅 Calendário Anual {new Date().getFullYear()}</div>
              <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>Todas as manutenções planejadas por mês · {planoList.length} planos ativos</div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {TODOS_SETORES.slice(0,6).map(s => (
                <span key={s} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#64748B" }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:SETOR_COLORS[s], display:"inline-block" }}/>
                  {SETOR_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          {/* Custo mensal total */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:6, marginBottom:20 }}>
            {MESES.map((mes, i) => {
              const custo = custoPorMes[i];
              const eventos = eventosPorMes[i];
              const maxCusto = Math.max(...custoPorMes, 1);
              const hPct = Math.round((custo / maxCusto) * 70);
              return (
                <div key={i} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:9, fontWeight:700, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>{mes.slice(0,3)}</div>
                  <div style={{ display:"flex", justifyContent:"center", gap:2, marginBottom:6, height:50, alignItems:"flex-end" }}>
                    {eventos.slice(0,8).map((ev, j) => (
                      <div key={j} title={ev.nome} style={{ width:5, borderRadius:2, background:ev.cor, height:Math.max(4, Math.round((1/eventos.length)*hPct)+4) }} />
                    ))}
                    {eventos.length > 8 && <div style={{ width:5, height:8, borderRadius:2, background:"#334155" }} />}
                  </div>
                  <div style={{ fontSize:8, color:custo > 0 ? "#34D399" : "#334155", fontWeight:700 }}>
                    {custo > 0 ? "R$"+Math.round(custo).toLocaleString("pt-BR") : "—"}
                  </div>
                  <div style={{ fontSize:8, color:"#475569", marginTop:2 }}>{eventos.length} exec.</div>
                </div>
              );
            })}
          </div>

          {/* Events list by month */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:12 }}>
            {MESES.map((mes, i) => {
              const eventos = eventosPorMes[i];
              if (eventos.length === 0) return null;
              const custo = custoPorMes[i];
              return (
                <div key={i} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#E2E8F0" }}>{mes}</div>
                    <div style={{ fontSize:12, color:"#34D399", fontWeight:700 }}>{fmtBRL(custo)}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:180, overflowY:"auto" }}>
                    {eventos.map((ev, j) => (
                      <div key={j} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, padding:"3px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                        <div style={{ width:6, height:6, borderRadius:2, background:ev.cor, flexShrink:0 }}/>
                        <span style={{ color:"#94A3B8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {planoList.length === 0 && (
            <div style={{ textAlign:"center", padding:48, color:"#475569" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
              <div style={{ fontSize:14, fontWeight:700 }}>Nenhum plano para exibir no calendário</div>
              <div style={{ fontSize:12, marginTop:6 }}>Crie planos na aba Visão Geral ou use o Gerador Di</div>
            </div>
          )}

          {/* Annual summary table */}
          {planoList.length > 0 && (
            <div style={{ marginTop:20, background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"14px 16px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#475569", marginBottom:12, textTransform:"uppercase", letterSpacing:"1px" }}>Resumo por Setor</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr>{["Setor","Planos","Custo/execução","Frequência","Custo anual","Prestador"].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"6px 10px", color:"#475569", fontWeight:700, borderBottom:"1px solid rgba(255,255,255,.08)", textTransform:"uppercase", letterSpacing:".03em", fontSize:10 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {TODOS_SETORES.filter(s => planoList.some(p=>p.setor===s)).map(setor => {
                      const ps = planoList.filter(p=>p.setor===setor);
                      const cor5 = SETOR_COLORS[setor];
                      const totalCusto = ps.reduce((s,p)=>s+(p.custo_estimado||p.custo_total||0),0);
                      const totalAnual = ps.reduce((s,p)=>s+custoAnual(p),0);
                      const prestadores = [...new Set(ps.map(p=>p.prestador_nome).filter(Boolean))].join(", ");
                      const freqs = [...new Set(ps.map(p=>FREQ_LABELS[p.frequencia_tipo||p.periodicidade||"mensal"]))].join(", ");
                      return (
                        <tr key={setor} style={{ borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                          <td style={{ padding:"7px 10px" }}>
                            <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ width:8, height:8, borderRadius:2, background:cor5, display:"inline-block", flexShrink:0 }}/>
                              <span style={{ color:"#E2E8F0", fontWeight:600 }}>{SETOR_ICONS[setor]} {SETOR_LABELS[setor]}</span>
                            </span>
                          </td>
                          <td style={{ padding:"7px 10px", color:"#94A3B8" }}>{ps.length}</td>
                          <td style={{ padding:"7px 10px", color:"#F59E0B", fontWeight:600 }}>{fmtBRL(totalCusto)}</td>
                          <td style={{ padding:"7px 10px", color:"#94A3B8" }}>{freqs}</td>
                          <td style={{ padding:"7px 10px", color:"#34D399", fontWeight:700 }}>{fmtBRL(totalAnual)}</td>
                          <td style={{ padding:"7px 10px", color:"#64748B", maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{prestadores || "—"}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background:"rgba(16,185,129,.06)", fontWeight:700 }}>
                      <td style={{ padding:"8px 10px", color:"#E2E8F0", fontSize:12 }}>TOTAL</td>
                      <td style={{ padding:"8px 10px", color:"#A78BFA" }}>{planoList.length}</td>
                      <td style={{ padding:"8px 10px", color:"#F59E0B" }}>{fmtBRL(planoList.reduce((s,p)=>s+(p.custo_estimado||p.custo_total||0),0))}</td>
                      <td/>
                      <td style={{ padding:"8px 10px", color:"#34D399", fontSize:13 }}>{fmtBRL(orcamentoAnual)}</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
