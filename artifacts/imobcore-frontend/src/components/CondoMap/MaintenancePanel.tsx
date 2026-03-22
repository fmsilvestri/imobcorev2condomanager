import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, CheckCircle, Clock, Wrench, ChevronRight, ExternalLink } from "lucide-react";
import { useCondoStore, type Area } from "./useCondoStore";
import { STATUS_COLOR } from "./AreaIcon";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(d?: string) {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

const STATUS_LABEL = { ok: "Operacional", warning: "Atenção", critical: "Urgente" } as const;
const STATUS_BG    = { ok: "bg-emerald-500/15", warning: "bg-amber-500/15", critical: "bg-red-500/15" } as const;
const STATUS_TEXT  = { ok: "text-emerald-400", warning: "text-amber-400",  critical: "text-red-400"  } as const;
const STATUS_ICON  = {
  ok:       <CheckCircle  className="w-4 h-4" />,
  warning:  <Clock        className="w-4 h-4" />,
  critical: <AlertTriangle className="w-4 h-4" />,
};

// ─── Statistic card ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-white/5 rounded-xl px-4 py-3">
      <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      <span className={`text-xl font-bold leading-none ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-white/35 mt-0.5">{sub}</span>}
    </div>
  );
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ tag }: { tag: string }) {
  return (
    <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-white/60 font-medium tracking-wide">
      #{tag}
    </span>
  );
}

// ─── Next maintenance countdown ───────────────────────────────────────────────
function NextMaintenance({ area }: { area: Area }) {
  const days = daysUntil(area.proximaManutencao);
  if (days === null) return null;

  const urgency = days < 0 ? "text-red-400" : days < 30 ? "text-amber-400" : "text-emerald-400";
  const label   = days < 0 ? `${Math.abs(days)}d em atraso` : days === 0 ? "hoje" : `em ${days}d`;

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 text-white/60 text-sm">
        <Wrench className="w-4 h-4" />
        <span>Próxima manutenção</span>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold ${urgency}`}>{label}</div>
        <div className="text-xs text-white/35">{formatDate(area.proximaManutencao)}</div>
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────
export function MaintenancePanel() {
  const { areas, selectedAreaId, selectArea } = useCondoStore();
  const area = areas.find((a) => a.id === selectedAreaId) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") selectArea(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectArea]);

  // Close on backdrop click (outside panel)
  const handleBackdrop = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) selectArea(null);
  };

  const glowHex = area ? STATUS_COLOR[area.status] : "#ffffff";
  const days = area ? daysUntil(area.proximaManutencao) : null;

  return (
    <AnimatePresence>
      {area && (
        <motion.div
          className="absolute inset-0 z-20 flex items-end justify-end pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdrop}
        >
          {/* Side panel */}
          <motion.div
            ref={panelRef}
            className="pointer-events-auto w-80 h-full bg-[#0f1117]/90 backdrop-blur-xl border-l border-white/10 flex flex-col overflow-hidden"
            style={{ boxShadow: `-8px 0 40px ${glowHex}22` }}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
          >
            {/* ── Header ── */}
            <div className="relative p-5 border-b border-white/10">
              {/* Colored accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: `linear-gradient(90deg, ${glowHex}00, ${glowHex}99, ${glowHex}00)` }}
              />

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl select-none" role="img" aria-label={area.nome}>
                    {area.icon}
                  </span>
                  <div>
                    <h2 className="text-white font-bold text-lg leading-tight">{area.nome}</h2>
                    <div className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BG[area.status]} ${STATUS_TEXT[area.status]}`}>
                      {STATUS_ICON[area.status]}
                      {STATUS_LABEL[area.status]}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => selectArea(null)}
                  className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-3 text-sm text-white/55 leading-relaxed">{area.descricao}</p>

              {/* Tags */}
              {area.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {area.tags.map((t) => <TagPill key={t} tag={t} />)}
                </div>
              )}
            </div>

            {/* ── Stats ── */}
            <div className="p-4 grid grid-cols-3 gap-2">
              <StatCard
                label="OS Abertas"
                value={area.osAbertas}
                color={area.osAbertas > 0 ? "text-amber-400" : "text-emerald-400"}
              />
              <StatCard
                label="Última Manutenção"
                value={formatDate(area.ultimaManutencao).split(" ")[0]}
                sub={formatDate(area.ultimaManutencao).split(" ").slice(1).join(" ")}
              />
              <StatCard
                label="Prazo"
                value={days !== null ? (days < 0 ? "Vencida" : `${days}d`) : "—"}
                color={days !== null && days < 0 ? "text-red-400" : days !== null && days < 30 ? "text-amber-400" : "text-white"}
              />
            </div>

            {/* ── Next maintenance ── */}
            <div className="px-4">
              <NextMaintenance area={area} />
            </div>

            {/* ── Quick actions ── */}
            <div className="px-4 mt-4 flex flex-col gap-2">
              <h3 className="text-[11px] uppercase tracking-widest text-white/35 mb-1">Ações Rápidas</h3>

              <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-sm font-medium transition-all group">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-400" />
                  Abrir nova OS
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-sm font-medium transition-all group">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-purple-400" />
                  Ver histórico completo
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>

            {/* ── Di insight ── */}
            <div className="mt-auto mx-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-purple-300">✨ Di</span>
              </div>
              <p className="text-xs text-white/65 leading-relaxed">
                {area.status === "critical"
                  ? `${area.nome} tem OS vencida — agende manutenção preventiva para evitar autuações regulatórias e risco à segurança dos moradores.`
                  : area.status === "warning"
                  ? `${area.nome} tem ${area.osAbertas} OS(s) em aberto. Acompanhe para não atrasar a manutenção preventiva.`
                  : `${area.nome} está em dia! Próxima revisão em ${days !== null ? `${days} dias` : "breve"}. Mantenha o cronograma preventivo.`}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
