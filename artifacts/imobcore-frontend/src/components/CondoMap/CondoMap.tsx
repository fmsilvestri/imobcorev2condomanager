/**
 * CondoMap — Módulo de Manutenção com Mapa Isométrico Interativo
 * Implementado em SVG + CSS puro (sem WebGL).
 * Requisitos: mapa isométrico clicável, painel lateral com 3 abas,
 * fluxo completo de OS, scores dinâmicos, animações de status.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Calendar, X, AlertCircle, CheckCircle, AlertTriangle, Clock, Image as ImageIcon, FileText } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Status   = "critico" | "atencao" | "ok";
type Priority = "Urgente" | "Alta" | "Média" | "Baixa";
type TabId    = "os" | "historico" | "fotos";

interface OSItem { id: string; titulo: string; prioridade: Priority; tecnico: string; data: string; custo: number; }
interface HistEvent { data: string; desc: string; tipo: "os" | "vistoria" | "reparo"; }

interface AreaData {
  id: string; nome: string; icon: string; status: Status; score: number;
  cx: number; cy: number; cubeH: number;
  ultimaVistoria: string; proximaVistoria: string;
  os: OSItem[]; historico: HistEvent[];
}

// ─── Tile constants ─────────────────────────────────────────────────────────────
const TW = 120, TH = 60, HW = 60, HH = 30; // tile width, height, half-width, half-height

// ─── Colors ─────────────────────────────────────────────────────────────────────
const C = {
  critico: { top:"#7f1d1d", lft:"#5f1515", rgt:"#45100f", topSel:"#ef4444", lftSel:"#dc2626", rgtSel:"#b91c1c", glow:"rgba(239,68,68,0.35)", glowSel:"rgba(239,68,68,0.6)" },
  atencao: { top:"#78350f", lft:"#5a2808", rgt:"#3f1a05", topSel:"#f59e0b", lftSel:"#d97706", rgtSel:"#b45309", glow:"rgba(245,158,11,0.25)", glowSel:"rgba(245,158,11,0.5)" },
  ok:      { top:"#064e3b", lft:"#043728", rgt:"#031f17", topSel:"#10b981", lftSel:"#059669", rgtSel:"#047857", glow:"rgba(16,185,129,0.2)",  glowSel:"rgba(16,185,129,0.45)" },
} as const;

const SCORE_HIT: Record<Priority, number> = { Urgente:8, Alta:5, Média:3, Baixa:1 };

const P_STYLE: Record<Priority, {bg:string; text:string}> = {
  Urgente: { bg:"bg-red-900/50",    text:"text-red-400" },
  Alta:    { bg:"bg-orange-900/50", text:"text-orange-400" },
  Média:   { bg:"bg-amber-900/50",  text:"text-amber-400" },
  Baixa:   { bg:"bg-emerald-900/50",text:"text-emerald-400" },
};

const S_STYLE: Record<Status, {bg:string; border:string; text:string; dot:string; label:string}> = {
  critico: { bg:"bg-red-900/30",    border:"border-red-800/60",    text:"text-red-400",    dot:"bg-red-500",    label:"Crítico"  },
  atencao: { bg:"bg-amber-900/30",  border:"border-amber-800/60",  text:"text-amber-400",  dot:"bg-amber-500",  label:"Atenção"  },
  ok:      { bg:"bg-emerald-900/30",border:"border-emerald-800/60",text:"text-emerald-400",dot:"bg-emerald-500",label:"OK"       },
};

// ─── Initial data ───────────────────────────────────────────────────────────────
const INITIAL: AreaData[] = [
  { id:"salao",     nome:"Salão de Festas", icon:"🎉", status:"critico", score:28,  cx:290, cy:62,  cubeH:58,
    ultimaVistoria:"Há 60 dias", proximaVistoria:"Vencida",
    os:[
      { id:"OS-004", titulo:"Infiltração no teto – lateral esq.", prioridade:"Urgente", tecnico:"Carlos Melo", data:"10/03", custo:5200 },
      { id:"OS-005", titulo:"Ar-condicionado inoperante",         prioridade:"Alta",    tecnico:"João Tech",   data:"12/03", custo:900  },
    ],
    historico:[
      { data:"10/03", desc:"OS aberta: infiltração teto", tipo:"os" },
      { data:"20/02", desc:"Vistoria detectou umidade",   tipo:"vistoria" },
      { data:"05/01", desc:"Pintura geral realizada",     tipo:"reparo" },
    ],
  },
  { id:"elevadores", nome:"Elevadores", icon:"🛗", status:"critico", score:31,  cx:145, cy:130, cubeH:62,
    ultimaVistoria:"Há 45 dias", proximaVistoria:"Vencida",
    os:[
      { id:"OS-001", titulo:"Sensor de porta com falha",  prioridade:"Urgente", tecnico:"Marcos Alves", data:"15/03", custo:3800 },
      { id:"OS-002", titulo:"Cabine B – ruído excessivo", prioridade:"Alta",    tecnico:"Marcos Alves", data:"18/03", custo:1200 },
    ],
    historico:[
      { data:"15/03", desc:"OS aberta: sensor de porta com falha", tipo:"os" },
      { data:"01/03", desc:"Vistoria de rotina realizada",          tipo:"vistoria" },
      { data:"10/02", desc:"Troca de cabos de aço – Elevador A",   tipo:"reparo" },
    ],
  },
  { id:"academia", nome:"Academia", icon:"🏋️", status:"atencao", score:64,  cx:435, cy:130, cubeH:52,
    ultimaVistoria:"Há 15 dias", proximaVistoria:"Em 15 dias",
    os:[
      { id:"OS-006", titulo:"Esteira 3 – correia desgastada",  prioridade:"Média", tecnico:"Pedro Lima",   data:"20/03", custo:650 },
      { id:"OS-007", titulo:"Iluminação lateral – 3 lâmpadas", prioridade:"Baixa", tecnico:"Elétrica Fix", data:"22/03", custo:180 },
    ],
    historico:[
      { data:"20/03", desc:"OS aberta: esteira 3",   tipo:"os" },
      { data:"08/03", desc:"Vistoria preventiva OK", tipo:"vistoria" },
    ],
  },
  { id:"piscina", nome:"Piscina", icon:"🏊", status:"ok", score:91, cx:290, cy:225, cubeH:42,
    ultimaVistoria:"Hoje", proximaVistoria:"Em 30 dias",
    os:[
      { id:"OS-003", titulo:"Troca de bomba filtrante", prioridade:"Baixa", tecnico:"Pedro Lima", data:"20/01", custo:1200 },
    ],
    historico:[
      { data:"22/03", desc:"Vistoria: pH e cloro OK",         tipo:"vistoria" },
      { data:"20/01", desc:"OS aberta: bomba filtrante",      tipo:"os" },
      { data:"15/01", desc:"Tratamento anti-algas realizado", tipo:"reparo" },
    ],
  },
  { id:"garagem", nome:"Garagem B2", icon:"🚗", status:"atencao", score:58, cx:140, cy:310, cubeH:52,
    ultimaVistoria:"Há 30 dias", proximaVistoria:"Em 0 dias",
    os:[
      { id:"OS-008", titulo:"Portão lento – tensão correia", prioridade:"Média", tecnico:"AutoFix", data:"18/03", custo:480 },
    ],
    historico:[
      { data:"18/03", desc:"OS aberta: portão B2",      tipo:"os" },
      { data:"20/02", desc:"Pintura de piso realizada", tipo:"reparo" },
      { data:"01/02", desc:"Vistoria estrutural OK",    tipo:"vistoria" },
    ],
  },
  { id:"coworking", nome:"Coworking", icon:"💼", status:"ok", score:97, cx:440, cy:300, cubeH:42,
    ultimaVistoria:"Há 7 dias", proximaVistoria:"Em 23 dias",
    os:[],
    historico:[
      { data:"15/03", desc:"Vistoria geral – tudo OK", tipo:"vistoria" },
      { data:"01/03", desc:"Internet fibra instalada",  tipo:"reparo" },
    ],
  },
];

// ─── IsoCube SVG component ─────────────────────────────────────────────────────
function IsoCube({ cx, cy, cubeH, status, selected, dimmed, onClick }: {
  cx:number; cy:number; cubeH:number; status:Status; selected:boolean; dimmed:boolean; onClick:()=>void;
}) {
  const col   = C[status];
  const isSel = selected;
  const top   = isSel ? col.topSel : col.top;
  const lft   = isSel ? col.lftSel : col.lft;
  const rgt   = isSel ? col.rgtSel : col.rgt;
  const glow  = isSel ? col.glowSel : col.glow;
  const pulse = status === "critico";

  const tp  = `${cx},${cy}`;
  const rt  = `${cx+HW},${cy+HH}`;
  const bt  = `${cx},${cy+TH}`;
  const lt  = `${cx-HW},${cy+HH}`;
  const lb  = `${cx-HW},${cy+HH+cubeH}`;
  const rb  = `${cx+HW},${cy+HH+cubeH}`;
  const btb = `${cx},${cy+TH+cubeH}`;

  return (
    <g onClick={onClick} style={{ cursor:"pointer", opacity: dimmed ? 0.32 : 1 }}>
      {/* Shadow ellipse */}
      <ellipse cx={cx} cy={cy+TH+cubeH+4} rx={HW*0.75} ry={HH*0.38} fill="rgba(0,0,0,0.4)" />

      {/* Status glow */}
      <ellipse cx={cx} cy={cy+TH+cubeH+3} rx={HW*0.85} ry={HH*0.45}
        fill={glow}
        className={pulse ? "iso-pulse-glow" : ""}
      />

      {/* Cube faces */}
      <polygon points={`${lt} ${bt} ${btb} ${lb}`}  fill={lft} stroke="#080b14" strokeWidth="0.8" />
      <polygon points={`${bt} ${rt} ${rb} ${btb}`}  fill={rgt} stroke="#080b14" strokeWidth="0.8" />
      <polygon points={`${tp} ${rt} ${bt} ${lt}`}   fill={top} stroke="#080b14" strokeWidth="0.8"
        className={pulse ? "iso-pulse-top" : ""} />

      {/* Selection ring on top face */}
      {selected && (
        <polygon points={`${tp} ${rt} ${bt} ${lt}`} fill="none"
          stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" />
      )}

      {/* Invisible full-cube click target */}
      <polygon points={`${tp} ${rt} ${rb} ${btb} ${lb} ${lt}`} fill="transparent" stroke="none" />
    </g>
  );
}

