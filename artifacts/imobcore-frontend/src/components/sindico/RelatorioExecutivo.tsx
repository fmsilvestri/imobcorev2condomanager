import { useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface OSItem { numero: number; titulo: string; prioridade: string; status: string; responsavel: string; custo_estimado: number; local: string; }
interface IoTItem { nome: string; nivel: number | null; capacidade: number; volume: number | null; }
interface LancItem { descricao: string; valor: number; categoria: string; data: string; }
interface RelatorioData {
  ok: boolean; periodo: string; condNome: string; sindNome: string; score: number;
  kpis: { osAberta: number; osAndamento: number; osConcluida: number; osUrgentes: number; totalReceita: number; totalDespesa: number; saldo: number; totalMoradores: number; moradoresAtivos: number; };
  osList: OSItem[]; iot: IoTItem[];
  financeiro: { receitas: LancItem[]; despesas: LancItem[]; };
  diAnalysis: string;
}
interface Props { condId: string; condNome: string; sindNome?: string; view: "mobile" | "desktop"; onClose?: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRI_COLOR: Record<string, string> = { urgente:"#EF4444", alta:"#F97316", media:"#3B82F6", baixa:"#10B981" };
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style:"currency", currency:"BRL", minimumFractionDigits:0, maximumFractionDigits:0 });

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 34; const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#EAB308" : "#EF4444";
  return (
    <div style={{ position:"relative", width:84, height:84, flexShrink:0 }}>
      <svg width={84} height={84} viewBox="0 0 84 84">
        <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={7} />
        <circle cx={42} cy={42} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 42 42)" style={{ transition:"stroke-dasharray .8s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:20, fontWeight:900, color, lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:8, color:"#64748B", fontWeight:600 }}>SCORE</div>
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ icon, title, badge, badgeColor, children, visible }: {
  icon: string; title: string; badge: string; badgeColor: string; children: React.ReactNode; visible: boolean;
}) {
  return (
    <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, overflow:"hidden", opacity:visible?1:0, transform:visible?"none":"translateY(12px)", transition:"all .4s ease", marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 16px", borderBottom:"1px solid rgba(255,255,255,.05)", background:"rgba(255,255,255,.02)" }}>
        <span style={{ fontSize:15 }}>{icon}</span>
        <span style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", flex:1 }}>{title}</span>
        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:`${badgeColor}18`, color:badgeColor, border:`1px solid ${badgeColor}33`, fontWeight:700 }}>{badge}</span>
      </div>
      <div style={{ padding:"14px 16px" }}>{children}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RelatorioExecutivo({ condId, condNome, sindNome = "Síndico", view, onClose }: Props) {
  const [periodo, setPeriodo]   = useState("mar");
  const [loading, setLoading]   = useState(false);
  const [data, setData]         = useState<RelatorioData | null>(null);
  const [diTexto, setDiTexto]   = useState("");
  const [phase, setPhase]       = useState<number>(0); // 0=idle 1=kpi 2=di 3=fin 4=os 5=iot 6=action
  const [copied, setCopied]     = useState(false);
  const isMob = view === "mobile";

  const periodos: [string, string][] = [["jan","Jan"],["fev","Fev"],["mar","Mar"],["abr","Abr"],["tri","Trim."],["ano","Ano"]];

  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true); setData(null); setDiTexto(""); setPhase(1);

    try {
      const r = await fetch("/api/sindico/relatorio-executivo", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ condominio_id: condId, periodo, condominio_nome: condNome, sindico_nome: sindNome })
      });
      const json: RelatorioData = await r.json();

      // Animate sections in sequence
      setData(json); setPhase(1);
      await delay(300);  setPhase(2);

      // Stream Di analysis
      const txt = json.diAnalysis || "";
      let i = 0;
      await new Promise<void>(res => {
        const iv = setInterval(() => {
          i += 5; setDiTexto(txt.slice(0, i));
          if (i >= txt.length) { clearInterval(iv); res(); }
        }, 15);
      });

      setPhase(3); await delay(300);
      setPhase(4); await delay(300);
      setPhase(5); await delay(300);
      setPhase(6);
    } catch {
      setPhase(0);
    } finally { setLoading(false); }
  }, [condId, condNome, sindNome, periodo, loading]);

  function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  function copyReport() {
    if (!data) return;
    const text = [
      `📊 RELATÓRIO EXECUTIVO — ${data.condNome}`,
      `Período: ${data.periodo} | Score Di: ${data.score}/100`,
      "",
      "─── KPIs ───",
      `OS Abertas: ${data.kpis.osAberta} | Urgentes: ${data.kpis.osUrgentes}`,
      `Receita: ${fmtBRL(data.kpis.totalReceita)} | Despesa: ${fmtBRL(data.kpis.totalDespesa)} | Saldo: ${fmtBRL(data.kpis.saldo)}`,
      `Moradores: ${data.kpis.moradoresAtivos} ativos`,
      "",
      "─── ANÁLISE DA DI ───",
      data.diAnalysis,
      "",
      `🤖 Relatório gerado por Di — Síndica Virtual ImobCore v2`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  // ── Score color ───────────────────────────────────────────────────────────
  const scoreColor = data ? (data.score >= 80 ? "#10B981" : data.score >= 60 ? "#EAB308" : "#EF4444") : "#818CF8";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#080B18", fontFamily:"'Nunito',sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,.07)", flexShrink:0 }}>
        {onClose && (
          <button onClick={onClose} style={{ background:"rgba(255,255,255,.08)", border:"none", borderRadius:8, padding:"5px 10px", color:"#94A3B8", cursor:"pointer", fontSize:12, fontWeight:700 }}>← Voltar</button>
        )}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#E2E8F0" }}>📊 Relatório Executivo</div>
          <div style={{ fontSize:10, color:"#64748B" }}>Di — Síndica Virtual IA · ImobCore v2</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.2)", borderRadius:20, padding:"3px 8px" }}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:"#10B981", animation:"pulse 1.5s infinite" }} />
          <span style={{ fontSize:9, color:"#34D399", fontWeight:700 }}>Claude IA</span>
        </div>
      </div>

      {/* ── Period + Generate ── */}
      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,.06)", flexShrink:0 }}>
        <div style={{ display:"flex", gap:4, marginBottom:10, flexWrap:"wrap" }}>
          {periodos.map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)}
              style={{ flex:"1 1 auto", padding:"6px 4px", borderRadius:8, border:`1.5px solid ${periodo===v?"rgba(139,92,246,.5)":"rgba(255,255,255,.08)"}`, background:periodo===v?"rgba(139,92,246,.15)":"rgba(255,255,255,.03)", color:periodo===v?"#C4B5FD":"#64748B", fontSize:11, fontWeight:periodo===v?700:400, cursor:"pointer", fontFamily:"inherit" }}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={generate} disabled={loading}
          style={{ width:"100%", padding:"12px", borderRadius:12, border:"none", background: loading ? "rgba(139,92,246,.3)" : "linear-gradient(135deg,#7C3AED,#4C1D95)", color:"#fff", fontSize:13, fontWeight:800, cursor:loading?"not-allowed":"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 4px 14px rgba(124,58,237,.35)", transition:"all .2s" }}>
          {loading ? (<><span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⏳</span> Di gerando relatório...</>) : "🧠 Gerar Relatório com Di"}
        </button>
      </div>

      {/* ── Report content ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>

        {/* Idle */}
        {!data && !loading && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:300, gap:12, textAlign:"center", padding:24 }}>
            <div style={{ fontSize:48, opacity:.3 }}>🧠</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#F1F5F9", opacity:.5 }}>Di está pronta para gerar o relatório</div>
            <div style={{ fontSize:12, color:"#475569" }}>Selecione o período e clique em<br /><strong style={{ color:"#A78BFA" }}>Gerar Relatório com Di</strong></div>
          </div>
        )}

        {/* Loading state */}
        {loading && phase <= 1 && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:200, gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", border:"3px solid rgba(139,92,246,.2)", borderTop:"3px solid #7C3AED", animation:"spin 1s linear infinite" }} />
            <div style={{ color:"#A78BFA", fontSize:13, fontWeight:700 }}>Di analisando todos os dados...</div>
          </div>
        )}

        {data && (
          <>
            {/* ── 1. HEADER KPIs ── */}
            <div style={{ background:"linear-gradient(135deg,rgba(124,58,237,.15),rgba(6,182,212,.08))", border:"1.5px solid rgba(139,92,246,.25)", borderRadius:16, overflow:"hidden", marginBottom:12, opacity:phase>=1?1:0, transform:phase>=1?"none":"translateY(12px)", transition:"all .4s ease" }}>
              {/* Banner */}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"1px solid rgba(255,255,255,.07)" }}>
                <img src="/di.png" alt="Di" style={{ width:44, height:44, borderRadius:"50%", objectFit:"cover", objectPosition:"top", border:"2px solid rgba(139,92,246,.4)", flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"#F3E8FF" }}>{data.condNome}</div>
                  <div style={{ fontSize:11, color:"#94A3B8" }}>Síndico: {data.sindNome} · {data.periodo}</div>
                  <div style={{ display:"flex", gap:5, marginTop:4 }}>
                    <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, background:"rgba(139,92,246,.15)", color:"#C4B5FD", border:"1px solid rgba(139,92,246,.3)" }}>Relatório Executivo</span>
                    <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, background:"rgba(16,185,129,.12)", color:"#34D399", border:"1px solid rgba(16,185,129,.2)" }}>claude-opus-4-5</span>
                  </div>
                </div>
                <ScoreRing score={data.score} />
              </div>
              {/* KPI strip */}
              <div style={{ display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", borderTop:"1px solid rgba(255,255,255,.05)" }}>
                {[
                  { label:"OS Abertas",   val: String(data.kpis.osAberta),   color:"#F59E0B" },
                  { label:"OS Urgentes",  val: String(data.kpis.osUrgentes),  color:data.kpis.osUrgentes>0?"#EF4444":"#10B981" },
                  { label:"Receita",      val: fmtBRL(data.kpis.totalReceita), color:"#10B981" },
                  { label:"Saldo",        val: fmtBRL(data.kpis.saldo),       color:data.kpis.saldo>=0?"#10B981":"#EF4444" },
                ].map((k, i) => (
                  <div key={i} style={{ padding:"10px 14px", borderRight:"1px solid rgba(255,255,255,.05)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                    <div style={{ fontSize:10, color:"#64748B", marginTop:3 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. DI ANALYSIS ── */}
            <div style={{ background:"rgba(9,12,24,.8)", border:"1px solid rgba(139,92,246,.2)", borderRadius:14, overflow:"hidden", marginBottom:12, opacity:phase>=2?1:0, transform:phase>=2?"none":"translateY(12px)", transition:"all .4s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,.05)", background:"rgba(139,92,246,.06)" }}>
                <img src="/di.png" alt="Di" style={{ width:30, height:30, borderRadius:"50%", objectFit:"cover", objectPosition:"top", border:"1.5px solid rgba(139,92,246,.4)", flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#A78BFA" }}>Análise Executiva — Di Síndica Virtual</div>
                  <div style={{ fontSize:10, color:"#475569" }}>claude-opus-4-5 · ImobCore v2</div>
                </div>
                {loading && <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:6, height:6, borderRadius:"50%", background:"#A78BFA", animation:"pulse .7s infinite" }} /><span style={{ fontSize:11, color:"#A78BFA" }}>Gerando...</span></div>}
              </div>
              <div style={{ padding:"14px 16px", fontSize:13, lineHeight:1.8, color:"#E2E8F0", minHeight:80, whiteSpace:"pre-wrap" }}>
                {diTexto || (loading ? <span style={{ color:"#4B3B7D" }}>Di está redigindo a análise...</span> : "")}
                {loading && diTexto.length < (data.diAnalysis||"").length && <span style={{ display:"inline-block", width:2, height:13, background:"#818CF8", verticalAlign:"text-bottom", marginLeft:2, animation:"pulse .6s infinite" }} />}
              </div>
            </div>

            {/* ── 3. FINANCEIRO ── */}
            <Section icon="💰" title="Financeiro" badge={`Saldo ${fmtBRL(data.kpis.saldo)}`} badgeColor={data.kpis.saldo>=0?"#10B981":"#EF4444"} visible={phase>=3}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                {[
                  { label:"Receitas",  val: fmtBRL(data.kpis.totalReceita),  color:"#10B981" },
                  { label:"Despesas",  val: fmtBRL(data.kpis.totalDespesa),  color:"#EF4444" },
                  { label:"Saldo",     val: fmtBRL(data.kpis.saldo),         color:data.kpis.saldo>=0?"#10B981":"#EF4444" },
                ].map((k,i) => (
                  <div key={i} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ fontSize:14, fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                    <div style={{ fontSize:10, color:"#64748B", marginTop:3 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {/* Top receitas */}
              {data.financeiro.receitas.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10, color:"#64748B", fontWeight:700, textTransform:"uppercase", letterSpacing:".4px", marginBottom:6 }}>Últimas Receitas</div>
                  {data.financeiro.receitas.slice(0,3).map((l,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                      <span style={{ fontSize:12, color:"#CBD5E1" }}>{l.descricao || l.categoria}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:"#10B981" }}>{fmtBRL(l.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Top despesas */}
              {data.financeiro.despesas.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:"#64748B", fontWeight:700, textTransform:"uppercase", letterSpacing:".4px", marginBottom:6 }}>Últimas Despesas</div>
                  {data.financeiro.despesas.slice(0,3).map((l,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                      <span style={{ fontSize:12, color:"#CBD5E1" }}>{l.descricao || l.categoria}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:"#F87171" }}>{fmtBRL(l.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── 4. ORDENS DE SERVIÇO ── */}
            <Section icon="🔧" title="Ordens de Serviço" badge={`${data.kpis.osAberta} abertas · ${data.kpis.osUrgentes} urgentes`} badgeColor={data.kpis.osUrgentes>0?"#EF4444":"#10B981"} visible={phase>=4}>
              {data.osList.length === 0 && <div style={{ fontSize:12, color:"#334155", textAlign:"center", padding:16 }}>Nenhuma OS aberta — excelente! 🎉</div>}
              {data.osList.map((os, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:PRI_COLOR[os.prioridade]||"#64748B", flexShrink:0, marginTop:4 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#F1F5F9", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>OS-{String(os.numero).padStart(3,"0")} — {os.titulo}</div>
                    <div style={{ fontSize:11, color:"#64748B" }}>{os.responsavel} · {os.local}</div>
                  </div>
                  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, background:`${PRI_COLOR[os.prioridade]||"#64748B"}18`, color:PRI_COLOR[os.prioridade]||"#64748B", border:`1px solid ${PRI_COLOR[os.prioridade]||"#64748B"}33`, fontWeight:700, flexShrink:0 }}>
                    {os.prioridade.charAt(0).toUpperCase()+os.prioridade.slice(1)}
                  </span>
                </div>
              ))}
              {data.kpis.osUrgentes > 0 && (
                <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", borderRadius:9, fontSize:12, color:"#F87171" }}>
                  ⚠️ {data.kpis.osUrgentes} OS urgente{data.kpis.osUrgentes>1?"s":""} requer{data.kpis.osUrgentes>1?"em":""} ação imediata. Custo preventivo vs emergencial pode ser 3-5×.
                </div>
              )}
            </Section>

            {/* ── 5. IoT ── */}
            {data.iot.length > 0 && (
              <Section icon="📡" title="IoT & Reservatórios" badge="Dados em tempo real" badgeColor="#06B6D4" visible={phase>=5}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {data.iot.map((r, i) => {
                    const nv = r.nivel ?? 0;
                    const col = nv < 30 ? "#EF4444" : nv < 50 ? "#EAB308" : "#06B6D4";
                    return (
                      <div key={i} style={{ background:"rgba(255,255,255,.04)", border:`1px solid ${col}22`, borderRadius:10, padding:"10px 12px", position:"relative" }}>
                        <div style={{ position:"absolute", top:8, right:8, width:5, height:5, borderRadius:"50%", background:"#10B981", animation:"pulse 1.5s infinite" }} />
                        <div style={{ fontSize:18, fontWeight:800, color:col, lineHeight:1 }}>{r.nivel !== null ? `${r.nivel}%` : "—"}</div>
                        <div style={{ fontSize:11, color:"#94A3B8", marginTop:3 }}>{r.nome}</div>
                        <div style={{ fontSize:10, color:col, marginTop:2 }}>{r.nivel !== null ? (nv<30?"Crítico":nv<50?"Atenção":"Normal") : "Sem leitura"}</div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── 6. FOOTER ── */}
            {phase >= 6 && (
              <div style={{ background:"rgba(9,12,24,.8)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", opacity:phase>=6?1:0, transition:"opacity .4s ease" }}>
                <div style={{ fontSize:11, color:"#475569", flex:1 }}>🤖 Relatório gerado por Di — {new Date().toLocaleString("pt-BR")}</div>
                <button onClick={copyReport}
                  style={{ fontSize:11, padding:"6px 14px", borderRadius:8, border:`1px solid ${copied?"rgba(16,185,129,.4)":"rgba(139,92,246,.3)"}`, background:copied?"rgba(16,185,129,.15)":"rgba(139,92,246,.12)", color:copied?"#34D399":"#C4B5FD", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>
                  {copied ? "✓ Copiado!" : "📋 Copiar"}
                </button>
                <button onClick={generate}
                  style={{ fontSize:11, padding:"6px 14px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#7C3AED,#4C1D95)", color:"#fff", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>
                  🔄 Atualizar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.2; } }
      `}</style>
    </div>
  );
}
