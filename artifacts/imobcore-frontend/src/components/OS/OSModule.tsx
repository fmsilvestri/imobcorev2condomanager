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
const PRI_GRAD:  Record<string,string> = { urgente:"linear-gradient(135deg,#991B1B,#EF4444,#FCA5A5)", alta:"linear-gradient(135deg,#C2410C,#F97316,#FED7AA)", media:"linear-gradient(135deg,#1D4ED8,#3B82F6,#93C5FD)", baixa:"linear-gradient(135deg,#065F46,#10B981,#6EE7B7)" };
const PRI_GLOW:  Record<string,string> = { urgente:"rgba(239,68,68,.45)", alta:"rgba(249,115,22,.40)", media:"rgba(59,130,246,.40)", baixa:"rgba(16,185,129,.40)" };
const PRI_LABEL: Record<string,string> = { urgente:"🔴 URGENTE", alta:"🟡 Alta", media:"🔵 Média", baixa:"🟢 Baixa" };
const STS_COLOR: Record<string,string> = { aberta:"#F59E0B", em_andamento:"#06B6D4", fechada:"#10B981", cancelada:"#EF4444" };
const STS_GRAD:  Record<string,string> = { aberta:"linear-gradient(135deg,#92400E,#F59E0B)", em_andamento:"linear-gradient(135deg,#155E75,#06B6D4)", fechada:"linear-gradient(135deg,#065F46,#10B981)", cancelada:"linear-gradient(135deg,#991B1B,#EF4444)" };
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
  const pc   = PRI_COLOR[os.prioridade] || "#64748B";
  const pg   = PRI_GRAD[os.prioridade]  || "linear-gradient(135deg,#475569,#94A3B8)";
  const pglow= PRI_GLOW[os.prioridade]  || "rgba(100,116,139,.3)";
  const sc   = STS_COLOR[os.status]     || "#64748B";
  const sg   = STS_GRAD[os.status]      || "linear-gradient(135deg,#475569,#94A3B8)";
  const cc   = CAT_COLOR[os.categoria]  || "#64748B";
  const ci   = CAT_ICON[os.categoria]   || "📋";
  const prog = os.status==="fechada"?100:os.status==="em_andamento"?50:0;
  const isUrgente = os.prioridade === "urgente" && os.status !== "fechada";

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius:16, overflow:"hidden", cursor:"pointer", marginBottom:12,
        border:`1px solid ${pc}30`,
        background:`rgba(255,255,255,.03)`,
        boxShadow: isUrgente
          ? `0 4px 24px ${pglow}, 0 0 0 1px ${pc}40`
          : `0 4px 16px ${pglow}`,
        transition:"transform .12s, box-shadow .12s",
      }}
    >
      {/* ── Barra de prioridade colorida no topo ── */}
      <div style={{ height:5, background:pg }} />

      <div style={{ padding:compact?"12px 14px":"14px 16px" }}>
        {/* ── Linha 1: Número + Título + Avatar ── */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
          {/* Ícone categoria colorido */}
          <div style={{ width:36, height:36, borderRadius:10, background:`${cc}22`, border:`1.5px solid ${cc}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
            {ci}
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            {/* Número da OS */}
            <div style={{ fontSize:10, fontFamily:"monospace", color:"#A5B4FC", fontWeight:800, letterSpacing:".06em", marginBottom:2 }}>
              {fmtNum(os.numero)} · {os.categoria}
            </div>
            {/* Título */}
            <div style={{ fontSize:compact?13:14, fontWeight:800, color:"#F1F5F9", lineHeight:1.3 }}>
              {os.titulo}
            </div>
          </div>

          {/* Avatar responsável */}
          {os.responsavel ? (
            <div title={os.responsavel} style={{ width:36,height:36,borderRadius:"50%",background:avatarColor(os.responsavel),display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",flexShrink:0,boxShadow:`0 2px 8px ${avatarColor(os.responsavel)}66` }}>
              {initials(os.responsavel)}
            </div>
          ) : isUrgente ? (
            <div style={{ width:12,height:12,borderRadius:"50%",background:pc,boxShadow:`0 0 10px ${pc}`,animation:"pulse 1s infinite",marginTop:6,flexShrink:0 }} />
          ) : null}
        </div>

        {/* ── Linha 2: Badges prioridade + status ── */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
          {/* Badge prioridade — gradiente completo */}
          <div style={{ background:pg, borderRadius:20, padding:"4px 12px", boxShadow:`0 2px 8px ${pglow}` }}>
            <span style={{ fontSize:10, fontWeight:900, color:"#fff", letterSpacing:".04em" }}>{PRI_LABEL[os.prioridade]||os.prioridade}</span>
          </div>
          {/* Badge status */}
          <div style={{ background:sg, borderRadius:20, padding:"4px 12px" }}>
            <span style={{ fontSize:10, fontWeight:800, color:"#fff", letterSpacing:".04em" }}>{STS_LABEL[os.status]||os.status}</span>
          </div>
          {/* Aprovação pendente */}
          {os.aprovacao_necessaria && (
            <div style={{ background:"linear-gradient(135deg,#78350F,#D97706)", borderRadius:20, padding:"4px 10px" }}>
              <span style={{ fontSize:10, fontWeight:800, color:"#fff" }}>⚠️ Aprovação</span>
            </div>
          )}
        </div>

        {/* ── SLA Bar ── */}
        {os.status !== "fechada" && os.status !== "cancelada" && (
          <SLABar created_at={os.created_at} sla_horas={os.sla_horas||48} />
        )}

        {/* ── Progresso (status concluída) ── */}
        {!compact && os.status !== "cancelada" && (
          <div style={{ marginTop:8 }}>
            <div style={{ height:4, background:"rgba(255,255,255,.08)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ width:`${prog}%`,height:"100%",background:sg,borderRadius:3,transition:"width .5s",boxShadow:`0 0 6px ${sc}88` }} />
            </div>
          </div>
        )}

        {/* ── Meta: local / custo / data ── */}
        {!compact && (os.local || (os.custo_estimado||0) > 0 || os.data_prevista) && (
          <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
            {os.local && (
              <div style={{ display:"flex",alignItems:"center",gap:4,background:"rgba(125,211,252,.08)",border:"1px solid rgba(125,211,252,.18)",borderRadius:8,padding:"3px 10px" }}>
                <span style={{ fontSize:12 }}>📍</span>
                <span style={{ fontSize:11,fontWeight:700,color:"#BAE6FD" }}>{os.local}</span>
              </div>
            )}
            {(os.custo_estimado||0) > 0 && (
              <div style={{ display:"flex",alignItems:"center",gap:4,background:"rgba(134,239,172,.08)",border:"1px solid rgba(134,239,172,.18)",borderRadius:8,padding:"3px 10px" }}>
                <span style={{ fontSize:12 }}>💰</span>
                <span style={{ fontSize:11,fontWeight:700,color:"#86EFAC" }}>R$ {os.custo_estimado!.toLocaleString("pt-BR")}</span>
              </div>
            )}
            {os.data_prevista && (
              <div style={{ display:"flex",alignItems:"center",gap:4,background:"rgba(252,165,165,.08)",border:"1px solid rgba(252,165,165,.18)",borderRadius:8,padding:"3px 10px" }}>
                <span style={{ fontSize:12 }}>📅</span>
                <span style={{ fontSize:11,fontWeight:700,color:"#FCA5A5" }}>{fmtDate(os.data_prevista)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Botões de ação ── */}
        {!compact && (
          <div style={{ marginTop:10,display:"flex",gap:8 }}>
            {os.status==="aberta" && (
              <button onClick={e=>{e.stopPropagation();onStatusChange(os.id,"em_andamento");}}
                style={{ flex:1,background:"linear-gradient(135deg,#155E75,#06B6D4,#67E8F9)",border:"none",borderRadius:10,padding:"9px 0",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 12px rgba(6,182,212,.45)",letterSpacing:".02em" }}>
                <span>▶</span> Iniciar OS
              </button>
            )}
            {os.status==="em_andamento" && (
              <button onClick={e=>{e.stopPropagation();onStatusChange(os.id,"fechada");}}
                style={{ flex:1,background:"linear-gradient(135deg,#065F46,#10B981,#34D399)",border:"none",borderRadius:10,padding:"9px 0",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 12px rgba(16,185,129,.45)",letterSpacing:".02em" }}>
                <span>✓</span> Concluir OS
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ os, filter, onFilter }: { os: OS[]; filter: string; onFilter:(f:string)=>void }) {
  const urgentesCount = os.filter(o=>o.prioridade==="urgente"&&o.status!=="fechada").length;
  const concluidasCount = os.filter(o=>o.status==="fechada").length;
  const stats = [
    { k:"todos",     v:os.length,          icon:"📊", label:"Total",      topColor:"#818CF8", botColor:"#4338CA", edge:"#3730A3", glow:"rgba(99,102,241,.6)",  filt:"todos"       },
    { k:"aberta",    v:os.filter(o=>o.status==="aberta").length, icon:"📋", label:"Abertas", topColor:"#FCD34D", botColor:"#D97706", edge:"#B45309", glow:"rgba(245,158,11,.6)", filt:"aberta" },
    { k:"andamento", v:os.filter(o=>o.status==="em_andamento").length, icon:"🔄", label:"Andamento", topColor:"#67E8F9", botColor:"#0891B2", edge:"#0E7490", glow:"rgba(6,182,212,.6)", filt:"em_andamento"},
    { k:"urgente",   v:urgentesCount,      icon:"🚨", label:"Urgentes",   topColor:"#FCA5A5", botColor:"#DC2626", edge:"#B91C1C", glow:"rgba(239,68,68,.6)",   filt:"urgente"     },
    { k:"concluidas",v:concluidasCount,    icon:"✅", label:"Concluídas", topColor:"#6EE7B7", botColor:"#059669", edge:"#047857", glow:"rgba(16,185,129,.6)",  filt:"fechada"     },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:18 }}>
      {stats.map(s => {
        const active = filter === s.filt;
        const isUrgent = s.k === "urgente" && s.v > 0;
        const highlighted = active || isUrgent;
        return (
          <div key={s.k} onClick={()=>onFilter(active?"todos":s.filt)}
            style={{
              borderRadius:16,
              background: `linear-gradient(160deg, ${s.topColor} 0%, ${s.botColor} 100%)`,
              border: `1px solid ${highlighted ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.12)"}`,
              padding:"14px 6px 12px", textAlign:"center",
              cursor:"pointer", position:"relative", overflow:"hidden",
              // 3D effect: light top border + deep bottom shadow
              boxShadow: highlighted
                ? `0 0 0 2px rgba(255,255,255,.25), 0 4px 0 ${s.edge}, 0 6px 20px ${s.glow}, inset 0 1px 0 rgba(255,255,255,.45)`
                : `0 3px 0 ${s.edge}99, 0 5px 16px ${s.glow}88, inset 0 1px 0 rgba(255,255,255,.35)`,
              transform: active ? "translateY(3px)" : "translateY(0)",
              transition:"all .15s ease",
              opacity: s.v === 0 && !active ? 0.7 : 1,
            }}>
            {/* Shine overlay */}
            <div style={{ position:"absolute", top:0, left:0, right:0, height:"50%", background:"linear-gradient(180deg,rgba(255,255,255,.28) 0%,rgba(255,255,255,0) 100%)", borderRadius:"16px 16px 0 0", pointerEvents:"none" }} />
            {/* Big icon background */}
            <div style={{ position:"absolute", bottom:-4, right:2, fontSize:34, opacity:0.18, lineHeight:1, pointerEvents:"none" }}>{s.icon}</div>
            {/* Active indicator dot */}
            {active && <div style={{ position:"absolute", top:6, left:"50%", transform:"translateX(-50%)", width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,.9)", boxShadow:"0 0 6px rgba(255,255,255,.8)" }} />}
            <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1, letterSpacing:"-1.5px", textShadow:"0 2px 4px rgba(0,0,0,.35)", position:"relative" }}>{s.v}</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,.9)", marginTop:5, fontWeight:800, letterSpacing:".06em", textTransform:"uppercase", position:"relative", textShadow:"0 1px 2px rgba(0,0,0,.3)" }}>{s.label}</div>
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