// ─── Block label ───────────────────────────────────────────────────────────────
function BlockLabel({ area, selected, dimmed }: { area:AreaData; selected:boolean; dimmed:boolean }) {
  const { cx, cy, nome, icon, score, os } = area;
  const w  = Math.max(nome.length * 7.2 + 36, 108);
  const w2 = Math.max(`Score ${score} · ${os.length} OS`.length * 6.2 + 16, 88);
  const lcy = cy - 18; // center-y of label group

  return (
    <g style={{ pointerEvents:"none", opacity: dimmed ? 0.38 : 1 }}>
      {/* Connector line */}
      <line x1={cx} y1={lcy+10} x2={cx} y2={cy-2}
        stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" strokeDasharray="2,2" />

      {/* Name chip */}
      <rect x={cx-w/2} y={lcy-18} width={w} height={22} rx={11}
        fill={selected ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.7)"}
        stroke={selected ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)"}
        strokeWidth="0.6" />
      <text x={cx} y={lcy-3} textAnchor="middle" fill="white" fontSize="10.5"
        fontFamily="system-ui,-apple-system,sans-serif" fontWeight={selected ? "600" : "400"}>
        {icon} {nome}
      </text>

      {/* Score + OS badge */}
      <rect x={cx-w2/2} y={lcy+5} width={w2} height={15} rx={7.5}
        fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <text x={cx} y={lcy+15.5} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8.5"
        fontFamily="system-ui,-apple-system,sans-serif">
        Score {score} · {os.length} OS
      </text>
    </g>
  );
}

