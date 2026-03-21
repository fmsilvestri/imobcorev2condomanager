import React, { useRef, useEffect } from "react";

type Theme = "dark" | "light";

interface CondoInfo {
  id: string;
  nome: string;
  cidade?: string;
  unidades?: number;
  photo_url?: string | null;
}

export interface SindicoHomeProps {
  sindicoTheme: Theme;
  setSindicoTheme: (t: Theme) => void;
  sindicoScreen: string | null;
  setSindicoScreen: (s: string | null) => void;
  setView: (v: "login" | "selector" | "gestor" | "sindico" | "morador" | "onboarding") => void;
  condo: CondoInfo | null;
  condId: string | null;
  loginEmail: string;
  bellCount: number;
  setBellCount: React.Dispatch<React.SetStateAction<number>>;
  bellShake: boolean;
  saldo: number;
  osAbertasCount: number;
  equipCount: number;
  crmCount: number;
  fornecCount: number;
  nivelMedio: number;
  sseCount: number;
  comunicadosCount: number;
  gasNivel: number;
  encPendentes: number;
  piscinaAlerta: boolean;
  piscinaLastPh: number | null;
  onPhotoUpdate: (url: string) => void;
  renderSindicoScreen: () => React.ReactNode;
}

const ANIM_STYLES = `
@keyframes sindico-pulse {
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.4;transform:scale(1.35)}
}
@keyframes sindico-fade-up {
  from{opacity:0;transform:translateY(14px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes sindico-shimmer {
  0%,100%{background-position:0% 50%}
  50%{background-position:100% 50%}
}
.sind-pulse-dot{animation:sindico-pulse 1.5s ease-in-out infinite}
.sind-card:active{transform:scale(0.97)!important}
.sind-ia-banner{animation:sindico-shimmer 3s ease infinite;background-size:200% 200%}
`;

