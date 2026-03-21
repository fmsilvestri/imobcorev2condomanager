import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
export interface OS {
  id: string; condominio_id: string; numero: number; titulo: string;
  descricao?: string; categoria: string; status: string; prioridade: string;
  unidade?: string; local?: string; responsavel?: string; prestador_nome?: string;
  custo_estimado?: number; custo_real?: number; data_prevista?: string;
  sla_horas: number; foto_antes?: string; foto_depois?: string;
  checklist?: { item: string; done: boolean }[]; aprovacao_necessaria?: boolean;
  aprovado_por?: string; di_sugestao?: { texto: string; gerado_em: string };
  equipamento_ids?: string[]; created_at: string; updated_at?: string;
}
interface Comentario { id: string; autor: string; mensagem: string; foto_url?: string; created_at: string; }
interface EqBasic { id: string; nome: string; categoria: string; catIcon: string; local: string; status: string; modelo?: string; fabricante?: string; }
interface FornecBasic { id: string; nome: string; categoria: string; icone?: string; telefone?: string; whatsapp?: string; email?: string; status?: string; }
interface Props { condId: string; condNome?: string; view: "mobile" | "desktop"; onBack?: () => void; }

// ── Constants ────────────────────────────────────────────────────────────────
const CAT_ICON: Record<string,string> = { Hidráulico:"💧",Elétrico:"⚡",Estrutural:"🏗️",Equipamento:"⚙️",Segurança:"🔒",Limpeza:"🧹",Outro:"📋",hidraulica:"💧",eletrica:"⚡",estrutural:"🏗️",equipamento:"⚙️",seguranca:"🔒",limpeza:"🧹",outros:"📋" };
const CAT_COLOR: Record<string,string> = { Hidráulico:"#3B82F6",Elétrico:"#EAB308",Estrutural:"#F97316",Equipamento:"#6366F1",Segurança:"#8B5CF6",Limpeza:"#14B8A6",Outro:"#64748B",hidraulica:"#3B82F6",eletrica:"#EAB308",estrutural:"#F97316",equipamento:"#6366F1",seguranca:"#8B5CF6",limpeza:"#14B8A6",outros:"#64748B" };
const PRI_COLOR: Record<string,string> = { urgente:"#EF4444", alta:"#F97316", media:"#3B82F6", baixa:"#10B981" };
const PRI_LABEL: Record<string,string> = { urgente:"🔴 URGENTE", alta:"🟡 Alta", media:"🔵 Média", baixa:"🟢 Baixa" };
const STS_COLOR: Record<string,string> = { aberta:"#F59E0B", em_andamento:"#06B6D4", fechada:"#10B981", cancelada:"#EF4444" };
const STS_LABEL: Record<string,string> = { aberta:"Aberta", em_andamento:"Em andamento", fechada:"Concluída", cancelada:"Cancelada" };
const CATS = ["Hidráulico","Elétrico","Estrutural","Equipamento","Segurança","Limpeza","Outro"];
const SLA_OPTS = [{ v:4,l:"4h — Urgente" },{ v:24,l:"24h" },{ v:48,l:"48h (padrão)" },{ v:72,l:"72h" },{ v:168,l:"7 dias" }];
const CHECKLISTS: Record<string,string[]> = {
  Hidráulico:   ["Verificar nível/pressão","Inspecionar vedações","Limpar filtros","Verificar vazamentos","Solicitar laudo técnico"],
  Elétrico:     ["Medir tensão/corrente","Verificar disjuntores","Inspecionar fiação","Testar aterramento","Verificar quadro de força"],
  Equipamento:  ["Verificar ruído/vibração","Inspecionar vedações","Lubrificar partes móveis","Medir consumo elétrico","Verificar vida útil"],
  Estrutural:   ["Fotografar extensão do dano","Verificar infiltração","Mapear área afetada","Avaliar risco estrutural"],
  Segurança:    ["Verificar cabos de rede","Testar POE switch","Verificar firmware","Testar visão/gravação"],
  Limpeza:      ["Listar áreas","Verificar materiais necessários","Agendar com zelador"],
  Outro:        ["Descrever problema","Avaliar urgência","Designar responsável"],
};
const EMPTY_FORM = (): Partial<OS> => ({ categoria:"Hidráulico", prioridade:"media", sla_horas:48, checklist:[], custo_estimado:0, aprovacao_necessaria:false });

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "–";
const fmtNum  = (n: number) => `OS-${String(n||"?").padStart(3,"0")}`;
const elapsed = (created: string, slaH: number) => {
  const ms = Date.now() - new Date(created).getTime();
  const pct = Math.min(ms / (slaH * 3_600_000) * 100, 120);
  const horas = Math.floor(ms / 3_600_000);
  const restH = Math.max(0, slaH - horas);
  return { pct, horas, restH, vencida: horas >= slaH };
};
const avatarColor = (s?: string) => { if (!s) return "#64748B"; const h = [...s].reduce((a,c)=>a+c.charCodeAt(0),0); const cols = ["#6366F1","#8B5CF6","#EC4899","#14B8A6","#F59E0B","#3B82F6","#10B981"]; return cols[h%cols.length]; };
const initials   = (s?: string) => s ? s.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";
const priSla     = (pri: string) => ({ urgente:4, alta:24, media:48, baixa:168 })[pri] || 48;

// ── SLABar ───────────────────────────────────────────────────────────────────
function SLABar({ created_at, sla_horas }: { created_at: string; sla_horas: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(()=>setTick(x=>x+1),60_000); return ()=>clearInterval(t); }, []);
  const { pct, restH, vencida } = elapsed(created_at, sla_horas);
  const barColor = pct < 60 ? "#10B981" : pct < 85 ? "#EAB308" : "#EF4444";
  void tick;
  return (
    <div>
      <div style={{ height:6, background:"rgba(255,255,255,.08)", borderRadius:3, overflow:"hidden", marginBottom:5 }}>
        <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background:barColor, borderRadius:3, transition:"width .5s" }} />
      </div>
      <div style={{ fontSize:18, color:barColor, fontWeight:700 }}>
        {vencida ? `⚠️ Vencida há ${Math.abs(restH)}h` : `${restH}h restantes`}
      </div>
    </div>
  );
}