// ─── Isometric Map ─────────────────────────────────────────────────────────────
function IsoMap({ areas, selectedId, onSelect }: {
  areas:AreaData[]; selectedId:string|null; onSelect:(id:string)=>void;
}) {
  // Sort back-to-front: lower cy (higher on screen = further) drawn first
  const sorted = useMemo(() =>
    [...areas].sort((a, b) => a.cy !== b.cy ? a.cy - b.cy : a.cx - b.cx),
    [areas]);

  return (
    <svg viewBox="0 0 590 420" className="w-full h-full select-none" style={{ overflow:"visible" }}>
      <defs>
        <style>{`
          @keyframes iso-pulse-top-anim { 0%,100%{opacity:1} 50%{opacity:.72} }
          @keyframes iso-pulse-glow-anim { 0%,100%{opacity:.6} 50%{opacity:1} }
          .iso-pulse-top  { animation: iso-pulse-top-anim 1.6s ease-in-out infinite }
          .iso-pulse-glow { animation: iso-pulse-glow-anim 1.6s ease-in-out infinite }
        `}</style>

        {/* Subtle grid line style */}
        <style>{`.grid-line { stroke: rgba(255,255,255,0.045); stroke-width: 0.7 }`}</style>
      </defs>

      {/* ── Floor grid (diagonal lines) ── */}
      <g>
        {/* "Across" lines: slope 0.5 — from NW to SE */}
        {[-120,-60,0,60,120,180,240,300,360,420].map(c => (
          <line key={`a${c}`} className="grid-line"
            x1={0}   y1={c}
            x2={590} y2={0.5*590+c} />
        ))}
        {/* "Depth" lines: slope -0.5 — from NE to SW */}
        {[0,60,120,180,240,300,360,420,480,540,600].map(c => (
          <line key={`d${c}`} className="grid-line"
            x1={0}   y1={c}
            x2={590} y2={-0.5*590+c} />
        ))}
      </g>

      {/* ── Blocks (back-to-front) ── */}
      {sorted.map(area => {
        const sel    = area.id === selectedId;
        const dimmed = selectedId !== null && !sel;
        return (
          <g key={area.id}>
            <IsoCube
              cx={area.cx} cy={area.cy} cubeH={area.cubeH}
              status={area.status} selected={sel} dimmed={dimmed}
              onClick={() => onSelect(area.id)}
            />
            <BlockLabel area={area} selected={sel} dimmed={dimmed} />
          </g>
        );
      })}

      {/* ── Legend ── */}
      <g transform="translate(22, 340)">
        <rect x={-4} y={-18} width={90} height={74} rx={8}
          fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
        <text x={0} y={-4} fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="system-ui,sans-serif" fontWeight="600" letterSpacing="1.5">LEGENDA</text>
        {([["#ef4444","Crítico"],["#f59e0b","Atenção"],["#10b981","OK"]] as [string,string][]).map(([col,label],i) => (
          <g key={label} transform={`translate(0,${i*18+6})`}>
            <circle cx={5} cy={5} r={5} fill={col} />
            <text x={14} y={9} fill="rgba(255,255,255,0.7)" fontSize="9.5" fontFamily="system-ui,sans-serif">{label}</text>
          </g>
        ))}
      </g>

      {/* ── Click hint ── */}
      <text x={295} y={415} textAnchor="middle" fill="rgba(255,255,255,0.22)" fontSize="9.5" fontFamily="system-ui,sans-serif">
        ↘ Clique numa área para detalhes
      </text>
    </svg>
  );
}