// ── Helpers de foto ──────────────────────────────────────────────────────────
async function uploadOsFoto(osId: string, file: File, tipo: "antes" | "depois"): Promise<string> {
  const fd = new FormData();
  fd.append("foto", file);
  fd.append("tipo", tipo);
  const r = await fetch(`/api/os/${osId}/foto`, { method: "POST", body: fd });
  const j = await r.json() as { ok?: boolean; url?: string; error?: string };
  if (!j.ok || !j.url) throw new Error(j.error || "Falha no upload");
  return j.url;
}

// ── FotoUpload — Seletor + preview (inline, sem upload automático) ─────────────
// Para uso no formulário de criação (upload acontece depois, quando OS já tem ID)
function FotoPicker({
  label, file, preview, onChange, onClear, disabled
}: {
  label: string; file: File | null; preview: string | null;
  onChange: (f: File, url: string) => void; onClear: () => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr("Foto muito grande (máx 8 MB)"); return; }
    setErr(null);
    onChange(f, URL.createObjectURL(f));
    if (ref.current) ref.current.value = "";
  }

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleChange} />
      {preview ? (
        <div style={{ position:"relative", borderRadius:12, overflow:"hidden", border:"2px solid rgba(99,102,241,.4)" }}>
          <img src={preview} alt={label} style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block" }} />
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.3)", display:"flex", alignItems:"flex-end", justifyContent:"space-between", padding:"8px 10px" }}>
            <span style={{ fontSize:11, color:"#fff", fontWeight:700, textShadow:"0 1px 3px rgba(0,0,0,.9)" }}>
              📎 {file?.name || label} {file ? `(${(file.size/1024).toFixed(0)} KB)` : ""}
            </span>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => ref.current?.click()} disabled={disabled}
                style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:6, color:"#fff", padding:"3px 8px", fontSize:11, cursor:"pointer", fontWeight:700 }}>
                🔄
              </button>
              <button onClick={onClear} disabled={disabled}
                style={{ background:"rgba(239,68,68,.8)", border:"none", borderRadius:6, color:"#fff", padding:"3px 8px", fontSize:11, cursor:"pointer", fontWeight:700 }}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
          style={{ width:"100%", padding:"18px 12px", borderRadius:12, border:"2px dashed rgba(99,102,241,.35)", background:"rgba(99,102,241,.06)", color:"#818CF8", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          📷 {label}
        </button>
      )}
      {err && <div style={{ fontSize:11, color:"#F87171", marginTop:4 }}>{err}</div>}
    </div>
  );
}