// ── OSCard ───────────────────────────────────────────────────────────────────
function OSCard({ os, onSelect, onStatusChange, compact }: { os: OS; onSelect: ()=>void; onStatusChange: (id:string,status:string)=>void; compact?: boolean }) {
  const pc = PRI_COLOR[os.prioridade] || "#64748B";
  const sc = STS_COLOR[os.status] || "#64748B";
  const prog = os.status==="fechada"?100:os.status==="em_andamento"?50:0;
  const isUrgente = os.prioridade === "urgente" && os.status !== "fechada";

  return (
    <div
      onClick={onSelect}
      style={{
        background:"rgba(255,255,255,.04)", border:`1.5px solid rgba(255,255,255,.10)`,
        borderLeft:`5px solid ${pc}`, borderRadius:12, padding:compact?"14px 16px":"16px 18px",
        marginBottom:10, cursor:"pointer", position:"relative",
        boxShadow: isUrgente ? `0 0 18px ${pc}33` : "0 2px 8px rgba(0,0,0,.25)",
        transition:"background .12s",
      }}
    >
      {/* Urgent pulse */}
      {isUrgente && (
        <div style={{ position:"absolute",top:14,right:14,width:12,height:12,borderRadius:"50%",background:pc,boxShadow:`0 0 8px ${pc}`,animation:"pulse 1s infinite" }} />
      )}

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
        <span style={{ fontFamily:"monospace", fontSize:20, color:"#A5B4FC", fontWeight:900, flexShrink:0, marginTop:2, letterSpacing:".03em" }}>{fmtNum(os.numero)}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:compact?22:24, fontWeight:800, color:"#FFFFFF", lineHeight:1.3, marginBottom:6 }}>{os.titulo}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:18, fontWeight:800, color:pc, background:pc+"22", border:`1.5px solid ${pc}55`, borderRadius:6, padding:"3px 10px" }}>{PRI_LABEL[os.prioridade]||os.prioridade}</span>
            <span style={{ fontSize:18, fontWeight:700, color:sc, background:sc+"18", border:`1px solid ${sc}44`, borderRadius:6, padding:"3px 10px" }}>{STS_LABEL[os.status]||os.status}</span>
            <span style={{ fontSize:18, color:"#94A3B8", fontWeight:600 }}>{CAT_ICON[os.categoria]} <span style={{ color:"#CBD5E1" }}>{os.categoria}</span></span>
          </div>
        </div>
        {/* Avatar */}
        {os.responsavel && (
          <div title={os.responsavel} style={{ width:42,height:42,borderRadius:"50%",background:avatarColor(os.responsavel),display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#fff",flexShrink:0,boxShadow:"0 2px 6px rgba(0,0,0,.4)" }}>
            {initials(os.responsavel)}
          </div>
        )}
      </div>

      {/* SLA bar */}
      {os.status !== "fechada" && os.status !== "cancelada" && (
        <SLABar created_at={os.created_at} sla_horas={os.sla_horas||48} />
      )}

      {/* Progress bar */}
      {!compact && (
        <div style={{ marginTop:8 }}>
          <div style={{ height:5, background:"rgba(255,255,255,.07)", borderRadius:3, overflow:"hidden" }}>
            <div style={{ width:`${prog}%`,height:"100%",background:sc,borderRadius:3,transition:"width .5s",boxShadow:`0 0 6px ${sc}88` }} />
          </div>
        </div>
      )}

      {/* Meta row */}
      {!compact && (
        <div style={{ display:"flex",gap:12,marginTop:10,flexWrap:"wrap",alignItems:"center" }}>
          {os.local && <span style={{ fontSize:20,color:"#7DD3FC",fontWeight:600 }}>📍 <span style={{ color:"#BAE6FD" }}>{os.local}</span></span>}
          {os.custo_estimado! > 0 && <span style={{ fontSize:20,color:"#86EFAC",fontWeight:600 }}>💰 <span style={{ color:"#BBF7D0" }}>R$ {os.custo_estimado!.toLocaleString("pt-BR")}</span></span>}
          {os.data_prevista && <span style={{ fontSize:20,color:"#FCA5A5",fontWeight:600 }}>📅 <span style={{ color:"#FECACA" }}>{fmtDate(os.data_prevista)}</span></span>}
          {os.aprovacao_necessaria && <span style={{ fontSize:18,fontWeight:800,color:"#FDE68A",background:"rgba(234,179,8,.18)",border:"1px solid rgba(234,179,8,.35)",borderRadius:6,padding:"3px 10px" }}>⚠️ Aprovação</span>}
          <div style={{ marginLeft:"auto",display:"flex",gap:6 }}>
            {os.status==="aberta"&&<button onClick={e=>{e.stopPropagation();onStatusChange(os.id,"em_andamento");}} style={{ fontSize:18,padding:"5px 16px",background:"rgba(6,182,212,.18)",border:"1.5px solid rgba(6,182,212,.4)",borderRadius:8,color:"#67E8F9",cursor:"pointer",fontWeight:700 }}>▶ Iniciar</button>}
            {os.status==="em_andamento"&&<button onClick={e=>{e.stopPropagation();onStatusChange(os.id,"fechada");}} style={{ fontSize:18,padding:"5px 16px",background:"rgba(16,185,129,.18)",border:"1.5px solid rgba(16,185,129,.4)",borderRadius:8,color:"#34D399",cursor:"pointer",fontWeight:700 }}>✓ Concluir</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ os, filter, onFilter }: { os: OS[]; filter: string; onFilter:(f:string)=>void }) {
  const urgentesCount = os.filter(o=>o.prioridade==="urgente"&&o.status!=="fechada").length;
  const stats = [
    { k:"todos",     v:os.length,                                                  icon:"📊", label:"Total",      color:"#A5B4FC", bg:"rgba(165,180,252,.08)", glow:"rgba(165,180,252,.25)", filt:"todos"       },
    { k:"aberta",    v:os.filter(o=>o.status==="aberta").length,                   icon:"📋", label:"Abertas",    color:"#FCD34D", bg:"rgba(252,211,77,.09)",  glow:"rgba(252,211,77,.28)",  filt:"aberta"      },
    { k:"andamento", v:os.filter(o=>o.status==="em_andamento").length,             icon:"🔄", label:"Andamento",  color:"#22D3EE", bg:"rgba(34,211,238,.09)", glow:"rgba(34,211,238,.28)",  filt:"em_andamento" },
    { k:"fechada",   v:os.filter(o=>o.status==="fechada").length,                  icon:"✅", label:"Concluídas", color:"#34D399", bg:"rgba(52,211,153,.09)", glow:"rgba(52,211,153,.28)",  filt:"fechada"     },
    { k:"urgente",   v:urgentesCount,                                              icon:"🚨", label:"Urgentes",   color:"#F87171", bg:urgentesCount>0?"rgba(248,113,113,.14)":"rgba(248,113,113,.06)", glow:"rgba(248,113,113,.38)", filt:"urgente" },
  ];
  return (
    <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flex:1 }}>
      {stats.map(s => {
        const active = filter === s.filt;
        const urgent = s.k === "urgente" && s.v > 0;
        return (
          <div key={s.k} onClick={()=>onFilter(active?"todos":s.filt)}
            style={{
              flex:"1 1 90px", minWidth:80,
              background: active ? s.bg.replace(/\.\d+\)$/,".22)") : s.bg,
              border:`2px solid ${active ? s.color : urgent ? s.color+"55" : "rgba(255,255,255,.07)"}`,
              borderTop:`3px solid ${active || urgent ? s.color : "rgba(255,255,255,.07)"}`,
              borderRadius:14, padding:"14px 10px 12px", textAlign:"center",
              cursor:"pointer",
              boxShadow: active ? `0 0 18px ${s.glow}` : urgent ? `0 0 10px ${s.glow}` : "none",
              transition:"all .18s ease",
            }}>
            <div style={{ fontSize:24,marginBottom:4,lineHeight:1 }}>{s.icon}</div>
            <div style={{ fontSize:26,fontWeight:900,color:s.color,lineHeight:1,letterSpacing:"-1px" }}>{s.v}</div>
            <div style={{ fontSize:11,color:s.color,opacity: active ? 1 : .75,marginTop:4,fontWeight:700,letterSpacing:".02em" }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mapeamento categoria equipamento → OS ─────────────────────────────────────
const EQ_TO_OS_CAT: Record<string,string> = {
  hidraulica:"Hidráulico", eletrica:"Elétrico", estrutural:"Estrutural",
  equipamento:"Equipamento", seguranca:"Segurança", limpeza:"Limpeza", outros:"Outro",
};
const STS_DOT: Record<string,string> = { operacional:"#10B981", atencao:"#EAB308", manutencao:"#EF4444", inativo:"#64748B" };

// ── NovaOS Form (4 steps) ─────────────────────────────────────────────────────
function NovaOSForm({ condId, condNome, osList, onSave, onCancel, view }:
  { condId:string; condNome:string; osList:OS[]; onSave:(os:OS)=>void; onCancel:()=>void; view:"mobile"|"desktop" }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Partial<OS>>(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [diTexto, setDiTexto] = useState("");
  const [diLoading, setDiLoading] = useState(false);
  const [diId, setDiId] = useState<string|null>(null);
  // Equipment picker state
  const [equipamentos, setEquipamentos] = useState<EqBasic[]>([]);
  const [selectedEquips, setSelectedEquips] = useState<EqBasic[]>([]);
  const [equipSearch, setEquipSearch] = useState("");
  const [showEquipList, setShowEquipList] = useState(false);
  // Fornecedor (supplier) picker state
  const [fornecedores, setFornecedores] = useState<FornecBasic[]>([]);
  const [fornecSearch, setFornecSearch] = useState("");
  const [showFornecList, setShowFornecList] = useState(false);
  const [selectedFornec, setSelectedFornec] = useState<FornecBasic | null>(null);

  const set = (k: keyof OS, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  // Load equipment list from maintenance module
  useEffect(() => {
    if (!condId) return;
    fetch(`/api/equipamentos?condominio_id=${condId}`)
      .then(r => r.json())
      .then((data: EqBasic[]) => { if (Array.isArray(data)) setEquipamentos(data); })
      .catch(() => {});
  }, [condId]);

  // Load supplier list
  useEffect(() => {
    if (!condId) return;
    fetch(`/api/fornecedores?condominio_id=${condId}`)
      .then(r => r.json())
      .then((data: FornecBasic[]) => { if (Array.isArray(data)) setFornecedores(data); })
      .catch(() => {});
  }, [condId]);

  const filteredFornec = fornecedores.filter(f => {
    if (!fornecSearch.trim()) return true;
    const q = fornecSearch.toLowerCase();
    return f.nome.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q) ||
           (f.email||"").toLowerCase().includes(q) || (f.telefone||"").includes(q);
  });

  function selectFornec(f: FornecBasic) {
    setSelectedFornec(f);
    set("prestador_nome", f.nome);
    setFornecSearch(f.nome);
    setShowFornecList(false);
  }

  function clearFornec() {
    setSelectedFornec(null);
    setFornecSearch("");
    set("prestador_nome", "");
  }

  const filteredEquips = equipamentos.filter(eq => {
    if (!equipSearch.trim()) return true;
    const q = equipSearch.toLowerCase();
    return eq.nome.toLowerCase().includes(q) || eq.local.toLowerCase().includes(q) ||
           eq.categoria.toLowerCase().includes(q) || (eq.modelo||"").toLowerCase().includes(q);
  }).filter(eq => !selectedEquips.find(s => s.id === eq.id));

  function selectEquip(eq: EqBasic) {
    const next = [...selectedEquips, eq];
    setSelectedEquips(next);
    set("equipamento_ids", next.map(e => e.id));
    // Auto-fill local if empty
    if (!form.local) set("local", eq.local);
    // Suggest categoria mapping
    const mappedCat = EQ_TO_OS_CAT[eq.categoria];
    if (mappedCat && form.categoria === "Hidráulico") set("categoria", mappedCat);
    setEquipSearch("");
    setShowEquipList(false);
  }

  function removeEquip(id: string) {
    const next = selectedEquips.filter(e => e.id !== id);
    setSelectedEquips(next);
    set("equipamento_ids", next.map(e => e.id));
  }

  const isMob = view === "mobile";
  const fc = { background:"rgba(255,255,255,.15)", border:"2px solid rgba(255,255,255,.3)", borderRadius:10, color:"#FFFFFF", fontWeight:700, padding:"14px 16px", fontSize:16, fontFamily:"inherit", width:"100%", outline:"none" };
  const lbl = { fontSize:13, color:"#CBD5E1", marginBottom:8, display:"block" as const, fontWeight:800, letterSpacing:".05em", textTransform:"uppercase" as const };
  const grp = { marginBottom:18 };

  // Auto-checklist when category changes
  useEffect(() => {
    const items = (CHECKLISTS[form.categoria||"Outro"]||[]).map(item=>({ item, done:false }));
    setForm(f=>({...f, checklist:items}));
  }, [form.categoria]);

  // Auto-SLA on priority change
  useEffect(() => { set("sla_horas", priSla(form.prioridade||"media")); }, [form.prioridade]);

  const needsAprov = form.prioridade==="urgente" || (form.custo_estimado||0) > 500;

  async function handleSave() {
    if (!form.titulo?.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/os", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, condominio_id: condId })
      });
      const created: OS = await r.json();
      if (created.id) onSave(created);
    } finally { setSaving(false); }
  }

  async function getDiAnalysis(id: string) {
    setDiLoading(true); setDiTexto("");
    const hist = osList.filter(o=>o.categoria===form.categoria).slice(-5);
    const r = await fetch(`/api/os/${id}/di`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ condominio_nome: condNome, historico: hist })
    });
    const json = await r.json();
    // Typewriter effect
    const txt: string = json.texto || "Não foi possível obter análise.";
    let i = 0;
    const iv = setInterval(()=>{ i+=3; setDiTexto(txt.slice(0,i)); if(i>=txt.length){clearInterval(iv);setDiLoading(false);} },25);
  }

  async function goStep3to4() {
    setSaving(true);
    const r = await fetch("/api/os", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...form, condominio_id: condId })
    });
    const created: OS = await r.json();
    setSaving(false);
    if (created.id) { setDiId(created.id); setStep(3); getDiAnalysis(created.id); }
  }

  const steps = ["📋 Identificação","🔍 Diagnóstico","👤 Atribuição","✅ Confirmação"];
  const panelStyle = isMob ? { padding:"0 14px 80px" } : { padding:0 };
  const btnNext = { background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",borderRadius:8,color:"#fff",padding:"9px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit" };
  const btnBack = { background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#94A3B8",padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit" };

  return (
    <div style={panelStyle}>
      <style>{`.os-nova-input::placeholder{color:rgba(255,255,255,.45);font-weight:400}`}</style>
      {/* Stepper indicator */}
      <div style={{ display:"flex",gap:4,marginBottom:22,alignItems:"center" }}>
        {steps.map((s,i) => (
          <div key={i} style={{ display:"flex",alignItems:"center",gap:4,flex:i<steps.length-1?1:undefined }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:i<=step?"linear-gradient(135deg,#6366F1,#818CF8)":"rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:i<=step?"#fff":"#475569",flexShrink:0 }}>{i+1}</div>
            <span style={{ fontSize:10,color:i===step?"#A5B4FC":"#475569",fontWeight:i===step?700:400,whiteSpace:"nowrap",display:isMob?"none":"inline" }}>{s.split(" ").slice(1).join(" ")}</span>
            {i<steps.length-1&&<div style={{ flex:1,height:2,background:i<step?"#6366F1":"rgba(255,255,255,.06)",borderRadius:1,minWidth:8 }} />}
          </div>
        ))}
      </div>
      <div style={{ fontSize:17,fontWeight:900,color:"#FFFFFF",marginBottom:18,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,.08)" }}>{steps[step]}</div>

      {/* Step 0: Identificação */}
      {step===0 && (
        <div>
          <div style={grp}><label style={lbl}>Título *</label><input className="os-nova-input" style={fc} placeholder="Descrição resumida do problema" value={form.titulo||""} onChange={e=>set("titulo",e.target.value)} /></div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div style={grp}>
              <label style={lbl}>Categoria</label>
              <select className="os-nova-input" style={fc} value={form.categoria||"Hidráulico"} onChange={e=>set("categoria",e.target.value)}>
                {CATS.map(c=><option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </select>
            </div>
            <div style={grp}>
              <label style={lbl}>Prioridade</label>
              <select className="os-nova-input" style={fc} value={form.prioridade||"media"} onChange={e=>set("prioridade",e.target.value)}>
                {[["urgente","🔴 Urgente"],["alta","🟡 Alta"],["media","🔵 Média"],["baixa","🟢 Baixa"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={grp}><label style={lbl}>Local / Área</label><input className="os-nova-input" style={fc} placeholder="Ex: Cobertura B1, Subsolo, Portaria..." value={form.local||""} onChange={e=>set("local",e.target.value)} /></div>
          <div style={grp}><label style={lbl}>Data prevista de conclusão</label><input type="date" className="os-nova-input" style={fc} value={form.data_prevista||""} min={new Date().toISOString().slice(0,10)} onChange={e=>set("data_prevista",e.target.value)} /></div>

          {/* ── Equipamentos vinculados ── */}
          <div style={grp}>
            <label style={lbl}>
              ⚙️ Equipamentos Vinculados
              <span style={{ fontSize:11,fontWeight:400,color:"#64748B",marginLeft:6 }}>(opcional)</span>
            </label>

            {/* Chips dos selecionados */}
            {selectedEquips.length > 0 && (
              <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
                {selectedEquips.map(eq => (
                  <div key={eq.id} style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(99,102,241,.2)",border:"1.5px solid rgba(99,102,241,.45)",borderRadius:8,padding:"7px 10px",fontSize:13,fontWeight:700,color:"#C7D2FE" }}>
                    <span style={{ fontSize:16 }}>{eq.catIcon||"⚙️"}</span>
                    <div>
                      <div style={{ lineHeight:1.2 }}>{eq.nome}</div>
                      <div style={{ fontSize:10,fontWeight:400,color:"#818CF8" }}>{eq.local}</div>
                    </div>
                    <div style={{ width:8,height:8,borderRadius:"50%",background:STS_DOT[eq.status]||"#64748B",flexShrink:0 }} />
                    <button onClick={() => removeEquip(eq.id)} style={{ background:"none",border:"none",color:"#6366F1",cursor:"pointer",fontSize:16,padding:0,lineHeight:1,marginLeft:2 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Busca */}
            <div style={{ position:"relative" }}>
              <input
                className="os-nova-input"
                style={fc}
                placeholder={equipamentos.length > 0
                  ? `🔍 Buscar entre ${equipamentos.length} equipamentos...`
                  : "Nenhum equipamento cadastrado"}
                disabled={equipamentos.length === 0}
                value={equipSearch}
                onChange={e => { setEquipSearch(e.target.value); setShowEquipList(true); }}
                onFocus={() => setShowEquipList(true)}
              />

              {/* Dropdown */}
              {showEquipList && (equipSearch || selectedEquips.length === 0) && filteredEquips.length > 0 && (
                <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:100,background:"#0F1628",border:"1.5px solid rgba(99,102,241,.4)",borderRadius:10,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
                  {filteredEquips.slice(0,20).map(eq => (
                    <div
                      key={eq.id}
                      onClick={() => selectEquip(eq)}
                      style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,.04)",transition:"background .1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background="rgba(99,102,241,.12)")}
                      onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                    >
                      <span style={{ fontSize:20,flexShrink:0 }}>{eq.catIcon||"⚙️"}</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:13,fontWeight:700,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{eq.nome}</div>
                        <div style={{ fontSize:11,color:"#64748B" }}>{eq.local} · {eq.categoria}</div>
                        {eq.modelo && <div style={{ fontSize:10,color:"#475569" }}>{eq.fabricante} {eq.modelo}</div>}
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0 }}>
                        <div style={{ width:8,height:8,borderRadius:"50%",background:STS_DOT[eq.status]||"#64748B" }} />
                        <span style={{ fontSize:9,color:STS_DOT[eq.status]||"#64748B",fontWeight:700,textTransform:"uppercase" }}>{eq.status}</span>
                      </div>
                    </div>
                  ))}
                  {filteredEquips.length === 0 && (
                    <div style={{ padding:"14px",color:"#475569",textAlign:"center",fontSize:12 }}>Nenhum equipamento encontrado</div>
                  )}
                </div>
              )}
            </div>

            {/* Fechar dropdown ao clicar fora */}
            {showEquipList && (
              <div onClick={() => setShowEquipList(false)} style={{ position:"fixed",inset:0,zIndex:99 }} />
            )}

            {equipamentos.length === 0 && (
              <div style={{ marginTop:8,fontSize:11,color:"#475569",fontStyle:"italic" }}>
                Cadastre equipamentos no módulo Manutenção para vinculá-los aqui.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Diagnóstico */}
      {step===1 && (
        <div>
          <div style={grp}><label style={lbl}>Descrição do problema</label><textarea style={{...fc,resize:"vertical" as const,minHeight:80}} placeholder="Detalhe o que foi observado, quando começou, sintomas..." value={form.descricao||""} onChange={e=>set("descricao",e.target.value)} /></div>
          <div style={grp}>
            <label style={lbl}>Checklist — {form.categoria}</label>
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {(form.checklist||[]).map((item,i)=>(
                <label key={i} style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer" }}>
                  <input type="checkbox" checked={item.done} onChange={e=>{
                    const cl=[...(form.checklist||[])]; cl[i]={...cl[i],done:e.target.checked}; set("checklist",cl);
                  }} style={{ accentColor:"#6366F1",width:24,height:24,flexShrink:0 }} />
                  <span style={{ fontSize:24,fontWeight:700,color:item.done?"#10B981":"#FFFFFF",textDecoration:item.done?"line-through":"none" }}>{item.item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Atribuição */}
      {step===2 && (
        <div>
          {needsAprov && (
            <div style={{ background:"rgba(234,179,8,.1)",border:"1px solid rgba(234,179,8,.3)",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:11,color:"#FDE68A" }}>
              ⚠️ <strong>Aprovação necessária</strong> — Esta OS requer aprovação do síndico antes de iniciar.
            </div>
          )}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div style={grp}><label style={lbl}>Responsável</label><input className="os-nova-input" style={fc} placeholder="Nome do técnico..." value={form.responsavel||""} onChange={e=>set("responsavel",e.target.value)} /></div>
            <div style={grp}>
              <label style={lbl}>Prestador / Empresa</label>
              {/* Selected supplier chip */}
              {selectedFornec ? (
                <div style={{ display:"flex",alignItems:"center",gap:10,background:"rgba(59,130,246,.15)",border:"1.5px solid rgba(59,130,246,.4)",borderRadius:10,padding:"10px 14px",marginBottom:6 }}>
                  <span style={{ fontSize:22,flexShrink:0 }}>{selectedFornec.icone||"🏢"}</span>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:14,fontWeight:700,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{selectedFornec.nome}</div>
                    <div style={{ fontSize:11,color:"#60A5FA" }}>{selectedFornec.categoria}{(selectedFornec.telefone||selectedFornec.whatsapp)?" · 📞 "+(selectedFornec.telefone||selectedFornec.whatsapp):""}</div>
                  </div>
                  <button onClick={clearFornec} style={{ background:"none",border:"none",color:"#60A5FA",cursor:"pointer",fontSize:18,padding:0,lineHeight:1,flexShrink:0 }}>✕</button>
                </div>
              ) : (
                <div style={{ position:"relative" }}>
                  <input
                    className="os-nova-input"
                    style={fc}
                    placeholder={fornecedores.length > 0 ? `🔍 Buscar entre ${fornecedores.length} fornecedores...` : "Empresa contratada..."}
                    value={fornecSearch}
                    onChange={e => { setFornecSearch(e.target.value); set("prestador_nome",e.target.value); setShowFornecList(true); }}
                    onFocus={() => setShowFornecList(true)}
                  />
                  {showFornecList && filteredFornec.length > 0 && (
                    <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:100,background:"#0F1628",border:"1.5px solid rgba(59,130,246,.4)",borderRadius:10,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
                      {filteredFornec.slice(0,15).map(f => (
                        <div key={f.id} onClick={() => selectFornec(f)}
                          style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,.04)",transition:"background .1s" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="rgba(59,130,246,.12)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <span style={{ fontSize:20,flexShrink:0 }}>{f.icone||"🏢"}</span>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:13,fontWeight:700,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{f.nome}</div>
                            <div style={{ fontSize:11,color:"#64748B" }}>{f.categoria}{(f.telefone||f.whatsapp)?" · "+(f.telefone||f.whatsapp):""}</div>
                          </div>
                          {f.status && <span style={{ fontSize:9,color:f.status==="ativo"?"#10B981":"#64748B",fontWeight:700,textTransform:"uppercase",flexShrink:0 }}>{f.status}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {showFornecList && <div onClick={()=>setShowFornecList(false)} style={{ position:"fixed",inset:0,zIndex:99 }} />}
                </div>
              )}
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div style={grp}><label style={lbl}>Custo estimado (R$)</label><input type="number" className="os-nova-input" style={fc} min={0} step={10} value={form.custo_estimado||0} onChange={e=>set("custo_estimado",Number(e.target.value))} /></div>
            <div style={grp}>
              <label style={lbl}>SLA</label>
              <select className="os-nova-input" style={fc} value={form.sla_horas||48} onChange={e=>set("sla_horas",Number(e.target.value))}>
                {SLA_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Confirmação + Di */}
      {step===3 && (
        <div>
          {/* Resumo */}
          <div style={{ background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:14,padding:20,marginBottom:18 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,fontSize:16 }}>
              {[
                ["Título",form.titulo],["Categoria",form.categoria],["Prioridade",PRI_LABEL[form.prioridade||""]],
                ["Local",form.local||"–"],["Responsável",form.responsavel||"–"],["SLA",`${form.sla_horas}h`],
                ["Custo est.",`R$ ${(form.custo_estimado||0).toLocaleString("pt-BR")}`],["Prazo",fmtDate(form.data_prevista)],
              ].map(([k,v])=>(
                <div key={k}>
                  <div style={{ color:"#64748B",marginBottom:3,fontSize:12 }}>{k}</div>
                  <div style={{ color:"var(--neu-text,#F1F5F9)",fontWeight:700,fontSize:16 }}>{v||"–"}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Di analysis card */}
          <div style={{ background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.2)",borderRadius:14,padding:18,marginBottom:18 }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
              <img src="/di.png" alt="Di" style={{ width:38,height:38,borderRadius:"50%",objectFit:"cover",objectPosition:"top" }} />
              <span style={{ fontSize:16,fontWeight:800,color:"#C4B5FD" }}>Di — Análise da OS</span>
            </div>
            {diLoading && !diTexto && <div style={{ color:"#A78BFA",fontSize:15 }}>⏳ Analisando...</div>}
            {diTexto ? <div style={{ fontSize:15,color:"#E9D5FF",lineHeight:1.65,whiteSpace:"pre-wrap" }}>{diTexto}</div>
              : !diLoading && <div style={{ color:"#64748B",fontSize:15 }}>A Di irá analisar esta OS após criação.</div>}
          </div>
          {/* Botão principal */}
          {diId ? (
            <button onClick={()=>onSave({id:diId} as OS)} disabled={diLoading}
              style={{...btnNext,width:"100%",padding:"18px",fontSize:18,opacity:diLoading?.6:1}}>
              ✅ Fechar e ver OS
            </button>
          ) : (
            <button onClick={goStep3to4} disabled={saving}
              style={{...btnNext,width:"100%",padding:"18px",fontSize:18}}>
              {saving ? "Criando..." : "🚀 Abrir OS"}
            </button>
          )}
        </div>
      )}

      {/* Nav buttons */}
      {step < 3 && (
        <div style={{ display:"flex",gap:8,marginTop:16 }}>
          <button style={btnBack} onClick={step===0?onCancel:()=>setStep(s=>s-1)}>{step===0?"✕ Cancelar":"← Voltar"}</button>
          <button style={{...btnNext,flex:1}} disabled={step===0&&!form.titulo?.trim()}
            onClick={step===2?goStep3to4:()=>setStep(s=>s+1)}>
            {step===2?(saving?"Criando...":"→ Criar & Analisar"):"Próximo →"}
          </button>
        </div>
      )}
      {step===3&&diId&&<button style={{...btnBack,marginTop:12,fontSize:15,padding:"10px 18px"}} onClick={onCancel}>← Nova OS</button>}
    </div>
  );
}

// ── OSDetail Drawer ───────────────────────────────────────────────────────────
function OSDetail({ os, condId, condNome, osList, onClose, onUpdate }: { os: OS; condId:string; condNome:string; osList:OS[]; onClose:()=>void; onUpdate:(os:OS)=>void }) {
  const [comments, setComments] = useState<Comentario[]>([]);
  const [newMsg, setNewMsg]     = useState("");
  const [diTexto, setDiTexto]   = useState((os.di_sugestao as {texto?:string}|undefined)?.texto || "");
  const [diLoading, setDiLoading] = useState(false);
  const [tab, setTab]           = useState<"info"|"checklist"|"comentarios"|"di"|"notif">("info");
  const [checklist, setChecklist] = useState<{item:string;done:boolean}[]>(os.checklist||[]);
  // Notification to residents
  const [notifTem, setNotifTem]         = useState(false);
  const [notifPrazo, setNotifPrazo]     = useState("");
  const [notifDet, setNotifDet]         = useState("");
  const [notifSind, setNotifSind]       = useState("Síndico");
  const [notifTexto, setNotifTexto]     = useState("");
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifCopied, setNotifCopied]   = useState(false);

  useEffect(() => {
    fetch(`/api/os-comentarios?os_id=${os.id}`).then(r=>r.json()).then(setComments).catch(()=>{});
  }, [os.id]);

  async function addComment() {
    if (!newMsg.trim()) return;
    const r = await fetch("/api/os-comentarios", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ os_id:os.id, condominio_id:condId, autor:"Síndico", mensagem:newMsg }) });
    const c = await r.json(); if (c.id) { setComments(prev=>[...prev,c]); setNewMsg(""); }
  }

  async function saveChecklist(cl: {item:string;done:boolean}[]) {
    setChecklist(cl);
    const r = await fetch(`/api/os/${os.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ checklist:cl }) });
    const updated = await r.json(); if (updated.id) onUpdate(updated);
  }

  async function getDi() {
    setDiLoading(true); setDiTexto(""); setTab("di");
    const hist = osList.filter(o=>o.categoria===os.categoria&&o.id!==os.id).slice(-5);
    const r = await fetch(`/api/os/${os.id}/di`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ condominio_nome:condNome, historico:hist }) });
    const json = await r.json();
    const txt: string = json.texto || "Sem análise disponível.";
    let i=0; const iv=setInterval(()=>{ i+=3; setDiTexto(txt.slice(0,i)); if(i>=txt.length){clearInterval(iv);setDiLoading(false);} },20);
  }

  async function changeStatus(status: string) {
    const r = await fetch(`/api/os/${os.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
    const updated = await r.json(); if (updated.id) onUpdate(updated);
  }

  async function generateNotif() {
    setNotifLoading(true); setNotifTexto(""); setTab("notif");
    const r = await fetch(`/api/os/${os.id}/notificacao-moradores`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ condominio_nome:condNome, sindico_nome:notifSind, tem_interrupcao:notifTem, prazo_interrupcao:notifPrazo, detalhes_interrupcao:notifDet })
    });
    const json = await r.json();
    const txt: string = json.texto || "Erro ao gerar comunicado.";
    let i=0; const iv=setInterval(()=>{ i+=4; setNotifTexto(txt.slice(0,i)); if(i>=txt.length){clearInterval(iv);setNotifLoading(false);} },18);
  }

  function copyNotif() {
    navigator.clipboard.writeText(notifTexto).then(()=>{ setNotifCopied(true); setTimeout(()=>setNotifCopied(false),2000); });
  }

  const tabBtn = (t:typeof tab, icon:string, lbl:string, big?:boolean) => {
    const active = tab === t;
    return (
      <button key={t} onClick={()=>setTab(t)} style={{
        flex: big ? "1.35" : "1",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4,
        padding: big ? "10px 4px 9px" : "9px 4px 8px",
        border:"none",
        borderBottom: `3px solid ${active ? (big ? "#F472B6" : "#818CF8") : "transparent"}`,
        background: active
          ? big ? "rgba(244,114,182,.12)" : "rgba(99,102,241,.15)"
          : "transparent",
        color: active ? (big ? "#F9A8D4" : "#A5B4FC") : "#4B5563",
        cursor:"pointer", fontFamily:"inherit",
        transition:"all .18s ease",
      }}>
        <span style={{ fontSize: big ? 22 : 18, lineHeight:1, filter: active ? "none" : "grayscale(60%) opacity(.6)" }}>{icon}</span>
        <span style={{ fontSize: big ? 12 : 10, fontWeight: active ? 800 : 600, letterSpacing:".2px", whiteSpace:"nowrap" }}>{lbl}</span>
      </button>
    );
  };

  const pc = PRI_COLOR[os.prioridade]||"#64748B";

  return (
    <div style={{ position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"stretch",justifyContent:"flex-end" }}>
      <div onClick={onClose} style={{ position:"absolute",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)" }} />
      <div style={{ position:"relative",width:"min(480px,100%)",background:"#0F0F1A",borderLeft:"1px solid rgba(255,255,255,.08)",display:"flex",flexDirection:"column",overflowY:"hidden",animation:"slideLeft .2s ease" }}>
        {/* Header */}
        <div style={{ padding:"16px 18px",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6 }}>
            <div>
              <div style={{ fontFamily:"monospace",fontSize:11,color:"#818CF8",fontWeight:800 }}>{fmtNum(os.numero)}</div>
              <div style={{ fontSize:15,fontWeight:800,color:"#F1F5F9",lineHeight:1.3 }}>{os.titulo}</div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,.06)",border:"none",borderRadius:8,width:30,height:30,color:"#94A3B8",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
          </div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            <span style={{ fontSize:9,fontWeight:700,color:pc,background:pc+"22",border:`1px solid ${pc}44`,borderRadius:4,padding:"2px 7px" }}>{PRI_LABEL[os.prioridade]}</span>
            <span style={{ fontSize:9,fontWeight:600,color:STS_COLOR[os.status],background:STS_COLOR[os.status]+"15",borderRadius:4,padding:"2px 7px" }}>{STS_LABEL[os.status]}</span>
            <span style={{ fontSize:9,color:"#64748B" }}>{CAT_ICON[os.categoria]} {os.categoria}</span>
          </div>
          {/* Quick actions */}
          <div style={{ display:"flex",gap:6,marginTop:10 }}>
            {os.status==="aberta"&&<button onClick={()=>changeStatus("em_andamento")} style={{ fontSize:10,padding:"4px 10px",background:"rgba(6,182,212,.15)",border:"1px solid rgba(6,182,212,.3)",borderRadius:6,color:"#67E8F9",cursor:"pointer",fontWeight:700 }}>▶ Iniciar</button>}
            {os.status==="em_andamento"&&<button onClick={()=>changeStatus("fechada")} style={{ fontSize:10,padding:"4px 10px",background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",borderRadius:6,color:"#34D399",cursor:"pointer",fontWeight:700 }}>✓ Concluir</button>}
            {os.status==="fechada"&&<button onClick={()=>changeStatus("aberta")} style={{ fontSize:10,padding:"4px 10px",background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:6,color:"#FCD34D",cursor:"pointer",fontWeight:700 }}>↩ Reabrir</button>}
            <button onClick={getDi} disabled={diLoading} style={{ fontSize:10,padding:"4px 10px",background:"rgba(139,92,246,.15)",border:"1px solid rgba(139,92,246,.3)",borderRadius:6,color:"#C4B5FD",cursor:"pointer",fontWeight:700,opacity:diLoading?.6:1 }}>🟣 Di</button>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", width:"100%", borderBottom:"2px solid rgba(255,255,255,.06)", background:"#080B14", flexShrink:0 }}>
          {tabBtn("info","ℹ️","Info")}
          {tabBtn("checklist","☑️","Checklist")}
          {tabBtn("comentarios","💬",`(${comments.length})`)}
          {tabBtn("di","🟣","Di")}
          {tabBtn("notif","📢","Avisar",true)}
        </div>
        {/* Tab content */}
        <div style={{ flex:1,overflowY:"auto",padding:"14px 18px" }}>
          {/* Info */}
          {tab==="info" && (
            <div>
              {os.descricao&&<div style={{ marginBottom:12,fontSize:12,color:"#CBD5E1",lineHeight:1.6,background:"rgba(255,255,255,.03)",borderRadius:8,padding:10 }}>{os.descricao}</div>}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11 }}>
                {[["SLA",`${os.sla_horas||48}h`],["Local",os.local||"–"],["Responsável",os.responsavel||"–"],["Prestador",os.prestador_nome||"–"],["Custo est.",`R$ ${(os.custo_estimado||0).toLocaleString("pt-BR")}`],["Custo real",os.custo_real?`R$ ${os.custo_real.toLocaleString("pt-BR")}`:"–"],["Prazo",fmtDate(os.data_prevista)],["Criada",fmtDate(os.created_at)]].map(([k,v])=>(
                  <div key={k} style={{ background:"rgba(255,255,255,.03)",borderRadius:8,padding:"8px 10px" }}><div style={{ color:"#64748B",fontSize:9,marginBottom:2 }}>{k}</div><div style={{ color:"#F1F5F9",fontWeight:600 }}>{v}</div></div>
                ))}
              </div>
              {os.status!=="fechada"&&<div style={{ marginTop:12 }}><div style={{ fontSize:10,color:"#64748B",marginBottom:4 }}>SLA Progress</div><SLABar created_at={os.created_at} sla_horas={os.sla_horas||48} /></div>}
              {os.aprovacao_necessaria&&<div style={{ marginTop:10,background:"rgba(234,179,8,.08)",border:"1px solid rgba(234,179,8,.2)",borderRadius:8,padding:"8px 10px",fontSize:11,color:"#FDE68A" }}>⚠️ Aprovação necessária{os.aprovado_por?` — Aprovado por ${os.aprovado_por}`:""}</div>}
            </div>
          )}
          {/* Checklist */}
          {tab==="checklist" && (
            <div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                <span style={{ fontSize:11,color:"#64748B" }}>{checklist.filter(c=>c.done).length}/{checklist.length} itens</span>
                <div style={{ height:4,width:120,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden" }}>
                  <div style={{ width:`${checklist.length?checklist.filter(c=>c.done).length/checklist.length*100:0}%`,height:"100%",background:"#10B981",borderRadius:2 }} />
                </div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {checklist.map((item,i)=>(
                  <label key={i} style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",background:"rgba(255,255,255,.03)",borderRadius:8,border:`1px solid ${item.done?"rgba(16,185,129,.2)":"rgba(255,255,255,.05)"}` }}>
                    <input type="checkbox" checked={item.done} onChange={e=>{const cl=[...checklist];cl[i]={...cl[i],done:e.target.checked};saveChecklist(cl);}} style={{ accentColor:"#10B981",width:24,height:24,flexShrink:0 }} />
                    <span style={{ fontSize:24,fontWeight:700,color:item.done?"#10B981":"#FFFFFF",textDecoration:item.done?"line-through":"none" }}>{item.item}</span>
                  </label>
                ))}
                {checklist.length===0&&<div style={{ color:"#334155",textAlign:"center",padding:20 }}>Sem checklist para esta OS</div>}
              </div>
            </div>
          )}
          {/* Comentários */}
          {tab==="comentarios" && (
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {comments.map(c=>(
                <div key={c.id} style={{ background:"rgba(255,255,255,.03)",borderRadius:10,padding:"10px 12px" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <span style={{ fontSize:11,fontWeight:700,color:"#A5B4FC" }}>{c.autor}</span>
                    <span style={{ fontSize:9,color:"#475569" }}>{fmtDate(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize:12,color:"#CBD5E1",lineHeight:1.5 }}>{c.mensagem}</div>
                </div>
              ))}
              {comments.length===0&&<div style={{ color:"#334155",textAlign:"center",padding:20,fontSize:12 }}>Nenhum comentário ainda.</div>}
              <div style={{ display:"flex",gap:8,marginTop:4 }}>
                <input value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment()}
                  placeholder="Adicionar comentário..."
                  style={{ flex:1,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#F1F5F9",padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none" }} />
                <button onClick={addComment} style={{ background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",borderRadius:8,color:"#fff",padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700 }}>➤</button>
              </div>
            </div>
          )}
          {/* Di */}
          {tab==="di" && (
            <div style={{ background:"rgba(139,92,246,.06)",border:"1px solid rgba(139,92,246,.2)",borderRadius:12,padding:14 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                <img src="/di.png" alt="Di" style={{ width:32,height:32,borderRadius:"50%",objectFit:"cover",objectPosition:"top" }} />
                <div><div style={{ fontSize:13,fontWeight:800,color:"#C4B5FD" }}>Di — Síndica Virtual</div><div style={{ fontSize:9,color:"#7C3AED" }}>Análise da OS</div></div>
              </div>
              {diLoading&&!diTexto&&<div style={{ color:"#A78BFA",fontSize:12 }}>⏳ Analisando...</div>}
              {diTexto?<div style={{ fontSize:12,color:"#E9D5FF",lineHeight:1.7,whiteSpace:"pre-wrap" }}>{diTexto}</div>
                :<div style={{ color:"#4B3B7D",fontSize:12 }}>Clique em "🟣 Di" no header para obter uma análise.</div>}
            </div>
          )}

          {/* ── Notificação aos Moradores ── */}
          {tab==="notif" && (
            <div>
              {/* Header card */}
              <div style={{ background:"linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.12))",border:"1.5px solid rgba(99,102,241,.3)",borderRadius:12,padding:"12px 14px",marginBottom:14 }}>
                <div style={{ fontSize:13,fontWeight:800,color:"#A5B4FC",marginBottom:4 }}>📢 Comunicado aos Moradores</div>
                <div style={{ fontSize:11,color:"#94A3B8",lineHeight:1.5 }}>
                  Gere um comunicado formal sobre esta OS para enviar aos moradores. A Di redige o texto automaticamente com base nos detalhes da ordem.
                </div>
              </div>

              {/* ── Opções ── */}
              {/* Interrupção de serviços */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11,color:"#CBD5E1",fontWeight:700,marginBottom:8,letterSpacing:".04em",textTransform:"uppercase" }}>Haverá interrupção dos serviços?</div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>setNotifTem(false)} style={{ flex:1,padding:"10px",borderRadius:8,border:`2px solid ${!notifTem?"#10B981":"rgba(255,255,255,.08)"}`,background:!notifTem?"rgba(16,185,129,.15)":"rgba(255,255,255,.03)",color:!notifTem?"#34D399":"#64748B",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s" }}>
                    ✅ Não — funcionamento normal
                  </button>
                  <button onClick={()=>setNotifTem(true)} style={{ flex:1,padding:"10px",borderRadius:8,border:`2px solid ${notifTem?"#F97316":"rgba(255,255,255,.08)"}`,background:notifTem?"rgba(249,115,22,.15)":"rgba(255,255,255,.03)",color:notifTem?"#FB923C":"#64748B",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s" }}>
                    ⚠️ Sim — haverá interrupção
                  </button>
                </div>
              </div>

              {/* Prazo (só quando tem interrupção) */}
              {notifTem && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11,color:"#CBD5E1",fontWeight:700,display:"block",marginBottom:5,letterSpacing:".04em",textTransform:"uppercase" }}>Prazo estimado de interrupção</label>
                  <input
                    placeholder="Ex: 4 horas, das 8h às 12h, 24 horas..."
                    value={notifPrazo}
                    onChange={e=>setNotifPrazo(e.target.value)}
                    style={{ width:"100%",background:"rgba(255,255,255,.07)",border:"1.5px solid rgba(249,115,22,.3)",borderRadius:8,padding:"10px 12px",color:"#FFF",fontWeight:600,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box" as const }}
                  />
                  <textarea
                    placeholder="Detalhes adicionais sobre a interrupção (opcional)..."
                    value={notifDet}
                    onChange={e=>setNotifDet(e.target.value)}
                    rows={2}
                    style={{ width:"100%",background:"rgba(255,255,255,.07)",border:"1.5px solid rgba(249,115,22,.3)",borderRadius:8,padding:"10px 12px",color:"#FFF",fontWeight:600,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box" as const,resize:"vertical" as const,marginTop:6 }}
                  />
                </div>
              )}

              {/* Nome do síndico */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11,color:"#CBD5E1",fontWeight:700,display:"block",marginBottom:5,letterSpacing:".04em",textTransform:"uppercase" }}>Assinatura do Síndico</label>
                <input
                  placeholder="Nome do síndico..."
                  value={notifSind}
                  onChange={e=>setNotifSind(e.target.value)}
                  style={{ width:"100%",background:"rgba(255,255,255,.07)",border:"1.5px solid rgba(255,255,255,.12)",borderRadius:8,padding:"10px 12px",color:"#FFF",fontWeight:600,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box" as const }}
                />
              </div>

              {/* Gerar button */}
              <button
                onClick={generateNotif}
                disabled={notifLoading}
                style={{ width:"100%",padding:"12px",background:"linear-gradient(135deg,#6366F1,#8B5CF6)",border:"none",borderRadius:10,color:"#fff",fontWeight:800,fontSize:13,cursor:notifLoading?"not-allowed":"pointer",opacity:notifLoading?.6:1,fontFamily:"inherit",marginBottom:14,boxShadow:"0 4px 14px rgba(99,102,241,.4)" }}
              >
                {notifLoading ? "⏳ Di gerando comunicado..." : "🤖 Gerar Comunicado com Di"}
              </button>

              {/* Preview do comunicado */}
              {notifTexto && (
                <div>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                    <span style={{ fontSize:11,color:"#818CF8",fontWeight:700 }}>📄 Comunicado gerado</span>
                    <button
                      onClick={copyNotif}
                      style={{ fontSize:11,padding:"4px 12px",background:notifCopied?"rgba(16,185,129,.2)":"rgba(99,102,241,.2)",border:`1px solid ${notifCopied?"rgba(16,185,129,.4)":"rgba(99,102,241,.4)"}`,borderRadius:6,color:notifCopied?"#34D399":"#A5B4FC",cursor:"pointer",fontWeight:700,fontFamily:"inherit",transition:"all .2s" }}
                    >
                      {notifCopied ? "✓ Copiado!" : "📋 Copiar"}
                    </button>
                  </div>
                  <div style={{ background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"14px 16px",fontSize:12,color:"#E2E8F0",lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"Georgia, serif" }}>
                    {notifTexto}
                    {notifLoading && <span style={{ display:"inline-block",width:8,height:14,background:"#818CF8",borderRadius:2,animation:"pulse .6s infinite",verticalAlign:"middle",marginLeft:3 }} />}
                  </div>
                </div>
              )}

              {!notifTexto && !notifLoading && (
                <div style={{ textAlign:"center",color:"#334155",fontSize:12,marginTop:10 }}>
                  Configure as opções acima e clique em "Gerar" para criar o comunicado.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── OSModule ─────────────────────────────────────────────────────────────────
export default function OSModule({ condId, condNome="Condomínio", view, onBack }: Props) {
  const [osList, setOsList]     = useState<OS[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("todos");
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [priFilter, setPriFilter] = useState("todos");
  const [selectedOS, setSelectedOS] = useState<OS|null>(null);
  const [showForm, setShowForm] = useState(false);
  const isMob = view === "mobile";

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ condominio_id: condId });
    if (filter !== "todos" && ["aberta","em_andamento","fechada","cancelada"].includes(filter)) params.set("status", filter);
    if (catFilter !== "todos") params.set("categoria", catFilter);
    if (priFilter !== "todos") params.set("prioridade", priFilter);
    if (search) params.set("search", search);
    const r = await fetch(`/api/os?${params}`);
    const data = await r.json();
    if (Array.isArray(data)) setOsList(data);
    setLoading(false);
  }, [condId, filter, catFilter, priFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Realtime via SSE
  const sseRef = useRef<EventSource|null>(null);
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = e => { try { const d=JSON.parse(e.data); if(["nova_os","os_atualizada","os_excluida"].includes(d.type))load(); }catch{} };
    sseRef.current = es;
    return () => es.close();
  }, [load]);

  // Derived list: urgentes first, then by SLA remaining
  const displayed = [...osList]
    .filter(o => filter==="urgente" ? o.prioridade==="urgente"&&o.status!=="fechada" : true)
    .sort((a,b)=>{
      const pa = a.prioridade==="urgente"?0:a.prioridade==="alta"?1:a.prioridade==="media"?2:3;
      const pb = b.prioridade==="urgente"?0:b.prioridade==="alta"?1:b.prioridade==="media"?2:3;
      if(pa!==pb)return pa-pb;
      const ra=elapsed(a.created_at,a.sla_horas||48).restH, rb=elapsed(b.created_at,b.sla_horas||48).restH;
      return ra-rb;
    });

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/os/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
    load();
  }

  function handleOSUpdate(updated: OS) {
    setOsList(prev=>prev.map(o=>o.id===updated.id?updated:o));
    if(selectedOS?.id===updated.id)setSelectedOS(updated);
  }

  const slaBreach = osList.filter(o=>o.status!=="fechada"&&elapsed(o.created_at,o.sla_horas||48).pct>80).length;

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  if (isMob) {
    if (showForm) return (
      <div style={{ position:"absolute",inset:0,zIndex:60,background:"var(--neu-bg,#1E1B35)",overflowY:"auto",fontFamily:"Nunito,sans-serif" }}>
        <div style={{ background:"rgba(99,102,241,.15)",borderBottom:"1px solid rgba(99,102,241,.15)",padding:"12px 14px",display:"flex",alignItems:"center",gap:10 }}>
          <button onClick={()=>setShowForm(false)} style={{ background:"none",border:"none",color:"var(--neu-text,#CBD5E1)",cursor:"pointer",fontSize:14,padding:4 }}>←</button>
          <div style={{ fontWeight:800,fontSize:14,color:"var(--neu-text,#F1F5F9)" }}>Nova OS</div>
        </div>
        <div style={{ padding:"14px 14px 80px" }}>
          <NovaOSForm condId={condId} condNome={condNome} osList={osList} view="mobile"
            onSave={()=>{setShowForm(false);load();}} onCancel={()=>setShowForm(false)} />
        </div>
      </div>
    );

    return (
      <div style={{ display:"flex",flexDirection:"column",height:"100%",fontFamily:"Nunito,sans-serif" }}>
        {/* SLA warning */}
        {slaBreach > 0 && (
          <div style={{ background:"rgba(234,179,8,.12)",borderBottom:"1px solid rgba(234,179,8,.25)",padding:"6px 14px",fontSize:10,fontWeight:700,color:"#FDE68A" }}>
            ⚠️ {slaBreach} OS(s) com SLA ultrapassando 80%
          </div>
        )}
        {/* KPI mini strip */}
        <div style={{ padding:"10px 14px 6px",flexShrink:0 }}>
          <div style={{ display:"flex",gap:6 }}>
            {[{v:osList.filter(o=>o.status==="aberta").length,l:"Abertas",c:"#F59E0B",f:"aberta"},{v:osList.filter(o=>o.status==="em_andamento").length,l:"Andamento",c:"#06B6D4",f:"em_andamento"},{v:osList.filter(o=>o.prioridade==="urgente"&&o.status!=="fechada").length,l:"Urgentes",c:"#EF4444",f:"urgente"}].map(s=>(
              <div key={s.f} onClick={()=>setFilter(filter===s.f?"todos":s.f)} style={{ flex:1,background:s.c+"15",border:`1px solid ${filter===s.f?s.c:"transparent"}`,borderRadius:10,padding:"8px 6px",textAlign:"center",cursor:"pointer" }}>
                <div style={{ fontSize:18,fontWeight:900,color:s.c,lineHeight:1 }}>{s.v}</div>
                <div style={{ fontSize:8,color:s.c,opacity:.8,fontWeight:700 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Search */}
        <div style={{ padding:"4px 14px 8px",flexShrink:0 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar OS..."
            style={{ width:"100%",boxSizing:"border-box",background:"var(--neu-bg,rgba(255,255,255,.05))",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"var(--neu-text,#F1F5F9)",padding:"7px 10px",fontSize:11,fontFamily:"inherit",outline:"none" }} />
        </div>
        {/* List */}
        <div style={{ flex:1,overflowY:"auto",padding:"0 14px 14px" }}>
          {loading&&<div style={{ textAlign:"center",padding:30,color:"#64748B",fontSize:12 }}>Carregando...</div>}
          {!loading&&displayed.length===0&&<div style={{ textAlign:"center",padding:30,color:"#64748B",fontSize:12 }}>Nenhuma OS encontrada</div>}
          {displayed.map(os=><OSCard key={os.id} os={os} compact onSelect={()=>setSelectedOS(os)} onStatusChange={handleStatusChange} />)}
        </div>
        {/* Nova OS FAB */}
        <button onClick={()=>setShowForm(true)} style={{ position:"absolute",bottom:80,right:14,width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",color:"#fff",fontSize:22,cursor:"pointer",boxShadow:"0 4px 14px rgba(99,102,241,.5)",zIndex:20 }}>+</button>
        {/* Detail drawer */}
        {selectedOS&&<OSDetail os={selectedOS} condId={condId} condNome={condNome} osList={osList} onClose={()=>setSelectedOS(null)} onUpdate={handleOSUpdate} />}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ─────────────────────────────────────────────────────────
  if (showForm) return (
    <div>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
        <button onClick={()=>setShowForm(false)} style={{ background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#94A3B8",padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit" }}>← Voltar</button>
        <div style={{ fontSize:17,fontWeight:800,color:"#F1F5F9" }}>Nova Ordem de Serviço</div>
      </div>
      <div style={{ maxWidth:600 }}>
        <NovaOSForm condId={condId} condNome={condNome} osList={osList} view="desktop"
          onSave={()=>{setShowForm(false);load();}} onCancel={()=>setShowForm(false)} />
      </div>
    </div>
  );

  return (
    <div>
      {/* SLA alert strip */}
      {slaBreach > 0 && (
        <div style={{ background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#FCA5A5",display:"flex",alignItems:"center",gap:8 }}>
          🚨 <strong>{slaBreach}</strong> OS(s) com SLA ultrapassando 80% — atenção imediata necessária!
        </div>
      )}
      {/* Header row: title + button */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontSize:18,fontWeight:900,color:"#F1F5F9",letterSpacing:"-.01em" }}>Ordens de Serviço</div>
        <button onClick={()=>setShowForm(true)} style={{ padding:"10px 22px",background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",letterSpacing:".03em",boxShadow:"0 4px 14px rgba(99,102,241,.45)",whiteSpace:"nowrap" }}>
          + Nova OS
        </button>
      </div>
      {/* KPIs */}
      <KpiStrip os={osList} filter={filter} onFilter={setFilter} />

      {/* Toolbar */}
      <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por título, local, responsável..."
          style={{ flex:1,minWidth:200,padding:"8px 12px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:"#F1F5F9",fontSize:12,fontFamily:"inherit",outline:"none" }} />
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{ padding:"8px 10px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:"#CBD5E1",fontSize:11,fontFamily:"inherit",cursor:"pointer" }}>
          <option value="todos">Todas categorias</option>
          {CATS.map(c=><option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
        </select>
        <select value={priFilter} onChange={e=>setPriFilter(e.target.value)} style={{ padding:"8px 10px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:"#CBD5E1",fontSize:11,fontFamily:"inherit",cursor:"pointer" }}>
          <option value="todos">Todas prioridades</option>
          {[["urgente","🔴 Urgente"],["alta","🟡 Alta"],["media","🔵 Média"],["baixa","🟢 Baixa"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        {(search||filter!=="todos"||catFilter!=="todos"||priFilter!=="todos")&&(
          <button onClick={()=>{setSearch("");setFilter("todos");setCatFilter("todos");setPriFilter("todos");}} style={{ padding:"8px 12px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",borderRadius:9,color:"#FCA5A5",fontSize:11,cursor:"pointer",fontFamily:"inherit" }}>✕ Limpar</button>
        )}
      </div>

      {/* List */}
      {loading&&<div style={{ textAlign:"center",padding:50,color:"#64748B" }}>Carregando ordens de serviço...</div>}
      {!loading&&displayed.length===0&&(
        <div style={{ textAlign:"center",padding:"60px 0",color:"#334155" }}>
          <div style={{ fontSize:48,marginBottom:12 }}>{osList.length===0?"✅":"🔍"}</div>
          <div style={{ fontSize:15,fontWeight:700,color:"#64748B" }}>{osList.length===0?"Nenhuma OS cadastrada":"Nenhuma OS encontrada"}</div>
          {osList.length===0&&<button onClick={()=>setShowForm(true)} style={{ marginTop:20,padding:"10px 24px",background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",borderRadius:10,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>+ Nova OS</button>}
        </div>
      )}
      <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
        {displayed.map(os=><OSCard key={os.id} os={os} onSelect={()=>setSelectedOS(os)} onStatusChange={handleStatusChange} />)}
      </div>

      {/* Detail drawer */}
      {selectedOS&&<OSDetail os={selectedOS} condId={condId} condNome={condNome} osList={osList} onClose={()=>setSelectedOS(null)} onUpdate={handleOSUpdate} />}
    </div>
  );
}