// ─── Priority badge ─────────────────────────────────────────────────────────────
function PriBadge({ p }: { p:Priority }) {
  const s = P_STYLE[p];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${s.bg} ${s.text}`}>{p}</span>
  );
}

// ─── OS card ───────────────────────────────────────────────────────────────────
function OSCard({ os }: { os:OSItem }) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/35 font-mono">{os.id}</span>
        <PriBadge p={os.prioridade} />
      </div>
      <div className="text-white text-[13px] font-semibold leading-tight">{os.titulo}</div>
      <div className="flex items-center gap-3 text-[11px] text-white/50">
        <span>👤 {os.tecnico}</span>
        <span>📅 {os.data}</span>
        <span>💰 R$ {os.custo.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
}

// ─── History item ───────────────────────────────────────────────────────────────
const HIST_ICON: Record<string, string> = { os:"🔧", vistoria:"🔍", reparo:"✅" };
const HIST_COLOR: Record<string, string> = { os:"bg-amber-500", vistoria:"bg-blue-500", reparo:"bg-emerald-500" };

function HistItem({ ev, last }: { ev:HistEvent; last:boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full mt-1.5 ${HIST_COLOR[ev.tipo]}`} />
        {!last && <div className="w-px flex-1 bg-white/10 mt-1" />}
      </div>
      <div className="pb-4">
        <div className="text-[11px] text-white/40">{ev.data}</div>
        <div className="text-[12.5px] text-white/80 leading-snug mt-0.5">{HIST_ICON[ev.tipo]} {ev.desc}</div>
      </div>
    </div>
  );
}

