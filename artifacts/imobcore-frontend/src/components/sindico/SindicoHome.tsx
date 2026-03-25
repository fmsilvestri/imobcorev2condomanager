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

  type ModItem = { bg: string; glow: string; text: string; badge: string; hasDot: boolean; icon: string; title: string; screen: string; sub: string };

  const mods: ModItem[] = [
    { icon:"💰", title:"Financeiro",   screen:"financeiro",   sub: saldo>=1000?`R$${(saldo/1000).toFixed(0)}k`:`R$${saldo.toFixed(0)}`,  hasDot:false,           bg:"linear-gradient(145deg,#059669,#10b981,#34d399)", glow:"rgba(16,185,129,0.45)",  text:"#ecfdf5", badge:"rgba(255,255,255,0.22)" },
    { icon:"⚙️", title:"Ordens Serv.", screen:"os",           sub:`${osAbertasCount} abertas`,                                            hasDot:osAbertasCount>0,bg:"linear-gradient(145deg,#4338ca,#6366f1,#818cf8)", glow:"rgba(99,102,241,0.45)",  text:"#eef2ff", badge:"rgba(255,255,255,0.22)" },
    { icon:"👤", title:"Usuários",     screen:"planejamento", sub:`${osAbertasCount} pendentes`,                                          hasDot:osAbertasCount>0,bg:"linear-gradient(145deg,#7c3aed,#8b5cf6,#a78bfa)", glow:"rgba(139,92,246,0.45)",  text:"#f5f3ff", badge:"rgba(255,255,255,0.22)" },
    { icon:"🔧", title:"Manutenção",   screen:"manutencao",   sub:`${equipCount} itens`,                                                  hasDot:false,           bg:"linear-gradient(145deg,#c2410c,#ea580c,#fb923c)", glow:"rgba(234,88,12,0.45)",   text:"#fff7ed", badge:"rgba(255,255,255,0.22)" },
    { icon:"👥", title:"CRM",          screen:"crm",          sub:`${crmCount} moradores`,                                                hasDot:false,           bg:"linear-gradient(145deg,#1d4ed8,#3b82f6,#60a5fa)", glow:"rgba(59,130,246,0.45)",  text:"#eff6ff", badge:"rgba(255,255,255,0.22)" },
    { icon:"📢", title:"Comunicados",  screen:"comunicados",  sub:`${comunicadosCount} enviados`,                                         hasDot:false,           bg:"linear-gradient(145deg,#9333ea,#a855f7,#c084fc)", glow:"rgba(168,85,247,0.45)",  text:"#faf5ff", badge:"rgba(255,255,255,0.22)" },
    { icon:"✨", title:"Insights IA",  screen:"insights",     sub:"Tempo real",                                                           hasDot:false,           bg:"linear-gradient(145deg,#d97706,#f59e0b,#fcd34d)", glow:"rgba(245,158,11,0.45)",  text:"#fffbeb", badge:"rgba(0,0,0,0.15)" },
    { icon:"🏪", title:"Fornecedores", screen:"fornecedores", sub:`${fornecCount} cadastros`,                                             hasDot:false,           bg:"linear-gradient(145deg,#15803d,#22c55e,#4ade80)", glow:"rgba(34,197,94,0.45)",   text:"#f0fdf4", badge:"rgba(255,255,255,0.22)" },
    { icon:"💧", title:"Água",         screen:"agua",         sub:`${nivelMedio}% nível`,                                                 hasDot:false,           bg:"linear-gradient(145deg,#0369a1,#0ea5e9,#38bdf8)", glow:"rgba(14,165,233,0.45)",  text:"#f0f9ff", badge:"rgba(255,255,255,0.22)" },
    { icon:"🔥", title:"Gás",          screen:"gas",          sub:`${gasNivel}% nível${gasNivel<20?" ⚠️":""}`,                           hasDot:gasNivel<20,     bg:"linear-gradient(145deg,#b91c1c,#ef4444,#f87171)", glow:"rgba(239,68,68,0.45)",   text:"#fff1f2", badge:"rgba(255,255,255,0.22)" },
    { icon:"⚡", title:"Energia",      screen:"energia",      sub:"Ver consumo",                                                          hasDot:false,           bg:"linear-gradient(145deg,#854d0e,#eab308,#fde047)", glow:"rgba(234,179,8,0.45)",   text:"#fefce8", badge:"rgba(0,0,0,0.15)" },
    { icon:"📦", title:"Encomendas",   screen:"encomendas",   sub:`${encPendentes} aguardando`,                                           hasDot:encPendentes>0,  bg:"linear-gradient(145deg,#5b21b6,#7c3aed,#a78bfa)", glow:"rgba(124,58,237,0.45)",  text:"#f5f3ff", badge:"rgba(255,255,255,0.22)" },
    { icon:"🏊", title:"Piscina",      screen:"piscina",      sub:piscinaLastPh!=null?`pH ${piscinaLastPh}`:"Sem leitura",               hasDot:piscinaAlerta,   bg: piscinaAlerta?"linear-gradient(145deg,#be123c,#f43f5e,#fb7185)":"linear-gradient(145deg,#0c4a6e,#0284c7,#38bdf8)", glow:piscinaAlerta?"rgba(244,63,94,0.45)":"rgba(2,132,199,0.45)", text:"#f0f9ff", badge:"rgba(255,255,255,0.22)" },
  ];

  const navMeta: Record<string, { clr: string; glow: string; grad: string }> = {
    "Início":  { clr:"#818cf8", glow:"rgba(99,102,241,0.55)",  grad:"linear-gradient(145deg,#4338ca,#6366f1,#a5b4fc)" },
    "Alertas": { clr:"#fbbf24", glow:"rgba(245,158,11,0.55)",  grad:"linear-gradient(145deg,#b45309,#f59e0b,#fde68a)" },
    "Usuário": { clr:"#34d399", glow:"rgba(16,185,129,0.55)",  grad:"linear-gradient(145deg,#065f46,#10b981,#6ee7b7)" },
    "CRM":     { clr:"#f472b6", glow:"rgba(236,72,153,0.55)",  grad:"linear-gradient(145deg,#9d174d,#ec4899,#fbcfe8)" },
  };
  const navItem = (imgSrc: string, label: string, screen: string | null, onClick: () => void) => {
    const active = sindicoScreen === screen || (screen === null && !sindicoScreen);
    const meta = navMeta[label] ?? { clr:"#818cf8", glow:"rgba(99,102,241,0.5)", grad:"linear-gradient(145deg,#4338ca,#6366f1,#a5b4fc)" };
    return (
      <button onClick={onClick} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"transform .15s", transform: active ? "scale(1.14)" : "scale(1)" }}>
        <div style={{
          width:44, height:44, borderRadius:16, overflow:"hidden",
          background: active ? meta.grad : (isDark ? "rgba(255,255,255,0.08)" : "rgba(100,80,200,0.10)"),
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"all .2s",
          boxShadow: active ? `0 4px 14px ${meta.glow}, 0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)` : "0 1px 4px rgba(0,0,0,0.15)",
          position:"relative",
        }}>
          {/* Gloss shine */}
          {active && <div style={{ position:"absolute", top:0, left:0, right:0, height:20, background:"linear-gradient(180deg,rgba(255,255,255,0.28) 0%,rgba(255,255,255,0) 100%)", pointerEvents:"none" }} />}
          <img
            src={imgSrc}
            alt={label}
            style={{
              width:28, height:28, objectFit:"contain",
              mixBlendMode: active ? "normal" : (isDark ? "screen" : "multiply"),
              filter: active ? "drop-shadow(1px 2px 4px rgba(0,0,0,0.4))" : (isDark ? "brightness(0.75)" : "brightness(0.8)"),
            }}
          />
        </div>
        <span style={{ fontSize:10, fontWeight:900, color: active ? meta.clr : (isDark ? "rgba(180,170,255,0.60)" : "rgba(80,60,180,0.55)"), lineHeight:1, letterSpacing:"0.02em", textShadow: active ? `0 0 8px ${meta.glow}` : "none" }}>{label}</span>
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
                  💡 Dicas da Di
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {mods.map((m, i) => (
              <div
                key={m.title}
                className="sind-card"
                onClick={() => setSindicoScreen(m.screen)}
                style={{
                  borderRadius:20, padding:"16px 14px 14px", cursor:"pointer",
                  background: m.bg,
                  position:"relative", overflow:"hidden",
                  transition:"transform 0.15s, box-shadow 0.15s",
                  boxShadow:`0 6px 20px ${m.glow}, 0 2px 6px rgba(0,0,0,0.25)`,
                  animation:"sindico-fade-up 0.4s ease both",
                  animationDelay:`${i * 40}ms`,
                }}
              >
                {/* Gloss shine bar */}
                <div style={{ position:"absolute", top:0, left:0, right:0, height:42, background:"linear-gradient(180deg,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0) 100%)", borderRadius:"20px 20px 0 0", pointerEvents:"none" }} />
                {/* Alert dot */}
                {m.hasDot && (
                  <div className="sind-pulse-dot" style={{ position:"absolute", top:11, right:11, width:10, height:10, borderRadius:"50%", background:"#fef08a", boxShadow:"0 0 6px #fef08a" }} />
                )}
                {/* 3D Icon */}
                <div style={{
                  fontSize:42, lineHeight:1, marginBottom:10,
                  filter:"drop-shadow(2px 4px 8px rgba(0,0,0,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
                  transform:"translateZ(0)",
                  display:"inline-block",
                }}>
                  {m.icon}
                </div>
                <div style={{ fontSize:13, fontWeight:900, color:"#fff", marginBottom:7, lineHeight:1.2, textShadow:"0 1px 4px rgba(0,0,0,0.3)" }}>{m.title}</div>
                <div style={{ display:"inline-block", fontSize:10, fontWeight:800, color:"#fff", background:m.badge, borderRadius:20, padding:"3px 10px", backdropFilter:"blur(4px)" }}>{m.sub}</div>
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