export default function SindicoHome({
  sindicoTheme, setSindicoTheme,
  sindicoScreen, setSindicoScreen,
  setView,
  condo, condId, loginEmail,
  bellCount, setBellCount, bellShake,
  saldo, osAbertasCount, equipCount, crmCount,
  fornecCount, nivelMedio, sseCount, comunicadosCount,
  gasNivel, encPendentes, piscinaAlerta, piscinaLastPh,
  onPhotoUpdate,
  renderSindicoScreen,
}: SindicoHomeProps) {
  const isDark = sindicoTheme === "dark";
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("imobcore_sindico_theme", sindicoTheme);
  }, [sindicoTheme]);

  const h = new Date().getHours();
  const greet = h < 12 ? "Bom dia," : h < 18 ? "Boa tarde," : "Boa noite,";
  const rawName = loginEmail.split("@")[0] || "Síndico";
  const fname = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  const condoNome = condo?.nome ?? "Residencial";
  const condoCidade = condo?.cidade ?? "Florianópolis";
  const condoUnidades = condo?.unidades ?? 0;
  const condoPhoto = condo?.photo_url ?? null;

  const v = {
    bg:         isDark ? "#0f0f1a"                    : "#f0f0f8",
    surface:    isDark ? "#1a1a2e"                    : "#ffffff",
    border:     isDark ? "rgba(255,255,255,0.08)"     : "rgba(99,60,230,0.12)",
    text:       isDark ? "#E2E8F0"                    : "#1a1040",
    muted:      isDark ? "rgba(200,190,255,0.50)"     : "rgba(99,60,230,0.50)",
    iconBg:     isDark ? "rgba(255,255,255,0.07)"     : "rgba(255,255,255,0.90)",
    iconBorder: isDark ? "rgba(255,255,255,0.10)"     : "rgba(99,60,230,0.12)",
    iconShadow: isDark ? "none"                       : "0 1px 4px rgba(0,0,0,0.07)",
    pillBg:     isDark ? "rgba(255,255,255,0.05)"     : "rgba(255,255,255,0.95)",
    pillBorder: isDark ? "rgba(255,255,255,0.07)"     : "rgba(99,60,230,0.10)",
    pillShadow: isDark ? "none"                       : "0 1px 6px rgba(99,60,230,0.06)",
    navBg:      isDark ? "rgba(15,15,26,0.97)"        : "rgba(255,255,255,0.97)",
    navBorder:  isDark ? "rgba(255,255,255,0.06)"     : "rgba(99,60,230,0.08)",
    navShadow:  isDark ? "none"                       : "0 -2px 12px rgba(99,60,230,0.06)",
    activeClr:  isDark ? "#a78bfa"                    : "#6d28d9",
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !condId) return;
    const fd = new FormData();
    fd.append("photo", file);
    try {
      const r = await fetch(`/api/condominios/${condId}/photo`, { method: "POST", body: fd });
      const j = await r.json() as { ok: boolean; photo_url?: string };
      if (j.ok && j.photo_url) onPhotoUpdate(j.photo_url);
    } catch (err) { console.error("Photo upload error:", err); }
    if (photoRef.current) photoRef.current.value = "";
  };

  const iconBtn = (label: string, emoji: string, onClick: () => void, extra?: React.CSSProperties) => (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 32, height: 32, borderRadius: "50%",
        border: `1px solid ${v.iconBorder}`,
        background: v.iconBg, boxShadow: v.iconShadow,
        cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 15, lineHeight: 1,
        ...extra,
      }}
    >{emoji}</button>
  );

  type DarkModule  = { bg: string; text: string; hasDot: boolean; icon: string; title: string; screen: string; sub: string };
  type LightModule = DarkModule & { border: string };

  const modsDark: DarkModule[] = [
    { icon:"💰", title:"Financeiro",   screen:"financeiro",    sub: saldo>=1000?`R$${(saldo/1000).toFixed(0)}k`:`R$${saldo.toFixed(0)}`,    hasDot:false,              bg:"linear-gradient(135deg,#064e3b,#065f46)", text:"#6ee7b7" },
    { icon:"⚙️", title:"Ordens Serv.", screen:"os",            sub:`${osAbertasCount} abertas`,                                              hasDot:osAbertasCount>0,   bg:"linear-gradient(135deg,#1e1b4b,#3730a3)", text:"#a5b4fc" },
    { icon:"👤", title:"Usuários",     screen:"planejamento",  sub:`${osAbertasCount} pendentes`,                                            hasDot:osAbertasCount>0,   bg:"linear-gradient(135deg,#1e1b4b,#2e2660)", text:"#a5b4fc" },
    { icon:"🔧", title:"Manutenção",   screen:"manutencao",    sub:`${equipCount} itens`,                                                    hasDot:false,              bg:"linear-gradient(135deg,#431407,#7c2d12)", text:"#fdba74" },
    { icon:"👥", title:"CRM",          screen:"crm",           sub:`${crmCount} moradores`,                                                  hasDot:false,              bg:"linear-gradient(135deg,#1e3a5f,#1e40af)", text:"#93c5fd" },
    { icon:"📢", title:"Comunicados",  screen:"comunicados",   sub:`${comunicadosCount} enviados`,                                           hasDot:false,              bg:"linear-gradient(135deg,#2d1b69,#4c1d95)", text:"#c4b5fd" },
    { icon:"✨", title:"Insights IA",  screen:"insights",      sub:"Tempo real",                                                             hasDot:false,              bg:"linear-gradient(135deg,#1c1917,#44403c)", text:"#fde68a" },
    { icon:"🏪", title:"Fornecedores", screen:"fornecedores",  sub:`${fornecCount} cadastros`,                                               hasDot:false,              bg:"linear-gradient(135deg,#0c1a12,#14532d)", text:"#86efac" },
    { icon:"💧", title:"Água",         screen:"agua",          sub:`${nivelMedio}% nível`,                                                   hasDot:false,              bg:"linear-gradient(135deg,#0c1a2e,#0f3460)", text:"#7dd3fc" },
    { icon:"🔥", title:"Gás",          screen:"gas",           sub:`${gasNivel}% nível${gasNivel<20?" ⚠️":""}`,                              hasDot:gasNivel<20,        bg:"linear-gradient(135deg,#431407,#7c2d12)", text:"#fb923c" },
    { icon:"⚡", title:"Energia",      screen:"energia",       sub:"Ver consumo",                                                            hasDot:false,              bg:"linear-gradient(135deg,#1c1a04,#3d3200)", text:"#fde047" },
    { icon:"📦", title:"Encomendas",   screen:"encomendas",    sub:`${encPendentes} aguardando`,                                             hasDot:encPendentes>0,     bg:"linear-gradient(135deg,#1e1b4b,#312e81)", text:"#818cf8" },
    { icon:"🏊", title:"Piscina",      screen:"piscina",       sub:piscinaLastPh!=null?`pH ${piscinaLastPh}`:"Sem leitura",                   hasDot:piscinaAlerta,      bg:"linear-gradient(135deg,#0c1a2e,#075985)", text: piscinaAlerta?"#fca5a5":"#38bdf8" },
  ];
  const modsLight: LightModule[] = [
    { icon:"💰", title:"Financeiro",   screen:"financeiro",    sub: saldo>=1000?`R$${(saldo/1000).toFixed(0)}k`:`R$${saldo.toFixed(0)}`,    hasDot:false,              bg:"#f0fdf4", border:"#bbf7d0", text:"#065f46" },
    { icon:"⚙️", title:"Ordens Serv.", screen:"os",            sub:`${osAbertasCount} abertas`,                                              hasDot:osAbertasCount>0,   bg:"#eef2ff", border:"#c7d2fe", text:"#3730a3" },
    { icon:"👤", title:"Usuários",     screen:"planejamento",  sub:`${osAbertasCount} pendentes`,                                            hasDot:osAbertasCount>0,   bg:"#eef2ff", border:"#c7d2fe", text:"#3730a3" },
    { icon:"🔧", title:"Manutenção",   screen:"manutencao",    sub:`${equipCount} itens`,                                                    hasDot:false,              bg:"#fff7ed", border:"#fed7aa", text:"#9a3412" },
    { icon:"👥", title:"CRM",          screen:"crm",           sub:`${crmCount} moradores`,                                                  hasDot:false,              bg:"#eff6ff", border:"#bfdbfe", text:"#1e40af" },
    { icon:"📢", title:"Comunicados",  screen:"comunicados",   sub:`${comunicadosCount} enviados`,                                           hasDot:false,              bg:"#f5f3ff", border:"#ddd6fe", text:"#5b21b6" },
    { icon:"✨", title:"Insights IA",  screen:"insights",      sub:"Tempo real",                                                             hasDot:false,              bg:"#fffbeb", border:"#fde68a", text:"#92400e" },
    { icon:"🏪", title:"Fornecedores", screen:"fornecedores",  sub:`${fornecCount} cadastros`,                                               hasDot:false,              bg:"#f0fdf4", border:"#bbf7d0", text:"#14532d" },
    { icon:"💧", title:"Água",         screen:"agua",          sub:`${nivelMedio}% nível`,                                                   hasDot:false,              bg:"#f0f9ff", border:"#bae6fd", text:"#0c4a6e" },
    { icon:"🔥", title:"Gás",          screen:"gas",           sub:`${gasNivel}% nível${gasNivel<20?" ⚠️":""}`,                              hasDot:gasNivel<20,        bg:"#fff7ed", border:"#fed7aa", text:"#c2410c" },
    { icon:"⚡", title:"Energia",      screen:"energia",       sub:"Ver consumo",                                                            hasDot:false,              bg:"#fefce8", border:"#fef08a", text:"#854d0e" },
    { icon:"📦", title:"Encomendas",   screen:"encomendas",    sub:`${encPendentes} aguardando`,                                             hasDot:encPendentes>0,     bg:"#eef2ff", border:"#c7d2fe", text:"#3730a3" },
    { icon:"🏊", title:"Piscina",      screen:"piscina",       sub:piscinaLastPh!=null?`pH ${piscinaLastPh}`:"Sem leitura",                   hasDot:piscinaAlerta,      bg:"#f0f9ff", border:"#bae6fd", text: piscinaAlerta?"#b91c1c":"#0369a1" },
  ];
  const mods = isDark ? modsDark : modsLight;

  const navItem = (emoji: string, label: string, screen: string | null, onClick: () => void) => {
    const active = sindicoScreen === screen || (screen === null && !sindicoScreen);
    return (
      <button onClick={onClick} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, opacity:active?1:0.35, transition:"opacity .15s" }}>
        <span style={{ fontSize:20 }}>{emoji}</span>
        <span style={{ fontSize:9, fontWeight:800, color:active?v.activeClr:v.muted, lineHeight:1 }}>{label}</span>
      </button>
    );
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", background:v.bg, fontFamily:"'Nunito',sans-serif", position:"relative", maxWidth:430, width:"100%", margin:"0 auto" }}>
      <style>{ANIM_STYLES}</style>
      <input ref={photoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handlePhotoChange} />

      {/* ── HEADER ─────────────────────────────────────── */}
      <div style={{ padding:"16px 20px 10px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
        <div>
          <div style={{ fontSize:12, color:v.muted, marginBottom:1, fontWeight:600 }}>{greet}</div>
          <div style={{ fontSize:22, fontWeight:900, color:v.text, letterSpacing:"-0.5px", lineHeight:1.15 }}>{fname}</div>
          <div style={{ marginTop:5 }}>
            <span style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", color:"#fff", fontSize:9, fontWeight:800, letterSpacing:"0.07em", textTransform:"uppercase", padding:"3px 10px", borderRadius:20 }}>⬡ SÍNDICO</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:2 }}>
          {iconBtn("Notificações", "🔔", () => setBellCount(0), bellShake ? { animation:"bell-shake .4s" } : {})}
          {bellCount > 0 && <div style={{ position:"absolute", top:18, right:92, width:9, height:9, borderRadius:"50%", background:"#EF4444", border:`2px solid ${v.bg}` }} />}
          {iconBtn(isDark?"Tema Claro":"Tema Escuro", isDark?"☀️":"🌙", () => setSindicoTheme(isDark?"light":"dark"))}
          {iconBtn("Trocar condomínio", "↕", () => setView("selector"))}
          <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#6366f1,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:900, color:"#fff", flexShrink:0 }}>
            {fname.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ─────────────────────────────── */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", paddingBottom:80 }}>

        {/* CONDO PHOTO CARD */}
        <div style={{ margin:"0 14px 10px", borderRadius:18, height:140, position:"relative", overflow:"hidden", background: condoPhoto ? "transparent" : "linear-gradient(135deg,#1e1b4b,#1e3a5f)", flexShrink:0 }}>
          {condoPhoto
            ? <img src={condoPhoto} alt={condoNome} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            : <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:48 }}>🏢</div>
          }
          {/* Gradient overlay */}
          <div style={{ position:"absolute", inset:0, background: isDark ? "linear-gradient(to top,rgba(0,0,0,0.80) 0%,transparent 60%)" : "linear-gradient(to top,rgba(99,60,230,0.55) 0%,transparent 70%)" }} />
          {/* Live badge */}
          <div style={{ position:"absolute", top:12, right:12, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(8px)", borderRadius:20, padding:"4px 10px", display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#fff", fontWeight:700 }}>
            <div className="sind-pulse-dot" style={{ width:7, height:7, borderRadius:"50%", background:"#10B981" }} />
            Sistema ativo
          </div>
          {/* Photo button */}
          <button onClick={() => photoRef.current?.click()} style={{ position:"absolute", top:12, left:12, background:"rgba(255,255,255,0.15)", backdropFilter:"blur(8px)", border:"1.5px dashed rgba(255,255,255,0.55)", borderRadius:20, padding:"4px 10px", fontSize:10, color:"#fff", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            📷 Alterar foto
          </button>
          {/* Name / subtitle */}
          <div style={{ position:"absolute", bottom:12, left:14, right:14 }}>
            <div style={{ fontSize:16, fontWeight:900, color:"#fff", textShadow:"0 1px 6px rgba(0,0,0,0.5)" }}>{condoNome}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)", marginTop:2 }}>{condoCidade} · {condoUnidades} unidades</div>
          </div>
        </div>

        {/* QUICK STATS STRIP */}
        <div style={{ display:"flex", gap:6, padding:"0 14px 10px", overflowX:"auto", scrollbarWidth:"none" }}>
          {[
            { dot:"#10B981", label:"Saldo",       val: saldo>=1000 ? `R$${(saldo/1000).toFixed(0)}k` : `R$${Math.abs(saldo).toFixed(0)}` },
            { dot:"#EF4444", label:"Pendências",  val: String(osAbertasCount) },
            { dot:"#F59E0B", label:"Manutenções", val: String(equipCount) },
            { dot:"#3B82F6", label:"Moradores",   val: String(crmCount) },
          ].map(p => (
            <div key={p.label} style={{ flexShrink:0, borderRadius:25, padding:"5px 12px", background:v.pillBg, border:`1px solid ${v.pillBorder}`, boxShadow:v.pillShadow, display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:p.dot, flexShrink:0 }} />
              <span style={{ fontSize:14, fontWeight:900, color:v.text }}>{p.val}</span>
              <span style={{ fontSize:11, color:v.muted }}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* IA BANNER — Di Síndica Virtual */}
        <div style={{ margin:"0 14px 10px", display:"flex", gap:8 }}>
          {/* Di card (primary) */}
          <div
            className="sind-ia-banner"
            onClick={() => setSindicoScreen("di")}
            style={{
              flex:2, borderRadius:14, padding:"12px 14px",
              background: isDark
                ? "linear-gradient(135deg,#3B0764,#7C3AED,#A855F7)"
                : "linear-gradient(135deg,#6d28d9,#a855f7)",
              boxShadow: isDark ? "0 0 20px rgba(168,85,247,.25)" : "0 4px 16px rgba(124,58,237,0.35)",
              cursor:"pointer", display:"flex", alignItems:"center", gap:10,
              position:"relative", overflow:"hidden",
            }}
          >
            <div style={{ position:"absolute", top:-14, right:-14, width:56, height:56, borderRadius:"50%", background:"rgba(255,255,255,0.08)" }} />
            <img src="/di.png" alt="Di" style={{ width:40, height:40, borderRadius:"50%", objectFit:"cover", objectPosition:"top", border:"2px solid rgba(255,255,255,0.3)", flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:8, color:"rgba(255,255,255,0.65)", letterSpacing:"0.08em", textTransform:"uppercase" as const, marginBottom:1 }}>SÍNDICA VIRTUAL IA</div>
              <div style={{ fontSize:14, fontWeight:900, color:"#fff", lineHeight:1.2 }}>Di — Briefing</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.65)", marginTop:1 }}>Análise + cards inteligentes</div>
            </div>
            <span style={{ color:"rgba(255,255,255,0.8)", fontSize:22, fontWeight:300 }}>›</span>
          </div>
          {/* Chat IA (secondary) */}
          <div
            onClick={() => setSindicoScreen("sindico")}
            style={{
              flex:1, borderRadius:14, padding:"12px 10px",
              background: isDark ? "rgba(99,102,241,.15)" : "rgba(99,102,241,.1)",
              border:`1px solid ${isDark ? "rgba(99,102,241,.3)" : "rgba(99,102,241,.2)"}`,
              cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:4,
            }}
          >
            <span style={{ fontSize:22 }}>💬</span>
            <div style={{ fontSize:10, fontWeight:800, color: isDark ? "#A5B4FC" : "#4f46e5", textAlign:"center" as const, lineHeight:1.2 }}>Chat IA</div>
          </div>
        </div>

        {/* MODULE GRID */}
        <div style={{ padding:"0 14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:10, fontWeight:800, color:v.muted, textTransform:"uppercase", letterSpacing:"0.8px" }}>OPERAÇÕES &amp; GESTÃO</span>
            <span style={{ fontSize:11, color:"#a78bfa", fontWeight:700, cursor:"pointer" }}>ver tudo</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {mods.map((m, i) => (
              <div
                key={m.title}
                className="sind-card"
                onClick={() => setSindicoScreen(m.screen)}
                style={{
                  borderRadius:14, padding:12, cursor:"pointer",
                  background: m.bg,
                  border: isDark ? "none" : `1px solid ${(m as LightModule).border}`,
                  position:"relative", transition:"transform 0.1s",
                  animation:"sindico-fade-up 0.4s ease both",
                  animationDelay:`${i * 45}ms`,
                }}
              >
                {m.hasDot && (
                  <div className="sind-pulse-dot" style={{ position:"absolute", top:10, right:10, width:8, height:8, borderRadius:"50%", background:"#EF4444" }} />
                )}
                <div style={{ fontSize:20, marginBottom:6 }}>{m.icon}</div>
                <div style={{ fontSize:12, fontWeight:800, color:m.text, marginBottom:4, lineHeight:1.2 }}>{m.title}</div>
                <div style={{ display:"inline-block", fontSize:9, fontWeight:700, color:m.text, background:"rgba(255,255,255,0.18)", borderRadius:20, padding:"2px 8px" }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SSE status strip */}
        <div style={{ margin:"12px 14px 0", display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:v.surface, border:`1px solid ${v.border}`, borderRadius:12 }}>
          <div className="sind-pulse-dot" style={{ width:7, height:7, borderRadius:"50%", background: sseCount>0?"#10B981":"#6B7280", flexShrink:0 }} />
          <span style={{ fontSize:11, color:v.muted }}>SSE: <strong style={{ color:v.text }}>{sseCount}</strong> eventos recebidos</span>
        </div>
      </div>

      {/* Sub-screen overlay */}
      {renderSindicoScreen()}

      {/* BOTTOM NAV */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0,
        background:v.navBg, borderTop:`1px solid ${v.navBorder}`,
        boxShadow:v.navShadow, backdropFilter:"blur(12px)",
        display:"flex", alignItems:"center", justifyContent:"space-around",
        padding:"6px 0 max(6px,env(safe-area-inset-bottom))",
        zIndex:50, flexShrink:0,
      }}>
        {navItem("⊞", "Início",   null,           () => setSindicoScreen(null))}
        {navItem("🔔", "Alertas", "misp",          () => setSindicoScreen("misp"))}
        {/* FAB — Di */}
        <button onClick={() => setSindicoScreen("di")} style={{ width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,#7C3AED,#A855F7)", border:"2.5px solid rgba(167,139,250,.7)", cursor:"pointer", marginTop:-12, boxShadow:"0 4px 18px rgba(168,85,247,0.65),0 0 0 3px rgba(168,85,247,.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0, overflow:"hidden" }}>
          <img src="/di.png" alt="Di" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top", borderRadius:"50%", display:"block" }} />
        </button>
        {navItem("👤", "Usuário", "planejamento",  () => setSindicoScreen("planejamento"))}
        {navItem("👥", "CRM",     "crm",           () => setSindicoScreen("crm"))}
      </div>
    </div>
  );
}