// ─── Photo grid placeholder ─────────────────────────────────────────────────────
const PHOTO_LABELS = [
  "Vistoria fev/26","OS recente","Vista geral","Detalhe problema",
  "Área completa","Pré-reparo",
];
function PhotoGrid({ status }: { status:Status }) {
  const hue = status === "critico" ? "from-red-900/40" : status === "atencao" ? "from-amber-900/40" : "from-emerald-900/40";
  return (
    <div className="grid grid-cols-2 gap-2">
      {PHOTO_LABELS.map((lbl, i) => (
        <div key={i} className={`rounded-xl bg-gradient-to-br ${hue} to-white/5 border border-white/10 h-24 flex flex-col items-center justify-center gap-1`}>
          <ImageIcon className="w-5 h-5 text-white/25" />
          <span className="text-[10px] text-white/35">{lbl}</span>
        </div>
      ))}
    </div>
  );
}

// ─── New OS form ────────────────────────────────────────────────────────────────
function NewOSForm({ onSubmit, onCancel }: {
  onSubmit:(o:Omit<OSItem,"id">)=>void; onCancel:()=>void;
}) {
  const [titulo,    setTitulo]    = useState("");
  const [prioridade,setPrioridade]= useState<Priority>("Média");
  const [tecnico,   setTecnico]   = useState("");
  const [custo,     setCusto]     = useState("");

  const fieldCls = "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-[12.5px] placeholder:text-white/30 focus:outline-none focus:border-purple-500/50";

  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[13px] font-semibold text-white">Nova Ordem de Serviço</h4>
        <button onClick={onCancel} className="text-white/40 hover:text-white p-1 rounded"><X className="w-3.5 h-3.5" /></button>
      </div>

      <input className={fieldCls} placeholder="Título da OS *" value={titulo} onChange={e=>setTitulo(e.target.value)} />

      <select className={fieldCls + " cursor-pointer"}
        value={prioridade} onChange={e=>setPrioridade(e.target.value as Priority)}>
        {(["Urgente","Alta","Média","Baixa"] as Priority[]).map(p=>(
          <option key={p} value={p} className="bg-[#0f1117]">{p}</option>
        ))}
      </select>

      <input className={fieldCls} placeholder="Técnico responsável" value={tecnico} onChange={e=>setTecnico(e.target.value)} />
      <input className={fieldCls} placeholder="Custo estimado (R$)" type="number" value={custo} onChange={e=>setCusto(e.target.value)} />

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-xl border border-white/15 text-white/60 text-[12px] hover:bg-white/5 transition-colors">
          Cancelar
        </button>
        <button
          disabled={!titulo.trim()}
          onClick={()=>{
            if(!titulo.trim()) return;
            onSubmit({ titulo: titulo.trim(), prioridade, tecnico: tecnico.trim()||"A definir", data: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}), custo: Number(custo)||0 });
          }}
          className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-semibold transition-colors">
          Criar OS
        </button>
      </div>
    </motion.div>
  );
}