// ── FotoUploadCard — Mostra foto existente + permite upload (para OSDetail) ────
function FotoCard({
  osId, tipo, currentUrl, label, onUploaded
}: {
  osId: string; tipo: "antes" | "depois"; currentUrl?: string; label: string; onUploaded: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl || "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr("Máx 8 MB"); return; }
    setErr(null); setUploading(true);
    const local = URL.createObjectURL(f);
    setPreview(local);
    try {
      const url = await uploadOsFoto(osId, f, tipo);
      setPreview(url); onUploaded(url);
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : "Erro"); }
    finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  }

  return (
    <div>
      <div style={{ fontSize:11, color:"#94A3B8", fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:".06em" }}>{label}</div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleChange} />
      {preview ? (
        <div style={{ position:"relative", borderRadius:10, overflow:"hidden", border:"1px solid rgba(255,255,255,.1)" }}>
          <img src={preview} alt={label} style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block" }} />
          {uploading && (
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#A78BFA", fontWeight:700 }}>
              ⏳ Enviando...
            </div>
          )}
          <button onClick={() => ref.current?.click()} disabled={uploading}
            style={{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,.7)", border:"1px solid rgba(255,255,255,.2)", borderRadius:6, color:"#E2E8F0", padding:"4px 10px", fontSize:11, cursor:"pointer", fontWeight:700 }}>
            🔄 Trocar
          </button>
        </div>
      ) : (
        <button type="button" disabled={uploading} onClick={() => ref.current?.click()}
          style={{ width:"100%", padding:"16px 12px", borderRadius:10, border:"2px dashed rgba(99,102,241,.3)", background:"rgba(99,102,241,.05)", color:"#6366F1", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          {uploading ? "⏳ Enviando..." : `📷 Adicionar ${label}`}
        </button>
      )}
      {err && <div style={{ fontSize:11, color:"#F87171", marginTop:4 }}>{err}</div>}
    </div>
  );
}

// ── NovaOS Form (4 steps) ─────────────────────────────────────────────────────
function NovaOSForm({ condId, condNome, osList, onSave, onCancel, view }:
  { condId:string; condNome:string; osList:OS[]; onSave:(os:OS)=>void; onCancel:()=>void; view:"mobile"|"desktop" }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Partial<OS>>(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [diTexto, setDiTexto] = useState("");
  const [diLoading, setDiLoading] = useState(false);
  const [diId, setDiId] = useState<string|null>(null);
  // Foto antes state
  const [fotoAntesFile, setFotoAntesFile] = useState<File | null>(null);
  const [fotoAntesPreview, setFotoAntesPreview] = useState<string | null>(null);
  const [fotoUploading, setFotoUploading] = useState(false);
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
    if (created.id && fotoAntesFile) {
      setFotoUploading(true);
      try { await uploadOsFoto(created.id, fotoAntesFile, "antes"); } catch { /* non-fatal */ }
      setFotoUploading(false);
    }
    setSaving(false);
    if (created.id) { setDiId(created.id); setStep(3); getDiAnalysis(created.id); }
  }

  const steps = ["📋 Identificação","🔍 Diagnóstico","👤 Atribuição","✅ Confirmação"];
  const panelStyle = isMob ? { padding:"0 14px 80px" } : { padding:0 };
  const btnNext = { background:"linear-gradient(135deg,#6366F1,#818CF8)",border:"none",borderRadius:8,color:"#fff",padding:"9px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit" };
  const btnBack = { background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#94A3B8",padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit" };

  return (
    <div style={panelStyle}>
      <style>{`.os-nova-input::placeholder{color:rgba(255,255,255,.45);font-weight:400} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
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
          {/* Foto antes (optativo) */}
          <div style={grp}>
            <label style={lbl}>📷 Foto do Problema <span style={{ fontSize:11,fontWeight:400,color:"#64748B",marginLeft:6 }}>(opcional)</span></label>
            <FotoPicker
              label="Tirar/selecionar foto do problema"
              file={fotoAntesFile}
              preview={fotoAntesPreview}
              onChange={(f, url) => { setFotoAntesFile(f); setFotoAntesPreview(url); }}
              onClear={() => { setFotoAntesFile(null); setFotoAntesPreview(null); }}
              disabled={saving || fotoUploading}
            />
            {fotoUploading && <div style={{ fontSize:11,color:"#A78BFA",marginTop:6,fontWeight:700 }}>⏳ Enviando foto para o servidor...</div>}
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
function OSDetail({ os, condId, condNome, osList, onClose, onUpdate }: { os: OS; condId:string; condNome:string; osList:OS[]; onClose:()=>void; onUpdate:(os:OS, refetch?:boolean)=>void }) {
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
    // Atualização otimista: reflete mudança imediatamente na UI (sem refetch)
    onUpdate({ ...os, status }, false);
    try {
      const r = await fetch(`/api/os/${os.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
      const updated = await r.json();
      // Sincroniza com dados reais do servidor E dispara refetch dos KPIs
      if (updated.id) onUpdate(updated, true);
      else onUpdate({ ...os, status }, true);
    } catch {
      // Em caso de erro, reverte para o status original
      onUpdate({ ...os }, false);
    }
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

  const tabBtn = (t:typeof tab, icon:string, lbl:string, big?:boolean, onClickExtra?:()=>void) => {
    const active = tab === t;
    return (
      <button key={t} onClick={()=>{ setTab(t); onClickExtra?.(); }} style={{
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
            {os.status==="em_andamento"&&<button onClick={async ()=>{ await changeStatus("fechada"); setDiTexto(""); getDi(); }} style={{ fontSize:10,padding:"4px 12px",background:"linear-gradient(135deg,rgba(16,185,129,.25),rgba(5,150,105,.2))",border:"1px solid rgba(16,185,129,.5)",borderRadius:6,color:"#34D399",cursor:"pointer",fontWeight:800,display:"flex",alignItems:"center",gap:4 }}>✓ Concluir OS</button>}
            {os.status==="fechada"&&<button onClick={()=>changeStatus("aberta")} style={{ fontSize:10,padding:"4px 10px",background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:6,color:"#FCD34D",cursor:"pointer",fontWeight:700 }}>↩ Reabrir</button>}
            <button onClick={getDi} disabled={diLoading} style={{ fontSize:10,padding:"4px 10px",background:"rgba(139,92,246,.15)",border:"1px solid rgba(139,92,246,.3)",borderRadius:6,color:"#C4B5FD",cursor:"pointer",fontWeight:700,opacity:diLoading?.6:1 }}>🟣 Di</button>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", width:"100%", borderBottom:"2px solid rgba(255,255,255,.06)", background:"#080B14", flexShrink:0 }}>
          {tabBtn("info","ℹ️","Info")}
          {tabBtn("checklist","☑️","Checklist")}
          {tabBtn("comentarios","💬",`(${comments.length})`)}
          {tabBtn("di","🟣","Di",false,()=>{ if (!diTexto && !diLoading) getDi(); })}
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

              {/* ── Fotos ── */}
              <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <FotoCard
                  osId={os.id} tipo="antes" label="Foto Antes" currentUrl={os.foto_antes}
                  onUploaded={url => onUpdate({ ...os, foto_antes: url })}
                />
                <FotoCard
                  osId={os.id} tipo="depois" label="Foto Depois" currentUrl={os.foto_depois}
                  onUploaded={url => onUpdate({ ...os, foto_depois: url })}
                />
              </div>
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
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                <img src="/di.png" alt="Di" style={{ width:36,height:36,borderRadius:"50%",objectFit:"cover",objectPosition:"top",border:"2px solid rgba(167,139,250,.4)" }} />
                <div>
                  <div style={{ fontSize:13,fontWeight:800,color:"#C4B5FD" }}>Di — Síndica Virtual</div>
                  <div style={{ fontSize:9,color:"#7C3AED" }}>Relatório de Andamento da OS</div>
                </div>
                {diTexto&&!diLoading&&(
                  <button onClick={()=>{ setDiTexto(""); getDi(); }} style={{ marginLeft:"auto",fontSize:9,padding:"3px 8px",background:"rgba(139,92,246,.2)",border:"1px solid rgba(139,92,246,.3)",borderRadius:6,color:"#A78BFA",cursor:"pointer",fontWeight:700 }}>🔄 Atualizar</button>
                )}
              </div>
              {diLoading&&(
                <div style={{ display:"flex",flexDirection:"column",gap:8,alignItems:"center",padding:"20px 0" }}>
                  <div style={{ width:32,height:32,border:"3px solid rgba(139,92,246,.2)",borderTop:"3px solid #A78BFA",borderRadius:"50%",animation:"spin 1s linear infinite" }} />
                  <div style={{ color:"#A78BFA",fontSize:12 }}>Di está analisando a OS…</div>
                  {diTexto&&<div style={{ fontSize:12,color:"#E9D5FF",lineHeight:1.7,whiteSpace:"pre-wrap",width:"100%" }}>{diTexto}</div>}
                </div>
              )}
              {!diLoading&&diTexto&&(
                <div style={{ fontSize:12,color:"#E9D5FF",lineHeight:1.8,whiteSpace:"pre-wrap" }}>{diTexto}</div>
              )}
              {!diLoading&&!diTexto&&(
                <div style={{ textAlign:"center",padding:"20px 0" }}>
                  <div style={{ fontSize:32,marginBottom:8 }}>🟣</div>
                  <div style={{ color:"#7C5CFC",fontSize:13,fontWeight:700,marginBottom:4 }}>Relatório de Andamento</div>
                  <div style={{ color:"#4B3B7D",fontSize:11,marginBottom:16,lineHeight:1.5 }}>A Di irá gerar um relatório completo sobre o andamento desta OS, incluindo análise de riscos e recomendações.</div>
                  <button onClick={getDi} style={{ padding:"10px 24px",borderRadius:20,border:"none",background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(124,58,237,.4)" }}>
                    🟣 Gerar Relatório Di
                  </button>
                </div>
              )}
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
    .filter(o => {
      if (filter==="urgente") return o.prioridade==="urgente"&&o.status!=="fechada";
      if (filter==="aberta") return o.status==="aberta";
      if (filter==="em_andamento") return o.status==="em_andamento";
      if (filter==="fechada") return o.status==="fechada";
      return true; // "todos"
    })
    .sort((a,b)=>{
      const pa = a.prioridade==="urgente"?0:a.prioridade==="alta"?1:a.prioridade==="media"?2:3;
      const pb = b.prioridade==="urgente"?0:b.prioridade==="alta"?1:b.prioridade==="media"?2:3;
      if(pa!==pb)return pa-pb;
      const ra=elapsed(a.created_at,a.sla_horas||48).restH, rb=elapsed(b.created_at,b.sla_horas||48).restH;
      return ra-rb;
    });

  async function handleStatusChange(id: string, status: string) {
    // Atualização otimista: muda status imediatamente nos cards
    setOsList(prev=>prev.map(o=>o.id===id ? { ...o, status } : o));
    try {
      const r = await fetch(`/api/os/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
      const updated = await r.json();
      if (updated.id) setOsList(prev=>prev.map(o=>o.id===id ? updated : o));
      else load();
    } catch { load(); }
  }

  function handleOSUpdate(updated: OS, refetch = false) {
    // Atualiza imediatamente no estado local (drawer + cards)
    setOsList(prev=>prev.map(o=>o.id===updated.id?updated:o));
    if(selectedOS?.id===updated.id)setSelectedOS(updated);
    // Refetch apenas quando confirmado pelo servidor (não na atualização otimista)
    if (refetch) setTimeout(()=>load(), 200);
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
            {[
              {v:osList.filter(o=>o.status==="aberta").length,         l:"Abertas",   top:"#FCD34D", bot:"#D97706", edge:"#B45309", glow:"rgba(245,158,11,.5)",  f:"aberta"},
              {v:osList.filter(o=>o.status==="em_andamento").length,   l:"Andamento", top:"#67E8F9", bot:"#0891B2", edge:"#0E7490", glow:"rgba(6,182,212,.5)",   f:"em_andamento"},
              {v:osList.filter(o=>o.prioridade==="urgente"&&o.status!=="fechada").length, l:"Urgentes", top:"#FCA5A5", bot:"#DC2626", edge:"#B91C1C", glow:"rgba(239,68,68,.5)", f:"urgente"},
              {v:osList.filter(o=>o.status==="fechada").length,        l:"Concluídas",top:"#6EE7B7", bot:"#059669", edge:"#047857", glow:"rgba(16,185,129,.5)", f:"fechada"},
            ].map(s=>(
              <div key={s.f} onClick={()=>setFilter(filter===s.f?"todos":s.f)} style={{ flex:1,background:`linear-gradient(160deg,${s.top},${s.bot})`,borderRadius:12,padding:"8px 4px 7px",textAlign:"center",cursor:"pointer",position:"relative",overflow:"hidden",
                boxShadow:filter===s.f?`0 0 0 2px rgba(255,255,255,.3),0 3px 0 ${s.edge},0 5px 12px ${s.glow},inset 0 1px 0 rgba(255,255,255,.4)`:`0 2px 0 ${s.edge}99,0 4px 10px ${s.glow}77,inset 0 1px 0 rgba(255,255,255,.35)`,
                transform:filter===s.f?"translateY(2px)":"translateY(0)",transition:"all .15s ease" }}>
                <div style={{ position:"absolute",top:0,left:0,right:0,height:"45%",background:"linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,0))",pointerEvents:"none" }}/>
                <div style={{ fontSize:20,fontWeight:900,color:"#fff",lineHeight:1,textShadow:"0 2px 4px rgba(0,0,0,.3)",position:"relative" }}>{s.v}</div>
                <div style={{ fontSize:8,color:"rgba(255,255,255,.9)",fontWeight:800,marginTop:3,textTransform:"uppercase",letterSpacing:".04em",position:"relative",textShadow:"0 1px 2px rgba(0,0,0,.25)" }}>{s.l}</div>
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
