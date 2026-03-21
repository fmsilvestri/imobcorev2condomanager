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
      <div style={{ height:4, background:"rgba(255,255,255,.08)", borderRadius:2, overflow:"hidden", marginBottom:3 }}>
        <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background:barColor, borderRadius:2, transition:"width .5s" }} />
      </div>
      <div style={{ fontSize:9, color:barColor, fontWeight:600 }}>
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
        background:"rgba(255,255,255,.025)", border:`1px solid rgba(255,255,255,.07)`,
        borderLeft:`3px solid ${pc}`, borderRadius:10, padding:compact?"10px 12px":"12px 14px",
        marginBottom:8, cursor:"pointer", position:"relative",
        boxShadow: isUrgente ? `0 0 12px ${pc}22` : "none",
        transition:"background .12s",
      }}
    >
      {/* Urgent pulse */}
      {isUrgente && (
        <div style={{ position:"absolute",top:10,right:10,width:8,height:8,borderRadius:"50%",background:pc,boxShadow:`0 0 6px ${pc}`,animation:"pulse 1s infinite" }} />
      )}
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
        <span style={{ fontFamily:"monospace", fontSize:10, color:"#818CF8", fontWeight:800, flexShrink:0, marginTop:1 }}>{fmtNum(os.numero)}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:compact?12:13, fontWeight:700, color:"var(--neu-text,#F1F5F9)", lineHeight:1.3, marginBottom:3 }}>{os.titulo}</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            <span style={{ fontSize:9, fontWeight:700, color:pc, background:pc+"22", border:`1px solid ${pc}44`, borderRadius:4, padding:"1px 6px" }}>{PRI_LABEL[os.prioridade]||os.prioridade}</span>
            <span style={{ fontSize:9, fontWeight:600, color:sc, background:sc+"15", borderRadius:4, padding:"1px 6px" }}>{STS_LABEL[os.status]||os.status}</span>
            <span style={{ fontSize:9, color:"#64748B" }}>{CAT_ICON[os.categoria]} {os.categoria}</span>
          </div>
        </div>
        {/* Avatar */}
        {os.responsavel && (
          <div title={os.responsavel} style={{ width:28,height:28,borderRadius:"50%",background:avatarColor(os.responsavel),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0 }}>
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
        <div style={{ marginTop:6 }}>
          <div style={{ height:3, background:"rgba(255,255,255,.06)", borderRadius:2, overflow:"hidden" }}>
            <div style={{ width:`${prog}%`,height:"100%",background:sc,borderRadius:2,transition:"width .5s" }} />
          </div>
        </div>
      )}

      {/* Meta row */}
      {!compact && (
        <div style={{ display:"flex",gap:8,marginTop:6,flexWrap:"wrap",alignItems:"center" }}>
          {os.local && <span style={{ fontSize:10,color:"#64748B" }}>📍 {os.local}</span>}
          {os.custo_estimado! > 0 && <span style={{ fontSize:10,color:"#64748B" }}>💰 R$ {os.custo_estimado!.toLocaleString("pt-BR")}</span>}
          {os.data_prevista && <span style={{ fontSize:10,color:"#64748B" }}>📅 {fmtDate(os.data_prevista)}</span>}
          {os.aprovacao_necessaria && <span style={{ fontSize:9,fontWeight:700,color:"#EAB308",background:"rgba(234,179,8,.15)",borderRadius:4,padding:"1px 6px" }}>⚠️ Aprovação</span>}
          <div style={{ marginLeft:"auto",display:"flex",gap:4 }}>
            {os.status==="aberta"&&<button onClick={e=>{e.stopPropagation();onStatusChange(os.id,"em_andamento");}} style={{ fontSize:9,padding:"2px 8px",background:"rgba(6,182,212,.15)",border:"1px solid rgba(6,182,212,.3)",borderRadius:4,color:"#67E8F9",cursor:"pointer",fontWeight:600 }}>▶ Iniciar</button>}
            {os.status==="em_andamento"&&<button onClick={e=>{e.stopPropagation();onStatusChange(os.id,"fechada");}} style={{ fontSize:9,padding:"2px 8px",background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",borderRadius:4,color:"#34D399",cursor:"pointer",fontWeight:600 }}>✓ Concluir</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ os, filter, onFilter }: { os: OS[]; filter: string; onFilter:(f:string)=>void }) {
  const stats = {
    total:     { v:os.length, icon:"📊", label:"Total", color:"#94A3B8", bg:"rgba(148,163,184,.1)", filt:"todos" },
    abertas:   { v:os.filter(o=>o.status==="aberta").length, icon:"📋", label:"Abertas", color:"#F59E0B", bg:"rgba(245,158,11,.08)", filt:"aberta" },
    andamento: { v:os.filter(o=>o.status==="em_andamento").length, icon:"🔄", label:"Andamento", color:"#06B6D4", bg:"rgba(6,182,212,.08)", filt:"em_andamento" },
    concluidas:{ v:os.filter(o=>o.status==="fechada").length, icon:"✅", label:"Concluídas", color:"#10B981", bg:"rgba(16,185,129,.08)", filt:"fechada" },
    urgentes:  { v:os.filter(o=>o.prioridade==="urgente"&&o.status!=="fechada").length, icon:"🚨", label:"Urgentes", color:"#EF4444", bg:"rgba(239,68,68,.1)", filt:"urgente" },
  };
  return (
    <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
      {Object.entries(stats).map(([k,s]) => (
        <div key={k} onClick={()=>onFilter(filter===s.filt?"todos":s.filt)}
          style={{ flex:"1 1 80px",background:s.bg,border:`1.5px solid ${filter===s.filt?s.color:"transparent"}`,borderRadius:12,padding:"10px 12px",textAlign:"center",cursor:"pointer",transition:"border-color .15s",minWidth:70 }}>
          <div style={{ fontSize:16,marginBottom:2 }}>{s.icon}</div>
          <div style={{ fontSize:20,fontWeight:900,color:s.color,lineHeight:1 }}>{s.v}</div>
          <div style={{ fontSize:9,color:s.color,opacity:.8,marginTop:2,fontWeight:600 }}>{s.label}</div>
        </div>
      ))}
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

  const set = (k: keyof OS, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  // Load equipment list from maintenance module
  useEffect(() => {
    if (!condId) return;
    fetch(`/api/equipamentos?condominio_id=${condId}`)
      .then(r => r.json())
      .then((data: EqBasic[]) => { if (Array.isArray(data)) setEquipamentos(data); })
      .catch(() => {});
  }, [condId]);

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
                  }} style={{ accentColor:"#6366F1",width:14,height:14 }} />
                  <span style={{ fontSize:12,color:item.done?"#10B981":"var(--neu-text,#CBD5E1)",textDecoration:item.done?"line-through":"none" }}>{item.item}</span>
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
            <div style={grp}><label style={lbl}>Prestador / Empresa</label><input className="os-nova-input" style={fc} placeholder="Empresa contratada..." value={form.prestador_nome||""} onChange={e=>set("prestador_nome",e.target.value)} /></div>
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
          <div style={{ background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:10,padding:12,marginBottom:12 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11 }}>
              {[
                ["Título",form.titulo],["Categoria",form.categoria],["Prioridade",PRI_LABEL[form.prioridade||""]],
                ["Local",form.local||"–"],["Responsável",form.responsavel||"–"],["SLA",`${form.sla_horas}h`],
                ["Custo est.",`R$ ${(form.custo_estimado||0).toLocaleString("pt-BR")}`],["Prazo",fmtDate(form.data_prevista)],
              ].map(([k,v])=>(
                <div key={k}><div style={{ color:"#64748B",marginBottom:1 }}>{k}</div><div style={{ color:"var(--neu-text,#F1F5F9)",fontWeight:600 }}>{v||"–"}</div></div>
              ))}
            </div>
          </div>
          {/* Di analysis card */}
          <div style={{ background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.2)",borderRadius:10,padding:12,marginBottom:12 }}>
            <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6 }}>
              <img src="/di.png" alt="Di" style={{ width:24,height:24,borderRadius:"50%",objectFit:"cover",objectPosition:"top" }} />
              <span style={{ fontSize:11,fontWeight:800,color:"#C4B5FD" }}>Di — Análise da OS</span>
            </div>
            {diLoading && !diTexto && <div style={{ color:"#A78BFA",fontSize:11 }}>⏳ Analisando...</div>}
            {diTexto ? <div style={{ fontSize:11,color:"#E9D5FF",lineHeight:1.6,whiteSpace:"pre-wrap" }}>{diTexto}</div>
              : !diLoading && <div style={{ color:"#64748B",fontSize:11 }}>A Di irá analisar esta OS após criação.</div>}
          </div>
          {/* Botão principal */}
          {diId ? (
            <button onClick={()=>onSave({id:diId} as OS)} disabled={diLoading}
              style={{...btnNext,width:"100%",padding:"12px",fontSize:13,opacity:diLoading?.6:1}}>
              ✅ Fechar e ver OS
            </button>
          ) : (
            <button onClick={goStep3to4} disabled={saving}
              style={{...btnNext,width:"100%",padding:"12px",fontSize:13}}>
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
      {step===3&&diId&&<button style={{...btnBack,marginTop:8}} onClick={onCancel}>← Nova OS</button>}
    </div>
  );
}

// ── OSDetail Drawer ───────────────────────────────────────────────────────────
function OSDetail({ os, condId, condNome, osList, onClose, onUpdate }: { os: OS; condId:string; condNome:string; osList:OS[]; onClose:()=>void; onUpdate:(os:OS)=>void }) {
  const [comments, setComments] = useState<Comentario[]>([]);
  const [newMsg, setNewMsg]     = useState("");
  const [diTexto, setDiTexto]   = useState((os.di_sugestao as {texto?:string}|undefined)?.texto || "");
  const [diLoading, setDiLoading] = useState(false);
  const [tab, setTab]           = useState<"info"|"checklist"|"comentarios"|"di">("info");
  const [checklist, setChecklist] = useState<{item:string;done:boolean}[]>(os.checklist||[]);

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

  const tabBtn = (t:typeof tab,lbl:string) => (
    <button key={t} onClick={()=>setTab(t)} style={{ padding:"6px 12px",border:"none",background:tab===t?"rgba(99,102,241,.3)":"transparent",color:tab===t?"#A5B4FC":"#64748B",fontSize:11,fontWeight:tab===t?700:400,cursor:"pointer",borderRadius:6,fontFamily:"inherit" }}>{lbl}</button>
  );

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
        <div style={{ padding:"8px 12px 4px",borderBottom:"1px solid rgba(255,255,255,.05)",flexShrink:0 }}>
          {tabBtn("info","ℹ️ Info")}{tabBtn("checklist","☑️ Checklist")}{tabBtn("comentarios",`💬 (${comments.length})`)}{tabBtn("di","🟣 Di")}
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
                    <input type="checkbox" checked={item.done} onChange={e=>{const cl=[...checklist];cl[i]={...cl[i],done:e.target.checked};saveChecklist(cl);}} style={{ accentColor:"#10B981",width:15,height:15 }} />
                    <span style={{ fontSize:12,color:item.done?"#10B981":"#CBD5E1",textDecoration:item.done?"line-through":"none" }}>{item.item}</span>
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
      {/* KPIs + Nova OS */}
      <div style={{ display:"flex",gap:10,marginBottom:16,alignItems:"flex-start" }}>
        <KpiStrip os={osList} filter={filter} onFilter={setFilter} />
        <button onClick={()=>setShowForm(true)} style={{ flexShrink:0,padding:"0 20px",height:52,background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",borderRadius:12,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",letterSpacing:".03em",boxShadow:"0 4px 14px rgba(99,102,241,.4)",whiteSpace:"nowrap" }}>
          + Nova OS
        </button>
      </div>

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