// ─── Side panel ────────────────────────────────────────────────────────────────
function SidePanel({ area, onCreateOS, condoNome }: {
  area:AreaData|null; onCreateOS:(id:string, os:Omit<OSItem,"id">)=>void; condoNome:string;
}) {
  const [tab, setTab]       = useState<TabId>("os");
  const [newOS, setNewOS]   = useState(false);

  // Reset form & tab when area changes
  const lastId = area?.id;

  const ss = area ? S_STYLE[area.status] : null;
  const scoreColor = !area ? "" : area.score >= 80 ? "text-emerald-400" : area.score >= 55 ? "text-amber-400" : "text-red-400";
  const barColor   = !area ? "" : area.score >= 80 ? "bg-emerald-500" : area.score >= 55 ? "bg-amber-500" : "bg-red-500";

  if (!area) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/25 text-sm gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl">🏗️</div>
        <div className="text-center leading-relaxed">
          <p className="font-medium text-white/40">Nenhuma área selecionada</p>
          <p className="text-[12px] mt-1">Clique em um bloco do mapa</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Area header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{area.icon}</span>
          <div>
            <h2 className="text-white font-bold text-[17px] leading-tight">{area.nome}</h2>
            <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${ss!.bg} ${ss!.border} ${ss!.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ss!.dot}`} />
              {ss!.label}
            </span>
          </div>
        </div>

        {/* Score bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-white/50">Score de Saúde</span>
            <span className={`text-[13px] font-bold ${scoreColor}`}>{area.score}/100</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div className={`h-full rounded-full ${barColor}`}
              initial={{ width:0 }} animate={{ width:`${area.score}%` }}
              transition={{ duration:0.7, ease:"easeOut" }} />
          </div>
        </div>

        {/* Vistoria cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/5 px-3 py-2">
            <div className="text-[10px] text-white/40 mb-0.5">Última vistoria</div>
            <div className="text-[12.5px] text-white font-medium">✅ {area.ultimaVistoria}</div>
          </div>
          <div className="rounded-xl bg-white/5 px-3 py-2">
            <div className="text-[10px] text-white/40 mb-0.5">Próxima vistoria</div>
            <div className={`text-[12.5px] font-medium ${area.proximaVistoria === "Vencida" ? "text-red-400" : "text-white"}`}>
              {area.proximaVistoria === "Vencida" ? "⚠️" : "📅"} {area.proximaVistoria}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 py-3 border-b border-white/10 shrink-0">
        {([["os", `OS (${area.os.length})`], ["historico","Histórico"], ["fotos","Fotos"]] as [TabId,string][]).map(([id,lbl]) => (
          <button key={id} onClick={() => { setTab(id); setNewOS(false); }}
            className={`flex-1 py-2 rounded-xl text-[12px] font-semibold transition-all ${
              tab === id ? "bg-white/15 text-white" : "text-white/45 hover:bg-white/8 hover:text-white/70"
            }`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
        <AnimatePresence mode="wait">
          {newOS ? (
            <motion.div key="newos" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
              <NewOSForm
                onSubmit={os => { onCreateOS(area.id, os); setNewOS(false); setTab("os"); }}
                onCancel={() => setNewOS(false)}
              />
            </motion.div>
          ) : tab === "os" ? (
            <motion.div key="os" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-2.5">
              {area.os.length === 0
                ? <div className="text-center text-white/30 text-[12px] py-8">Nenhuma OS em aberto ✓</div>
                : area.os.map(o => <OSCard key={o.id} os={o} />)
              }
            </motion.div>
          ) : tab === "historico" ? (
            <motion.div key="hist" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="pt-1">
              {area.historico.map((ev, i) => <HistItem key={i} ev={ev} last={i === area.historico.length-1} />)}
            </motion.div>
          ) : (
            <motion.div key="fotos" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
              <PhotoGrid status={area.status} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action buttons */}
      <div className="px-5 py-4 border-t border-white/10 flex gap-2 shrink-0">
        <button
          onClick={() => { setNewOS(true); setTab("os"); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/15 text-white text-[12.5px] font-semibold transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova OS
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/15 text-white text-[12.5px] font-semibold transition-all">
          <Calendar className="w-3.5 h-3.5" />
          Agendar vistoria
        </button>
      </div>
    </div>
  );
}

// ─── Main CondoMap component ───────────────────────────────────────────────────
interface CondoMapProps { condoNome?: string; className?: string; }

export function CondoMap({ condoNome = "Condomínio", className = "" }: CondoMapProps) {
  const [areas,       setAreas]       = useState<AreaData[]>(INITIAL);
  const [selectedId,  setSelectedId]  = useState<string | null>("piscina");

  const selectedArea = areas.find(a => a.id === selectedId) ?? null;

  const scoreAvg = useMemo(() =>
    Math.round(areas.reduce((s,a) => s + a.score, 0) / areas.length),
    [areas]);

  const counts = useMemo(() => ({
    critico: areas.filter(a=>a.status==="critico").length,
    atencao: areas.filter(a=>a.status==="atencao").length,
    ok:      areas.filter(a=>a.status==="ok").length,
  }), [areas]);

  const handleSelect = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  const handleCreateOS = (areaId: string, osData: Omit<OSItem,"id">) => {
    setAreas(prev => prev.map(a => {
      if (a.id !== areaId) return a;
      const newId  = `OS-${String(a.os.length + 100 + Math.floor(Math.random()*50)).padStart(3,"0")}`;
      const newOS  = { ...osData, id: newId } satisfies OSItem;
      const hit    = SCORE_HIT[osData.prioridade];
      const newScore = Math.max(0, a.score - hit);
      const newStatus: Status = newScore < 40 ? "critico" : newScore < 70 ? "atencao" : "ok";
      return { ...a, os:[...a.os, newOS], score:newScore, status:newStatus, historico:[{ data:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}), desc:`OS aberta: ${osData.titulo}`, tipo:"os" }, ...a.historico] };
    }));
  };

  return (
    <div className={`flex flex-col h-full min-h-[520px] bg-[#0a0c14] overflow-hidden rounded-2xl ${className}`}>

      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-white/10 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-white font-black text-sm shrink-0">IC</div>
          <div>
            <div className="text-white font-black text-[13px] tracking-wide leading-tight">IMOBCORE</div>
            <div className="text-white/40 text-[10px] leading-none">Módulo Manutenção · {condoNome}</div>
          </div>
        </div>

        {/* Status counts */}
        <div className="flex gap-2 ml-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-900/30 border border-red-800/50 text-red-400 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{counts.critico} Crítico
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-900/30 border border-amber-800/50 text-amber-400 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{counts.atencao} Atenção
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-900/30 border border-emerald-800/60 text-emerald-400 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{counts.ok} OK
          </span>
        </div>

        {/* Score médio */}
        <div className="ml-auto text-right">
          <div className="text-orange-400 font-black text-2xl leading-none">{scoreAvg}</div>
          <div className="text-white/35 text-[9px] tracking-widest uppercase mt-0.5">Score Médio</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Isometric Map */}
        <div className="flex-1 min-w-0 p-3 flex items-center justify-center overflow-hidden">
          <IsoMap areas={areas} selectedId={selectedId} onSelect={handleSelect} />
        </div>

        {/* Divider */}
        <div className="w-px bg-white/8 shrink-0" />

        {/* Right: Side Panel */}
        <div className="w-[340px] shrink-0 bg-[#0d1018] overflow-hidden">
          <SidePanel area={selectedArea} onCreateOS={handleCreateOS} condoNome={condoNome} />
        </div>
      </div>
    </div>
  );
}
