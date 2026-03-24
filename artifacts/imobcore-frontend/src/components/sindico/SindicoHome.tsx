import React, { useRef, useEffect, useState } from "react";

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
@keyframes di-glow {
  0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,0)}
  50%{box-shadow:0 0 0 6px rgba(167,139,250,0.18)}
}
.sind-pulse-dot{animation:sindico-pulse 1.5s ease-in-out infinite}
.sind-card:active{transform:scale(0.97)!important}
.sind-ia-banner{animation:sindico-shimmer 3s ease infinite;background-size:200% 200%}
.di-avatar-ring{animation:di-glow 2.5s ease-in-out infinite}
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
  const [quickInput, setQuickInput] = useState("");
  const [diGreet] = useState(() => {
    const msgs = [
      "Olá! Monitorando o condomínio agora. Consulte OSs, comunique moradores ou crie votações com minha ajuda.",
      "Tudo sob controle! Pergunte sobre finanças, ordens de serviço ou envie comunicados rapidamente.",
      "Sistema ativo. Posso analisar relatórios, criar OSs ou redigir comunicados por você.",
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  });

  useEffect(() => {
    localStorage.setItem("imobcore_sindico_theme", sindicoTheme);
  }, [sindicoTheme]);

  const h = new Date().getHours();
  const greetWord = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const greetEmoji = h < 12 ? "🌤️" : h < 18 ? "☀️" : "🌙";
  const rawName = loginEmail.split("@")[0] || "Síndico";
  const fname = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  const condoNome = condo?.nome ?? "Residencial";
  const condoCidade = condo?.cidade ?? "Florianópolis";

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

  const navItem = (imgSrc: string, label: string, screen: string | null, onClick: () => void) => {
    const active = sindicoScreen === screen || (screen === null && !sindicoScreen);
    return (
      <button onClick={onClick} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, opacity:active?1:0.45, transition:"opacity .15s, transform .15s", transform: active ? "scale(1.08)" : "scale(1)" }}>
        <img src={imgSrc} alt={label} style={{ width:28, height:28, objectFit:"contain", filter: active ? "none" : "grayscale(30%)" }} />
        <span style={{ fontSize:9, fontWeight:800, color:active?v.activeClr:v.muted, lineHeight:1 }}>{label}</span>
      </button>
    );
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", background:v.bg, fontFamily:"'Nunito',sans-serif", position:"relative", maxWidth:430, width:"100%", margin:"0 auto" }}>
      <style>{ANIM_STYLES}</style>
      <input ref={photoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handlePhotoChange} />

      {/* ── HEADER ─────────────────────────────────────── */}
      <div style={{ padding:"18px 20px 12px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
        <div>
          <div style={{ fontSize:13, color:v.muted, marginBottom:1, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
            {greetWord} {greetEmoji}
          </div>
          <div style={{ fontSize:26, fontWeight:900, color:v.text, letterSpacing:"-0.5px", lineHeight:1.1 }}>Síndico</div>
          <div style={{ marginTop:6 }}>
            <button
              onClick={() => photoRef.current?.click()}
              style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(99,60,230,0.08)", border: `1px solid ${v.border}`, borderRadius:20, padding:"4px 12px", fontSize:11, color:v.muted, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5, fontFamily:"inherit" }}
            >
              🏢 {condoNome.length > 18 ? condoNome.substring(0, 18) + "…" : condoNome}
            </button>
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

        {/* ── DI SÍNDICA VIRTUAL — CARD PRINCIPAL ─────── */}
        <div style={{ margin:"0 14px 6px" }}>
          {/* Card Di */}
          <div
            style={{
              borderRadius:20,
              background: isDark
                ? "linear-gradient(135deg,#1a1060 0%,#2d1b6b 45%,#3b2299 100%)"
                : "linear-gradient(135deg,#2d1b6b 0%,#4c1d95 50%,#6d28d9 100%)",
              boxShadow: isDark
                ? "0 8px 32px rgba(100,60,220,0.35)"
                : "0 8px 28px rgba(109,40,217,0.40)",
              display:"flex", overflow:"hidden", position:"relative", minHeight:130,
            }}
          >
            {/* Decorative circles */}
            <div style={{ position:"absolute", top:-30, left:-20, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:-20, left:80, width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />

            {/* Left: info */}
            <div style={{ flex:1, padding:"18px 14px 18px 18px", display:"flex", flexDirection:"column", justifyContent:"space-between", zIndex:1 }}>
              {/* Status badge */}
              <div style={{ display:"inline-flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.13)", borderRadius:20, padding:"3px 10px", width:"fit-content" }}>
                <div className="sind-pulse-dot" style={{ width:6, height:6, borderRadius:"50%", background:"#10B981", flexShrink:0 }} />
                <span style={{ fontSize:9, fontWeight:800, color:"rgba(255,255,255,0.9)", letterSpacing:"0.06em" }}>ONLINE AGORA</span>
              </div>
              {/* Name */}
              <div>
                <div style={{ fontSize:32, fontWeight:900, color:"#fff", lineHeight:1, marginBottom:2 }}>Di</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", fontWeight:600, marginBottom:4 }}>Consultora Virtual IA</div>
                <div style={{ fontSize:10, color:"rgba(200,180,255,0.65)", fontWeight:600 }}>✦ Claude AI · ImobCore</div>
              </div>
              {/* Action buttons */}
              <div style={{ display:"flex", gap:6, marginTop:2 }}>
                <button
                  onClick={() => setSindicoScreen("di")}
                  style={{ background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:20, padding:"5px 12px", fontSize:10, fontWeight:800, color:"#fff", cursor:"pointer", fontFamily:"inherit" }}
                >
                  📊 Briefing
                </button>
                <button
                  onClick={() => setSindicoScreen("sindico")}
                  style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:20, padding:"5px 12px", fontSize:10, fontWeight:800, color:"rgba(255,255,255,0.8)", cursor:"pointer", fontFamily:"inherit" }}
                >
                  💬 Chat
                </button>
              </div>
            </div>

            {/* Right: avatar */}
            <div style={{ width:130, position:"relative", flexShrink:0 }}>
              <img
                src="/di.png"
                alt="Di"
                style={{
                  position:"absolute", bottom:0, right:0,
                  height:"110%", width:"auto",
                  objectFit:"cover", objectPosition:"top center",
                  filter:"drop-shadow(-4px 0 16px rgba(60,20,120,0.5))",
                }}
              />
            </div>
          </div>

          {/* Di greeting message */}
          <div style={{
            marginTop:8,
            padding:"10px 14px",
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)",
            border: `1px solid ${v.border}`,
            borderRadius:14,
            fontSize:12,
            color: isDark ? "rgba(200,190,255,0.75)" : "#4a4070",
            lineHeight:1.5,
            fontWeight:500,
          }}>
            {diGreet}
          </div>

          {/* Quick chat input */}
          <div style={{ marginTop:8, display:"flex", gap:8, alignItems:"center" }}>
            <input
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && quickInput.trim()) {
                  setSindicoScreen("sindico");
                  setQuickInput("");
                }
              }}
              placeholder="Consulte a Di..."
              style={{
                flex:1, padding:"10px 14px", borderRadius:24,
                background: isDark ? "rgba(255,255,255,0.07)" : "#fff",
                border: `1px solid ${v.border}`,
                color:v.text, fontSize:13, fontFamily:"inherit",
                outline:"none",
              }}
            />
            <button
              onClick={() => { if (quickInput.trim()) { setSindicoScreen("sindico"); setQuickInput(""); } else { setSindicoScreen("sindico"); } }}
              style={{
                width:40, height:40, borderRadius:"50%", flexShrink:0,
                background:"linear-gradient(135deg,#7C3AED,#A855F7)",
                border:"none", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:"0 4px 14px rgba(168,85,247,0.45)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* QUICK STATS STRIP */}
        <div style={{ display:"flex", gap:6, padding:"10px 14px 2px", overflowX:"auto", scrollbarWidth:"none" }}>
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

        {/* MODULE GRID */}
        <div style={{ padding:"10px 14px 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:10, fontWeight:800, color:v.muted, textTransform:"uppercase", letterSpacing:"0.8px" }}>OPERAÇÕES &amp; GESTÃO</span>
            <span style={{ fontSize:11, color:"#a78bfa", fontWeight:700, cursor:"pointer" }}>ver tudo</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {mods.map((m, i) => (
              <div
                key={m.title}
                className="sind-card"
                onClick={() => setSindicoScreen(m.screen)}
                style={{
                  borderRadius:16, padding:"18px 16px", cursor:"pointer",
                  background: m.bg,
                  border: isDark ? "none" : `1px solid ${(m as LightModule).border}`,
                  position:"relative", transition:"transform 0.1s",
                  animation:"sindico-fade-up 0.4s ease both",
                  animationDelay:`${i * 45}ms`,
                }}
              >
                {m.hasDot && (
                  <div className="sind-pulse-dot" style={{ position:"absolute", top:12, right:12, width:9, height:9, borderRadius:"50%", background:"#EF4444" }} />
                )}
                <div style={{ fontSize:28, marginBottom:8 }}>{m.icon}</div>
                <div style={{ fontSize:14, fontWeight:800, color:m.text, marginBottom:6, lineHeight:1.2 }}>{m.title}</div>
                <div style={{ display:"inline-block", fontSize:11, fontWeight:700, color:m.text, background:"rgba(255,255,255,0.18)", borderRadius:20, padding:"3px 10px" }}>{m.sub}</div>
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
        {navItem("/nav-inicio.png",   "Início",  null,          () => setSindicoScreen(null))}
        {navItem("/nav-alertas.png",  "Alertas", "misp",        () => setSindicoScreen("misp"))}
        {/* FAB — Di (centro) */}
        <button onClick={() => setSindicoScreen("di")} style={{ width:56, height:56, borderRadius:"50%", background:"linear-gradient(135deg,#7C3AED,#A855F7)", border:"2.5px solid rgba(167,139,250,.7)", cursor:"pointer", marginTop:-14, boxShadow:"0 4px 18px rgba(168,85,247,0.65),0 0 0 3px rgba(168,85,247,.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0, overflow:"hidden" }}>
          <img src="/di.png" alt="Di" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top", borderRadius:"50%", display:"block" }} />
        </button>
        {navItem("/nav-usuario.png",  "Usuário", "planejamento",() => setSindicoScreen("planejamento"))}
        {navItem("/nav-crm.png",      "CRM",     "crm",         () => setSindicoScreen("crm"))}
      </div>
    </div>
  );
}
