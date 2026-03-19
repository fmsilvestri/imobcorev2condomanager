import { useEffect, useRef, useState, useCallback } from "react";
import SindicoHome from "./components/sindico/SindicoHome";
import AguaModule from "./modules/agua/AguaModule";
import QRCode from "qrcode";
import { PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrdemServico { id: string; numero: number; titulo: string; descricao?: string; categoria: string; status: string; prioridade: string; unidade?: string; responsavel?: string; updated_at?: string; created_at: string; equipamento_ids?: string[] }
interface Sensor { id: string; sensor_id: string; nome: string; local: string; capacidade_litros: number; nivel_atual: number; volume_litros: number; status?: string }
interface Reservatorio { id: string; sensor_id: string; nome: string; local: string; capacidade_litros: number; altura_cm: number; mac_address?: string; cf_url: string; wh_url: string; protocolo: string; porta: number; cf_online: boolean; wh_online: boolean; created_at: string; condominio_id?: string | null }
interface Alerta { id: string; origem: string; titulo: string; descricao?: string; tipo: string; nivel: string; cidade: string; bairro: string }
interface Receita { id: string; descricao: string; valor: number; categoria: string; status: string; created_at?: string }
interface Despesa { id: string; descricao: string; valor: number; categoria: string; fornecedor?: string; created_at?: string }
interface Lancamento { id: string; condominio_id?: string; tipo: "receita"|"despesa"; categoria: string; subcategoria?: string; descricao: string; valor: number; data: string; competencia?: string; status: "previsto"|"pago"|"atrasado"; created_at?: string }
interface OrcamentoEntry { id: string; categoria: string; mes: number; valor_previsto: number; valor_real: number }
interface FinanceiroInsight { score: number; inadimplencia: number; saldo: number; risco: string; analise: string; riscos: string; recomendacoes: string; gerado_em: string; reply?: string }
interface Comunicado { id: string; titulo: string; corpo: string; gerado_por_ia: boolean; created_at: string }
interface ChatMsg { role: "user" | "ai"; content: string; time: string }
interface PiscinaLeitura { id: string; condominio_id: string; ph: number; cloro: number; temperatura?: number; alcalinidade?: number; dureza_calcica?: number; status: "ok" | "alerta"; observacoes?: string; created_at: string; }
interface DashTotais { os_abertas: number; os_urgentes: number; saldo: number; total_receitas: number; total_despesas: number; alertas_ativos: number; nivel_medio_agua: number }
interface CondominioInfo {
  id: string; nome: string; cidade: string; estado?: string;
  cnpj?: string; endereco?: string;
  unidades: number; total_unidades?: number; moradores: number;
  sindico_nome: string; sindico_email?: string; sindico_tel?: string;
  plano?: "free" | "starter" | "pro" | "admin_plus";
  status?: "ativo" | "suspenso" | "trial";
  trial_expires_at?: string;
  logo_url?: string; cor_primaria?: string;
  photo_url?: string | null;
  created_at?: string;
}
interface Dashboard { ordens_servico: OrdemServico[]; sensores: Sensor[]; alertas_publicos: Alerta[]; receitas: Receita[]; despesas: Despesa[]; comunicados: Comunicado[]; totais: DashTotais; condominios: CondominioInfo[] }
interface Encomenda { id: string; condominio_id: string; morador_nome: string; bloco: string; unidade: string; tipos: string[]; codigo_rastreio?: string | null; status: "aguardando_retirada" | "notificado" | "retirado" | "devolvido"; received_at: string; notified_at?: string | null; withdrawn_at?: string | null; returned_at?: string | null; created_at: string }

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => "R$" + Math.round(v).toLocaleString("pt-BR");
const fmtBRLFull = (v: number) => "R$" + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtTime = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Nunito:wght@400;700;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;font-family:'Inter',sans-serif;background:var(--c-bg);color:var(--c-text);overflow:hidden}
/* ── Neumorphic design system for phone views ─────────────────────────── */
:root{
  --neu-bg:#EEEEF4;--neu-shadow-d:#c8cad4;--neu-shadow-l:#ffffff;
  --neu-purple:#7C5CFC;--neu-purple-2:#A855F7;
  --neu-text:#2e2850;--neu-text-2:rgba(100,90,150,0.5);
  --neu-out:5px 5px 12px var(--neu-shadow-d),-4px -4px 10px var(--neu-shadow-l);
  --neu-out-lg:8px 8px 18px var(--neu-shadow-d),-6px -6px 14px var(--neu-shadow-l);
  --neu-out-sm:3px 3px 7px var(--neu-shadow-d),-3px -3px 7px var(--neu-shadow-l);
  --neu-in:inset 3px 3px 7px var(--neu-shadow-d),inset -3px -3px 7px var(--neu-shadow-l);
  --neu-in-sm:inset 2px 2px 5px var(--neu-shadow-d),inset -2px -2px 4px var(--neu-shadow-l);
  --neu-grad:linear-gradient(135deg,#7C5CFC 0%,#A855F7 60%,#C084FC 100%);
}
:root{
  --bg:#070B12;--card-bg:rgba(255,255,255,.04);--card-border:rgba(255,255,255,.08);
  --grad:linear-gradient(135deg,#6366F1,#7C3AED,#A855F7);
  --grad-teal:linear-gradient(135deg,#0D9488,#14B8A6,#2DD4BF);
  --indigo:#6366F1;--violet:#7C3AED;--purple:#A855F7;
  --teal:#14B8A6;--red:#EF4444;--amber:#F59E0B;--green:#10B981;--blue:#3B82F6;--cyan:#06B6D4;
  --sidebar-w:220px;--ai-panel-w:340px;--topbar-h:52px;
  /* ── Theme tokens (updated via JS useEffect) ─────────────────── */
  --c-bg:#070B12;--c-bg2:#0D1526;
  --c-sidebar:rgba(8,12,20,.98);--c-topbar:rgba(7,11,18,.95);
  --c-topbar-border:rgba(255,255,255,.08);--c-panel:rgba(8,10,20,.98);
  --c-input:rgba(0,0,0,.3);--c-input-border:rgba(255,255,255,.1);
  --c-text:#E2E8F0;--c-text-muted:#94A3B8;--c-text-faint:#475569;
  --c-surface:rgba(255,255,255,.04);--c-surface2:rgba(255,255,255,.02);
  --c-divider:rgba(255,255,255,.05);--c-hover:rgba(255,255,255,.04);
  --c-sb-item:#94A3B8;--c-sb-item-hover:#E2E8F0;
  --c-scrollbar:rgba(255,255,255,.1);
}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--c-scrollbar);border-radius:2px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideLeft{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes bellShake{0%,100%{transform:rotate(0)}20%{transform:rotate(-15deg)}40%{transform:rotate(15deg)}60%{transform:rotate(-10deg)}80%{transform:rotate(10deg)}}
.topbar{position:fixed;top:0;left:0;right:0;z-index:1000;height:var(--topbar-h);background:var(--c-topbar);backdrop-filter:blur(12px);border-bottom:1px solid var(--c-topbar-border);display:flex;align-items:center;gap:12px;padding:0 16px}
.theme-toggle{padding:6px 10px;border-radius:8px;border:1px solid var(--c-topbar-border);background:transparent;cursor:pointer;font-size:15px;transition:all .2s;display:flex;align-items:center;gap:5px;font-family:inherit;color:var(--c-text-muted);font-size:12px;font-weight:500}
.theme-toggle:hover{background:var(--c-hover);color:var(--c-text)}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;letter-spacing:-.3px;margin-right:8px}
.view-btns{display:flex;gap:4px}
.view-btn{padding:5px 12px;border-radius:8px;border:1px solid var(--c-topbar-border);background:transparent;color:var(--c-text-muted);font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit}
.view-btn.active{background:var(--grad);border-color:transparent;color:#fff}
.view-btn:hover:not(.active){background:var(--c-hover);color:var(--c-text)}
.rt-badge{display:flex;align-items:center;gap:6px;margin-left:auto;padding:4px 10px;border-radius:20px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);font-size:11px;color:#10B981;font-weight:500}
.rt-badge .dot{width:7px;height:7px;border-radius:50%;background:#10B981}
.rt-badge .dot.pulse{animation:pulse 2s infinite}
.rt-badge.offline{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.2);color:#EF4444}
.rt-badge.offline .dot{background:#EF4444;animation:none}
.clock{font-size:12px;color:#64748B;font-variant-numeric:tabular-nums;margin-left:8px}
.view{display:none;height:calc(100vh - var(--topbar-h));margin-top:var(--topbar-h)}
.view.active{display:flex}
.sidebar{width:var(--sidebar-w);min-width:var(--sidebar-w);height:100%;background:var(--c-sidebar);border-right:1px solid var(--c-topbar-border);overflow-y:auto;padding:12px 0}
.sb-label{font-size:10px;font-weight:600;color:var(--c-text-faint);text-transform:uppercase;letter-spacing:.08em;padding:8px 16px 4px}
.sb-item{display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--c-sb-item);transition:all .15s;position:relative}
.sb-item:hover{color:var(--c-sb-item-hover);background:var(--c-hover)}
.sb-item.active{color:#fff;background:rgba(99,102,241,.12)}
.sb-item.active::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;background:var(--indigo);border-radius:0 2px 2px 0}
.sb-icon{font-size:15px;width:20px;text-align:center}
.sb-badge{margin-left:auto;padding:1px 7px;border-radius:10px;background:var(--red);color:#fff;font-size:10px;font-weight:600}
.sb-badge.blue{background:var(--blue)}
.main-area{flex:1;overflow-y:auto;padding:16px;background:var(--c-bg);color:var(--c-text)}
.kpi-row{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.kpi-card{flex:1;min-width:140px;padding:14px 16px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px}
.kpi-label{font-size:11px;color:#64748B;font-weight:500;margin-bottom:4px}
.kpi-value{font-size:22px;font-weight:700;line-height:1}
.kpi-sub{font-size:11px;color:#475569;margin-top:4px}
.panel{display:none;animation:fadeIn .2s ease}
.panel.active{display:block}
.card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px;margin-bottom:12px}
.card-title{font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.chat-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.chip{padding:5px 12px;border-radius:20px;border:1px solid var(--card-border);background:rgba(255,255,255,.04);color:#94A3B8;font-size:12px;cursor:pointer;transition:all .15s;font-family:inherit}
.chip:hover{background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.3);color:var(--indigo)}
.chat-area{height:340px;overflow-y:auto;padding:12px;background:rgba(0,0,0,.2);border:1px solid var(--card-border);border-radius:12px;display:flex;flex-direction:column;gap:10px;margin-bottom:10px}
.msg{display:flex;flex-direction:column;max-width:88%;animation:fadeIn .2s ease}
.msg.user{align-self:flex-end;align-items:flex-end}
.msg.ai{align-self:flex-start;align-items:flex-start}
.msg-bubble{padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.msg.ai .msg-bubble{background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.2);color:#C7D2FE}
.msg.user .msg-bubble{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#E2E8F0}
.msg-time{font-size:10px;color:#475569;margin-top:2px}
/* ── Gestor chat: theme-aware overrides ─────────────────────────────── */
.gestor-chat .chat-area{background:var(--c-input);border-color:var(--c-input-border)}
.gestor-chat .msg.ai .msg-bubble,.ai-panel .msg.ai .msg-bubble{color:var(--c-text);background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.25)}
.gestor-chat .msg.user .msg-bubble,.ai-panel .msg.user .msg-bubble{color:var(--c-text);background:var(--c-surface2);border-color:var(--c-input-border)}
.gestor-chat .msg-time,.ai-panel .msg-time{color:var(--c-text-faint)}
.chat-input-row{display:flex;gap:8px}
.chat-input{flex:1;padding:10px 14px;background:var(--c-input);border:1px solid var(--c-input-border);border-radius:10px;color:var(--c-text);font-size:13px;font-family:inherit;resize:none;transition:border-color .15s}
.chat-input:focus{outline:none;border-color:rgba(99,102,241,.5)}
.btn-send{padding:10px 16px;background:var(--grad);border:none;border-radius:10px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;transition:opacity .15s;font-family:inherit}
.btn-send:hover{opacity:.85}
.btn-send:disabled{opacity:.4;cursor:not-allowed}
.typing{display:flex;gap:4px;align-items:center;padding:10px 14px}
.typing-dot{width:7px;height:7px;border-radius:50%;background:var(--indigo);animation:blink 1.2s infinite}
.typing-dot:nth-child(2){animation-delay:.2s}
.typing-dot:nth-child(3){animation-delay:.4s}
.status-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
.badge-online{background:rgba(16,185,129,.1);color:#10B981;border:1px solid rgba(16,185,129,.2)}
.badge-offline{background:rgba(239,68,68,.1);color:#EF4444;border:1px solid rgba(239,68,68,.2)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--card-border)}
tbody td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:#CBD5E1}
tbody tr:hover td{background:rgba(255,255,255,.02)}
.pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
.pill-red{background:rgba(239,68,68,.15);color:#F87171;border:1px solid rgba(239,68,68,.2)}
.pill-amber{background:rgba(245,158,11,.15);color:#FCD34D;border:1px solid rgba(245,158,11,.2)}
.pill-green{background:rgba(16,185,129,.15);color:#34D399;border:1px solid rgba(16,185,129,.2)}
.pill-blue{background:rgba(59,130,246,.15);color:#93C5FD;border:1px solid rgba(59,130,246,.2)}
.pill-cyan{background:rgba(6,182,212,.15);color:#67E8F9;border:1px solid rgba(6,182,212,.2)}
.pill-purple{background:rgba(168,85,247,.15);color:#D8B4FE;border:1px solid rgba(168,85,247,.2)}
.pill-gray{background:rgba(100,116,139,.15);color:#94A3B8;border:1px solid rgba(100,116,139,.2)}
.btn{padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:all .15s}
.btn-primary{background:var(--grad);color:#fff}
.btn-primary:hover{opacity:.85}
.btn-primary:disabled{opacity:.4;cursor:not-allowed}
.btn-sm{padding:5px 10px;font-size:12px;border-radius:6px}
.btn-ghost{background:rgba(255,255,255,.06);color:#94A3B8;border:1px solid var(--card-border)}
.btn-ghost:hover{background:rgba(255,255,255,.1);color:#E2E8F0}
.btn-danger{background:rgba(239,68,68,.15);color:#F87171;border:1px solid rgba(239,68,68,.2)}
.btn-danger:hover{background:rgba(239,68,68,.25)}
.btn-success{background:rgba(16,185,129,.15);color:#34D399;border:1px solid rgba(16,185,129,.2)}
.btn-success:hover{background:rgba(16,185,129,.25)}
.form-group{margin-bottom:12px}
.form-label{font-size:12px;color:var(--c-text-faint);margin-bottom:4px;display:block;font-weight:500}
.form-control{width:100%;padding:8px 12px;background:var(--c-input);border:1px solid var(--c-input-border);border-radius:8px;color:var(--c-text);font-size:13px;font-family:inherit}
.form-control:focus{outline:none;border-color:rgba(99,102,241,.5)}
select.form-control option{background:var(--c-bg2)}
.sensor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.agua-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.agua-charts-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:768px){.agua-summary-grid{grid-template-columns:repeat(2,1fr)!important}.agua-charts-row{grid-template-columns:1fr!important}}
.sensor-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:16px;text-align:center}
.sensor-ring-wrap{position:relative;width:90px;height:90px;margin:0 auto 10px}
.sensor-ring-wrap svg{width:90px;height:90px;transform:rotate(-135deg)}
.ring-bg{fill:none;stroke:rgba(255,255,255,.06);stroke-width:8;stroke-linecap:round}
.ring-fg{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .5s ease,stroke .5s ease}
.ring-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:16px;font-weight:700;line-height:1}
.sensor-name{font-size:12px;font-weight:600;color:#CBD5E1;margin-bottom:2px}
.sensor-sub{font-size:11px;color:#475569}
.ai-panel{width:var(--ai-panel-w);min-width:var(--ai-panel-w);height:100%;background:var(--c-panel);border-left:1px solid var(--c-topbar-border);display:flex;flex-direction:column}
.ai-panel-header{padding:12px 14px;border-bottom:1px solid var(--card-border);display:flex;align-items:center;justify-content:space-between}
.ctx-pills{display:flex;flex-wrap:wrap;gap:4px;padding:8px 14px;border-bottom:1px solid var(--card-border)}
.ctx-pill{font-size:10px;padding:2px 7px;border-radius:8px;font-weight:500;background:rgba(99,102,241,.1);color:#A5B4FC;border:1px solid rgba(99,102,241,.2)}
.ai-panel-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.ai-panel-input{padding:10px;border-top:1px solid var(--card-border)}
.ai-panel-input textarea{width:100%;padding:8px 10px;background:var(--c-input);border:1px solid var(--c-input-border);border-radius:8px;color:var(--c-text);font-size:12px;font-family:inherit;resize:none;height:60px}
.ai-panel-input textarea:focus{outline:none;border-color:rgba(99,102,241,.5)}
.log-wrap{height:380px;overflow-y:auto;padding:10px;font-family:'Courier New',monospace;font-size:11px;background:rgba(0,0,0,.4);border-radius:8px;border:1px solid var(--card-border)}
.log-entry{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.03);color:#64748B}
.log-time{color:#334155;margin-right:8px}
.fin-kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.fin-kpi{background:rgba(255,255,255,.04);border:1px solid var(--card-border);border-radius:10px;padding:12px;text-align:center}
.fin-kpi-label{font-size:10px;color:#64748B;margin-bottom:4px}
.fin-kpi-val{font-size:16px;font-weight:700}
.misp-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:14px;margin-bottom:8px}
.com-preview{background:rgba(255,255,255,.04);border:1px solid var(--card-border);border-radius:10px;padding:12px;margin-bottom:8px}
.com-titulo{font-size:13px;font-weight:600;margin-bottom:4px}
.com-corpo{font-size:12px;color:#64748B;line-height:1.5}
.com-meta{font-size:10px;color:#334155;margin-top:6px;display:flex;gap:8px}
.os-form{display:none;background:rgba(0,0,0,.2);border:1px solid var(--card-border);border-radius:12px;padding:14px;margin-bottom:14px}
.os-form.open{display:block;animation:fadeIn .2s ease}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.toast-container{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px}
/* ═══════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ════════════════════════════════════════════════════════════════ */
.login-root{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 30% 20%,rgba(99,102,241,.18) 0%,transparent 55%),radial-gradient(ellipse at 75% 80%,rgba(168,85,247,.14) 0%,transparent 50%),#070B12;font-family:'Inter',sans-serif;padding:20px}
.login-card{width:100%;max-width:400px;display:flex;flex-direction:column;gap:0;animation:fadeIn .35s ease}
.login-logo-row{display:flex;align-items:center;gap:12px;margin-bottom:28px}
.login-logo-icon{width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#6366F1,#7C3AED,#A855F7);display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 8px 24px rgba(99,102,241,.4)}
.login-logo-text{display:flex;flex-direction:column}
.login-logo-title{font-size:22px;font-weight:800;letter-spacing:-.5px;background:linear-gradient(135deg,#A5B4FC,#C4B5FD);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.login-logo-sub{font-size:10px;font-weight:600;letter-spacing:.18em;color:#4B5563;text-transform:uppercase;margin-top:1px}
.login-welcome{margin-bottom:28px}
.login-welcome-h{font-size:28px;font-weight:800;color:#F1F5F9;letter-spacing:-.5px;margin-bottom:4px}
.login-welcome-sub{font-size:14px;color:#64748B}
.login-tabs{display:flex;gap:0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:4px;margin-bottom:24px}
.login-tab{flex:1;padding:9px 8px;border-radius:10px;border:none;background:transparent;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;color:#64748B;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap}
.login-tab.active{background:linear-gradient(135deg,#6366F1,#7C3AED);color:#fff;box-shadow:0 4px 12px rgba(99,102,241,.35)}
.login-tab:hover:not(.active){color:#94A3B8;background:rgba(255,255,255,.04)}
.login-form-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:20px;margin-bottom:16px}
.login-field{margin-bottom:16px}
.login-field:last-child{margin-bottom:0}
.login-field-label{font-size:10px;font-weight:700;letter-spacing:.1em;color:#475569;text-transform:uppercase;margin-bottom:8px;display:block}
.login-input-wrap{position:relative;display:flex;align-items:center}
.login-input-icon{position:absolute;left:14px;font-size:15px;pointer-events:none}
.login-input{width:100%;padding:13px 14px 13px 42px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#E2E8F0;font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:border-color .2s;box-sizing:border-box}
.login-input:focus{border-color:rgba(99,102,241,.6);background:rgba(99,102,241,.06)}
.login-input::placeholder{color:#334155}
.login-eye{position:absolute;right:14px;background:none;border:none;color:#475569;cursor:pointer;padding:0;font-size:16px;display:flex;align-items:center;transition:color .15s}
.login-eye:hover{color:#94A3B8}
.login-forgot{text-align:right;margin-top:10px;margin-bottom:0}
.login-forgot a{font-size:12px;color:#6366F1;text-decoration:none;cursor:pointer;font-weight:500}
.login-forgot a:hover{color:#818CF8}
.login-btn{width:100%;padding:15px;border:none;border-radius:14px;background:linear-gradient(135deg,#6366F1,#7C3AED,#A855F7);color:#fff;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;transition:all .2s;box-shadow:0 6px 20px rgba(99,102,241,.4);margin-bottom:24px;letter-spacing:-.1px}
.login-btn:hover{opacity:.9;box-shadow:0 8px 28px rgba(99,102,241,.5);transform:translateY(-1px)}
.login-btn:active{transform:translateY(0)}
.login-divider{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.login-divider-line{flex:1;height:1px;background:rgba(255,255,255,.07)}
.login-divider-text{font-size:10px;font-weight:600;letter-spacing:.1em;color:#334155;text-transform:uppercase}
.login-quick{display:flex;justify-content:center;gap:36px;margin-bottom:28px}
.login-quick-btn{display:flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;background:none;border:none;font-family:'Inter',sans-serif;transition:transform .15s}
.login-quick-btn:hover{transform:translateY(-2px)}
.login-quick-icon{width:68px;height:68px;border-radius:50%;background:#060e1c;border:1.5px solid rgba(56,189,248,.35);display:flex;align-items:center;justify-content:center;transition:all .25s;box-shadow:0 0 14px rgba(56,189,248,.08) inset}
.login-quick-icon.faceid{border-radius:16px}
.login-quick-btn:hover .login-quick-icon{background:#081628;border-color:rgba(56,189,248,.65);box-shadow:0 0 20px rgba(56,189,248,.18) inset,0 4px 20px rgba(56,189,248,.12)}
.login-quick-label{font-size:9.5px;font-weight:600;letter-spacing:.12em;color:#4A6080;text-transform:uppercase}
.login-footer-link{text-align:center;margin-bottom:16px;font-size:13px;color:#475569}
.login-footer-link a{color:#6366F1;text-decoration:none;font-weight:600;cursor:pointer}
.login-footer-link a:hover{color:#818CF8}
.login-version{text-align:center;font-size:11px;color:#1E293B}
.toast{padding:10px 16px;border-radius:10px;background:#1E293B;border:1px solid var(--card-border);color:#E2E8F0;font-size:13px;max-width:320px;animation:slideIn .2s ease;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.toast.success{border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.1);color:#34D399}
.toast.error{border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:#F87171}
.toast.info{border-color:rgba(99,102,241,.3);background:rgba(99,102,241,.1);color:#A5B4FC}
.toast.warn{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.1);color:#FCD34D}
.phone-frame{width:375px;border-radius:52px;background:var(--neu-bg);box-shadow:14px 14px 32px #b0b2c0,-10px -10px 26px #ffffff,0 0 0 1.5px rgba(200,202,212,.6);position:relative;overflow:hidden;height:780px}
.phone-inner{background:var(--neu-bg);height:100%;border-radius:52px;overflow:hidden;display:flex;flex-direction:column;position:relative;font-family:'Nunito',sans-serif}
.phone-notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:110px;height:28px;background:var(--neu-bg);border-radius:0 0 18px 18px;z-index:100;box-shadow:0 4px 8px rgba(200,202,212,.4)}
.phone-status{height:44px;display:flex;align-items:center;padding:0 24px;justify-content:space-between;font-size:12px;font-weight:800;padding-top:6px;position:relative;z-index:10;color:var(--neu-text)}
.phone-content{flex:1;overflow-y:auto;overflow-x:hidden;background:var(--neu-bg)}
.phone-bottom-nav{height:68px;background:var(--neu-bg);border-top:1px solid #d4d6e0;box-shadow:0 -3px 12px rgba(124,92,252,.06);display:flex;align-items:center;justify-content:space-around;padding:0 6px;flex-shrink:0;position:relative;z-index:300}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--neu-text-2);cursor:pointer;flex:1;padding:6px 4px;transition:all .2s;border-radius:12px}
.nav-item.active{color:var(--neu-purple);background:var(--neu-bg);box-shadow:var(--neu-in)}
.nav-fab{width:56px;height:56px;border-radius:50%;background:var(--neu-grad);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:6px 8px 20px rgba(124,92,252,.45),-2px -2px 8px rgba(255,255,255,.7);margin-top:-14px;flex-shrink:0;transition:transform .15s}
.nav-fab:hover{transform:scale(1.06)}
/* ── Phone header (neumorphic) ──────────────────────────────────────── */
.phone-header{padding:0;display:flex;flex-direction:column;flex-shrink:0;background:var(--neu-bg)}
.ph-topbar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px 8px}
.ph-logo-row{display:flex;align-items:center;gap:9px}
.ph-logo-icon{width:34px;height:34px;border-radius:10px;background:var(--neu-grad);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;letter-spacing:-.5px;box-shadow:var(--neu-out-sm)}
.ph-brand-name{font-size:15px;font-weight:900;color:var(--neu-text)}
.ph-brand-name span{font-size:11px;color:var(--neu-text-2);font-weight:700}
.ph-topbar-btns{display:flex;align-items:center;gap:8px}
.ph-btn-neu{width:34px;height:34px;border-radius:10px;background:var(--neu-bg);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:var(--neu-out-sm);transition:box-shadow .2s;color:var(--neu-text-2);position:relative}
.ph-btn-neu:hover{box-shadow:var(--neu-in-sm)}
.ph-bell-dot{position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:#EF4444;border:1.5px solid var(--neu-bg)}
.ph-greeting-section{padding:8px 16px 14px;display:flex;align-items:flex-start;justify-content:space-between}
.ph-greet-wrap{flex:1;min-width:0}
.ph-greet-time{font-size:11px;color:var(--neu-text-2);margin-bottom:3px;font-weight:700}
.ph-greet-name{font-size:22px;font-weight:900;line-height:1.1;margin-bottom:6px;color:var(--neu-text)}
.badge-role{display:inline-flex;align-items:center;gap:4px;background:var(--neu-grad);border-radius:8px;padding:3px 10px;font-size:10px;font-weight:900;color:#fff;letter-spacing:.05em;text-transform:uppercase;box-shadow:3px 3px 8px rgba(124,92,252,.35);margin-bottom:5px}
.ph-greet-condo{font-size:11px;color:var(--neu-text-2);font-weight:600;margin-top:2px}
.ph-av-lg{width:50px;height:50px;border-radius:15px;background:var(--neu-grad);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;flex-shrink:0;box-shadow:var(--neu-out);cursor:pointer}
.ph-av-lg.teal{background:linear-gradient(135deg,#0D9488,#14B8A6)}
/* bell-shake and old helpers kept for compat */
.ph-bell-btn.bell-shake{animation:bellShake .4s ease}
.bell-shake{animation:bellShake .4s ease}
.bell-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#EF4444;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--neu-bg);padding:0 3px}
/* ── Cards ──────────────────────────────────────────────────────────── */
.ph-card{margin:0 14px 12px;padding:16px;background:var(--neu-bg);border-radius:18px;box-shadow:var(--neu-out)}
.ph-card.grad-card{background:var(--neu-grad);box-shadow:6px 8px 20px rgba(124,92,252,.45),-2px -2px 8px rgba(255,255,255,.7);cursor:pointer;border:none}
.ph-card.grad-card-teal{background:linear-gradient(135deg,#0D9488,#14B8A6,#2DD4BF);box-shadow:6px 8px 20px rgba(20,184,166,.35),-2px -2px 8px rgba(255,255,255,.6);border:none}
.ph-card.critical{background:var(--neu-bg);box-shadow:var(--neu-in);position:relative;overflow:hidden}
.ph-card.critical::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3.5px;background:linear-gradient(180deg,#FF5A3C,#FF8A70);border-radius:18px 0 0 18px}
/* ── Module grid cards ──────────────────────────────────────────────── */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 14px;margin-bottom:12px}
.module-card{background:var(--neu-bg);border-radius:18px;padding:16px 14px;cursor:pointer;transition:box-shadow .2s;box-shadow:var(--neu-out);position:relative}
.module-card:active{box-shadow:var(--neu-in)}
.module-card-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:10px;box-shadow:var(--neu-out-sm);background:var(--neu-bg)}
.module-card-title{font-size:13px;font-weight:800;color:var(--neu-text);margin-bottom:6px}
.module-card-sub{display:inline-block;font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;box-shadow:var(--neu-out-sm);background:var(--neu-bg);color:var(--neu-text-2)}
.module-card-val{font-size:16px;font-weight:900;margin-top:4px}
/* ── Subscreen ──────────────────────────────────────────────────────── */
.ph-subscreen{position:absolute;top:0;left:0;right:0;bottom:68px;background:var(--neu-bg);z-index:200;display:flex;flex-direction:column;overflow:hidden;animation:slideLeft .2s ease}
.ph-subscreen.hidden{display:none}
.ph-sub-header{padding:16px 16px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #d4d6e0;flex-shrink:0;background:var(--neu-bg)}
.back-btn{width:34px;height:34px;border-radius:11px;background:var(--neu-bg);border:none;color:var(--neu-text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:var(--neu-out-sm);transition:box-shadow .15s}
.back-btn:hover{box-shadow:var(--neu-in-sm)}
.ph-sub-title{font-size:15px;font-weight:800;flex:1;color:var(--neu-text)}
.ph-sub-body{flex:1;overflow-y:auto;padding:14px;background:var(--neu-bg)}
.ph-sub-footer{padding:10px 12px;border-top:1px solid #d4d6e0;flex-shrink:0;background:var(--neu-bg)}
/* ── List items ─────────────────────────────────────────────────────── */
.ph-os-item{background:var(--neu-bg);border-radius:14px;box-shadow:var(--neu-out);padding:14px;margin-bottom:10px}
.ph-os-titulo{font-size:13px;font-weight:800;margin-bottom:4px;color:var(--neu-text)}
.ph-os-meta{font-size:11px;color:var(--neu-text-2);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ph-log-entry{padding:6px 0;border-bottom:1px solid #d4d6e0;font-size:11px;color:var(--neu-text)}
.ph-log-time{color:var(--neu-text-2);font-size:10px}
.ph-fin-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #d4d6e0}
.ph-fin-label{font-size:12px;color:var(--neu-text);font-weight:700}
.ph-fin-sub{font-size:10px;color:var(--neu-text-2)}
.ph-fin-val{font-size:13px;font-weight:800;color:var(--neu-text)}
.services-list{padding:0 14px;margin-bottom:12px}
.service-item{display:flex;align-items:center;gap:12px;padding:13px 14px;background:var(--neu-bg);border-radius:14px;box-shadow:var(--neu-out);margin-bottom:8px;cursor:pointer;transition:box-shadow .2s}
.service-item:hover{box-shadow:var(--neu-in)}
.svc-icon{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:var(--neu-out-sm);background:var(--neu-bg)}
.svc-name{flex:1;font-size:13px;font-weight:700;color:var(--neu-text)}
.svc-count{padding:3px 9px;border-radius:9px;font-size:11px;font-weight:800;box-shadow:var(--neu-out-sm);background:var(--neu-bg);color:var(--neu-purple)}
.morador-nav .nav-item.active{color:var(--neu-purple)}
.morador-nav .nav-fab{background:var(--neu-grad);box-shadow:6px 8px 20px rgba(124,92,252,.45),-2px -2px 8px rgba(255,255,255,.7)}
.sec-header{display:flex;align-items:center;justify-content:space-between;padding:0 14px;margin-bottom:10px}
.sec-title{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--neu-text-2)}
.sec-link{font-size:12px;font-weight:800;color:var(--neu-purple);cursor:pointer}
textarea.fc{width:100%;padding:8px 12px;background:rgba(0,0,0,.3);border:1px solid var(--card-border);border-radius:8px;color:#E2E8F0;font-size:13px;font-family:inherit;resize:none}
textarea.fc:focus{outline:none;border-color:rgba(99,102,241,.5)}
.meter-neu{height:5px;border-radius:3px;background:var(--neu-bg);box-shadow:var(--neu-in-sm);overflow:hidden}.meter-neu-fill{height:100%;border-radius:3px;background:var(--neu-grad)}
/* ── Subscreen neumorphic neutralizer ────────────────────────────────────── */
.ph-subscreen{color:var(--neu-text)}
.ph-sub-body,.ph-sub-body *{font-family:'Nunito',sans-serif}
/* Recharts inside phone views */
.ph-subscreen .recharts-cartesian-grid-horizontal line,.ph-subscreen .recharts-cartesian-grid-vertical line{stroke:#d4d6e0 !important}
.ph-subscreen .recharts-tooltip-wrapper .recharts-default-tooltip{background:var(--neu-bg) !important;border:1px solid #d4d6e0 !important;color:var(--neu-text) !important;box-shadow:var(--neu-out) !important}
/* Textarea and inputs inside subscreens */
.ph-subscreen textarea,.ph-subscreen input{background:var(--neu-bg) !important;border:1px solid #d4d6e0 !important;color:var(--neu-text) !important;box-shadow:var(--neu-in-sm) !important}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:10px}
.cal-day{text-align:center;padding:6px 2px;border-radius:8px;font-size:12px;cursor:pointer;transition:all .15s}
.cal-day.avail{background:rgba(16,185,129,.12);color:#34D399;border:1px solid rgba(16,185,129,.2)}
.cal-day.avail:hover{background:rgba(16,185,129,.25)}
.cal-day.today{background:rgba(99,102,241,.2);color:#A5B4FC;border:1px solid rgba(99,102,241,.3);font-weight:700}
.cal-day.taken{color:#334155;cursor:default}
.cal-day-hdr{text-align:center;font-size:10px;color:#475569;font-weight:600;padding:4px}
.cal-sel{margin-top:12px;padding:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);border-radius:10px;font-size:12px;color:#34D399}
.sensor-ring-sm{position:relative;width:70px;height:70px;margin:0 auto 6px}
.sensor-ring-sm svg{width:70px;height:70px;transform:rotate(-135deg)}
.sensor-ring-sm .ring-label{font-size:13px}
.avg-ring-wrap{position:relative;width:120px;height:120px;margin:0 auto 10px}
.avg-ring-wrap svg{width:120px;height:120px;transform:rotate(-135deg)}
.avg-ring-wrap .ring-label{font-size:22px}
.ob-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;background:radial-gradient(ellipse at 20% 50%,rgba(99,102,241,.12) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,rgba(168,85,247,.08) 0%,transparent 50%),var(--bg)}
.ob-card{width:100%;max-width:680px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:24px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.6)}
.ob-hero{background:var(--grad);padding:40px 40px 32px;text-align:center;position:relative;overflow:hidden}
.ob-hero::before{content:'';position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")}
.ob-hero-logo{font-size:48px;margin-bottom:12px;position:relative}
.ob-hero-title{font-size:26px;font-weight:800;color:#fff;margin-bottom:6px;position:relative}
.ob-hero-sub{font-size:14px;color:rgba(255,255,255,.75);position:relative}
.ob-stepper{display:flex;align-items:flex-start;justify-content:center;padding:18px 20px 14px;border-bottom:1px solid var(--card-border);overflow-x:auto;gap:0}
.ob-stepper-item{display:flex;flex-direction:column;align-items:center;position:relative;flex:1;min-width:48px}
.ob-stepper-dot{width:30px;height:30px;border-radius:50%;border:2px solid #334155;background:rgba(30,41,59,.8);color:#475569;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;flex-shrink:0;position:relative;z-index:1}
.ob-stepper-dot.active{border-color:#6366F1;background:rgba(99,102,241,.25);color:#A5B4FC;box-shadow:0 0 0 4px rgba(99,102,241,.12)}
.ob-stepper-dot.done{border-color:#10B981;background:rgba(16,185,129,.2);color:#10B981}
.ob-stepper-label{font-size:10px;font-weight:500;color:#334155;margin-top:5px;text-align:center;white-space:nowrap}
.ob-stepper-label.active{color:#A5B4FC}
.ob-stepper-label.done{color:#10B981}
.ob-stepper-line{position:absolute;top:15px;left:calc(50% + 18px);right:calc(-50% + 18px);height:2px;background:#1E293B;z-index:0}
.ob-stepper-line.done{background:#10B981}
.ob-body{padding:28px 36px}
.ob-footer{padding:18px 36px;border-top:1px solid var(--card-border);display:flex;align-items:center;justify-content:space-between}
.btn-ob-back{padding:10px 20px;border-radius:10px;border:1px solid var(--card-border);background:transparent;color:#64748B;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
.btn-ob-back:hover{background:rgba(255,255,255,.06);color:#E2E8F0}
.btn-ob-next{padding:10px 24px;border-radius:10px;background:var(--grad);border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s}
.btn-ob-next:hover{opacity:.85}
.btn-ob-next:disabled{opacity:.4;cursor:not-allowed}
.btn-ativar{width:100%;padding:18px;border-radius:16px;background:var(--grad);border:none;color:#fff;font-size:18px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:-.3px;box-shadow:0 8px 32px rgba(99,102,241,.4);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:10px}
.btn-ativar:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(99,102,241,.6)}
.btn-ativar:active{transform:translateY(0)}
.btn-ativar:disabled{opacity:.5;cursor:not-allowed;transform:none}
.ob-sensor-row{display:grid;grid-template-columns:1fr 1fr 1fr 80px 70px;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.ob-sensor-hdr{font-size:10px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.ob-confirm-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.ob-confirm-label{font-size:13px;color:#64748B}
.ob-confirm-val{font-size:13px;font-weight:600}
.ob-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.2);color:#A5B4FC}
.ob-progress{height:3px;background:var(--card-border);border-radius:2px;margin:0 36px 0;overflow:hidden}
.ob-progress-bar{height:100%;background:var(--grad);border-radius:2px;transition:width .4s cubic-bezier(.4,0,.2,1)}
@keyframes spin{to{transform:rotate(360deg)}}
.topbar-sep{width:1px;height:20px;background:var(--card-border);margin:0 4px}
.btn-reconfig{padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#F87171;font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit;display:flex;align-items:center;gap:5px}
.btn-reconfig:hover{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4)}
.btn-onboard{padding:5px 12px;border-radius:8px;border:1px solid rgba(99,102,241,.3);background:rgba(99,102,241,.12);color:#A5B4FC;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;animation:pulse 2s infinite}
.btn-onboard:hover{background:rgba(99,102,241,.25);animation:none}
`;


// ─── Sensor Ring ──────────────────────────────────────────────────────────────
function SensorRing({ sensor, small = false }: { sensor: Sensor; small?: boolean }) {
  const pct = Math.min(100, Math.max(0, Number(sensor.nivel_atual) || 0));
  const color = pct >= 60 ? "#10B981" : pct >= 30 ? "#F59E0B" : "#EF4444";
  const R = small ? 26 : 36;
  const C = 2 * Math.PI * R;
  const arc = C * 0.75;
  const filled = arc * (pct / 100);
  const gap = arc - filled;
  const size = small ? 70 : 90;
  return (
    <div className="sensor-card">
      <div className={small ? "sensor-ring-sm" : "sensor-ring-wrap"}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          <circle className="ring-bg" cx={size / 2} cy={size / 2} r={R} strokeDasharray={`${arc} ${C - arc}`} />
          <circle className="ring-fg" cx={size / 2} cy={size / 2} r={R} stroke={color}
            strokeDasharray={`${filled} ${gap + (C - arc)}`} />
        </svg>
        <div className="ring-label" style={{ color }}>{pct}%</div>
      </div>
      <div className="sensor-name" style={{ fontSize: small ? 10 : 12 }}>{sensor.nome || sensor.sensor_id}</div>
      <div className="sensor-sub" style={{ fontSize: 10 }}>{sensor.local}</div>
      {!small && <div className="sensor-sub" style={{ marginTop: 2, color: "#334155", fontSize: 10 }}>
        {Number(sensor.volume_litros || 0).toFixed(0)}L / {Number(sensor.capacidade_litros || 0)}L
      </div>}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg ai">
      <div className="msg-bubble typing">
        <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// ─── Manutenção – Dados Demo ───────────────────────────────────────────────────
interface Equipamento {
  id: string; nome: string; categoria: string; catIcon: string; local: string;
  fabricante: string; modelo: string; serie: string; dataInstalacao: string;
  vidaUtilAnos: number; instaladoHa: number; consumoKwh: number; horasDia: number;
  status: "operacional" | "atencao" | "manutencao" | "inativo";
  proxManutencao: string; ultimaManutencao: string; custoManutencao: number;
  descricao: string; fornecedor_id?: string; quantidade: number;
}
const RES_DEMO: Reservatorio[] = [
  { id:"res-1", sensor_id:"sensor_agua", nome:"Caixa Principal", local:"Bloco A – Cobertura", capacidade_litros:15000, altura_cm:200, mac_address:"F8:83:87:90:9F:78", cf_url:"https://imobcore1.fmsilvestri39.workers.dev", wh_url:"https://imob-core-mobile-12.replit.app/api/webhook", protocolo:"HTTPS POST", porta:443, cf_online:true, wh_online:true, created_at:new Date().toISOString() },
  { id:"res-2", sensor_id:"sensor_cisterna", nome:"Cisterna Principal", local:"Subsolo", capacidade_litros:50000, altura_cm:200, mac_address:"", cf_url:"https://imobcore1.fmsilvestri39.workers.dev", wh_url:"https://imob-core-mobile-12.replit.app/api/webhook", protocolo:"HTTPS POST", porta:443, cf_online:true, wh_online:true, created_at:new Date().toISOString() },
];

const ENC_DEMO: Encomenda[] = [
  { id:"enc-1", condominio_id:"87339066-db1e-4743-a152-095527e66c28", morador_nome:"Dirce", bloco:"Bloco C", unidade:"107", tipos:["pacote","correio"], codigo_rastreio:"43456465", status:"retirado", received_at:"2026-02-26T12:29:00Z", notified_at:"2026-02-26T13:00:00Z", withdrawn_at:"2026-02-27T10:00:00Z", created_at:"2026-02-26T12:29:00Z" },
  { id:"enc-2", condominio_id:"87339066-db1e-4743-a152-095527e66c28", morador_nome:"marcos", bloco:"Bloco C", unidade:"201", tipos:["pacote","correio"], codigo_rastreio:null, status:"retirado", received_at:"2026-02-21T17:02:00Z", notified_at:"2026-02-21T18:00:00Z", withdrawn_at:"2026-02-22T09:00:00Z", created_at:"2026-02-21T17:02:00Z" },
  { id:"enc-3", condominio_id:"87339066-db1e-4743-a152-095527e66c28", morador_nome:"fabio", bloco:"Bloco A", unidade:"101A", tipos:["pacote","correio"], codigo_rastreio:"1", status:"aguardando_retirada", received_at:"2026-02-21T16:06:00Z", notified_at:null, withdrawn_at:null, created_at:"2026-02-21T16:06:00Z" },
  { id:"enc-4", condominio_id:"87339066-db1e-4743-a152-095527e66c28", morador_nome:"Ana Beatriz", bloco:"Bloco B", unidade:"302", tipos:["correio"], codigo_rastreio:"BR123456789", status:"notificado", received_at:"2026-03-01T09:00:00Z", notified_at:"2026-03-01T09:30:00Z", withdrawn_at:null, created_at:"2026-03-01T09:00:00Z" },
  { id:"enc-5", condominio_id:"87339066-db1e-4743-a152-095527e66c28", morador_nome:"Carlos", bloco:"Bloco D", unidade:"501", tipos:["pacote","documento"], codigo_rastreio:"JD987654321", status:"devolvido", received_at:"2026-02-18T14:00:00Z", notified_at:"2026-02-18T14:30:00Z", withdrawn_at:null, returned_at:"2026-02-25T10:00:00Z", created_at:"2026-02-18T14:00:00Z" },
];

// ─── Perfis de Usuário ────────────────────────────────────────────────────────
type PerfilKey = "gestor" | "sindico" | "morador" | "zelador";
interface PerfilConfig { cor: string; label: string; icon: string; modulos: string[] }
const PERFIS_CONFIG: Record<PerfilKey, PerfilConfig> = {
  gestor: {
    cor: "#7C3CFC", icon: "⚡", label: "Gestor Sistema",
    modulos: ["chatIA","insights","comunicados","ordens","financeiro","agua","misp","diagnostico","crm","manutencao","energia","gas","encomendas","fornecedores","condominios","usuarios","sseLiveLog"],
  },
  sindico: {
    cor: "#2563EB", icon: "🛡️", label: "Síndico",
    modulos: ["chatIA","insights","comunicados","ordens","financeiro","agua","misp","diagnostico","crm","manutencao","energia","gas","encomendas","fornecedores"],
  },
  morador: {
    cor: "#059669", icon: "🏠", label: "Morador",
    modulos: ["comunicados","ordens","encomendas"],
  },
  zelador: {
    cor: "#D97706", icon: "🔧", label: "Zelador",
    modulos: ["ordens","manutencao","agua","energia","gas","encomendas"],
  },
};

// ─── MISP Checklist Items ──────────────────────────────────────────────────────
const MISP_ITEMS: { id:string; pilar:string; nome:string; desc:string; peso:number }[] = [
  // FINANCEIRO
  { id:"f1", pilar:"Financeiro", nome:"Inadimplência < 5%", desc:"Taxa de inadimplência abaixo de 5% do total de condôminos", peso:4 },
  { id:"f2", pilar:"Financeiro", nome:"Fundo de reserva ≥ 35%", desc:"Fundo de reserva equivalente a 35% do orçamento anual", peso:3 },
  { id:"f3", pilar:"Financeiro", nome:"Previsão orçamentária divulgada", desc:"Previsão orçamentária aprovada em assembleia e publicada", peso:3 },
  { id:"f4", pilar:"Financeiro", nome:"Balanço mensal publicado", desc:"Balanço mensal sem pendências divulgado no prazo", peso:3 },
  { id:"f5", pilar:"Financeiro", nome:"Conciliação bancária em dia", desc:"Conciliação bancária realizada corretamente todo mês", peso:3 },
  { id:"f6", pilar:"Financeiro", nome:"Monitoramento consumo mensal", desc:"Consumo de energia e água monitorado mensalmente", peso:3 },
  { id:"f7", pilar:"Financeiro", nome:"Seguro predial vigente", desc:"Seguro predial contratado, vigente e renovado", peso:2 },
  { id:"f8", pilar:"Financeiro", nome:"Contratos formalizados", desc:"Contratos de fornecedores formalmente assinados", peso:2 },
  // SEGURANÇA
  { id:"s1", pilar:"Segurança", nome:"CFTV 100% funcionando", desc:"Sistema CFTV com todas as câmeras operacionais", peso:1 },
  { id:"s2", pilar:"Segurança", nome:"Controle de acesso ativo", desc:"Controle de acesso (portaria remota ou presencial) ativo", peso:4 },
  { id:"s3", pilar:"Segurança", nome:"Comunicação emergência configurada", desc:"App/portal/mural com canais de emergência configurados", peso:3 },
  { id:"s4", pilar:"Segurança", nome:"Comunicados regulares", desc:"Comunicados enviados mensalmente aos condôminos", peso:2 },
  { id:"s5", pilar:"Segurança", nome:"Extintores em validade (30 dias)", desc:"Extintores com recarga e validade dentro de 30 dias", peso:2 },
  { id:"s6", pilar:"Segurança", nome:"Hidrante em conformidade", desc:"Hidrante com laudo e pressão dentro das normas ABNT", peso:4 },
  { id:"s7", pilar:"Segurança", nome:"AVCB vigente", desc:"Auto de Vistoria do Corpo de Bombeiros vigente e atualizado", peso:3 },
  { id:"s8", pilar:"Segurança", nome:"Regimento interno divulgado", desc:"Regimento interno publicado e acessível a todos os moradores", peso:2 },
  { id:"s9", pilar:"Segurança", nome:"CONPAJ ativo e regular", desc:"CONPAJ (contribuição para Bombeiros) ativo e em dia", peso:3 },
  // MANUTENÇÃO
  { id:"m1", pilar:"Manutenção", nome:"Sistema de OS ativo", desc:"Sistema de Ordem de Serviço em uso pela gestão do condomínio", peso:3 },
  { id:"m2", pilar:"Manutenção", nome:"MTT Urgentes < 48h", desc:"Manutenções urgentes atendidas em menos de 48 horas", peso:4 },
  { id:"m3", pilar:"Manutenção", nome:"Preventiva implementada", desc:"Plano de manutenção preventiva ativo e em andamento", peso:3 },
  { id:"m4", pilar:"Manutenção", nome:"Histórico de manutenção registrado", desc:"Dados histórico de manutenção registrados digitalmente", peso:2 },
  { id:"m5", pilar:"Manutenção", nome:"Certidões negativas atualizadas", desc:"Certidões negativas (Trabalhista/Fiscal/Previdenciária) em dia", peso:3 },
  { id:"m6", pilar:"Manutenção", nome:"Gestão digital implantada", desc:"Sistema de gestão digital com dados em backup e histórico", peso:3 },
  // INFRAESTRUTURA
  { id:"i1", pilar:"Infraestrutura", nome:"Elevadores – preventiva em dia", desc:"Elevadores com manutenção preventiva obrigatória em dia", peso:5 },
  { id:"i2", pilar:"Infraestrutura", nome:"Hidráulicos sem vazamentos", desc:"Sistema hidráulico sem vazamentos identificados e registrados", peso:4 },
  { id:"i3", pilar:"Infraestrutura", nome:"SPDA (para-raios) com laudo", desc:"Para-raios com laudo técnico vigente conforme NR-10", peso:3 },
  { id:"i4", pilar:"Infraestrutura", nome:"GLP com laudo vigente", desc:"Instalação de gás com laudo de inspeção vigente (NR-12)", peso:4 },
  { id:"i5", pilar:"Infraestrutura", nome:"Cobertura impermeabilizada", desc:"Cobertura/telhado com impermeabilização vigente e sem infiltração", peso:3 },
  // SUSTENTABILIDADE
  { id:"su1", pilar:"Sustentabilidade", nome:"Medidores individuais de água", desc:"Hidrômetros individuais por unidade instalados e funcionando", peso:3 },
  { id:"su2", pilar:"Sustentabilidade", nome:"Gerador testado mensalmente", desc:"Gerador testado mensalmente com laudo registrado", peso:4 },
  { id:"su3", pilar:"Sustentabilidade", nome:"Coleta seletiva implantada", desc:"Coleta seletiva com descarte correto em funcionamento", peso:3 },
  // GESTÃO E GOVERNANÇA
  { id:"g1", pilar:"Gestão", nome:"App/portal ativo e atualizado", desc:"App ou portal do condômino ativo e com conteúdo atualizado", peso:3 },
  { id:"g2", pilar:"Gestão", nome:"Comunicados regulares periódicos", desc:"Comunicados enviados regularmente com conteúdo relevante", peso:2 },
  { id:"g3", pilar:"Gestão", nome:"Assembleia realizada regularmente", desc:"Assembleias realizadas conforme regulamento (mínimo anual)", peso:3 },
  { id:"g4", pilar:"Gestão", nome:"Sistema digital completo", desc:"Sistema de gestão digital com dados completos e atualizados", peso:3 },
  { id:"g5", pilar:"Gestão", nome:"Dados em backup digital", desc:"Dados históricos do condomínio em backup digital seguro", peso:2 },
  { id:"g6", pilar:"Gestão", nome:"Iluminação LED nas áreas comuns", desc:"Iluminação LED implantada em todas as áreas comuns", peso:2 },
];
const MISP_PILARES = ["Financeiro","Segurança","Manutenção","Infraestrutura","Sustentabilidade","Gestão"];
const MISP_PILAR_ICONS: Record<string,string> = { "Financeiro":"💰","Segurança":"🔒","Manutenção":"🔧","Infraestrutura":"🏗️","Sustentabilidade":"🌱","Gestão":"📊" };
const MISP_PILAR_COLORS: Record<string,string> = { "Financeiro":"#10B981","Segurança":"#EF4444","Manutenção":"#3B82F6","Infraestrutura":"#F59E0B","Sustentabilidade":"#06B6D4","Gestão":"#8B5CF6" };

const EQUIP_DEMO: Equipamento[] = [
  { id:"eq1", nome:"Elevador Torre A", categoria:"elevador", catIcon:"🛗", local:"Torre A – Poço", fabricante:"OTIS", modelo:"Gen2 MRL", serie:"OT-2021-0841", dataInstalacao:"2021-03-15", vidaUtilAnos:20, instaladoHa:4, consumoKwh:5.2, horasDia:12, status:"operacional", proxManutencao:"2026-04-10", ultimaManutencao:"2026-01-10", custoManutencao:2400, descricao:"Elevador sem casa de máquinas, 10 paradas.", quantidade:1 },
  { id:"eq2", nome:"Elevador Torre B", categoria:"elevador", catIcon:"🛗", local:"Torre B – Poço", fabricante:"ThyssenKrupp", modelo:"Evolution 200", serie:"TK-2019-3312", dataInstalacao:"2019-08-20", vidaUtilAnos:20, instaladoHa:6, consumoKwh:5.8, horasDia:10, status:"manutencao", proxManutencao:"2026-03-28", ultimaManutencao:"2025-12-20", custoManutencao:2400, descricao:"Em manutenção corretiva – cabo de tração.", quantidade:1 },
  { id:"eq3", nome:"Bomba Piscina Principal", categoria:"piscina", catIcon:"🏊", local:"Casa de Bombas – Piscina", fabricante:"Pentair", modelo:"SuperFlo VS", serie:"PNT-2022-0115", dataInstalacao:"2022-01-10", vidaUtilAnos:10, instaladoHa:3, consumoKwh:1.1, horasDia:8, status:"operacional", proxManutencao:"2026-06-01", ultimaManutencao:"2025-12-01", custoManutencao:800, descricao:"Bomba de velocidade variável 1.5CV.", quantidade:1 },
  { id:"eq4", nome:"Bomba Cisterna Principal", categoria:"hidraulico", catIcon:"💧", local:"Subsolo – Cisterna", fabricante:"Schneider", modelo:"BCC-2000", serie:"SCH-2020-7743", dataInstalacao:"2020-05-18", vidaUtilAnos:12, instaladoHa:5, consumoKwh:2.2, horasDia:6, status:"atencao", proxManutencao:"2026-04-05", ultimaManutencao:"2025-10-05", custoManutencao:1200, descricao:"Vibração elevada detectada. Verificar rolamentos.", quantidade:1 },
  { id:"eq5", nome:"Caixa d'Água Torre A", categoria:"hidraulico", catIcon:"🪣", local:"Telhado Torre A", fabricante:"Eternit", modelo:"Fortlev 5000L", serie:"ET-2018-9901", dataInstalacao:"2018-09-01", vidaUtilAnos:15, instaladoHa:7, consumoKwh:0, horasDia:0, status:"operacional", proxManutencao:"2026-09-01", ultimaManutencao:"2025-09-01", custoManutencao:400, descricao:"Limpeza semestral programada.", quantidade:1 },
  { id:"eq6", nome:"Caixa d'Água Torre B", categoria:"hidraulico", catIcon:"🪣", local:"Telhado Torre B", fabricante:"Eternit", modelo:"Fortlev 5000L", serie:"ET-2018-9902", dataInstalacao:"2018-09-01", vidaUtilAnos:15, instaladoHa:7, consumoKwh:0, horasDia:0, status:"operacional", proxManutencao:"2026-09-01", ultimaManutencao:"2025-09-01", custoManutencao:400, descricao:"Limpeza semestral programada.", quantidade:1 },
  { id:"eq7", nome:"Sistema CFTV – 12 câmeras", categoria:"seguranca", catIcon:"📷", local:"Várias áreas comuns", fabricante:"Hikvision", modelo:"DS-2CD2T47G2", serie:"HK-2023-0044", dataInstalacao:"2023-06-12", vidaUtilAnos:8, instaladoHa:2, consumoKwh:0.08, horasDia:24, status:"operacional", proxManutencao:"2026-12-12", ultimaManutencao:"2025-12-12", custoManutencao:600, descricao:"12 câmeras IP 4MP com visão noturna.", quantidade:1 },
  { id:"eq8", nome:"Gerador de Emergência", categoria:"eletrico", catIcon:"⚡", local:"Garagem – Subsolo", fabricante:"Stemac", modelo:"GTA 45", serie:"ST-2020-1122", dataInstalacao:"2020-11-30", vidaUtilAnos:15, instaladoHa:5, consumoKwh:30, horasDia:0, status:"operacional", proxManutencao:"2026-05-30", ultimaManutencao:"2025-11-30", custoManutencao:1800, descricao:"45 kVA diesel. Teste mensal obrigatório.", quantidade:1 },
  { id:"eq9", nome:"Portão Garagem Bloco A", categoria:"eletrico", catIcon:"🚗", local:"Acesso Garagem A", fabricante:"PPA", modelo:"DZ Turbo", serie:"PPA-2021-5510", dataInstalacao:"2021-07-22", vidaUtilAnos:10, instaladoHa:4, consumoKwh:0.4, horasDia:10, status:"operacional", proxManutencao:"2026-07-22", ultimaManutencao:"2025-07-22", custoManutencao:350, descricao:"Motor deslizante 1/3 HP.", quantidade:1 },
  { id:"eq10", nome:"Portão Garagem Bloco B", categoria:"eletrico", catIcon:"🚗", local:"Acesso Garagem B", fabricante:"PPA", modelo:"DZ Turbo", serie:"PPA-2021-5511", dataInstalacao:"2021-07-22", vidaUtilAnos:10, instaladoHa:4, consumoKwh:0.4, horasDia:10, status:"inativo", proxManutencao:"2026-03-20", ultimaManutencao:"2025-06-15", custoManutencao:350, descricao:"Motor queimado – peça em pedido.", quantidade:1 },
  { id:"eq11", nome:"Central de Incêndio", categoria:"seguranca", catIcon:"🔥", local:"Térreo – Hall", fabricante:"ADEMCO", modelo:"Vista 128", serie:"AD-2019-8832", dataInstalacao:"2019-03-10", vidaUtilAnos:12, instaladoHa:7, consumoKwh:0.1, horasDia:24, status:"operacional", proxManutencao:"2026-03-10", ultimaManutencao:"2025-09-10", custoManutencao:900, descricao:"Central endereçável 128 zonas. Vistoria semestral.", quantidade:1 },
  { id:"eq12", nome:"Aquecedor Solar – Cobertura", categoria:"eletrico", catIcon:"☀️", local:"Cobertura", fabricante:"Heliotek", modelo:"TS-30", serie:"HT-2020-3301", dataInstalacao:"2020-04-05", vidaUtilAnos:15, instaladoHa:5, consumoKwh:1.5, horasDia:6, status:"atencao", proxManutencao:"2026-04-05", ultimaManutencao:"2025-10-05", custoManutencao:700, descricao:"30 coletores – eficiência reduzida (incrustação).", quantidade:1 },
];

const MANUT_SCHEDULE: { mes: string; items: { equip: string; tipo: "preventiva"|"corretiva"; custo: number }[] }[] = [
  { mes:"Out/25", items:[{ equip:"Elevador Torre A", tipo:"preventiva", custo:2400 },{ equip:"Bomba Piscina", tipo:"preventiva", custo:800 }] },
  { mes:"Nov/25", items:[{ equip:"CFTV", tipo:"preventiva", custo:600 },{ equip:"Gerador", tipo:"preventiva", custo:1800 }] },
  { mes:"Dez/25", items:[{ equip:"Caixa Torre A", tipo:"preventiva", custo:400 },{ equip:"Caixa Torre B", tipo:"preventiva", custo:400 },{ equip:"Central Incêndio", tipo:"preventiva", custo:900 }] },
  { mes:"Jan/26", items:[{ equip:"Elevador Torre A", tipo:"preventiva", custo:2400 },{ equip:"Bomba Cisterna", tipo:"corretiva", custo:1200 }] },
  { mes:"Fev/26", items:[{ equip:"Portão A", tipo:"preventiva", custo:350 },{ equip:"Aquecedor Solar", tipo:"corretiva", custo:700 }] },
  { mes:"Mar/26", items:[{ equip:"Elevador Torre B", tipo:"corretiva", custo:3800 },{ equip:"Portão B", tipo:"corretiva", custo:1200 },{ equip:"Central Incêndio", tipo:"preventiva", custo:900 }] },
  { mes:"Abr/26", items:[{ equip:"Elevador Torre A", tipo:"preventiva", custo:2400 },{ equip:"Bomba Cisterna", tipo:"preventiva", custo:1200 },{ equip:"Aquecedor Solar", tipo:"preventiva", custo:700 }] },
  { mes:"Mai/26", items:[{ equip:"Gerador", tipo:"preventiva", custo:1800 },{ equip:"Bomba Piscina", tipo:"preventiva", custo:800 }] },
  { mes:"Jun/26", items:[{ equip:"Caixa Torre A", tipo:"preventiva", custo:400 },{ equip:"Caixa Torre B", tipo:"preventiva", custo:400 },{ equip:"CFTV", tipo:"preventiva", custo:600 }] },
  { mes:"Jul/26", items:[{ equip:"Portão A", tipo:"preventiva", custo:350 },{ equip:"Elevador Torre A", tipo:"preventiva", custo:2400 }] },
  { mes:"Ago/26", items:[{ equip:"Bomba Piscina", tipo:"preventiva", custo:800 }] },
  { mes:"Set/26", items:[{ equip:"Caixa Torre A", tipo:"preventiva", custo:400 },{ equip:"Caixa Torre B", tipo:"preventiva", custo:400 },{ equip:"Gerador", tipo:"preventiva", custo:1800 }] },
];

export default function App() {
  const [view, setView] = useState<"login" | "selector" | "gestor" | "sindico" | "morador" | "onboarding">("login");
  const [panel, setPanel] = useState("sv-chat");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [condId, setCondId] = useState<string | null>(null);
  const condIdRef = useRef<string | null>(null);
  const [condDropOpen, setCondDropOpen] = useState(false);
  const [sseOnline, setSseOnline] = useState(false);
  const [clock, setClock] = useState(fmtTime());
  const [logs, setLogs] = useState<{ ev: string; data: string; time: string }[]>([]);
  const [sseCount, setSseCount] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const toastIdRef = useRef(0);
  const [bellCount, setBellCount] = useState(0);
  const [bellShake, setBellShake] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loginMode, setLoginMode] = useState<"morador" | "sindico" | "gestor">("morador");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);
  // ── Manutenção state ────────────────────────────────────────────────────
  const [mantTab, setMantTab] = useState<"equip"|"mapa"|"plano"|"os"|"qr"|"ia">("equip");
  const [mantSearch, setMantSearch] = useState("");
  const [mantCatFilter, setMantCatFilter] = useState("todos");
  const [mantStatusFilter, setMantStatusFilter] = useState("todos");
  const [mantSelEquip, setMantSelEquip] = useState<Equipamento | null>(null);
  // ── Equipamentos CRUD (persistido no Supabase) ──────────────────────────────
  const [equipList, setEquipList] = useState<Equipamento[]>([]);
  const [equipLoading, setEquipLoading] = useState(false);
  const [equipSaving, setEquipSaving] = useState(false);
  const [equipEditId, setEquipEditId] = useState<string|null>(null);
  const [equipShowEdit, setEquipShowEdit] = useState(false);
  const EQUIP_CAT_ICONS: Record<string, string> = {
    elevador: "🛗", hidraulico: "💧", eletrico: "⚡", seguranca: "🔒",
    limpeza: "🧹", estrutural: "🏗️", piscina: "🏊", gerador: "🔋",
    climatizacao: "❄️", incendio: "🔥", portaria: "🚪", outros: "📦",
  };
  const EQUIP_CAT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    elevador:     { bg:"rgba(99,102,241,.22)",  border:"rgba(99,102,241,.45)",  text:"#A5B4FC" },
    hidraulico:   { bg:"rgba(14,165,233,.22)",  border:"rgba(14,165,233,.45)",  text:"#7DD3FC" },
    eletrico:     { bg:"rgba(234,179,8,.22)",   border:"rgba(234,179,8,.45)",   text:"#FDE047" },
    seguranca:    { bg:"rgba(239,68,68,.22)",   border:"rgba(239,68,68,.45)",   text:"#FCA5A5" },
    limpeza:      { bg:"rgba(16,185,129,.22)",  border:"rgba(16,185,129,.45)",  text:"#6EE7B7" },
    estrutural:   { bg:"rgba(180,83,9,.28)",    border:"rgba(180,83,9,.5)",     text:"#FCD34D" },
    piscina:      { bg:"rgba(6,182,212,.22)",   border:"rgba(6,182,212,.45)",   text:"#67E8F9" },
    climatizacao: { bg:"rgba(139,92,246,.22)",  border:"rgba(139,92,246,.45)",  text:"#C4B5FD" },
    incendio:     { bg:"rgba(249,115,22,.22)",  border:"rgba(249,115,22,.45)",  text:"#FDBA74" },
    portaria:     { bg:"rgba(107,114,128,.22)", border:"rgba(107,114,128,.45)", text:"#D1D5DB" },
    gerador:      { bg:"rgba(20,184,166,.22)",  border:"rgba(20,184,166,.45)",  text:"#5EEAD4" },
    outros:       { bg:"rgba(100,116,139,.22)", border:"rgba(100,116,139,.45)", text:"#CBD5E1" },
  };
  const EQUIP_CATS: [string, string][] = [
    ["elevador","🛗 Elevador"], ["hidraulico","💧 Hidráulico"], ["eletrico","⚡ Elétrico"],
    ["seguranca","🔒 Segurança"], ["limpeza","🧹 Limpeza"], ["estrutural","🏗️ Estrutural"],
    ["piscina","🏊 Piscina"], ["climatizacao","❄️ Climatização"], ["incendio","🔥 Incêndio"],
    ["portaria","🚪 Portaria"], ["gerador","🔋 Gerador"], ["outros","📦 Outros"],
  ];
  const EQUIP_CAT_LABELS: Record<string, string> = {
    elevador:"Elevador", hidraulico:"Hidráulico", eletrico:"Elétrico",
    seguranca:"Segurança", limpeza:"Limpeza", estrutural:"Estrutural",
    piscina:"Piscina", climatizacao:"Climatização", incendio:"Incêndio",
    portaria:"Portaria", gerador:"Gerador", outros:"Outros",
  };
  const EMPTY_EQ: { nome:string; categoria:string; catIcon:string; local:string; fabricante:string; modelo:string; serie:string; dataInstalacao:string; vidaUtilAnos:number; instaladoHa:number; consumoKwh:number; horasDia:number; status:"operacional"|"atencao"|"manutencao"|"inativo"; proxManutencao:string; ultimaManutencao:string; custoManutencao:number; descricao:string; fornecedor_id:string; quantidade:number } = { nome:"", categoria:"elevador", catIcon:"🛗", local:"", fabricante:"", modelo:"", serie:"", dataInstalacao:"", vidaUtilAnos:10, instaladoHa:0, consumoKwh:0, horasDia:8, status:"operacional", proxManutencao:"", ultimaManutencao:"", custoManutencao:0, descricao:"", fornecedor_id:"", quantidade:1 };
  const [equipForm, setEquipForm] = useState(EMPTY_EQ);

  const loadEquipamentos = async (cid: string) => {
    setEquipLoading(true);
    try {
      const r = await fetch(`/api/equipamentos?condominio_id=${cid}`);
      const d = await r.json();
      if (r.ok && Array.isArray(d)) setEquipList(d.map((e: Equipamento) => ({
        ...e,
        catIcon: EQUIP_CAT_ICONS[e.categoria] ?? e.catIcon ?? "📦",
      })));
    } catch { /* silent */ }
    setEquipLoading(false);
  };

  const equipSave = async () => {
    if (!equipForm.nome.trim() || !condId) return;
    setEquipSaving(true);
    try {
      if (equipEditId) {
        const r = await fetch(`/api/equipamentos/${equipEditId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ condominio_id: condId, ...equipForm }) });
        const d = await r.json();
        if (r.ok) { setEquipList(prev => prev.map(e => e.id === equipEditId ? d.equipamento : e)); showToast("Equipamento atualizado!", "success"); }
        else showToast("Erro: " + d.error, "error");
      } else {
        const r = await fetch("/api/equipamentos", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ condominio_id: condId, ...equipForm }) });
        const d = await r.json();
        if (r.ok) { setEquipList(prev => [d.equipamento, ...prev]); showToast("Equipamento cadastrado!", "success"); }
        else showToast("Erro: " + d.error, "error");
      }
    } catch { showToast("Erro ao salvar equipamento", "error"); }
    setEquipSaving(false);
    setEquipShowEdit(false); setEquipEditId(null); setEquipForm(EMPTY_EQ);
  };

  const equipDelete = async (id: string) => {
    if (!confirm("Excluir equipamento permanentemente?")) return;
    try {
      const r = await fetch(`/api/equipamentos/${id}`, { method:"DELETE" });
      const d = await r.json();
      if (r.ok) { setEquipList(prev => prev.filter(e => e.id !== id)); if (mantSelEquip?.id === id) setMantSelEquip(null); showToast("Equipamento excluído", "success"); }
      else showToast("Erro: " + d.error, "error");
    } catch { showToast("Erro ao excluir equipamento", "error"); }
  };

  const equipEdit = (e: Equipamento) => {
    setEquipEditId(e.id);
    setEquipForm({ nome:e.nome, categoria:e.categoria, catIcon:e.catIcon, local:e.local, fabricante:e.fabricante, modelo:e.modelo, serie:e.serie, dataInstalacao:e.dataInstalacao, vidaUtilAnos:e.vidaUtilAnos, instaladoHa:e.instaladoHa, consumoKwh:e.consumoKwh, horasDia:e.horasDia, status:e.status, proxManutencao:e.proxManutencao, ultimaManutencao:e.ultimaManutencao, custoManutencao:e.custoManutencao, descricao:e.descricao, fornecedor_id:e.fornecedor_id||"", quantidade:e.quantidade||1 });
    setEquipShowEdit(true);
  };

  const equipDuplicate = (e: Equipamento) => {
    setEquipEditId(null);
    setEquipForm({ nome:`${e.nome} (Cópia)`, categoria:e.categoria, catIcon:e.catIcon, local:e.local, fabricante:e.fabricante, modelo:e.modelo, serie:"", dataInstalacao:new Date().toISOString().slice(0,10), vidaUtilAnos:e.vidaUtilAnos, instaladoHa:0, consumoKwh:e.consumoKwh, horasDia:e.horasDia, status:"operacional", proxManutencao:e.proxManutencao, ultimaManutencao:"", custoManutencao:e.custoManutencao, descricao:e.descricao, fornecedor_id:e.fornecedor_id||"", quantidade:e.quantidade||1 });
    setEquipShowEdit(true);
    showToast("Equipamento duplicado — revise e salve", "success");
  };
  // ── Diagnóstico Automático (IA + dados reais) ───────────────────────────────
  type DiagAutoResult = { score: { total:number; nivel:string; financeiro:number; manutencao:number; iot:number; gestao:number }; dados: { inadimplencia_pct:number; os_atrasadas:number; os_urgentes:number; sensores_offline:number; nivel_medio_agua:number; saldo_positivo:boolean }; insights: { tipo:string; mensagem:string; prioridade:string }[]; ia_analise:string; calculado_em:string };
  type DiagHistorico = { id:string; condominio_id:string; score_total:number; nivel:string; score_financeiro:number|null; score_manutencao:number|null; score_iot:number|null; score_gestao:number|null; dados:{ inadimplencia_pct:number; os_atrasadas:number; os_urgentes:number; sensores_offline:number; nivel_medio_agua:number; saldo_positivo:boolean }|null; insights:{ tipo:string; mensagem:string; prioridade:string }[]|null; ia_analise:string|null; calculado_em:string };
  const [diagAutoResult, setDiagAutoResult] = useState<DiagAutoResult | null>(null);
  const [diagAutoLoading, setDiagAutoLoading] = useState(false);
  const [diagHistorico, setDiagHistorico] = useState<DiagHistorico[]>([]);
  const [diagHistLoading, setDiagHistLoading] = useState(false);

  // Ao trocar condomínio: resetar resultado e carregar último salvo do Supabase
  useEffect(() => {
    setDiagAutoResult(null);
    if (!condId) return;
    fetch(`/api/diagnostico/ultimo?condominio_id=${condId}`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.resultado) setDiagAutoResult(d.resultado); })
      .catch(() => {});
  }, [condId]);

  // Ao trocar condomínio: carregar equipamentos e planos do Supabase
  useEffect(() => {
    if (!condId) { setEquipList([]); setPlanoList([]); setFornecList([]); setPiscinaList([]); setDiagHistorico([]); return; }
    loadEquipamentos(condId);
    loadPlanos(condId);
    loadFornecedores(condId);
    loadPiscina(condId);
    loadDiagHistorico(condId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condId]);

  const loadDiagHistorico = async (cId: string) => {
    setDiagHistLoading(true);
    try {
      const r = await fetch(`/api/diagnostico/historico?condominio_id=${cId}`);
      const d = await r.json();
      if (r.ok) setDiagHistorico(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setDiagHistLoading(false);
  };

  const calcDiagAuto = async () => {
    if (!condId) { showToast("Selecione um condomínio primeiro", "warn"); return; }
    setDiagAutoLoading(true);
    try {
      const r = await fetch("/api/diagnostico/calcular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condominio_id: condId }) });
      const d = await r.json();
      if (!r.ok) { showToast("Erro: " + d.error, "error"); } else {
        setDiagAutoResult(d);
        showToast("✅ Diagnóstico calculado e salvo!", "success");
        loadDiagHistorico(condId);
      }
    } catch { showToast("Erro ao calcular diagnóstico", "error"); }
    setDiagAutoLoading(false);
  };

  const exportDiagPDF = (answers: Record<string,string>, aiText: string) => {
    const calc = (() => {
      let total = 0, max = 0;
      const pilarObt: Record<string,number> = {}, pilarMax: Record<string,number> = {};
      MISP_ITEMS.forEach(it => {
        max += it.peso;
        pilarMax[it.pilar] = (pilarMax[it.pilar]||0) + it.peso;
        if (answers[it.id] === "sim") { total += it.peso; pilarObt[it.pilar] = (pilarObt[it.pilar]||0) + it.peso; }
        else if (answers[it.id] === "parcial") { const v = Math.round(it.peso*0.5); total += v; pilarObt[it.pilar] = (pilarObt[it.pilar]||0) + v; }
      });
      const score = max > 0 ? Math.round((total/max)*100) : 0;
      const nivel = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Regular" : "Crítico";
      const nivelColor = score >= 80 ? "#059669" : score >= 60 ? "#D97706" : score >= 40 ? "#EA580C" : "#DC2626";
      const radarData = MISP_PILARES.map(p => ({ pilar: p, score: pilarMax[p] ? Math.round((pilarObt[p]||0)/pilarMax[p]*100) : 0 }));
      const answered = MISP_ITEMS.filter(it => answers[it.id]).length;
      return { score, nivel, nivelColor, radarData, answered };
    })();
    const condNome = dash?.condominios?.find(c => c.id === condId)?.nome || "Condomínio";
    const dataHoje = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });
    const criticais = MISP_ITEMS.filter(it => answers[it.id]==="nao" && it.peso>=4);
    const parciais = MISP_ITEMS.filter(it => answers[it.id]==="parcial" && it.peso>=3);
    const positivos = MISP_ITEMS.filter(it => answers[it.id]==="sim" && it.peso>=4);

    const pilarRows = MISP_PILARES.map(p => {
      const items = MISP_ITEMS.filter(it => it.pilar === p);
      const data = calc.radarData.find(r => r.pilar === p);
      const scorePilar = data?.score ?? 0;
      const barColor = scorePilar >= 80 ? "#059669" : scorePilar >= 60 ? "#D97706" : "#DC2626";
      const icon = MISP_PILAR_ICONS[p] || "";
      const itemRows = items.map(it => {
        const ans = answers[it.id];
        const ansLabel = ans === "sim" ? "✅ Sim" : ans === "parcial" ? "⚠️ Parcial" : ans === "nao" ? "❌ Não" : "— Não respondido";
        const ansColor = ans === "sim" ? "#059669" : ans === "parcial" ? "#D97706" : ans === "nao" ? "#DC2626" : "#94A3B8";
        return `<tr><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#1e293b;">${it.nome}<br><span style="font-size:10px;color:#64748b;">${it.desc}</span></td><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:11px;font-weight:700;color:${ansColor};">${ansLabel}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:11px;color:#475569;">${it.peso}</td></tr>`;
      }).join("");
      return `<div style="margin-bottom:20px;page-break-inside:avoid;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="font-size:18px;">${icon}</span><span style="font-size:14px;font-weight:700;color:#1e293b;">${p}</span><span style="margin-left:auto;font-size:13px;font-weight:800;color:${barColor};">${scorePilar}%</span></div><div style="background:#f1f5f9;border-radius:4px;height:6px;margin-bottom:10px;"><div style="background:${barColor};width:${scorePilar}%;height:6px;border-radius:4px;"></div></div><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;font-size:10px;color:#64748b;padding:4px 8px;background:#f8fafc;">Item</th><th style="font-size:10px;color:#64748b;padding:4px 8px;background:#f8fafc;width:100px;">Resposta</th><th style="font-size:10px;color:#64748b;padding:4px 8px;background:#f8fafc;width:50px;">Peso</th></tr></thead><tbody>${itemRows}</tbody></table></div>`;
    }).join("");

    const itemListHTML = (items: typeof MISP_ITEMS, color: string, prefix: string) => items.length > 0
      ? items.map(it => `<div style="padding:6px 10px;margin-bottom:4px;border-left:3px solid ${color};background:${color}0d;border-radius:0 6px 6px 0;"><span style="font-weight:600;font-size:11px;color:#1e293b;">${prefix} ${it.nome}</span><span style="float:right;font-size:10px;color:#64748b;">${MISP_PILAR_ICONS[it.pilar]} ${it.pilar}</span></div>`).join("")
      : `<p style="color:#94a3b8;font-size:11px;font-style:italic;">Nenhum item.</p>`;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Diagnóstico MISP – ${condNome}</title><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1e293b;padding:32px;max-width:900px;margin:0 auto;}
      h1{font-size:22px;font-weight:900;color:#1e293b;margin-bottom:2px;}
      h2{font-size:15px;font-weight:700;color:#334155;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0;}
      .meta{font-size:12px;color:#64748b;margin-bottom:24px;}
      .score-hero{text-align:center;padding:24px;border:2px solid ${calc.nivelColor}44;border-radius:12px;background:${calc.nivelColor}08;margin-bottom:24px;}
      .score-num{font-size:64px;font-weight:900;color:${calc.nivelColor};line-height:1;}
      .score-nivel{font-size:20px;font-weight:700;color:${calc.nivelColor};margin:4px 0;}
      .score-sub{font-size:12px;color:#64748b;}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
      .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;}
      .kpi-val{font-size:20px;font-weight:800;}
      .kpi-label{font-size:10px;color:#64748b;margin-top:3px;}
      .pilar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px;}
      .pilar-card{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;}
      .section{margin-bottom:20px;}
      @media print{body{padding:16px;}h2{page-break-after:avoid;}}
    </style></head><body>
      <h1>🫀 Diagnóstico de Saúde do Condomínio</h1>
      <div class="meta">${condNome} &nbsp;·&nbsp; ${dataHoje} &nbsp;·&nbsp; ${calc.answered} de ${MISP_ITEMS.length} itens respondidos</div>

      <div class="score-hero">
        <div class="score-num">${calc.score}</div>
        <div class="score-nivel">${calc.nivel}</div>
        <div class="score-sub">Score MISP (0–100)</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-val" style="color:${calc.nivelColor}">${calc.score}/100</div><div class="kpi-label">Score Total</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#DC2626">${criticais.length}</div><div class="kpi-label">Itens Críticos</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#D97706">${parciais.length}</div><div class="kpi-label">Itens Parciais</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#6366F1">${Math.round(calc.answered/MISP_ITEMS.length*100)}%</div><div class="kpi-label">% Preenchido</div></div>
      </div>

      <h2>📡 Score por Pilar</h2>
      <div class="pilar-grid">${MISP_PILARES.map(p => {
        const d = calc.radarData.find(r => r.pilar===p); const s = d?.score??0;
        const c = s>=80?"#059669":s>=60?"#D97706":"#DC2626";
        return `<div class="pilar-card"><div style="font-size:12px;font-weight:700;color:#334155;">${MISP_PILAR_ICONS[p]} ${p}</div><div style="font-size:18px;font-weight:900;color:${c};margin:4px 0;">${s}%</div><div style="background:#e2e8f0;border-radius:3px;height:5px;"><div style="background:${c};width:${s}%;height:5px;border-radius:3px;"></div></div></div>`;
      }).join("")}</div>

      <h2>🚨 Itens Críticos (Não respondido, peso ≥ 4)</h2>
      ${itemListHTML(criticais, "#DC2626", "❌")}

      <h2>⚠️ Itens em Atenção (Parcial, peso ≥ 3)</h2>
      ${itemListHTML(parciais, "#D97706", "⚠️")}

      <h2>✅ Pontos Fortes (Sim, peso ≥ 4)</h2>
      ${itemListHTML(positivos, "#059669", "✅")}

      <h2>📋 Checklist Completo por Pilar</h2>
      ${pilarRows}

      ${aiText ? `<h2>🤖 Análise do Síndico Virtual</h2><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-size:12px;line-height:1.8;color:#334155;white-space:pre-wrap;">${aiText}</div>` : ""}

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
        Gerado pelo ImobCore v2 &nbsp;·&nbsp; ${dataHoje} &nbsp;·&nbsp; Sistema de Gestão Inteligente de Condomínios
      </div>

      <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

    const w = window.open("", "_blank", "width=1000,height=800");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ── MISP Checklist state ────────────────────────────────────────────────────
  const [mispTab, setMispTab] = useState<"checklist"|"resultado"|"historico"|"automatico">("automatico");
  const [mispActivePilar, setMispActivePilar] = useState("Financeiro");
  const [mispAnswers, setMispAnswers] = useState<Record<string,"sim"|"parcial"|"nao">>({});
  const [mispAiLoading, setMispAiLoading] = useState(false);
  const [mispAiResult, setMispAiResult] = useState("");
  const [mispHistory, setMispHistory] = useState<{date:string;score:number;nivel:string;answers:Record<string,string>}[]>(() => {
    try { return JSON.parse(localStorage.getItem("misp_history")||"[]"); } catch { return []; }
  });
  const mispCalc = (answers: Record<string,string>) => {
    let obtained = 0; let max = 0;
    const pilarObt: Record<string,number> = {}; const pilarMax: Record<string,number> = {};
    MISP_ITEMS.forEach(it => {
      max += it.peso * 2;
      pilarMax[it.pilar] = (pilarMax[it.pilar]||0) + it.peso * 2;
      const pts = answers[it.id] === "sim" ? it.peso*2 : answers[it.id] === "parcial" ? it.peso : 0;
      obtained += pts;
      pilarObt[it.pilar] = (pilarObt[it.pilar]||0) + pts;
    });
    const score = Math.round((obtained/max)*100);
    const nivel = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Regular" : "Crítico";
    const nivelColor = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : score >= 40 ? "#F97316" : "#EF4444";
    const radarData = MISP_PILARES.map(p => ({ pilar:p, score: pilarMax[p] ? Math.round((pilarObt[p]||0)/pilarMax[p]*100) : 0 }));
    const answered = Object.keys(answers).length;
    return { score, nivel, nivelColor, radarData, answered, total:MISP_ITEMS.length };
  };
  const mispFinalize = () => {
    const { score, nivel } = mispCalc(mispAnswers);
    const entry = { date: new Date().toLocaleDateString("pt-BR")+" "+new Date().toLocaleTimeString("pt-BR"), score, nivel, answers:{...mispAnswers} };
    const newHist = [entry, ...mispHistory].slice(0, 20);
    setMispHistory(newHist);
    try { localStorage.setItem("misp_history", JSON.stringify(newHist)); } catch { /**/ }
    setMispTab("resultado");
  };
  const [qrUrls, setQrUrls] = useState<Record<string,string>>({});
  const [mantAiLoading, setMantAiLoading] = useState(false);
  const [mantAiResult, setMantAiResult] = useState<string>("");
  const [mantMapHover, setMantMapHover] = useState<string|null>(null);
  const [mantPlanMonth, setMantPlanMonth] = useState(5); // index in MANUT_SCHEDULE (current=Mar/26)

  // ── Planos de Manutenção CRUD ───────────────────────────────────────────────
  type PlanoEquipItem = { equipId: string; equipNome: string; custo_previsto: number };
  type PlanoManut = {
    id: string; codigo: string; nome: string; tipo: string; periodicidade: string;
    equipamentos_itens: PlanoEquipItem[]; custo_total: number; tempo_estimado_min: number;
    proxima_execucao: string; instrucoes: string; status: string;
  };
  const emptyPlanoForm = (): Omit<PlanoManut,"id"> => ({
    codigo:"", nome:"", tipo:"preventiva", periodicidade:"mensal",
    equipamentos_itens:[], custo_total:0, tempo_estimado_min:0,
    proxima_execucao:"", instrucoes:"", status:"ativo"
  });
  const [planoList, setPlanoList] = useState<PlanoManut[]>([]);
  const [planoShowEdit, setPlanoShowEdit] = useState(false);
  const [planoEditId, setPlanoEditId] = useState<string|null>(null);
  const [planoForm, setPlanoForm] = useState<Omit<PlanoManut,"id">>(emptyPlanoForm());
  const [planoSaving, setPlanoSaving] = useState(false);
  const [planoLoading, setPlanoLoading] = useState(false);

  const loadPlanos = async (cId: string) => {
    setPlanoLoading(true);
    try {
      const r = await fetch(`/api/planos?condominio_id=${cId}`);
      const d = await r.json();
      setPlanoList(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setPlanoLoading(false);
  };

  const planoSave = async () => {
    if (!condId || !planoForm.nome.trim()) return;
    setPlanoSaving(true);
    const url = planoEditId ? `/api/planos/${planoEditId}` : `/api/planos`;
    const method = planoEditId ? "PUT" : "POST";
    const body = planoEditId ? planoForm : { ...planoForm, condominio_id: condId };
    await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    await loadPlanos(condId);
    setPlanoShowEdit(false);
    setPlanoEditId(null);
    setPlanoForm(emptyPlanoForm());
    setPlanoSaving(false);
  };

  const planoDelete = async (id: string) => {
    if (!condId) return;
    await fetch(`/api/planos/${id}`, { method:"DELETE" });
    await loadPlanos(condId);
  };

  const planoExportPDF = () => {
    if (planoList.length === 0) { showToast("Nenhum plano para exportar", "error"); return; }
    const condNome = dash?.condominios?.find(c => c.id === condId)?.nome || "Condomínio";
    const now = new Date().toLocaleString("pt-BR");
    const tipoColor: Record<string,string> = { preventiva:"#10B981", corretiva:"#EF4444", preditiva:"#3B82F6", "inspeção":"#F59E0B" };
    const fmtBRLp = (v: number) => v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
    const orcTotal = planoList.reduce((s,p) => s + (Number(p.custo_total)||0), 0);
    const equipCobertos = new Set(planoList.flatMap(p => (p.equipamentos_itens||[]).map(e => e.equipId))).size;
    const proxExec = planoList.filter(p=>p.proxima_execucao).sort((a,b)=>a.proxima_execucao.localeCompare(b.proxima_execucao))[0]?.proxima_execucao || "—";

    const planosHtml = planoList.map((p, idx) => {
      const tc = tipoColor[p.tipo] || "#94A3B8";
      const itens: PlanoEquipItem[] = Array.isArray(p.equipamentos_itens) ? p.equipamentos_itens : [];
      const itensHtml = itens.length > 0
        ? `<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">Equipamento</th>
                <th style="text-align:right;padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">Custo Previsto</th>
              </tr>
            </thead>
            <tbody>
              ${itens.map((it,i) => `
                <tr style="background:${i%2===0?"#fff":"#f8fafc"};">
                  <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;">${it.equipNome}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:right;color:${Number(it.custo_previsto)>0?"#F59E0B":"#94A3B8"};font-weight:${Number(it.custo_previsto)>0?"700":"400"};">${Number(it.custo_previsto)>0?fmtBRLp(Number(it.custo_previsto)):"—"}</td>
                </tr>`).join("")}
            </tbody>
           </table>`
        : `<div style="color:#94A3B8;font-size:11px;margin-top:8px;font-style:italic;">Nenhum equipamento vinculado.</div>`;

      return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin-bottom:16px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${p.codigo ? `<span style="font-size:10px;color:#64748B;background:#f1f5f9;border-radius:4px;padding:2px 7px;">${p.codigo}</span>` : ""}
            <span style="font-size:15px;font-weight:800;color:#1e293b;">${p.nome}</span>
            <span style="font-size:11px;font-weight:700;color:${tc};background:${tc}22;border:1px solid ${tc}44;border-radius:4px;padding:2px 8px;">${p.tipo}</span>
            <span style="font-size:11px;color:#64748B;background:#f8fafc;border-radius:4px;padding:2px 7px;">${p.periodicidade}</span>
            <span style="font-size:11px;color:${p.status==="ativo"?"#10B981":"#64748B"};background:${p.status==="ativo"?"#D1FAE5":"#f1f5f9"};border-radius:4px;padding:2px 7px;">${p.status||"ativo"}</span>
          </div>
          <span style="font-size:15px;font-weight:800;color:#059669;">${fmtBRLp(Number(p.custo_total||0))}</span>
        </div>
        ${p.instrucoes ? `<div style="font-size:12px;color:#475569;margin-bottom:8px;line-height:1.5;">${p.instrucoes}</div>` : ""}
        ${itensHtml}
        <div style="display:flex;gap:18px;font-size:11px;color:#64748B;margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;">
          ${p.proxima_execucao ? `<span>📅 Próxima execução: <strong style="color:#1e293b;">${p.proxima_execucao}</strong></span>` : ""}
          ${p.tempo_estimado_min > 0 ? `<span>⏱ Tempo estimado: <strong style="color:#1e293b;">${p.tempo_estimado_min} min</strong></span>` : ""}
          <span style="margin-left:auto;"># ${idx+1} de ${planoList.length}</span>
        </div>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Planos de Manutenção – ${condNome}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin:0; padding:0; background:#fff; color:#1e293b; }
        .page { max-width:900px; margin:0 auto; padding:32px 40px; }
        @media print { body { padding:0; } .page { padding:20px 24px; } }
      </style>
    </head><body><div class="page">
      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #7C5CFC;">
        <div>
          <div style="font-size:22px;font-weight:900;color:#7C5CFC;">📅 Planos de Manutenção</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-top:4px;">${condNome}</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px;">Gerado em ${now}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#64748B;">ImobCore v2</div>
          <div style="font-size:11px;color:#64748B;">Módulo Manutenção</div>
        </div>
      </div>
      <!-- RESUMO -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
        ${[
          { label:"Total de Planos", val:String(planoList.length), color:"#7C5CFC" },
          { label:"Orçamento Previsto", val:fmtBRLp(orcTotal), color:"#10B981" },
          { label:"Equip. Cobertos", val:String(equipCobertos), color:"#F59E0B" },
          { label:"Próxima Execução", val:proxExec, color:"#3B82F6" },
        ].map(k=>`<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center;">
          <div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">${k.label}</div>
          <div style="font-size:20px;font-weight:900;color:${k.color};margin-top:6px;">${k.val}</div>
        </div>`).join("")}
      </div>
      <!-- PLANOS -->
      <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Planos detalhados</div>
      ${planosHtml}
      <!-- FOOTER -->
      <div style="margin-top:32px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:10px;color:#94A3B8;display:flex;justify-content:space-between;">
        <span>ImobCore v2 — Gestão de Condomínios com IA</span>
        <span>${now}</span>
      </div>
    </div></body></html>`;

    const w = window.open("", "_blank");
    if (!w) { showToast("Popup bloqueado — libere popups para exportar PDF", "error"); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const planoToggleEquip = (eq: { id: string; nome: string }) => {
    const exists = planoForm.equipamentos_itens.find(e => e.equipId === eq.id);
    const newItens = exists
      ? planoForm.equipamentos_itens.filter(e => e.equipId !== eq.id)
      : [...planoForm.equipamentos_itens, { equipId: eq.id, equipNome: eq.nome, custo_previsto: 0 }];
    setPlanoForm(f => ({ ...f, equipamentos_itens: newItens }));
  };

  const planoSetEquipCusto = (equipId: string, custo: number) => {
    setPlanoForm(f => ({
      ...f,
      equipamentos_itens: f.equipamentos_itens.map(e => e.equipId === equipId ? { ...e, custo_previsto: custo } : e)
    }));
  };

  // ── Fornecedores e Contatos ────────────────────────────────────────────────
  const FORNEC_CATEGORIAS = ["Geral","Bombas","Elevadores","Elétrico","Hidráulico","Jardinagem","Limpeza","Segurança","Pintura","Estrutural","TI/Câmeras","Climatização","Gás","Portaria","Manutenção","Outros"];
  const FORNEC_ICONES = ["🏢","🔧","⚡","💧","🛗","🔒","🌿","🧹","🎨","🏗️","📷","❄️","🔥","🚪","🔩","🪛","🛠️","📦","🚛","📞","💡","🔌","🪟","🛁","🚿","🌡️","⚙️","🔑"];
  type Fornecedor = { id:string; condominio_id:string; nome:string; categoria:string; icone:string; telefone:string; whatsapp:string; email:string; endereco:string; observacoes:string; status:string; created_at:string; updated_at:string };
  const emptyFornec = (): Omit<Fornecedor,"id"|"condominio_id"|"created_at"|"updated_at"> => ({ nome:"", categoria:"Geral", icone:"🏢", telefone:"", whatsapp:"", email:"", endereco:"", observacoes:"", status:"ativo" });
  const [fornecList, setFornecList] = useState<Fornecedor[]>([]);
  const [fornecLoading, setFornecLoading] = useState(false);
  const [fornecSaving, setFornecSaving] = useState(false);
  const [fornecSearch, setFornecSearch] = useState("");
  const [fornecCatFilter, setFornecCatFilter] = useState("todas");
  const [fornecModal, setFornecModal] = useState(false);
  const [fornecEditId, setFornecEditId] = useState<string|null>(null);
  const [fornecForm, setFornecForm] = useState<ReturnType<typeof emptyFornec>>(emptyFornec());
  const [fornecMsgModal, setFornecMsgModal] = useState<Fornecedor|null>(null);
  const [fornecMsg, setFornecMsg] = useState("");
  const [sindFornecDetail, setSindFornecDetail] = useState<string|null>(null);
  const [morFornecDetail, setMorFornecDetail] = useState<string|null>(null);
  // ─── Piscina ───────────────────────────────────────────────────────────────
  const emptyPiscinaForm = () => ({ ph: "", cloro: "", temperatura: "", alcalinidade: "", dureza_calcica: "", observacoes: "" });
  const [piscinaList, setPiscinaList] = useState<PiscinaLeitura[]>([]);
  const [piscinaLoading, setPiscinaLoading] = useState(false);
  const [piscSaving, setPiscSaving] = useState(false);
  const [piscModal, setPiscModal] = useState(false);
  const [piscEditId, setPiscEditId] = useState<string|null>(null);
  const [piscForm, setPiscForm] = useState(emptyPiscinaForm());

  const loadFornecedores = async (cId: string) => {
    setFornecLoading(true);
    try {
      const r = await fetch(`/api/fornecedores?condominio_id=${cId}`);
      const d = await r.json();
      setFornecList(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setFornecLoading(false);
  };

  const loadPiscina = async (cId: string) => {
    setPiscinaLoading(true);
    try {
      const r = await fetch(`/api/piscina?condominio_id=${cId}`);
      const d = await r.json();
      if (r.ok) setPiscinaList(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setPiscinaLoading(false);
  };

  const fornecSave = async () => {
    if (!condId || !fornecForm.nome.trim()) return;
    setFornecSaving(true);
    try {
      const url = fornecEditId ? `/api/fornecedores/${fornecEditId}` : `/api/fornecedores`;
      const method = fornecEditId ? "PUT" : "POST";
      const body = fornecEditId ? fornecForm : { ...fornecForm, condominio_id: condId };
      await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      await loadFornecedores(condId);
      setFornecModal(false); setFornecEditId(null); setFornecForm(emptyFornec());
    } catch { /* ignore */ }
    setFornecSaving(false);
  };

  const fornecDelete = async (id: string) => {
    if (!condId) return;
    await fetch(`/api/fornecedores/${id}`, { method:"DELETE" });
    await loadFornecedores(condId);
  };

  const fornecWhatsApp = (f: Fornecedor, msg?: string) => {
    const num = (f.whatsapp || f.telefone || "").replace(/\D/g,"");
    if (!num) return;
    const text = msg ? encodeURIComponent(msg) : "";
    window.open(`https://wa.me/55${num}${text ? "?text="+text : ""}`, "_blank");
  };

  // ── CRM state ──────────────────────────────────────────────────────────────
  const [crmTab, setCrmTab] = useState<"moradores"|"inquilinos">("moradores");
  const [crmSearch, setCrmSearch] = useState("");
  const [crmNovoModal, setCrmNovoModal] = useState(false);
  const [crmPerfilId, setCrmPerfilId] = useState<string|null>(null);
  const [crmNovoForm, setCrmNovoForm] = useState({ nome:"", bloco:"", apto:"", email:"", telefone:"", veiculo:"", segmentos:[] as string[], pet:false, homeOffice:false });
  const [crmMoradores, setCrmMoradores] = useState([
    { id:"cm1", nome:"Dircilene Lunardi",         bloco:"",  apto:"102", email:"",                        telefone:"(48)99100-1234", veiculo:"",       segmentos:["outro"],                    score:72, status:"ativo",  pet:false, homeOffice:false, pendencias:0, interesses:["Delivery","Farmácia"] },
    { id:"cm2", nome:"Fabio Mantese Silvestri",   bloco:"A", apto:"",    email:"fmsilvestri39@gmail.com", telefone:"(48)98800-5599", veiculo:"próprio", segmentos:["proprietario","airbnb"],    score:85, status:"ativo",  pet:true,  homeOffice:false, pendencias:0, interesses:["Internet","Academia"] },
    { id:"cm3", nome:"Jardim Franta",             bloco:"A", apto:"",    email:"fmsilvestri39@gmail.com", telefone:"(48)97700-3311", veiculo:"",       segmentos:["outro"],                    score:68, status:"ativo",  pet:false, homeOffice:true,  pendencias:0, interesses:["Esportes/Lazer"] },
  ]);
  const [crmInquilinos] = useState<typeof crmMoradores>([]);
  // ── Usuarios state ──────────────────────────────────────────────────────────
  type Usuario = { id:string; condominio_id:string; nome:string; email:string; telefone?:string; perfil:PerfilKey; unidade?:string; status:string; permissoes_customizadas?:Record<string,unknown>; ultimo_acesso?:string; created_at:string };
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuariosLoading, setUsuariosLoading] = useState(false);
  const [usuariosFiltroStatus, setUsuariosFiltroStatus] = useState<"todos"|"ativo"|"inativo">("todos");
  const [usuariosFiltroPerfl, setUsuariosFiltroPerfl] = useState<"todos"|PerfilKey>("todos");
  const [usuariosSearch, setUsuariosSearch] = useState("");
  const [usuarioModal, setUsuarioModal] = useState<"none"|"new"|"edit">("none");
  const [usuarioEditId, setUsuarioEditId] = useState<string|null>(null);
  const [usuarioForm, setUsuarioForm] = useState({ nome:"", email:"", telefone:"", perfil:"morador" as PerfilKey, unidade:"", status:"ativo" });
  const [showPermsPanel, setShowPermsPanel] = useState(false);
  const [permsCustom, setPermsCustom] = useState<Record<string,boolean>>({});
  const [usuariosSubtab, setUsuariosSubtab] = useState<"lista"|"permissoes">("lista");
  const [permTabUserId, setPermTabUserId] = useState<string|null>(null);
  const [permTabPerms, setPermTabPerms] = useState<Record<string,boolean>>({});
  const [permTabSaving, setPermTabSaving] = useState(false);
  const [usuariosLoaded, setUsuariosLoaded] = useState(false);
  const [usuarioPermId, setUsuarioPermId] = useState<string|null>(null);
  const [usuarioPermNome, setUsuarioPermNome] = useState("");
  const [usuarioPermJson, setUsuarioPermJson] = useState("");
  const [usuarioPermJsonErr, setUsuarioPermJsonErr] = useState(false);

  // ── Gás state ──────────────────────────────────────────────────────────────
  const [gasNovaLeitModal, setGasNovaLeitModal] = useState(false);
  const [gasNovaLeitForm, setGasNovaLeitForm] = useState({ nivel:"", obs:"" });
  const [gasLeituras, setGasLeituras] = useState([
    { id:"g1",  nivel:35, data:"29/01/2026", hora:"16:34", foto:true,  obs:"Verificação final do dia" },
    { id:"g2",  nivel:15, data:"29/01/2026", hora:"13:07", foto:true,  obs:"Nível crítico detectado" },
    { id:"g3",  nivel:80, data:"29/01/2026", hora:"10:21", foto:false, obs:"Abastecimento realizado" },
    { id:"g4",  nivel:28, data:"28/01/2026", hora:"18:00", foto:false, obs:"" },
    { id:"g5",  nivel:22, data:"28/01/2026", hora:"09:00", foto:false, obs:"" },
    { id:"g6",  nivel:18, data:"27/01/2026", hora:"17:30", foto:false, obs:"" },
    { id:"g7",  nivel:15, data:"27/01/2026", hora:"08:15", foto:true,  obs:"Alerta nível baixo" },
    { id:"g8",  nivel:20, data:"26/01/2026", hora:"19:00", foto:false, obs:"" },
    { id:"g9",  nivel:25, data:"26/01/2026", hora:"08:45", foto:false, obs:"" },
    { id:"g10", nivel:30, data:"25/01/2026", hora:"18:30", foto:false, obs:"" },
    { id:"g11", nivel:38, data:"25/01/2026", hora:"08:00", foto:false, obs:"" },
    { id:"g12", nivel:45, data:"24/01/2026", hora:"17:00", foto:false, obs:"" },
    { id:"g13", nivel:55, data:"23/01/2026", hora:"16:00", foto:false, obs:"" },
    { id:"g14", nivel:65, data:"22/01/2026", hora:"15:00", foto:false, obs:"" },
    { id:"g15", nivel:72, data:"21/01/2026", hora:"14:00", foto:false, obs:"" },
    { id:"g16", nivel:78, data:"20/01/2026", hora:"13:00", foto:false, obs:"" },
    { id:"g17", nivel:80, data:"20/01/2026", hora:"08:00", foto:true,  obs:"Início do período" },
  ]);
  // ── Água state ─────────────────────────────────────────────────────────────
  const [aguaTab, setAguaTab] = useState<"reservatorios"|"leituras"|"hidrometro"|"historico"|"fornecedora"|"alertas"|"integracao">("reservatorios");
  const [aguaNovoResModal, setAguaNovoResModal] = useState(false);
  const [aguaNovoResForm, setAguaNovoResForm] = useState({ nome:"", local:"", capacidade:"", mac:"" });
  // ── Reservatórios state ────────────────────────────────────────────────────
  const [resList, setResList] = useState<Reservatorio[]>([]);
  // Ref síncrono para resList — usado no SSE handler para evitar closure stale
  const resListRef = useRef<Reservatorio[]>([]);
  useEffect(() => { resListRef.current = resList; }, [resList]);
  // Níveis em tempo real por sensor_id (atualizado via SSE sensor_leitura)
  const [resNivels, setResNivels] = useState<Record<string, { nivel: number; volume: number; ts: string }>>({});
  // Histórico de leituras por sensor_id (carregado do backend sensor_leituras)
  const [resHistorico, setResHistorico] = useState<Record<string, { nivel: number; volume_litros: number; received_at: string }[]>>({});
  // ── Gerenciamento de sensores (tabela sensores — aparecem nos gauges) ───────
  const [sensoresManaged, setSensoresManaged] = useState<Sensor[]>([]);
  const EMPTY_SENSOR_FORM = { sensor_id:"", nome:"", local:"", capacidade_litros:5000, nivel_atual:0 };
  const [sensorEditModal, setSensorEditModal] = useState(false);
  const [sensorEditId, setSensorEditId] = useState<string|null>(null);
  const [sensorEditForm, setSensorEditForm] = useState(EMPTY_SENSOR_FORM);
  const [resShowForm, setResShowForm] = useState(false);
  const [resEditId, setResEditId] = useState<string|null>(null);
  const EMPTY_RES_FORM = { sensor_id:"", nome:"", local:"", capacidade_litros:20000, altura_cm:200, mac_address:"", cf_url:"https://imobcore1.fmsilvestri39.workers.dev", wh_url:"https://condo-manager-ai.replit.app/api/webhook", protocolo:"HTTPS POST", porta:443 };
  const [resForm, setResForm] = useState(EMPTY_RES_FORM);
  const [resTesting, setResTesting] = useState<{cf?:boolean;wh?:boolean}>({});
  // Per-reservoir testing (used in integration tab)
  const [resPerTesting, setResPerTesting] = useState<Record<string,{cf:boolean;wh:boolean}>>({});
  // Global integration config (used in the integration tab form)
  const [cfGlobalUrl, setCfGlobalUrl] = useState("https://imobcore1.fmsilvestri39.workers.dev");
  const [whGlobalUrl, setWhGlobalUrl] = useState("https://condo-manager-ai.replit.app/api/webhook");
  const [whGlobalProtocolo, setWhGlobalProtocolo] = useState("HTTPS POST");
  const [whGlobalPorta, setWhGlobalPorta] = useState(443);
  const [cfTestLog, setCfTestLog] = useState<{id:string; ok:boolean; status:number; ts:string}[]>([]);
  const [whTestLog, setWhTestLog] = useState<{id:string; ok:boolean; status:number; ts:string}[]>([]);

  // ── FINANCEIRO INTELIGENTE ──────────────────────────────────────────────────
  type FinTab = "dashboard"|"lancamentos"|"orcamento"|"previsao"|"insights";
  const [finTab, setFinTab] = useState<FinTab>("dashboard");
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [orcamento, setOrcamento] = useState<OrcamentoEntry[]>([]);
  const [finInsight, setFinInsight] = useState<FinanceiroInsight|null>(null);
  const [finInsightLoading, setFinInsightLoading] = useState(false);
  const [finLancFilter, setFinLancFilter] = useState<{tipo:""|"receita"|"despesa"; mes:string; cat:string}>({ tipo:"", mes:"", cat:"" });
  const [finModal, setFinModal] = useState<{open:boolean; editing:Lancamento|null}>({ open:false, editing:null });
  const [finForm, setFinForm] = useState<Partial<Lancamento>>({ tipo:"receita", status:"previsto", categoria:"", descricao:"", valor:0, data: new Date().toISOString().slice(0,10) });
  const [finSaving, setFinSaving] = useState(false);

  const finFetchLancamentos = useCallback(async () => {
    try {
      const cid = dash?.condominios?.[0]?.id;
      const q = cid ? `?condominio_id=${cid}` : "";
      const r = await fetch(`/api/financeiro/lancamentos${q}`);
      if (r.ok) setLancamentos(await r.json());
    } catch {}
  }, [dash]);

  const finFetchOrcamento = useCallback(async () => {
    try {
      const cid = dash?.condominios?.[0]?.id;
      const q = cid ? `?condominio_id=${cid}&ano=${new Date().getFullYear()}` : `?ano=${new Date().getFullYear()}`;
      const r = await fetch(`/api/financeiro/orcamento${q}`);
      if (r.ok) setOrcamento(await r.json());
    } catch {}
  }, [dash]);

  useEffect(() => { if (panel === "financeiro") { finFetchLancamentos(); finFetchOrcamento(); } }, [panel, finFetchLancamentos, finFetchOrcamento]);

  const finSalvarLancamento = async () => {
    if (!finForm.descricao || !finForm.valor || !finForm.data) return;
    setFinSaving(true);
    try {
      const cid = dash?.condominios?.[0]?.id;
      const payload = { ...finForm, condominio_id: cid };
      let r: Response;
      if (finModal.editing) {
        r = await fetch(`/api/financeiro/lancamentos/${finModal.editing.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      } else {
        r = await fetch("/api/financeiro/lancamentos", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      }
      if (r.ok) { setFinModal({open:false,editing:null}); finFetchLancamentos(); showToast("Lançamento salvo!", "success"); }
      else showToast("Erro ao salvar", "warn");
    } catch { showToast("Erro ao salvar", "warn"); }
    setFinSaving(false);
  };

  const finDeletarLancamento = async (id: string) => {
    if (!confirm("Remover este lançamento?")) return;
    const r = await fetch(`/api/financeiro/lancamentos/${id}`, { method:"DELETE" });
    if (r.ok) { finFetchLancamentos(); showToast("Removido", "success"); }
  };

  const finGerarInsights = async (pergunta?: string) => {
    setFinInsightLoading(true);
    try {
      const cid = condId || dash?.condominios?.[0]?.id;
      const body: Record<string, unknown> = {
        tipo: "financeiro",
        condominio_id: cid,
      };
      if (pergunta) body.message = pergunta;
      const r = await fetch("/api/sindico/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const data = await r.json();
        // Monta FinanceiroInsight a partir da resposta do Síndico Virtual
        const reply: string = data.reply || "";
        const analise = reply.match(/ANÁLISE[:\s]+([\s\S]+?)(?=RISCOS|RECOMENDAÇÕES|$)/i)?.[1]?.trim() || reply.slice(0, 600);
        const riscos = reply.match(/RISCOS[:\s]+([\s\S]+?)(?=RECOMENDAÇÕES|$)/i)?.[1]?.trim() || "";
        const recomendacoes = reply.match(/RECOMENDAÇÕES[:\s]+([\s\S]+)/i)?.[1]?.trim() || "";
        setFinInsight({
          score: data.score ?? 0,
          inadimplencia: data.inadimplencia ?? 0,
          saldo: data.saldo ?? 0,
          risco: typeof data.risco === "string" ? data.risco.replace(/[🟢🟡🔴⛔]\s*/g, "").toLowerCase() : "—",
          analise: analise || reply,
          riscos,
          recomendacoes,
          gerado_em: new Date().toISOString(),
          reply,
        });
      } else { showToast("Erro ao gerar insights", "warn"); }
    } catch { showToast("Erro ao gerar insights", "warn"); }
    setFinInsightLoading(false);
  };

  const resTestCFById = async (r: Reservatorio) => {
    setResPerTesting(p => ({ ...p, [r.id]: { cf: true, wh: p[r.id]?.wh ?? false } }));
    try {
      const resp = await fetch("/api/reservatorios/test-url", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ url:r.cf_url, method:"POST", payload:{ test:true, sensor_id:r.sensor_id, timestamp:new Date().toISOString() } }) });
      const data = await resp.json();
      const ok = data.ok as boolean;
      setResList(prev => prev.map(x => x.id === r.id ? { ...x, cf_online:ok } : x));
      setCfTestLog(p => [{ id:r.id, ok, status:data.status||0, ts:new Date().toLocaleTimeString("pt-BR") }, ...p].slice(0,20));
      showToast(ok ? `✅ CF ${r.nome}: HTTP ${data.status}` : `❌ CF ${r.nome}: HTTP ${data.status||"timeout"}`, ok?"success":"warn");
    } catch { showToast(`❌ CF ${r.nome}: inacessível`, "warn"); }
    setResPerTesting(p => ({ ...p, [r.id]: { cf: false, wh: p[r.id]?.wh ?? false } }));
  };
  const resTestWHById = async (r: Reservatorio) => {
    setResPerTesting(p => ({ ...p, [r.id]: { cf: p[r.id]?.cf ?? false, wh: true } }));
    try {
      const testNivel2 = 50;
      const testVol2 = Math.round((r.capacidade_litros || 10000) * testNivel2 / 100);
      const resp = await fetch("/api/reservatorios/test-url", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ url:r.wh_url, method:r.protocolo.includes("POST")?"POST":"GET", payload:{ test:true, device_id:r.sensor_id, sensor_id:r.sensor_id, nivel_percent:testNivel2, nivel:testNivel2, volume_litros:testVol2, received_at:new Date().toISOString() } }) });
      const data = await resp.json();
      const ok = data.ok as boolean;
      setResList(prev => prev.map(x => x.id === r.id ? { ...x, wh_online:ok } : x));
      setWhTestLog(p => [{ id:r.id, ok, status:data.status||0, ts:new Date().toLocaleTimeString("pt-BR") }, ...p].slice(0,20));
      showToast(ok ? `✅ WH ${r.nome}: HTTP ${data.status}` : `❌ WH ${r.nome}: HTTP ${data.status||"timeout"}`, ok?"success":"warn");
    } catch { showToast(`❌ WH ${r.nome}: inacessível`, "warn"); }
    setResPerTesting(p => ({ ...p, [r.id]: { cf: p[r.id]?.cf ?? false, wh: false } }));
  };
  const applyGlobalCF = () => {
    setResList(prev => prev.map(r => ({ ...r, cf_url: cfGlobalUrl })));
    showToast("☁️ URL Cloudflare aplicada a todos os reservatórios", "success");
  };
  const applyGlobalWH = () => {
    setResList(prev => prev.map(r => ({ ...r, wh_url: whGlobalUrl, protocolo: whGlobalProtocolo, porta: whGlobalPorta })));
    showToast("🔗 Webhook aplicado a todos os reservatórios", "success");
  };
  const testAllCF = async () => {
    for (const r of resList) await resTestCFById(r);
  };
  const testAllWH = async () => {
    for (const r of resList) await resTestWHById(r);
  };

  const resSave = async () => {
    if (!resForm.nome.trim()) { showToast("⚠️ Preencha o Nome do reservatório", "warn"); return; }
    const sensorId = resForm.sensor_id.trim() || `sensor_${Date.now()}`;
    const formData = { ...resForm, sensor_id: sensorId, condominio_id: condId };
    if (resEditId) {
      setResList(prev => prev.map(r => r.id === resEditId ? { ...r, ...formData, cf_online:r.cf_online, wh_online:r.wh_online } : r));
      try {
        const r = await fetch(`/api/reservatorios/${resEditId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(formData) });
        if (!r.ok) { console.error("PUT reservatorio failed", await r.text()); showToast("❌ Erro ao atualizar", "error"); }
        else showToast("✅ Reservatório atualizado", "success");
      } catch (e) { console.error("PUT reservatorio error", e); showToast("❌ Erro de conexão", "error"); }
    } else {
      const tempId = `res-${Date.now()}`;
      const novo: Reservatorio = { id:tempId, ...formData, cf_online:false, wh_online:false, created_at:new Date().toISOString() };
      setResList(prev => [novo, ...prev]);
      try {
        const r = await fetch("/api/reservatorios", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(novo) });
        if (!r.ok) {
          console.error("POST reservatorio failed", await r.text());
          showToast("❌ Erro ao salvar reservatório", "error");
        } else {
          const json = await r.json();
          if (json.doc?.id && json.doc.id !== tempId) {
            setResList(prev => prev.map(x => x.id === tempId ? { ...x, id: json.doc.id } : x));
          }
          showToast("✅ Reservatório salvo com sucesso", "success");
        }
      } catch (e) {
        console.error("POST reservatorio error", e);
        showToast("❌ Erro de conexão ao salvar", "error");
      }
    }
    setResShowForm(false); setResEditId(null); setResForm(EMPTY_RES_FORM);
  };

  // Carrega histórico de sensor_leituras para todos os reservatórios da lista
  const loadResHistorico = async (lista: Reservatorio[]) => {
    const ids = lista.map(r => r.sensor_id).filter(Boolean);
    if (!ids.length) return;
    try {
      const r = await fetch(`/api/sensor-leituras/historico?sensor_ids=${ids.join(",")}&limit=60`);
      if (r.ok) {
        const json = await r.json();
        setResHistorico(json.historico || {});
      }
    } catch { /* ignore */ }
  };

  const resDelete = async (id: string) => {
    const target = resList.find(r => r.id === id);
    if (!confirm(`Excluir reservatório "${target?.nome || id}"?`)) return;
    setResList(prev => prev.filter(r => r.id !== id));
    // Remove nível em tempo real do estado
    if (target?.sensor_id) {
      setResNivels(prev => { const n = { ...prev }; delete n[target.sensor_id]; return n; });
    }
    try {
      const r = await fetch(`/api/reservatorios/${id}`, { method:"DELETE" });
      if (!r.ok) {
        console.error("DELETE reservatorio failed", await r.text());
        showToast("❌ Erro ao excluir reservatório", "error");
      } else {
        showToast("🗑️ Reservatório excluído", "info");
      }
    } catch (e) { console.error("DELETE reservatorio error", e); showToast("❌ Erro de conexão", "error"); }
  };
  const resEdit = (r: Reservatorio) => {
    setResEditId(r.id);
    setResForm({ sensor_id:r.sensor_id, nome:r.nome, local:r.local, capacidade_litros:r.capacidade_litros, altura_cm:r.altura_cm, mac_address:r.mac_address||"", cf_url:r.cf_url, wh_url:r.wh_url, protocolo:r.protocolo, porta:r.porta });
    setResShowForm(true);
  };
  // ── Sensor management (tabela sensores) ────────────────────────────────────
  const sensorEdit = (s: Sensor) => {
    setSensorEditId(s.sensor_id);
    setSensorEditForm({ sensor_id:s.sensor_id, nome:s.nome, local:s.local, capacidade_litros:s.capacidade_litros, nivel_atual:s.nivel_atual });
    setSensorEditModal(true);
  };
  const sensorSave = async () => {
    if (!sensorEditId) return;
    if (!sensorEditForm.nome.trim()) { showToast("⚠️ Preencha o Nome", "warn"); return; }
    // Optimistic update
    setSensoresManaged(prev => prev.map(s => s.sensor_id === sensorEditId
      ? { ...s, nome:sensorEditForm.nome, local:sensorEditForm.local, capacidade_litros:sensorEditForm.capacidade_litros, nivel_atual:sensorEditForm.nivel_atual,
          volume_litros:Math.round(sensorEditForm.nivel_atual/100*sensorEditForm.capacidade_litros) }
      : s));
    // Also update resNivels so gauge reflects new nivel immediately
    setResNivels(prev => ({
      ...prev,
      [sensorEditId]: { nivel:sensorEditForm.nivel_atual, volume:Math.round(sensorEditForm.nivel_atual/100*sensorEditForm.capacidade_litros), ts:new Date().toISOString() }
    }));
    setSensorEditModal(false); setSensorEditId(null); setSensorEditForm(EMPTY_SENSOR_FORM);
    try {
      const r = await fetch(`/api/sensores/${encodeURIComponent(sensorEditId)}`, {
        method:"PUT", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ nome:sensorEditForm.nome, local:sensorEditForm.local, capacidade_litros:sensorEditForm.capacidade_litros, nivel_atual:sensorEditForm.nivel_atual })
      });
      if (!r.ok) { showToast("❌ Erro ao atualizar sensor", "error"); return; }
      showToast("✅ Sensor atualizado", "success");
      loadDashboard();
    } catch { showToast("❌ Erro de conexão", "error"); }
  };
  const sensorDelete = async (s: Sensor) => {
    if (!confirm(`Excluir sensor "${s.nome}"?`)) return;
    setSensoresManaged(prev => prev.filter(x => x.sensor_id !== s.sensor_id));
    setResNivels(prev => { const n = { ...prev }; delete n[s.sensor_id]; return n; });
    try {
      const r = await fetch(`/api/sensores/${encodeURIComponent(s.sensor_id)}`, { method:"DELETE" });
      if (!r.ok) { showToast("❌ Erro ao excluir sensor", "error"); }
      else { showToast("🗑️ Sensor excluído", "info"); loadDashboard(); }
    } catch { showToast("❌ Erro de conexão", "error"); }
  };
  const resTestCF = async (r: Reservatorio) => {
    setResTesting(p=>({...p,cf:true}));
    try {
      const resp = await fetch("/api/reservatorios/test-url", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ url:r.cf_url, method:"POST", payload:{ test:true, sensor_id:r.sensor_id } }) });
      const data = await resp.json();
      const ok = data.ok as boolean;
      setResList(prev => prev.map(x => x.id === r.id ? { ...x, cf_online:ok } : x));
      showToast(ok ? `✅ Cloudflare conectado! (HTTP ${data.status})` : `❌ Cloudflare respondeu com erro (HTTP ${data.status})`, ok?"success":"warn");
    } catch { showToast("❌ Cloudflare inacessível ou timeout", "warn"); }
    setResTesting(p=>({...p,cf:false}));
  };
  const resTestWH = async (r: Reservatorio) => {
    setResTesting(p=>({...p,wh:true}));
    try {
      const testNivel = 50;
      const testVol = Math.round((r.capacidade_litros || 10000) * testNivel / 100);
      const resp = await fetch("/api/reservatorios/test-url", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ url:r.wh_url, method:r.protocolo.includes("POST")?"POST":"GET", payload:{ test:true, device_id:r.sensor_id, sensor_id:r.sensor_id, nivel_percent:testNivel, nivel:testNivel, volume_litros:testVol, received_at:new Date().toISOString() } }) });
      const data = await resp.json();
      const ok = data.ok as boolean;
      setResList(prev => prev.map(x => x.id === r.id ? { ...x, wh_online:ok } : x));
      showToast(ok ? `✅ Webhook conectado! (HTTP ${data.status})` : `❌ Webhook respondeu com erro (HTTP ${data.status})`, ok?"success":"warn");
    } catch { showToast("❌ Webhook inacessível ou timeout", "warn"); }
    setResTesting(p=>({...p,wh:false}));
  };
  const [aguaNovaLeitModal, setAguaNovaLeitModal] = useState(false);
  const [aguaNovaLeitForm, setAguaNovaLeitForm] = useState({ reservatorio:"Bloco A", nivel:"", distancia:"", obs:"" });
  const [aguaLeituras, setAguaLeituras] = useState([
    { id:"l1",  res:"Bloco A", nivel:45, volume:22500, dist:55,  data:"08/02/2026", hora:"19:37:30", fonte:"IoT" },
    { id:"l2",  res:"Bloco A", nivel:48, volume:24000, dist:51,  data:"08/02/2026", hora:"09:12:00", fonte:"IoT" },
    { id:"l3",  res:"Bloco A", nivel:52, volume:26000, dist:48,  data:"07/02/2026", hora:"19:30:00", fonte:"IoT" },
    { id:"l4",  res:"Bloco A", nivel:55, volume:27500, dist:45,  data:"07/02/2026", hora:"09:05:00", fonte:"IoT" },
    { id:"l5",  res:"Bloco A", nivel:58, volume:29000, dist:42,  data:"06/02/2026", hora:"18:55:00", fonte:"IoT" },
    { id:"l6",  res:"Bloco A", nivel:50, volume:25000, dist:50,  data:"06/02/2026", hora:"09:00:00", fonte:"IoT" },
    { id:"l7",  res:"Bloco A", nivel:42, volume:21000, dist:58,  data:"05/02/2026", hora:"19:45:00", fonte:"IoT" },
    { id:"l8",  res:"Bloco A", nivel:38, volume:19000, dist:62,  data:"05/02/2026", hora:"09:15:00", fonte:"IoT" },
    { id:"l9",  res:"Bloco A", nivel:35, volume:17500, dist:65,  data:"04/02/2026", hora:"20:00:00", fonte:"IoT" },
    { id:"l10", res:"Bloco A", nivel:60, volume:30000, dist:40,  data:"04/02/2026", hora:"09:30:00", fonte:"Manual" },
    { id:"l11", res:"Bloco A", nivel:65, volume:32500, dist:35,  data:"03/02/2026", hora:"10:00:00", fonte:"Manual" },
  ]);
  const [aguaHidroLeituras] = useState([
    { id:"h1", mes:"Jan/26", m3:142, custo:497, data:"31/01/2026" },
    { id:"h2", mes:"Fev/26", m3:138, custo:483, data:"28/02/2026" },
    { id:"h3", mes:"Mar/26", m3:145, custo:507, data:"15/03/2026" },
    { id:"h4", mes:"Out/25", m3:130, custo:455, data:"31/10/2025" },
    { id:"h5", mes:"Nov/25", m3:135, custo:472, data:"30/11/2025" },
    { id:"h6", mes:"Dez/25", m3:150, custo:525, data:"31/12/2025" },
  ]);
  // ── Energia state ──────────────────────────────────────────────────────────
  const [energiaTab, setEnergiaTab] = useState<"ocorrencias"|"consumo"|"equipamentos"|"solar"|"graficos"|"fornecedora"|"alertas">("ocorrencias");
  const [energiaAno, setEnergiaAno] = useState(2026);
  const [energiaRegModal, setEnergiaRegModal] = useState(false);
  const [energiaRegForm, setEnergiaRegForm] = useState({ titulo:"", tipo:"queda", obs:"" });
  const [energiaOcorrencias, setEnergiaOcorrencias] = useState([
    { id:"oc1", titulo:"queda energia 29/01/2026", tipo:"queda",     data:"29/01/2026", hora:"10:21:16", obs:"Queda total no bloco A" },
    { id:"oc2", titulo:"energia normal",            tipo:"retorno",   data:"29/01/2026", hora:"10:21:04", obs:"Energia restaurada pela CELESC" },
    { id:"oc3", titulo:"falta",                     tipo:"falta",     data:"20/01/2026", hora:"09:48:33", obs:"Falta de energia – manutenção programada CELESC" },
    { id:"oc4", titulo:"oscilação detectada",        tipo:"oscilacao", data:"15/01/2026", hora:"14:30:00", obs:"Oscilação de tensão detectada pelo medidor" },
    { id:"oc5", titulo:"energia restaurada",         tipo:"retorno",   data:"08/01/2026", hora:"07:15:22", obs:"Retorno após oscilação" },
    { id:"oc6", titulo:"queda energia noturna",      tipo:"queda",     data:"03/01/2026", hora:"22:48:11", obs:"Queda por sobrecarga na rede" },
    { id:"oc7", titulo:"falta de energia",           tipo:"falta",     data:"28/12/2025", hora:"16:22:00", obs:"Falta programada – manutenção preventiva" },
    { id:"oc8", titulo:"energia restaurada",         tipo:"retorno",   data:"28/12/2025", hora:"16:45:12", obs:"Energia restabelecida dentro do prazo" },
  ]);

  // Sub-screen navigation
  const [sindicoScreen, setSindicoScreen] = useState<string | null>(null);
  const [moradorScreen, setMoradorScreen] = useState<string | null>(null);
  const [sindicoTheme, setSindicoTheme] = useState<"light" | "dark">(() => (localStorage.getItem("imobcore_sindico_theme") as "light" | "dark" | null) ?? "dark");

  // Chat
  const [deskMsgs, setDeskMsgs] = useState<ChatMsg[]>([]);
  const [sideMsgs, setSideMsgs] = useState<ChatMsg[]>([]);
  const [mobileMsgs, setMobileMsgs] = useState<ChatMsg[]>([]);
  const [deskTyping, setDeskTyping] = useState(false);
  const [sideTyping, setSideTyping] = useState(false);
  const [mobileTyping, setMobileTyping] = useState(false);
  const [deskInput, setDeskInput] = useState("");
  const [sideInput, setSideInput] = useState("");
  const [mobileInput, setMobileInput] = useState("");
  const [deskHistory, setDeskHistory] = useState<{ role: string; content: string }[]>([]);
  const [mobileHistory, setMobileHistory] = useState<{ role: string; content: string }[]>([]);
  const [tokenInfo, setTokenInfo] = useState("");

  // OS module
  const OS_BLANK = { numero: "", titulo: "", descricao: "", categoria: "hidraulica", prioridade: "media", unidade: "", responsavel: "" };
  const [osModal, setOsModal] = useState<"criar" | "editar" | null>(null);
  const [osForm, setOsForm] = useState({ ...OS_BLANK });
  const [osEditId, setOsEditId] = useState<string | null>(null);
  const [osViewMode, setOsViewMode] = useState<"tabela" | "cards">("tabela");
  const [osFilter, setOsFilter] = useState({ status: "todos", categoria: "todos", prioridade: "todos" });
  const [osSearch, setOsSearch] = useState("");
  const [osDeleteId, setOsDeleteId] = useState<string | null>(null);
  const [osFormOpen, setOsFormOpen] = useState(false);
  // OS ↔ Equipamentos links
  const [osEquipLinks, setOsEquipLinks] = useState<{ id: string; nome: string; catIcon: string; categoria: string; local: string; status: string }[]>([]);
  const [osEquipSearch, setOsEquipSearch] = useState("");

  // Comunicado
  const [comTema, setComTema] = useState("");
  const [comLoading, setComLoading] = useState(false);
  const [comPreview, setComPreview] = useState<{ titulo: string; corpo: string } | null>(null);
  // ── Encomendas module ─────────────────────────────────────────────────────
  const [encList, setEncList] = useState<Encomenda[]>(ENC_DEMO);
  const [encFilter, setEncFilter] = useState<"todos"|"aguardando_retirada"|"notificado"|"retirado"|"devolvido">("todos");
  const [encSearch, setEncSearch] = useState("");
  const [encLoading, setEncLoading] = useState(false);
  const [encShowForm, setEncShowForm] = useState(false);
  const [encForm, setEncForm] = useState({ morador_nome:"", bloco:"", unidade:"", tipos:["pacote"] as string[], codigo_rastreio:"" });
  const [encEditId, setEncEditId] = useState<string|null>(null);
  const fetchEncomendas = useCallback(async () => {
    try {
      const r = await fetch("/imobcore/api/encomendas");
      if (r.ok) { const d = await r.json(); if (d.encomendas?.length) setEncList(d.encomendas); }
    } catch { /* use demo data */ }
  }, []);
  const encUpdateStatus = async (id: string, status: Encomenda["status"]) => {
    setEncList(prev => prev.map(e => e.id === id ? { ...e, status, notified_at: status==="notificado" ? new Date().toISOString() : e.notified_at, withdrawn_at: status==="retirado" ? new Date().toISOString() : e.withdrawn_at, returned_at: status==="devolvido" ? new Date().toISOString() : e.returned_at } : e));
    try { await fetch(`/imobcore/api/encomendas/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) }); } catch { /* local update kept */ }
  };
  const encDelete = async (id: string) => {
    setEncList(prev => prev.filter(e => e.id !== id));
    try { await fetch(`/imobcore/api/encomendas/${id}`, { method:"DELETE" }); } catch { /**/ }
  };
  const encCreate = async () => {
    if (!encForm.morador_nome.trim() || !encForm.bloco.trim() || !encForm.unidade.trim()) return;
    const novo: Encomenda = { id:`enc-${Date.now()}`, condominio_id:"87339066-db1e-4743-a152-095527e66c28", ...encForm, status:"aguardando_retirada", received_at:new Date().toISOString(), created_at:new Date().toISOString() };
    setEncList(prev => [novo, ...prev]);
    setEncShowForm(false);
    setEncForm({ morador_nome:"", bloco:"", unidade:"", tipos:["pacote"], codigo_rastreio:"" });
    try { await fetch("/imobcore/api/encomendas", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(novo) }); } catch { /**/ }
  };

  // Insights
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Visitante form
  const [visitante, setVisitante] = useState({ nome: "", documento: "", motivo: "", unidade: "", placa: "" });
  const [visitanteSent, setVisitanteSent] = useState(false);

  // Calendar
  const [calSel, setCalSel] = useState<number | null>(null);

  // ── Onboarding Wizard (7 steps) ───────────────────────────────────────────
  const [obStep, setObStep] = useState(0);
  const [obLoading, setObLoading] = useState(false);
  const [obIsReset, setObIsReset] = useState(false);
  // Step 1: Condomínio básico
  const [obCondo, setObCondo] = useState({ nome: "", cnpj: "", endereco: "", cidade: "", estado: "SC", sindico_nome: "", sindico_email: "", sindico_tel: "", unidades: "84" });
  const [obSavedCondoId, setObSavedCondoId] = useState<string | null>(null);
  // Step 2: Estrutura (torres/blocos)
  const [obTorres, setObTorres] = useState([
    { nome: "Torre A", andares: 4, unidades_por_andar: 4 },
    { nome: "Torre B", andares: 4, unidades_por_andar: 4 },
  ]);
  const [obInfra, setObInfra] = useState({ moradores: "168", andares: "10", torres: "2", churrasqueira: true, salao: true, piscina: true, academia: false, playground: false, coworking: false });
  // Step 3: Moradores
  const [obMoradores, setObMoradores] = useState<{ unidade: string; nome: string; email: string; telefone: string; tipo: string; cpf: string; nascimento: string; veiculos: string }[]>([]);
  const [obMorForm, setObMorForm] = useState({ unidade: "", nome: "", email: "", telefone: "", tipo: "proprietario", cpf: "", nascimento: "", veiculos: "0" });
  const [obMorTab, setObMorTab] = useState<"manual" | "csv">("manual");
  const [obHasSensors, setObHasSensors] = useState<"sim" | "nao" | null>(null);
  const [obSensorQRs, setObSensorQRs] = useState<string[]>([]);
  const [obQRModal, setObQRModal] = useState<number | null>(null);
  const [obCsvPreview, setObCsvPreview] = useState<{ unidade: string; nome: string; email: string; telefone: string; tipo: string; cpf: string; nascimento: string; veiculos: string }[]>([]);
  const [obCsvError, setObCsvError] = useState("");
  // Step 4: Sensores IoT
  const [obSensors, setObSensors] = useState([
    { sensor_id: "sensor_cisterna", nome: "Cisterna Principal", local: "Subsolo", capacidade_litros: "20000", nivel_atual: "80" },
    { sensor_id: "sensor_torre_a", nome: "Caixa Torre A", local: "Telhado Torre A", capacidade_litros: "5000", nivel_atual: "75" },
    { sensor_id: "sensor_torre_b", nome: "Caixa Torre B", local: "Telhado Torre B", capacidade_litros: "5000", nivel_atual: "70" },
    { sensor_id: "sensor_piscina", nome: "Tanque Piscina", local: "Área da Piscina", capacidade_litros: "8000", nivel_atual: "85" },
    { sensor_id: "sensor_jardim", nome: "Reservatório Jardim", local: "Área Verde", capacidade_litros: "2000", nivel_atual: "60" },
  ]);
  // Step 4: Financeiro
  const [obSaldo, setObSaldo] = useState("50000");
  const [obTaxaMensal, setObTaxaMensal] = useState("648");
  const [obVencimento, setObVencimento] = useState("10");
  // Step 5: Alertas & MISP
  const [obMisp, setObMisp] = useState({ bairro: "", misp_alertas: true, alert_agua_critico: true, alert_nova_os: true, alert_misp: true });
  // Step 6: Síndico Virtual IA
  const [obIA, setObIA] = useState({ persona: "formal", auto_com: false, greet: true, lang: "pt-BR" });

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Usuarios callbacks ────────────────────────────────────────────────────
  const loadUsuarios = useCallback(async () => {
    if (!condId) return;
    setUsuariosLoading(true);
    try {
      const r = await fetch(`/api/usuarios?condominio_id=${condId}`);
      const data = await r.json();
      setUsuarios(Array.isArray(data) ? data : []);
      setUsuariosLoaded(true);
    } catch { showToast("Erro ao carregar usuários","error"); }
    finally { setUsuariosLoading(false); }
  }, [condId, showToast]);

  const saveUsuario = useCallback(async () => {
    if (!usuarioForm.nome.trim() || !usuarioForm.email.trim()) { showToast("Nome e email são obrigatórios","warn"); return; }
    try {
      const isEdit = usuarioModal === "edit" && usuarioEditId;
      const url = isEdit ? `/api/usuarios/${usuarioEditId}` : "/api/usuarios";
      const method = isEdit ? "PUT" : "POST";
      const payload = { ...usuarioForm, permissoes_customizadas: permsCustom };
      const body = isEdit ? payload : { ...payload, condominio_id: condId };
      const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      showToast(isEdit ? "Usuário atualizado ✓" : "Usuário criado ✓","ok");
      setUsuarioModal("none");
      loadUsuarios();
    } catch { showToast("Erro ao salvar usuário","error"); }
  }, [usuarioModal, usuarioEditId, usuarioForm, permsCustom, condId, showToast, loadUsuarios]);

  const deleteUsuario = useCallback(async (id: string) => {
    try {
      await fetch(`/api/usuarios/${id}`, { method:"DELETE" });
      showToast("Usuário desativado","ok");
      loadUsuarios();
    } catch { showToast("Erro ao desativar","error"); }
  }, [showToast, loadUsuarios]);

  // ── Bell ──────────────────────────────────────────────────────────────────
  const ringBell = useCallback(() => {
    setBellCount(c => c + 1);
    setBellShake(true);
    setTimeout(() => setBellShake(false), 500);
  }, []);

  // Sync condIdRef whenever condId changes (stable ref for callbacks)
  useEffect(() => { condIdRef.current = condId; }, [condId]);

  // Load piscina data when sindico piscina screen opens
  useEffect(() => {
    if (sindicoScreen === "piscina" && condId) loadPiscina(condId);
  }, [sindicoScreen, condId]);

  // Carrega histórico de sensor_leituras sempre que a lista de reservatórios mudar
  useEffect(() => {
    if (resList.length > 0) loadResHistorico(resList);
  }, [resList]);

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async (forCondId?: string) => {
    try {
      const cid = forCondId ?? condIdRef.current;
      const url = cid ? `/api/dashboard?condominio_id=${cid}` : "/api/dashboard";
      const r = await fetch(url);
      if (!r.ok) { console.warn("dashboard fetch status:", r.status); return; }
      const text = await r.text();
      if (!text || !text.trim().startsWith("{")) { console.warn("dashboard: empty/invalid response"); return; }
      const d: Dashboard = JSON.parse(text);
      setDash(d);
      // Sincronizar lista gerenciável de sensores com dados frescos do banco
      if (d.sensores?.length) {
        setSensoresManaged(d.sensores);
      }
      if (forCondId) {
        setCondId(forCondId);
      } else if (d.condominios?.[0] && !condIdRef.current) {
        setCondId(d.condominios[0].id);
        // Pre-fill onboarding with existing condo data for reconfiguration
        const c = d.condominios[0];
        setObCondo({ nome: c.nome || "", cnpj: "", endereco: "", cidade: c.cidade || "", estado: "SC", sindico_nome: c.sindico_nome || "", sindico_email: "", sindico_tel: "", unidades: String(c.unidades || "84") });
        setObSavedCondoId(c.id);
        setObInfra(p => ({ ...p, moradores: String(c.moradores || "168") }));
      } else if (!d.condominios?.length) {
        // Only go to onboarding when there are truly NO condominiums configured
        setView("onboarding");
        setObStep(0);
      }
      // If condominios exist and condIdRef is already set, do nothing (stay on current view)
    } catch (e) { console.error("dashboard err:", e); }
  }, []);

  // ── Ativar ImobCore (Onboarding Submit) ───────────────────────────────────
  const ativarImobCore = useCallback(async () => {
    if (!obCondo.nome.trim()) { showToast("Nome do condomínio é obrigatório", "warn"); return; }
    setObLoading(true);
    try {
      const payload = {
        nome: obCondo.nome, cidade: obCondo.cidade,
        sindico_nome: obCondo.sindico_nome,
        sindico_email: obCondo.sindico_email,
        sindico_tel: obCondo.sindico_tel,
        condominio_id: obSavedCondoId || undefined,
        unidades: Number(obCondo.unidades), moradores: Number(obInfra.moradores),
        andares: Math.max(...obTorres.map(t => t.andares), Number(obInfra.andares) || 1),
        torres: obTorres.length || Number(obInfra.torres),
        torres_config: obTorres,
        amenidades: Object.entries(obInfra).filter(([k, v]) => typeof v === "boolean" && v).map(([k]) => k),
        sensores: obSensors.map(s => ({ ...s, capacidade_litros: Number(s.capacidade_litros), nivel_atual: Number(s.nivel_atual) })),
        saldo_inicial: Number(obSaldo) || 0,
        taxa_mensal: Number(obTaxaMensal) || 0,
        vencimento_dia: Number(obVencimento) || 10,
        bairro: obMisp.bairro,
        ia_persona: obIA.persona,
        ia_auto_com: obIA.auto_com,
        reset: obIsReset,
      };
      const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const res = await r.json();
      if (!r.ok) { showToast("Erro: " + res.error, "error"); setObLoading(false); return; }
      showToast("🚀 ImobCore ativado com sucesso!", "success");
      setObIsReset(false);
      await loadDashboard();
      setView("gestor");
      setObStep(0);
    } catch { showToast("Erro ao ativar ImobCore", "error"); }
    setObLoading(false);
  }, [obCondo, obInfra, obSensors, obSaldo, obTaxaMensal, obVencimento, obMisp, obIA, obIsReset, obSavedCondoId, showToast, loadDashboard]);

  // ── SSE ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const addLog = (ev: string, data: unknown) => {
      setLogs(prev => [{ ev, data: JSON.stringify(data).substring(0, 80), time: fmtTime() }, ...prev.slice(0, 299)]);
      setSseCount(c => c + 1);
    };
    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/stream");
      es.addEventListener("connected", () => {
        setSseOnline(true);
        addLog("connected", { status: "ok" });
        showToast("✅ SSE conectado – Realtime ativo", "success");
      });
      ["nova_os", "os_atualizada", "sensor_update", "alerta_sensor", "sindico_chat", "novo_comunicado"].forEach(evt => {
        es.addEventListener(evt, (e: MessageEvent) => {
          const data = JSON.parse(e.data);
          addLog(evt, data);
          loadDashboard();
          if (evt === "alerta_sensor") showToast("⚠️ " + data.message, "warn");
          if (evt === "nova_os") { showToast("🔧 Nova OS criada", "info"); ringBell(); }
          if (evt === "novo_comunicado") { showToast("📢 Novo comunicado publicado", "info"); ringBell(); }
          if (evt === "os_atualizada") showToast("🔄 OS atualizada", "info");
        });
      });
      // ── Atualização em tempo real de nível de reservatórios ──────────────────
      // Handler compartilhado — aceita formato novo (water_reading) e legado (sensor_leitura)
      const handleWaterEvent = (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        addLog(data.type || "sensor_leitura", data);
        // Nível: aceita nivel_percent (Worker), nivel (legado), ou nivel do payload novo
        const nivelRaw = data.nivel_percent ?? data.nivel;
        if (nivelRaw == null) return;
        const nivel = Math.min(100, Math.max(0, Number(nivelRaw)));
        // Volume: campo 'volume' (novo sensor_readings) OU 'volume_litros' (legado)
        const volume = Number(data.volume ?? data.volume_litros ?? 0);
        const ts = data.timestamp || data.received_at || new Date().toISOString();

        setResNivels(prev => {
          const next = { ...prev };
          // Candidatos de identificação: sensor_id, device_id, reservoir_id
          const candidates = [data.sensor_id, data.device_id].filter(Boolean) as string[];

          // Atualiza pelo sensor_id exato que veio (sem reservatórios cadastrados)
          if (data.sensor_id) next[data.sensor_id] = { nivel, volume, ts };

          // Cruza com reservatórios em memória (via ref síncrono) por sensor_id OU mac_address
          for (const res of resListRef.current) {
            const matchSensor = candidates.some(c =>
              (res.sensor_id && res.sensor_id === c) ||
              (res.mac_address && res.mac_address.toUpperCase() === c.toUpperCase())
            );
            // Match adicional por reservoir_id (formato novo water_reading)
            const matchId = data.reservoir_id && res.id === data.reservoir_id;
            if (matchSensor || matchId) next[res.sensor_id] = { nivel, volume, ts };
          }
          return next;
        });
      };

      es.addEventListener("water_reading",  handleWaterEvent);   // novo formato
      es.addEventListener("sensor_leitura", handleWaterEvent);   // legado
      es.onerror = () => { setSseOnline(false); retryTimer = setTimeout(connect, 5000); };
    };
    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  }, [loadDashboard, showToast, ringBell]);

  // ── Init + auto-refresh 10s ───────────────────────────────────────────────
  useEffect(() => {
    loadDashboard();
    const clock = setInterval(() => setClock(fmtTime()), 30000);
    const refresh = setInterval(() => loadDashboard(), 10000);
    return () => { clearInterval(clock); clearInterval(refresh); };
  }, [loadDashboard]);

  // ── Carregar reservatórios da API (isolado por condomínio) ────────────────
  useEffect(() => {
    // Limpa lista imediatamente ao trocar de condomínio para não mostrar dados errados
    setResList([]);
    if (!condId) return;
    Promise.all([
      fetch(`/api/reservatorios?condominio_id=${condId}`).then(r => r.json()).catch(() => ({})),
      fetch("/api/reservatorios/niveis").then(r => r.json()).catch(() => ({})),
    ]).then(([resJson, niveisJson]) => {
      setResList(resJson.reservatorios ?? []);
      if (niveisJson.niveis) setResNivels(niveisJson.niveis);
    });
  }, [condId]);

  // ── Theme: apply CSS custom properties ───────────────────────────────────
  useEffect(() => {
    const r = document.documentElement.style;
    if (theme === "light") {
      r.setProperty("--c-bg", "#F1F5F9");
      r.setProperty("--c-bg2", "#E2E8F0");
      r.setProperty("--card-bg", "#FFFFFF");
      r.setProperty("--card-border", "rgba(0,0,0,.1)");
      r.setProperty("--c-sidebar", "#EAEFF6");
      r.setProperty("--c-topbar", "rgba(241,245,249,.97)");
      r.setProperty("--c-topbar-border", "rgba(0,0,0,.1)");
      r.setProperty("--c-panel", "#F8FAFC");
      r.setProperty("--c-input", "#FFFFFF");
      r.setProperty("--c-input-border", "rgba(0,0,0,.15)");
      r.setProperty("--c-text", "#0F172A");
      r.setProperty("--c-text-muted", "#334155");
      r.setProperty("--c-text-faint", "#64748B");
      r.setProperty("--c-surface", "#FFFFFF");
      r.setProperty("--c-surface2", "#F8FAFC");
      r.setProperty("--c-divider", "rgba(0,0,0,.07)");
      r.setProperty("--c-hover", "rgba(0,0,0,.04)");
      r.setProperty("--c-sb-item", "#475569");
      r.setProperty("--c-sb-item-hover", "#0F172A");
      r.setProperty("--c-scrollbar", "rgba(0,0,0,.15)");
    } else {
      r.setProperty("--c-bg", "#070B12");
      r.setProperty("--c-bg2", "#0D1526");
      r.setProperty("--card-bg", "rgba(255,255,255,.04)");
      r.setProperty("--card-border", "rgba(255,255,255,.08)");
      r.setProperty("--c-sidebar", "rgba(8,12,20,.98)");
      r.setProperty("--c-topbar", "rgba(7,11,18,.95)");
      r.setProperty("--c-topbar-border", "rgba(255,255,255,.08)");
      r.setProperty("--c-panel", "rgba(8,10,20,.98)");
      r.setProperty("--c-input", "rgba(0,0,0,.3)");
      r.setProperty("--c-input-border", "rgba(255,255,255,.1)");
      r.setProperty("--c-text", "#E2E8F0");
      r.setProperty("--c-text-muted", "#94A3B8");
      r.setProperty("--c-text-faint", "#475569");
      r.setProperty("--c-surface", "rgba(255,255,255,.04)");
      r.setProperty("--c-surface2", "rgba(255,255,255,.02)");
      r.setProperty("--c-divider", "rgba(255,255,255,.05)");
      r.setProperty("--c-hover", "rgba(255,255,255,.04)");
      r.setProperty("--c-sb-item", "#94A3B8");
      r.setProperty("--c-sb-item-hover", "#E2E8F0");
      r.setProperty("--c-scrollbar", "rgba(255,255,255,.1)");
    }
  }, [theme]);

  // ── Theme tokens (used in inline styles throughout panels) ───────────────
  const th = theme === "light" ? {
    bg: "#F1F5F9", surface: "#FFFFFF", surface2: "#F8FAFC", surface3: "#EEF2F7",
    border: "rgba(0,0,0,.1)", border2: "rgba(0,0,0,.06)",
    text: "#0F172A", textMuted: "#334155", textFaint: "#64748B",
    inputBg: "#FFFFFF", inputBorder: "rgba(0,0,0,.15)",
    logBg: "rgba(0,0,0,.04)", chatBg: "rgba(0,0,0,.04)",
    shadow: "0 1px 3px rgba(0,0,0,.12)",
  } : {
    bg: "#070B12", surface: "rgba(255,255,255,.04)", surface2: "rgba(255,255,255,.02)", surface3: "rgba(255,255,255,.06)",
    border: "rgba(255,255,255,.08)", border2: "rgba(255,255,255,.05)",
    text: "#E2E8F0", textMuted: "#94A3B8", textFaint: "#475569",
    inputBg: "rgba(0,0,0,.3)", inputBorder: "rgba(255,255,255,.1)",
    logBg: "rgba(0,0,0,.4)", chatBg: "rgba(0,0,0,.2)",
    shadow: "none",
  };

  // ── Auto-greet ────────────────────────────────────────────────────────────
  const greetedRef = useRef(false);
  useEffect(() => {
    if (!dash || greetedRef.current) return;
    greetedRef.current = true;
    const urgentes = (dash.ordens_servico || []).filter(o => o.prioridade === "urgente" && o.status === "aberta").length;
    sendChat(
      `Bom dia! Analise a situação atual: ${urgentes} OS(s) urgentes, ${dash.totais.alertas_ativos} alertas MISP, ${dash.sensores.length} sensores IoT. Dê um status executivo conciso.`,
      [], setDeskMsgs, setDeskTyping, setDeskHistory
    );
    setBellCount(urgentes + dash.totais.alertas_ativos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dash]);

  // ── QR code generation for sensors ────────────────────────────────────────
  useEffect(() => {
    if (obHasSensors !== "sim" || obSensors.length === 0) { setObSensorQRs([]); return; }
    let cancelled = false;
    Promise.all(
      obSensors.map(s =>
        QRCode.toDataURL(`ImobCore|${s.sensor_id}|${s.nome}|${s.local}|${s.capacidade_litros}L`, {
          width: 180, margin: 1, color: { dark: "#6366F1", light: "#0F172A" }
        })
      )
    ).then(urls => { if (!cancelled) setObSensorQRs(urls); });
    return () => { cancelled = true; };
  }, [obSensors, obHasSensors]);

  // ── QR codes para equipamentos ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      equipList.map(eq =>
        QRCode.toDataURL(`EQUIP|${eq.id}|${eq.nome}|${eq.serie}|${eq.categoria}`, {
          width: 160, margin: 1, color: { dark: "#6366F1", light: "#0F172A" }
        })
      )
    ).then(urls => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      equipList.forEach((eq, i) => { map[eq.id] = urls[i]; });
      setQrUrls(map);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendChat = async (
    msg: string,
    history: { role: string; content: string }[],
    setMsgs: React.Dispatch<React.SetStateAction<ChatMsg[]>>,
    setTyping: (v: boolean) => void,
    setHistory: React.Dispatch<React.SetStateAction<{ role: string; content: string }[]>>
  ) => {
    if (!msg.trim()) return;
    setMsgs(prev => [...prev, { role: "user", content: msg, time: fmtTime() }]);
    const nh = [...history, { role: "user", content: msg }];
    setHistory(nh);
    setTyping(true);
    try {
      const r = await fetch("/api/sindico/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: nh.slice(-10), condominio_id: condId }),
      });
      const res = await r.json();
      setMsgs(prev => [...prev, { role: "ai", content: res.reply, time: fmtTime() }]);
      setHistory(prev => [...prev, { role: "assistant", content: res.reply }]);
      if (res.tokens) setTokenInfo(`${res.tokens.input}↑ ${res.tokens.output}↓`);
    } catch {
      setMsgs(prev => [...prev, { role: "ai", content: "❌ Erro ao contactar o Síndico IA.", time: fmtTime() }]);
    }
    setTyping(false);
  };

  // ── OS ────────────────────────────────────────────────────────────────────
  const osFiltered = (list: OrdemServico[]) => list.filter(o => {
    if (osFilter.status !== "todos" && o.status !== osFilter.status) return false;
    if (osFilter.categoria !== "todos" && o.categoria !== osFilter.categoria) return false;
    if (osFilter.prioridade !== "todos" && o.prioridade !== osFilter.prioridade) return false;
    if (osSearch && !o.titulo.toLowerCase().includes(osSearch.toLowerCase()) &&
        !(o.unidade || "").toLowerCase().includes(osSearch.toLowerCase()) &&
        !(o.responsavel || "").toLowerCase().includes(osSearch.toLowerCase())) return false;
    return true;
  });

  const openCriarOS = () => {
    setOsForm({ ...OS_BLANK });
    setOsEditId(null);
    setOsEquipLinks([]);
    setOsEquipSearch("");
    setOsModal("criar");
  };

  const openEditarOS = (o: OrdemServico) => {
    setOsForm({
      numero: String(o.numero ?? ""),
      titulo: o.titulo,
      descricao: o.descricao || "",
      categoria: o.categoria,
      prioridade: o.prioridade,
      unidade: o.unidade || "",
      responsavel: o.responsavel || "",
    });
    setOsEditId(o.id);
    // Reconstitui links de equipamentos a partir dos IDs salvos
    const ids: string[] = Array.isArray(o.equipamento_ids) ? o.equipamento_ids : [];
    const linked = equipList.filter(eq => ids.includes(eq.id))
      .map(eq => ({ id: eq.id, nome: eq.nome, catIcon: eq.catIcon, categoria: eq.categoria, local: eq.local, status: eq.status }));
    setOsEquipLinks(linked);
    setOsEquipSearch("");
    setOsModal("editar");
  };

  const criarOS = async () => {
    if (!osForm.titulo.trim()) { showToast("Informe o título", "warn"); return; }
    const payload: Record<string, unknown> = {
      ...osForm,
      condominio_id: condId,
      equipamento_ids: osEquipLinks.map(e => e.id),
    };
    if (osForm.numero) payload.numero = Number(osForm.numero);
    await fetch("/api/os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    showToast("✅ OS criada!", "success");
    setOsModal(null);
    setOsEquipLinks([]);
    ringBell();
    loadDashboard();
  };

  const salvarEditOS = async () => {
    if (!osEditId) return;
    if (!osForm.titulo.trim()) { showToast("Informe o título", "warn"); return; }
    const payload: Record<string, unknown> = {
      titulo: osForm.titulo, descricao: osForm.descricao, categoria: osForm.categoria,
      prioridade: osForm.prioridade, unidade: osForm.unidade, responsavel: osForm.responsavel,
      equipamento_ids: osEquipLinks.map(e => e.id),
    };
    if (osForm.numero) payload.numero = Number(osForm.numero);
    try {
      const r = await fetch(`/api/os/${osEditId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { showToast("Erro ao salvar OS: " + (d.error || r.status), "error"); return; }
      showToast("✅ OS atualizada", "success");
      setOsModal(null);
      setOsEquipLinks([]);
      loadDashboard();
    } catch { showToast("Erro ao salvar OS", "error"); }
  };

  const updateOSStatus = async (id: string, status: string) => {
    await fetch(`/api/os/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    showToast(`OS → ${status.replace("_", " ")}`, "success");
    loadDashboard();
  };

  const deleteOS = async (id: string) => {
    await fetch(`/api/os/${id}`, { method: "DELETE" });
    showToast("OS excluída", "info");
    setOsDeleteId(null);
    loadDashboard();
  };

  const updateOS = updateOSStatus;

  // ── Comunicado ────────────────────────────────────────────────────────────
  const gerarComunicado = async () => {
    if (!comTema.trim()) { showToast("Informe o tema", "warn"); return; }
    setComLoading(true);
    try {
      const r = await fetch("/api/sindico/comunicado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: comTema, condominio_id: condId }) });
      const com = await r.json();
      setComPreview({ titulo: com.titulo, corpo: com.corpo });
      showToast("✅ Comunicado gerado via IA", "success");
      ringBell();
      loadDashboard();
    } catch { showToast("Erro ao gerar comunicado", "error"); }
    setComLoading(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const t = dash?.totais;
  const urgentes = (dash?.ordens_servico || []).filter(o => o.prioridade === "urgente" && o.status === "aberta").length;
  const osAbertas = (dash?.ordens_servico || []).filter(o => o.status !== "fechada");
  const nivelMedio = dash?.sensores?.length
    ? Math.round(dash.sensores.reduce((a, s) => a + (Number(s.nivel_atual) || 0), 0) / dash.sensores.length)
    : 0;

  const priPill = (p: string) => ({ urgente: "pill-red", alta: "pill-amber", media: "pill-blue", baixa: "pill-gray" }[p] || "pill-gray");
  const stsPill = (s: string) => ({ aberta: "pill-amber", em_andamento: "pill-cyan", fechada: "pill-green" }[s] || "pill-gray");
  const logColor = (ev: string) => ({ connected: "#10B981", nova_os: "#6366F1", os_atualizada: "#6366F1", sensor_update: "#06B6D4", alerta_sensor: "#EF4444", sindico_chat: "#A855F7", novo_comunicado: "#F59E0B" }[ev] || "#475569");

  // Calendar data — available dates in current month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const takenDays = new Set([3, 8, 14, 20, 25]);
  const availDays = new Set([5, 6, 7, 10, 11, 12, 15, 17, 18, 19, 22, 24, 26, 27, 28]);

  // ── Onboarding Wizard (8 itens, 7 passos de config) ──────────────────────
  const OB_STEPS = [
    { icon: "👋", label: "Boas-vindas" },
    { icon: "🏢", label: "Condomínio" },
    { icon: "🏗️", label: "Estrutura" },
    { icon: "👥", label: "Moradores" },
    { icon: "💧", label: "Sensores IoT" },
    { icon: "💰", label: "Financeiro" },
    { icon: "🤖", label: "Síndico IA" },
    { icon: "🚀", label: "Ativação" },
  ];

  const obNextStep = useCallback(async () => {
    // ── Step 1: Condomínio ────────────────────────────────────────────────────
    if (obStep === 1) {
      if (!obCondo.nome.trim()) { showToast("Nome do condomínio é obrigatório", "warn"); return; }
      if (!obCondo.sindico_nome.trim()) { showToast("Nome do síndico é obrigatório", "warn"); return; }
      if (!obCondo.sindico_email.trim()) { showToast("E-mail do síndico é obrigatório", "warn"); return; }
      if (!obCondo.unidades || Number(obCondo.unidades) < 1) { showToast("Total de unidades é obrigatório", "warn"); return; }
      setObLoading(true);
      try {
        const payload = {
          id: obSavedCondoId || undefined,
          nome: obCondo.nome, cnpj: obCondo.cnpj, endereco: obCondo.endereco,
          cidade: obCondo.cidade, estado: obCondo.estado,
          sindico_nome: obCondo.sindico_nome, sindico_email: obCondo.sindico_email,
          sindico_tel: obCondo.sindico_tel, unidades: Number(obCondo.unidades),
        };
        const r = await fetch("/api/condominios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const res = await r.json();
        if (!r.ok) { showToast("Erro ao salvar: " + res.error, "error"); setObLoading(false); return; }
        setObSavedCondoId(res.condominio?.id || null);
        showToast("✅ Condomínio salvo!", "success");
      } catch { showToast("Erro ao salvar condomínio", "error"); setObLoading(false); return; }
      setObLoading(false);
    }

    // ── Step 2: Estrutura ─────────────────────────────────────────────────────
    if (obStep === 2) {
      if (obTorres.length === 0) { showToast("Adicione pelo menos um bloco/torre", "warn"); return; }
      const invalid = obTorres.find(t => !t.nome.trim() || t.andares < 1 || t.unidades_por_andar < 1);
      if (invalid) { showToast("Preencha nome, andares e unidades de cada bloco", "warn"); return; }
      if (obSavedCondoId) {
        setObLoading(true);
        try {
          const totalUnits = obTorres.reduce((s, t) => s + t.andares * t.unidades_por_andar, 0);
          const r = await fetch(`/api/condominios/${obSavedCondoId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ torres_config: obTorres, torres: obTorres.length, andares: Math.max(...obTorres.map(t => t.andares)), unidades: totalUnits }),
          });
          if (r.ok) showToast("🏗️ Estrutura salva!", "success");
          else showToast("Estrutura salva localmente (Supabase pendente)", "info");
        } catch { showToast("Estrutura salva localmente", "info"); }
        setObLoading(false);
      }
    }

    // ── Step 3: Moradores ─────────────────────────────────────────────────────
    if (obStep === 3 && obSavedCondoId && obMoradores.length > 0) {
      setObLoading(true);
      try {
        const r = await fetch("/api/moradores", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condominio_id: obSavedCondoId, moradores: obMoradores }),
        });
        if (r.ok) showToast(`👥 ${obMoradores.length} morador(es) salvos!`, "success");
        else showToast("Moradores salvos localmente (Supabase pendente)", "info");
      } catch { showToast("Moradores salvos localmente", "info"); }
      setObLoading(false);
    }

    // ── Step 4: Sensores ──────────────────────────────────────────────────────
    if (obStep === 4 && obHasSensors === null) {
      showToast("Selecione uma opção: Tenho sensores ou Não tenho sensores", "warn");
      return;
    }
    if (obStep === 4 && obHasSensors === "sim" && obSensors.length > 0 && obSavedCondoId) {
      setObLoading(true);
      try {
        await Promise.all(obSensors.map(s =>
          fetch("/api/sensor", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ condominio_id: obSavedCondoId, ...s, capacidade_litros: Number(s.capacidade_litros), nivel_atual: Number(s.nivel_atual) }),
          })
        ));
        showToast(`📡 ${obSensors.length} sensor(es) salvos!`, "success");
      } catch { showToast("Sensores salvos localmente", "info"); }
      setObLoading(false);
    }

    setObStep(s => Math.min(s + 1, OB_STEPS.length - 1));
  }, [obStep, obCondo, obSavedCondoId, obTorres, obMoradores, obHasSensors, obSensors, showToast]);

  const obPrevStep = () => setObStep(s => Math.max(s - 1, 0));

  const renderOnboarding = () => {
    const progress = (obStep / (OB_STEPS.length - 1)) * 100;
    const hasCondo = (dash?.condominios?.length ?? 0) > 0;

    const ToggleChip = ({ label, val, set }: { label: string; val: boolean; set: (v: boolean) => void }) => (
      <button onClick={() => set(!val)} style={{
        padding: "5px 12px", borderRadius: 20, border: "1px solid",
        borderColor: val ? "#6366F1" : "#334155",
        background: val ? "rgba(99,102,241,.18)" : "rgba(30,41,59,.5)",
        color: val ? "#A5B4FC" : "#64748B", fontSize: 12, cursor: "pointer",
        transition: "all .15s",
      }}>
        {val ? "✓ " : ""}{label}
      </button>
    );

    return (
      <div className="ob-wrap" style={{ overflowY: "auto", marginTop: "var(--topbar-h)" }}>
        <div className="ob-card" style={{ maxWidth: obStep >= 1 ? 960 : undefined }}>

          {/* ── Hero ── */}
          <div className="ob-hero">
            <div className="ob-hero-logo">{OB_STEPS[obStep].icon}</div>
            <div className="ob-hero-title">
              {obIsReset ? "Reconfigurar ImobCore" : hasCondo && obStep === 0 ? "Editar Configuração" : "Configurar ImobCore"}
            </div>
            <div className="ob-hero-sub">
              {obIsReset ? "Dados atuais serão apagados e substituídos" : `Passo ${obStep + 1} de ${OB_STEPS.length} — ${OB_STEPS[obStep].label}`}
            </div>
          </div>

          {/* ── Stepper ── */}
          <div className="ob-stepper">
            {OB_STEPS.map((s, i) => (
              <div key={s.label} className="ob-stepper-item">
                <button
                  className={`ob-stepper-dot ${i === obStep ? "active" : i < obStep ? "done" : ""}`}
                  onClick={() => { if (i < obStep || (i === obStep + 1 && (obStep !== 1 || obCondo.nome.trim()))) setObStep(i); }}
                  title={s.label}
                >
                  {i < obStep ? "✓" : i + 1}
                </button>
                <span className={`ob-stepper-label ${i === obStep ? "active" : i < obStep ? "done" : ""}`}>{s.label}</span>
                {i < OB_STEPS.length - 1 && <div className={`ob-stepper-line ${i < obStep ? "done" : ""}`} />}
              </div>
            ))}
          </div>

          {/* ── Progress bar ── */}
          <div className="ob-progress"><div className="ob-progress-bar" style={{ width: progress + "%" }} /></div>

          {/* ── Body ── */}
          <div className="ob-body">

            {/* ════ STEP 0: Boas-vindas ════ */}
            {obStep === 0 && (
              <div style={{ animation: "fadeIn .25s ease" }}>

                {/* Logo + título */}
                <div style={{ textAlign: "center", padding: "4px 0 28px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16,
                    background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 16, padding: "10px 20px" }}>
                    <span style={{ fontSize: 28 }}>🏢</span>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#38BDF8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1 }}>ImobCore</div>
                      <div style={{ fontSize: 10, color: "#6366F1", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>v2 · SaaS</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", marginBottom: 8, lineHeight: 1.2 }}>
                    Configure seu condomínio<br />
                    <span style={{ background: "linear-gradient(135deg,#6366F1,#38BDF8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>em 7 passos</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748B", maxWidth: 340, margin: "0 auto" }}>
                    Ative o sistema completo de gestão inteligente para o seu condomínio.
                  </div>
                </div>

                {/* 4 benefícios principais */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                  {([
                    { ic: "🤖", cor: "#6366F1", bg: "rgba(99,102,241,.1)", bd: "rgba(99,102,241,.2)", titulo: "Síndico Virtual IA", desc: "Claude AI com contexto do condomínio — análises, comunicados e alertas automáticos" },
                    { ic: "💧", cor: "#38BDF8", bg: "rgba(56,189,248,.08)", bd: "rgba(56,189,248,.15)", titulo: "IoT Água", desc: "5 sensores de nível monitorados em tempo real com alertas de criticidade" },
                    { ic: "📱", cor: "#10B981", bg: "rgba(16,185,129,.08)", bd: "rgba(16,185,129,.15)", titulo: "App Morador", desc: "Reservas, visitantes, boletos e comunicados na palma da mão" },
                    { ic: "⚡", cor: "#F59E0B", bg: "rgba(245,158,11,.08)", bd: "rgba(245,158,11,.15)", titulo: "SSE Realtime", desc: "Notificações push instantâneas via Server-Sent Events sem polling" },
                  ] as const).map(({ ic, cor, bg, bd, titulo, desc }) => (
                    <div key={titulo} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: "16px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 26, flexShrink: 0, marginTop: 1 }}>{ic}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: cor, marginBottom: 4 }}>{titulo}</div>
                        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA — varia se já existe condomínio */}
                {hasCondo ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Condo summary card */}
                    <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(99,102,241,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏢</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {dash?.condominios?.[0]?.nome || "Condomínio configurado"}
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {dash?.condominios?.[0]?.cidade && (
                            <span style={{ fontSize: 11, color: "#64748B" }}>📍 {dash.condominios[0].cidade}</span>
                          )}
                          {dash?.condominios?.[0]?.unidades && (
                            <span style={{ fontSize: 11, color: "#64748B" }}>🏠 {dash.condominios[0].unidades} unidades</span>
                          )}
                          {dash?.condominios?.[0]?.sindico_nome && (
                            <span style={{ fontSize: 11, color: "#64748B" }}>👤 {dash.condominios[0].sindico_nome}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#10B981", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 20, padding: "3px 8px", flexShrink: 0 }}>
                        ✓ Ativo
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}>O que deseja fazer?</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <button className="btn-ob-next" style={{ padding: "14px 10px", fontSize: 14, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                        onClick={() => { setObIsReset(false); setObStep(1); }}>
                        <span style={{ fontSize: 20 }}>▶</span>
                        <span>Continuar configuração</span>
                        <span style={{ fontSize: 10, opacity: .7, fontWeight: 400 }}>Editar sem apagar dados</span>
                      </button>
                      <button onClick={() => { setObIsReset(true); setObStep(1); }}
                        style={{ padding: "14px 10px", fontSize: 14, borderRadius: 12, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.07)", color: "#F87171", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 20 }}>🔄</span>
                        <span>Reconfigurar</span>
                        <span style={{ fontSize: 10, opacity: .7, fontWeight: 400 }}>Apaga todos os dados</span>
                      </button>
                    </div>

                    {obIsReset && (
                      <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.18)", borderRadius: 10, fontSize: 12, color: "#F87171", display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>Modo Reconfiguração ativo</div>
                          <div style={{ opacity: .8 }}>Todos os dados existentes (OSs, sensores, financeiro, comunicados) serão apagados ao finalizar.</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="btn-ativar" style={{ fontSize: 16, padding: "16px" }} onClick={() => setObStep(1)}>
                    <span>🚀</span> Começar agora
                  </button>
                )}
              </div>
            )}

            {/* ════ STEP 1: Condomínio ════ */}
            {obStep === 1 && (
              <div style={{ animation: "fadeIn .25s ease", display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

                {/* ── Formulário ── */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>🏢 Dados do Condomínio</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Campos com * são obrigatórios</div>

                  <div className="form-group">
                    <label className="form-label">Nome do Condomínio *</label>
                    <input className="form-control" value={obCondo.nome} autoFocus
                      onChange={e => setObCondo(c => ({ ...c, nome: e.target.value }))}
                      placeholder="Ex: Residencial Parque das Flores" />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">CNPJ</label>
                      <input className="form-control" value={obCondo.cnpj}
                        onChange={e => setObCondo(c => ({ ...c, cnpj: e.target.value }))}
                        placeholder="00.000.000/0001-00" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Total de Unidades *</label>
                      <input className="form-control" type="number" min="1" value={obCondo.unidades}
                        onChange={e => setObCondo(c => ({ ...c, unidades: e.target.value }))}
                        placeholder="84" />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Endereço Completo</label>
                    <input className="form-control" value={obCondo.endereco}
                      onChange={e => setObCondo(c => ({ ...c, endereco: e.target.value }))}
                      placeholder="Rua das Flores, 123 — Bairro Jardim" />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Cidade</label>
                      <input className="form-control" value={obCondo.cidade}
                        onChange={e => setObCondo(c => ({ ...c, cidade: e.target.value }))}
                        placeholder="Florianópolis" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Estado</label>
                      <input className="form-control" value={obCondo.estado} maxLength={2}
                        onChange={e => setObCondo(c => ({ ...c, estado: e.target.value.toUpperCase() }))}
                        placeholder="SC" style={{ textTransform: "uppercase" }} />
                    </div>
                  </div>

                  <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "12px 0" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 10 }}>👤 Responsável pela Gestão</div>

                  <div className="form-group">
                    <label className="form-label">Nome do Síndico *</label>
                    <input className="form-control" value={obCondo.sindico_nome}
                      onChange={e => setObCondo(c => ({ ...c, sindico_nome: e.target.value }))}
                      placeholder="Ex: Ricardo Gestor" />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">E-mail *</label>
                      <input className="form-control" type="email" value={obCondo.sindico_email}
                        onChange={e => setObCondo(c => ({ ...c, sindico_email: e.target.value }))}
                        placeholder="sindico@condo.com.br" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Telefone / WhatsApp</label>
                      <input className="form-control" value={obCondo.sindico_tel}
                        onChange={e => setObCondo(c => ({ ...c, sindico_tel: e.target.value }))}
                        placeholder="(48) 99999-0000" />
                    </div>
                  </div>
                </div>

                {/* ── Preview Card (live) ── */}
                <div style={{ position: "sticky", top: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                    Preview em tempo real
                  </div>
                  <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,.15),rgba(56,189,248,.1))", border: "1px solid rgba(99,102,241,.25)", borderRadius: 16, padding: "20px 16px", minHeight: 280 }}>
                    {/* Building icon */}
                    <div style={{ fontSize: 36, marginBottom: 10, textAlign: "center" }}>🏢</div>

                    {/* Name */}
                    <div style={{ fontSize: 14, fontWeight: 800, color: obCondo.nome ? "#F1F5F9" : "#334155", textAlign: "center", marginBottom: 4, minHeight: 20, wordBreak: "break-word" }}>
                      {obCondo.nome || "Nome do Condomínio"}
                    </div>

                    {/* Cidade/Estado */}
                    {(obCondo.cidade || obCondo.estado) && (
                      <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", marginBottom: 12 }}>
                        📍 {[obCondo.cidade, obCondo.estado].filter(Boolean).join(" · ")}
                      </div>
                    )}

                    {/* Divider */}
                    <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "10px 0" }} />

                    {/* Details */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        ["🏠", "Unidades", obCondo.unidades ? `${obCondo.unidades} unidades` : "–"],
                        ["👤", "Síndico", obCondo.sindico_nome || "–"],
                        obCondo.sindico_email ? ["✉️", "E-mail", obCondo.sindico_email] : null,
                        obCondo.sindico_tel ? ["📞", "Telefone", obCondo.sindico_tel] : null,
                        obCondo.cnpj ? ["🏛️", "CNPJ", obCondo.cnpj] : null,
                        obCondo.endereco ? ["📌", "End.", obCondo.endereco] : null,
                      ].filter(Boolean).map((row) => {
                        const [ic, lbl, val] = row as string[];
                        return (
                          <div key={lbl} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
                            <span style={{ flexShrink: 0 }}>{ic}</span>
                            <span style={{ color: "#64748B", flexShrink: 0 }}>{lbl}:</span>
                            <span style={{ color: "#CBD5E1", fontWeight: 500, wordBreak: "break-all" }}>{val}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Status badge */}
                    <div style={{ marginTop: 14, textAlign: "center" }}>
                      {obCondo.nome && obCondo.sindico_nome && obCondo.sindico_email && obCondo.unidades ? (
                        <span style={{ fontSize: 10, padding: "4px 10px", borderRadius: 20, background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.3)", color: "#6EE7B7" }}>
                          ✓ Pronto para salvar
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, padding: "4px 10px", borderRadius: 20, background: "rgba(100,116,139,.1)", border: "1px solid rgba(100,116,139,.2)", color: "#475569" }}>
                          Preencha os campos obrigatórios
                        </span>
                      )}
                    </div>
                  </div>
                  {obSavedCondoId && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#10B981", textAlign: "center" }}>
                      ✅ Salvo no Supabase
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ════ STEP 2: Estrutura do Condomínio ════ */}
            {obStep === 2 && (() => {
              // Generate unit list for a torre in BLOCO+NÚMERO format
              const genUnits = (t: { nome: string; andares: number; unidades_por_andar: number }): string[] => {
                const words = t.nome.trim().split(/\s+/);
                const prefix = words[words.length - 1].slice(0, 2).toUpperCase();
                const units: string[] = [];
                for (let f = 1; f <= t.andares; f++)
                  for (let u = 1; u <= t.unidades_por_andar; u++)
                    units.push(`${prefix}${f}${String(u).padStart(2, "0")}`);
                return units;
              };
              const totalUnits = obTorres.reduce((s, t) => s + t.andares * t.unidades_por_andar, 0);
              const BLOCO_COLORS = ["#6366F1","#14B8A6","#F59E0B","#EF4444","#A855F7","#3B82F6","#10B981","#F97316","#EC4899","#8B5CF6"];

              return (
                <div style={{ animation: "fadeIn .25s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>🏗️ Estrutura do Condomínio</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#64748B" }}>{obTorres.length} bloco(s) · {totalUnits} unidades total</span>
                      {obTorres.length < 10 && (
                        <button onClick={() => setObTorres(ts => [...ts, { nome: `Torre ${String.fromCharCode(65 + ts.length)}`, andares: 4, unidades_por_andar: 4 }])}
                          style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid rgba(99,102,241,.4)", background: "rgba(99,102,241,.1)", color: "#A5B4FC", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          + Adicionar Bloco
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Configure torres/blocos — as unidades são geradas automaticamente no formato BLOCO+NÚMERO</div>

                  {/* ── Layout: configurador (esquerda) + preview (direita) ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>

                    {/* Coluna esquerda: cards de torres */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {obTorres.map((torre, idx) => {
                        const color = BLOCO_COLORS[idx % BLOCO_COLORS.length];
                        const unitCount = torre.andares * torre.unidades_por_andar;
                        return (
                          <div key={idx} style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${color}33`, borderRadius: 14, padding: "14px 16px", position: "relative" }}>
                            {/* Color stripe */}
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color, borderRadius: "14px 0 0 14px" }} />

                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 8, background: color + "22", border: `1px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🏢</div>
                              <div style={{ flex: 1 }}>
                                <input value={torre.nome}
                                  onChange={e => setObTorres(ts => ts.map((t, i) => i === idx ? { ...t, nome: e.target.value } : t))}
                                  style={{ background: "transparent", border: "none", color: "#F1F5F9", fontSize: 13, fontWeight: 700, fontFamily: "inherit", width: "100%", outline: "none" }}
                                  placeholder="Nome do bloco" />
                              </div>
                              <span style={{ fontSize: 11, color: "#64748B", flexShrink: 0 }}>{unitCount} unid.</span>
                              {obTorres.length > 1 && (
                                <button onClick={() => setObTorres(ts => ts.filter((_, i) => i !== idx))}
                                  style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#F87171", borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" }}>
                                  ×
                                </button>
                              )}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Andares</div>
                                <input type="number" min="1" max="50" value={torre.andares}
                                  onChange={e => setObTorres(ts => ts.map((t, i) => i === idx ? { ...t, andares: Math.max(1, Number(e.target.value)) } : t))}
                                  style={{ width: "100%", padding: "6px 8px", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, color: "#E2E8F0", fontSize: 13, fontFamily: "inherit" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Unid./Andar</div>
                                <input type="number" min="1" max="20" value={torre.unidades_por_andar}
                                  onChange={e => setObTorres(ts => ts.map((t, i) => i === idx ? { ...t, unidades_por_andar: Math.max(1, Number(e.target.value)) } : t))}
                                  style={{ width: "100%", padding: "6px 8px", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, color: "#E2E8F0", fontSize: 13, fontFamily: "inherit" }} />
                              </div>
                              <div style={{ display: "flex", alignItems: "flex-end" }}>
                                <div style={{ padding: "6px 10px", background: color + "15", border: `1px solid ${color}33`, borderRadius: 8, fontSize: 11, color, width: "100%", textAlign: "center" }}>
                                  {unitCount} unid. total
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Áreas Comuns */}
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 8 }}>🌳 Áreas Comuns</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {([["churrasqueira","🔥 Churrasqueira"],["salao","🎉 Salão de Festas"],["piscina","🏊 Piscina"],["academia","💪 Academia"],["playground","🛝 Playground"],["coworking","💻 Coworking"]] as [keyof typeof obInfra, string][]).map(([k, lbl]) => (
                            <ToggleChip key={k} label={lbl} val={!!obInfra[k]} set={v => setObInfra(p => ({ ...p, [k]: v }))} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Coluna direita: preview visual de unidades */}
                    <div style={{ position: "sticky", top: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                        Preview · Unidades geradas
                      </div>
                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 16, maxHeight: 480, overflowY: "auto" }}>
                        {obTorres.length === 0 ? (
                          <div style={{ textAlign: "center", color: "#334155", fontSize: 12, padding: "20px 0" }}>Nenhum bloco configurado</div>
                        ) : obTorres.map((torre, idx) => {
                          const color = BLOCO_COLORS[idx % BLOCO_COLORS.length];
                          const units = genUnits(torre);
                          // Group by floor
                          const floors: string[][] = [];
                          for (let f = 0; f < torre.andares; f++)
                            floors.push(units.slice(f * torre.unidades_por_andar, (f + 1) * torre.unidades_por_andar));
                          return (
                            <div key={idx} style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />
                                {torre.nome} — {units.length} unidades
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {[...floors].reverse().map((row, fi) => (
                                  <div key={fi} style={{ display: "flex", gap: 3, alignItems: "center" }}>
                                    <span style={{ fontSize: 9, color: "#334155", width: 20, textAlign: "right", flexShrink: 0 }}>
                                      {torre.andares - fi}°
                                    </span>
                                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                      {row.map(unit => (
                                        <div key={unit} style={{ padding: "2px 5px", borderRadius: 4, background: color + "18", border: `1px solid ${color}35`, color, fontSize: 9, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                                          {unit}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 11, color: "#10B981", fontWeight: 600, textAlign: "center" }}>
                          ✓ {totalUnits} unidades · {obTorres.length} bloco(s)
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* ════ STEP 3: Moradores ════ */}
            {obStep === 3 && (() => {
              const genUnits = (t: { nome: string; andares: number; unidades_por_andar: number }) => {
                const words = t.nome.trim().split(/\s+/);
                const prefix = words[words.length - 1].slice(0, 2).toUpperCase();
                const units: string[] = [];
                for (let f = 1; f <= t.andares; f++)
                  for (let u = 1; u <= t.unidades_por_andar; u++)
                    units.push(`${prefix}${f}${String(u).padStart(2, "0")}`);
                return units;
              };
              const allUnits = obTorres.flatMap(genUnits);
              const filledSet = new Set(obMoradores.map(m => m.unidade));
              const BLOCO_COLORS = ["#6366F1","#14B8A6","#F59E0B","#EF4444","#A855F7","#3B82F6","#10B981","#F97316","#EC4899","#8B5CF6"];

              const addMorador = () => {
                if (!obMorForm.unidade) return;
                const existing = obMoradores.findIndex(m => m.unidade === obMorForm.unidade);
                if (existing >= 0) {
                  setObMoradores(ms => ms.map((m, i) => i === existing ? { ...obMorForm } : m));
                } else {
                  setObMoradores(ms => [...ms, { ...obMorForm }]);
                }
                const nextEmpty = allUnits.find(u => u !== obMorForm.unidade && !filledSet.has(u));
                setObMorForm(f => ({ ...f, unidade: nextEmpty || "", nome: "", email: "", telefone: "", cpf: "", nascimento: "", veiculos: "0" }));
              };

              const downloadTemplate = () => {
                const header = "unidade,nome,email,telefone,tipo,cpf,nascimento,veiculos";
                const names = ["Ana Silva","Carlos Souza","Maria Lima"];
                const cpfs = ["123.456.789-00","987.654.321-00","111.222.333-44"];
                const examples = allUnits.slice(0, 3).map((u, i) => {
                  return `${u},${names[i] || "Morador Exemplo"},morador${i+1}@email.com,(48) 9${i}999-000${i},proprietario,${cpfs[i]},1985-0${i+1}-15,${i}`;
                }).join("\n");
                const csv = header + "\n" + examples;
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = "moradores_template.csv"; a.click();
                URL.revokeObjectURL(url);
              };

              const parseCsv = (text: string) => {
                setObCsvError("");
                const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
                if (lines.length < 2) { setObCsvError("CSV deve ter ao menos uma linha de dados após o cabeçalho."); return; }
                const header = lines[0].toLowerCase().replace(/^\uFEFF/,"").split(",").map(h => h.trim());
                const idx = { unidade: header.indexOf("unidade"), nome: header.indexOf("nome"), email: header.indexOf("email"), telefone: header.indexOf("telefone"), tipo: header.indexOf("tipo"), cpf: header.indexOf("cpf"), nascimento: header.indexOf("nascimento"), veiculos: header.indexOf("veiculos") };
                if (idx.unidade < 0 || idx.nome < 0) { setObCsvError("Colunas obrigatórias ausentes: 'unidade' e 'nome'."); return; }
                const rows = lines.slice(1).map(line => {
                  const cols = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
                  return {
                    unidade: cols[idx.unidade] || "",
                    nome: cols[idx.nome] || "",
                    email: idx.email >= 0 ? (cols[idx.email] || "") : "",
                    telefone: idx.telefone >= 0 ? (cols[idx.telefone] || "") : "",
                    tipo: idx.tipo >= 0 ? (cols[idx.tipo] || "proprietario") : "proprietario",
                    cpf: idx.cpf >= 0 ? (cols[idx.cpf] || "") : "",
                    nascimento: idx.nascimento >= 0 ? (cols[idx.nascimento] || "") : "",
                    veiculos: idx.veiculos >= 0 ? (cols[idx.veiculos] || "0") : "0",
                  };
                }).filter(r => r.unidade && r.nome);
                if (rows.length === 0) { setObCsvError("Nenhuma linha válida encontrada no CSV."); return; }
                setObCsvPreview(rows);
              };

              const importCsv = () => {
                const merged = [...obMoradores];
                obCsvPreview.forEach(r => {
                  const ex = merged.findIndex(m => m.unidade === r.unidade);
                  if (ex >= 0) merged[ex] = r; else merged.push(r);
                });
                setObMoradores(merged);
                setObCsvPreview([]);
                setObMorTab("manual");
                showToast(`✅ ${obCsvPreview.length} morador(es) importado(s)!`, "success");
              };

              return (
                <div style={{ animation: "fadeIn .25s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>👥 Moradores</div>
                    <span style={{ fontSize: 11, color: "#64748B" }}>{obMoradores.length}/{allUnits.length} unidades preenchidas · <span style={{ color: "#475569" }}>opcional</span></span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 14 }}>
                    Cadastre os moradores por unidade — geradas automaticamente das torres configuradas.
                  </div>

                  {/* ── Tab switcher ── */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(0,0,0,.2)", borderRadius: 10, padding: 4, width: "fit-content" }}>
                    {([["manual","✏️ Manual"],["csv","📄 Importar CSV"]] as [typeof obMorTab, string][]).map(([tab, lbl]) => (
                      <button key={tab} onClick={() => { setObMorTab(tab); setObCsvPreview([]); setObCsvError(""); }}
                        style={{ padding: "6px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none", transition: "all .15s",
                          background: obMorTab === tab ? "rgba(99,102,241,.25)" : "transparent",
                          color: obMorTab === tab ? "#A5B4FC" : "#64748B",
                          outline: obMorTab === tab ? "1px solid rgba(99,102,241,.3)" : "none" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

                    {/* ── TAB: Manual ── */}
                    {obMorTab === "manual" && (
                      <div>
                        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 12 }}>➕ Adicionar / Editar Morador</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <div className="form-group">
                              <label className="form-label">Unidade *</label>
                              <select value={obMorForm.unidade} onChange={e => setObMorForm(f => ({ ...f, unidade: e.target.value }))}
                                style={{ width: "100%", padding: "7px 10px", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: "#E2E8F0", fontSize: 13, fontFamily: "inherit" }}>
                                <option value="">Selecione...</option>
                                {allUnits.map(u => <option key={u} value={u}>{u}{filledSet.has(u) ? " ✓" : ""}</option>)}
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Tipo</label>
                              <div style={{ display: "flex", gap: 6, paddingTop: 6 }}>
                                {["proprietario","inquilino"].map(t => (
                                  <button key={t} onClick={() => setObMorForm(f => ({ ...f, tipo: t }))}
                                    style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "1px solid", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                                      borderColor: obMorForm.tipo === t ? "#6366F1" : "#334155",
                                      background: obMorForm.tipo === t ? "rgba(99,102,241,.18)" : "rgba(30,41,59,.5)",
                                      color: obMorForm.tipo === t ? "#A5B4FC" : "#64748B" }}>
                                    {t === "proprietario" ? "🏠 Prop." : "🔑 Inq."}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Nome completo *</label>
                            <input className="form-control" value={obMorForm.nome} onChange={e => setObMorForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Ana Silva" />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div className="form-group">
                              <label className="form-label">E-mail</label>
                              <input className="form-control" type="email" value={obMorForm.email} onChange={e => setObMorForm(f => ({ ...f, email: e.target.value }))} placeholder="ana@email.com" />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Telefone / WhatsApp</label>
                              <input className="form-control" value={obMorForm.telefone} onChange={e => setObMorForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(48) 99999-0000" />
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div className="form-group">
                              <label className="form-label">CPF</label>
                              <input className="form-control" value={obMorForm.cpf} onChange={e => setObMorForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" maxLength={14} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Data de nascimento</label>
                              <input className="form-control" type="date" value={obMorForm.nascimento} onChange={e => setObMorForm(f => ({ ...f, nascimento: e.target.value }))} />
                            </div>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Nº de veículos</label>
                            <div style={{ display: "flex", gap: 8 }}>
                              {["0","1","2","3","4+"].map(v => (
                                <button key={v} type="button" onClick={() => setObMorForm(f => ({ ...f, veiculos: v }))}
                                  style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                                    borderColor: obMorForm.veiculos === v ? "#6366F1" : "#334155",
                                    background: obMorForm.veiculos === v ? "rgba(99,102,241,.18)" : "rgba(30,41,59,.5)",
                                    color: obMorForm.veiculos === v ? "#A5B4FC" : "#64748B" }}>
                                  🚗 {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          <button onClick={addMorador} disabled={!obMorForm.unidade || !obMorForm.nome.trim()}
                            style={{ width: "100%", padding: "10px", marginTop: 4, borderRadius: 10, background: "var(--grad)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: (!obMorForm.unidade || !obMorForm.nome.trim()) ? .4 : 1, transition: "opacity .15s" }}>
                            {filledSet.has(obMorForm.unidade) ? "✏️ Atualizar Morador" : "➕ Adicionar Morador"}
                          </button>
                        </div>
                        {obMoradores.length > 0 ? (
                          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                            {obMoradores.map((m, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{m.tipo === "proprietario" ? "🏠" : "🔑"}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{m.nome}</div>
                                  <div style={{ fontSize: 10, color: "#64748B" }}>{m.unidade} · {m.cpf || m.email || "sem dados"} {m.veiculos && m.veiculos !== "0" ? `· 🚗×${m.veiculos}` : ""}</div>
                                </div>
                                <button onClick={() => setObMorForm({ ...m })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.1)", color: "#A5B4FC", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>editar</button>
                                <button onClick={() => setObMoradores(ms => ms.filter((_, j) => j !== i))} style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.1)", color: "#F87171", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" }}>×</button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ textAlign: "center", color: "#334155", fontSize: 12, padding: "16px 0" }}>Nenhum morador ainda — este passo é opcional.</div>
                        )}
                      </div>
                    )}

                    {/* ── TAB: CSV ── */}
                    {obMorTab === "csv" && (
                      <div>
                        {/* Download template */}
                        <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 8 }}>1️⃣ Baixe o template</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>
                            Planilha pré-preenchida com as unidades do seu condomínio (colunas: unidade, nome, email, telefone, tipo, cpf, nascimento, veiculos).
                          </div>
                          <button onClick={downloadTemplate}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 9, background: "rgba(99,102,241,.12)", border: "1px solid rgba(99,102,241,.22)", color: "#A5B4FC", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            <span>⬇️</span> Baixar template CSV ({allUnits.length} unidades)
                          </button>
                        </div>

                        {/* Upload CSV */}
                        <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 8 }}>2️⃣ Preencha e faça upload</div>
                          <label style={{ display: "block", padding: "20px", border: "2px dashed rgba(99,102,241,.25)", borderRadius: 10, textAlign: "center", cursor: "pointer", transition: "border-color .2s" }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const r = new FileReader(); r.onload = ev => parseCsv(ev.target?.result as string); r.readAsText(f); } }}>
                            <input type="file" accept=".csv,.txt" style={{ display: "none" }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => parseCsv(ev.target?.result as string); r.readAsText(f); } }} />
                            <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
                            <div style={{ fontSize: 12, color: "#64748B" }}>Arraste o CSV aqui ou clique para selecionar</div>
                            <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>Formato: .csv · Codificação: UTF-8</div>
                          </label>
                          {obCsvError && (
                            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, fontSize: 11, color: "#F87171" }}>
                              ⚠️ {obCsvError}
                            </div>
                          )}
                        </div>

                        {/* Preview table */}
                        {obCsvPreview.length > 0 && (
                          <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(16,185,129,.15)", borderRadius: 14, padding: "14px 16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#6EE7B7" }}>3️⃣ Preview — {obCsvPreview.length} moradores</div>
                              <button onClick={() => setObCsvPreview([])} style={{ fontSize: 10, color: "#64748B", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>limpar</button>
                            </div>
                            <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                                    {["Unidade","Nome","CPF","Nasc.","Veíc.","Tipo"].map(h => <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "#64748B", fontWeight: 600 }}>{h}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {obCsvPreview.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                                      <td style={{ padding: "4px 8px", color: "#A5B4FC", fontWeight: 600 }}>{r.unidade}</td>
                                      <td style={{ padding: "4px 8px", color: "#E2E8F0" }}>{r.nome}</td>
                                      <td style={{ padding: "4px 8px", color: "#64748B" }}>{r.cpf || "–"}</td>
                                      <td style={{ padding: "4px 8px", color: "#64748B" }}>{r.nascimento || "–"}</td>
                                      <td style={{ padding: "4px 8px", color: "#64748B", textAlign: "center" }}>{r.veiculos || "0"}</td>
                                      <td style={{ padding: "4px 8px" }}>
                                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: r.tipo === "proprietario" ? "rgba(99,102,241,.15)" : "rgba(245,158,11,.12)", color: r.tipo === "proprietario" ? "#A5B4FC" : "#FCD34D" }}>
                                          {r.tipo === "proprietario" ? "🏠 Prop." : "🔑 Inq."}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <button onClick={importCsv}
                              style={{ width: "100%", padding: "10px", borderRadius: 10, background: "linear-gradient(135deg,#10B981,#059669)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              ✅ Importar {obCsvPreview.length} morador(es)
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Mapa de ocupação (side panel, ambas as abas) ── */}
                    <div style={{ position: "sticky", top: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Mapa de Ocupação</div>
                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 14, maxHeight: 500, overflowY: "auto" }}>
                        {obTorres.map((torre, idx) => {
                          const color = BLOCO_COLORS[idx % BLOCO_COLORS.length];
                          const units = genUnits(torre);
                          const filled = units.filter(u => filledSet.has(u)).length;
                          const pct = units.length ? Math.round(filled / units.length * 100) : 0;
                          return (
                            <div key={idx} style={{ marginBottom: 14 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color, display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />{torre.nome}
                                </div>
                                <span style={{ fontSize: 10, color: "#64748B" }}>{filled}/{units.length}</span>
                              </div>
                              <div style={{ height: 3, background: "rgba(255,255,255,.06)", borderRadius: 2, marginBottom: 6, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .3s" }} />
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {units.map(u => {
                                  const mor = obMoradores.find(m => m.unidade === u);
                                  return (
                                    <div key={u} title={mor ? mor.nome : u}
                                      onClick={() => { setObMorTab("manual"); setObMorForm(f => ({ ...f, unidade: u })); }}
                                      style={{ padding: "2px 5px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer", transition: "all .1s",
                                        background: mor ? color + "22" : "rgba(30,41,59,.6)",
                                        border: `1px solid ${mor ? color + "44" : "rgba(255,255,255,.05)"}`,
                                        color: mor ? color : "#334155",
                                        outline: obMorForm.unidade === u && obMorTab === "manual" ? `2px solid ${color}` : "none" }}>
                                      {u}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ borderTop: "1px solid rgba(255,255,255,.04)", paddingTop: 8, marginTop: 4, fontSize: 11, textAlign: "center" }}>
                          {obMoradores.length > 0
                            ? <span style={{ color: "#10B981", fontWeight: 600 }}>✓ {obMoradores.length} morador(es)</span>
                            : <span style={{ color: "#334155" }}>Clique para pré-selecionar</span>}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* ════ STEP 4: Sensores IoT ════ */}
            {obStep === 4 && (
              <div style={{ animation: "fadeIn .25s ease" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>💧 Sensores IoT de Água</div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>Monitoramento de nível em tempo real — selecione sua situação atual</div>

                {/* ── Seleção A / B ── */}
                {obHasSensors === null && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
                    {[
                      { key: "sim", icon: "📡", title: "Tenho sensores físicos", desc: "Configure os dispositivos IoT já instalados nas cisternas e caixas d'água.", color: "#6366F1", glow: "rgba(99,102,241,.18)" },
                      { key: "nao", icon: "🕐", title: "Não tenho sensores ainda", desc: "Continue sem sensores agora. Você pode instalá-los e configurar depois.", color: "#14B8A6", glow: "rgba(20,184,166,.15)" },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => { setObHasSensors(opt.key as "sim" | "nao"); if (opt.key === "nao") setObSensors([]); }}
                        style={{ background: opt.glow, border: `1.5px solid ${opt.color}30`, borderRadius: 16, padding: "24px 20px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all .2s", display: "flex", flexDirection: "column", gap: 10 }}>
                        <span style={{ fontSize: 32 }}>{opt.icon}</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: opt.color }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{opt.desc}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: opt.color, fontWeight: 600 }}>Selecionar →</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Opção B: sem sensores — prévia em tempo real ── */}
                {obHasSensors === "nao" && (() => {
                  const totalUnits = obTorres.reduce((s, t) => s + t.andares * t.unidades_por_andar, 0) || Number(obCondo.unidades) || 0;
                  const receita = (Number(obTaxaMensal) || 0) * totalUnits;
                  const amenidades = [obInfra.churrasqueira && "Churrasqueira", obInfra.salao && "Salão", obInfra.piscina && "Piscina", obInfra.academia && "Academia"].filter(Boolean);
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
                      <div>
                        <div style={{ background: "rgba(20,184,166,.06)", border: "1px solid rgba(20,184,166,.18)", borderRadius: 16, padding: "24px 20px", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 28 }}>🕐</span>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#2DD4BF" }}>Sem sensores por enquanto</div>
                              <div style={{ fontSize: 11, color: "#64748B" }}>Monitoramento IoT será ativado após instalação física</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {["💧 Nível de cisterna","📊 Alertas automáticos","📱 Push notification","🔔 Histórico"].map(f => (
                              <span key={f} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: "rgba(20,184,166,.1)", border: "1px solid rgba(20,184,166,.2)", color: "#5EEAD4" }}>{f}</span>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => { setObHasSensors(null); setObSensors([
                          { sensor_id: "sensor_cisterna", nome: "Cisterna Principal", local: "Subsolo", capacidade_litros: "20000", nivel_atual: "80" },
                          { sensor_id: "sensor_torre_a", nome: "Caixa Torre A", local: "Telhado Torre A", capacidade_litros: "5000", nivel_atual: "75" },
                        ]); }}
                          style={{ fontSize: 12, padding: "8px 16px", borderRadius: 9, background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.2)", color: "#A5B4FC", cursor: "pointer", fontFamily: "inherit" }}>
                          ← Tenho sensores, configurar agora
                        </button>
                      </div>

                      {/* Prévia em tempo real do condomínio */}
                      <div style={{ position: "sticky", top: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Prévia do Condomínio</div>
                        <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", marginBottom: 2 }}>{obCondo.nome || "—"}</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>{obCondo.cidade || "Cidade"}{obCondo.estado ? " · " + obCondo.estado : ""}</div>
                          {[
                            { label: "Unidades", val: totalUnits || "–", color: "#A5B4FC" },
                            { label: "Moradores", val: obMoradores.length || "–", color: "#6EE7B7" },
                            { label: "Torres", val: obTorres.length || "–", color: "#FCD34D" },
                            { label: "Receita/mês", val: receita > 0 ? `R$ ${receita.toLocaleString("pt-BR")}` : "–", color: "#10B981" },
                          ].map(kpi => (
                            <div key={kpi.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                              <span style={{ color: "#475569" }}>{kpi.label}</span>
                              <span style={{ fontWeight: 700, color: kpi.color }}>{kpi.val}</span>
                            </div>
                          ))}
                          {amenidades.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 9, color: "#334155", marginBottom: 4 }}>ÁREAS COMUNS</div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {amenidades.map(a => (
                                  <span key={String(a)} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(99,102,241,.1)", color: "#A5B4FC" }}>{String(a)}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ marginTop: 10, padding: "8px", background: "rgba(20,184,166,.06)", borderRadius: 8, border: "1px solid rgba(20,184,166,.12)" }}>
                            <div style={{ fontSize: 9, color: "#2DD4BF", fontWeight: 600 }}>💧 SENSORES IoT</div>
                            <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Aguardando instalação física</div>
                            <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 2, marginTop: 6 }}>
                              <div style={{ width: "0%", height: "100%", background: "#14B8A6", borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Opção A: configurar sensores ── */}
                {obHasSensors === "sim" && (
                  <div>
                    <button onClick={() => setObHasSensors(null)}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, background: "transparent", border: "1px solid rgba(255,255,255,.08)", color: "#64748B", cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>
                      ← Mudar opção
                    </button>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
                      {/* Tabela */}
                      <div>
                        <div style={{ overflowX: "auto", marginBottom: 10 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                                {["#", "Nome", "Local", "Cap. (L)", "Nível %", ""].map(h => (
                                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#64748B", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {obSensors.map((s, i) => {
                                const lvl = Number(s.nivel_atual) || 0;
                                const color = lvl < 25 ? "#EF4444" : lvl < 50 ? "#F59E0B" : "#10B981";
                                return (
                                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                                    <td style={{ padding: "6px 8px", color: "#475569" }}>{i + 1}</td>
                                    {(["nome","local","capacidade_litros","nivel_atual"] as (keyof typeof s)[]).map(field => (
                                      <td key={field} style={{ padding: "4px 6px" }}>
                                        {field === "nivel_atual" ? (
                                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <input className="form-control" style={{ fontSize: 11, padding: "4px 7px", width: 54 }}
                                              type="number" min="0" max="100" value={s[field]}
                                              onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, [field]: e.target.value } : x))} />
                                            <span style={{ fontSize: 10, color, fontWeight: 700 }}>{lvl}%</span>
                                          </div>
                                        ) : (
                                          <input className="form-control" style={{ fontSize: 11, padding: "4px 7px", minWidth: field === "nome" || field === "local" ? 110 : 70 }}
                                            value={s[field]}
                                            onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, [field]: e.target.value } : x))} />
                                        )}
                                      </td>
                                    ))}
                                    <td style={{ padding: "4px 6px" }}>
                                      {obSensors.length > 1 && (
                                        <button onClick={() => setObSensors(arr => arr.filter((_, j) => j !== i))}
                                          style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.1)", color: "#F87171", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
                                          ×
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <button onClick={() => setObSensors(arr => [...arr, { sensor_id: `sensor_${arr.length + 1}`, nome: "Novo Sensor", local: "–", capacidade_litros: "1000", nivel_atual: "50" }])}
                            style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, background: "rgba(99,102,241,.12)", border: "1px solid rgba(99,102,241,.2)", color: "#A5B4FC", cursor: "pointer", fontFamily: "inherit" }}>
                            + Adicionar sensor
                          </button>
                        </div>
                        {obSensorQRs.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>QR Codes dos Sensores</div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {obSensorQRs.map((qr, i) => (
                                <button key={i} onClick={() => setObQRModal(i)}
                                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 10, padding: "8px 10px", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                                  <img src={qr} alt={obSensors[i]?.nome} style={{ width: 60, height: 60, display: "block" }} />
                                  <div style={{ fontSize: 9, color: "#A5B4FC", marginTop: 4, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {obSensors[i]?.nome || `S${i+1}`}
                                  </div>
                                </button>
                              ))}
                            </div>
                            <div style={{ fontSize: 10, color: "#334155", marginTop: 6 }}>Clique para ampliar. Fixe o QR em cada reservatório.</div>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>💡 Sensores pré-configurados — ajuste conforme sua infraestrutura.</div>
                      </div>

                      {/* Gauges */}
                      <div style={{ position: "sticky", top: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Monitor em Tempo Real</div>
                        <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                          {obSensors.map((s, i) => {
                            const lvl = Math.min(100, Math.max(0, Number(s.nivel_atual) || 0));
                            const cap = Number(s.capacidade_litros) || 1000;
                            const color = lvl < 25 ? "#EF4444" : lvl < 50 ? "#F59E0B" : "#10B981";
                            const vol = Math.round(cap * lvl / 100);
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 22, height: 44, borderRadius: "3px 3px 5px 5px", border: `1.5px solid ${color}40`, background: "rgba(0,0,0,.25)", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${lvl}%`, background: color + "55", borderRadius: "0 0 3px 3px", transition: "height .5s ease" }} />
                                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${Math.min(lvl, 12)}%`, background: color + "99" }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nome || `Sensor ${i+1}`}</div>
                                    <span style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0, marginLeft: 4 }}>{lvl}%</span>
                                  </div>
                                  <div style={{ height: 5, background: "rgba(255,255,255,.07)", borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${lvl}%`, background: color, borderRadius: 3, transition: "width .5s ease" }} />
                                  </div>
                                  <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{vol.toLocaleString("pt-BR")}L / {cap.toLocaleString("pt-BR")}L · {s.local || "–"}</div>
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", paddingTop: 8, marginTop: 2 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                              <span style={{ color: "#64748B" }}>Total de sensores</span>
                              <span style={{ color: "#94A3B8", fontWeight: 600 }}>{obSensors.length}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}>
                              <span style={{ color: "#64748B" }}>Nível médio</span>
                              <span style={{ color: "#10B981", fontWeight: 700 }}>{Math.round(obSensors.reduce((a, s) => a + (Number(s.nivel_atual) || 0), 0) / (obSensors.length || 1))}%</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}>
                              <span style={{ color: "#64748B" }}>Cap. total</span>
                              <span style={{ color: "#94A3B8", fontWeight: 600 }}>{obSensors.reduce((a, s) => a + (Number(s.capacidade_litros) || 0), 0).toLocaleString("pt-BR")}L</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════ STEP 5: Financeiro ════ */}
            {obStep === 5 && (() => {
              const taxa = Number(obTaxaMensal) || 0;
              const units = Number(obCondo.unidades) || 0;
              const saldo = Number(obSaldo) || 0;
              const receita = taxa * units;
              const reserva = receita * 0.1;
              const manutencao = receita * 0.25;
              const disponivel = receita - reserva - manutencao;
              const venc = Number(obVencimento) || 10;
              const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
              return (
                <div style={{ animation: "fadeIn .25s ease" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>💰 Configuração Financeira</div>
                  <div style={{ fontSize: 13, color: "#64748B", marginBottom: 18 }}>Defina o saldo inicial e as taxas condominiais</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

                    {/* ── Formulário ── */}
                    <div>
                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "18px 18px", marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 14 }}>🏦 Fundo do Condomínio</div>
                        <div className="form-group">
                          <label className="form-label">Saldo Inicial (R$)</label>
                          <input className="form-control" type="number" value={obSaldo} onChange={e => setObSaldo(e.target.value)} placeholder="50000" />
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Saldo atual do fundo de reserva / conta bancária.</div>
                        </div>
                      </div>

                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "18px 18px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 14 }}>📋 Taxas & Cobrança</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div className="form-group">
                            <label className="form-label">Taxa Mensal / Unidade (R$)</label>
                            <input className="form-control" type="number" min="0" value={obTaxaMensal} onChange={e => setObTaxaMensal(e.target.value)} placeholder="648" />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Dia de Vencimento</label>
                            <input className="form-control" type="number" min="1" max="28" value={obVencimento} onChange={e => setObVencimento(e.target.value)} placeholder="10" />
                            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Boletos vencem todo dia {venc || "–"} do mês.</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(99,102,241,.06)", borderRadius: 10, border: "1px solid rgba(99,102,241,.1)" }}>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>Receita bruta mensal estimada</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#A5B4FC", marginTop: 2 }}>R$ {fmtBRL(receita)}</div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{units} un. × R$ {fmtBRL(taxa)}/mês</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Preview financeiro ── */}
                    <div style={{ position: "sticky", top: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                        Projeção Mensal
                      </div>
                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 16 }}>

                        {/* Saldo card */}
                        <div style={{ padding: "10px 12px", background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.12)", borderRadius: 10, marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: "#6EE7B7", fontWeight: 600 }}>💵 SALDO ATUAL</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#10B981", marginTop: 2 }}>R$ {fmtBRL(saldo)}</div>
                        </div>

                        {/* Breakdown bars */}
                        {[
                          { label: "Receita Total", val: receita, color: "#10B981", pct: 100 },
                          { label: "Fundo de Reserva (10%)", val: reserva, color: "#6366F1", pct: 10 },
                          { label: "Manutenção prevista (25%)", val: manutencao, color: "#F59E0B", pct: 25 },
                          { label: "Disponível operacional", val: disponivel, color: "#14B8A6", pct: 65 },
                        ].map(row => (
                          <div key={row.label} style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                              <span style={{ color: "#64748B" }}>{row.label}</span>
                              <span style={{ color: row.color, fontWeight: 700 }}>R$ {fmtBRL(row.val)}</span>
                            </div>
                            <div style={{ height: 4, background: "rgba(255,255,255,.05)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(row.pct, 100)}%`, background: row.color, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}

                        {/* Vencimento */}
                        <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(255,255,255,.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,.06)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "#64748B" }}>📆 Vencimento boletos</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>Dia {venc || "–"}</span>
                          </div>
                        </div>

                        {receita > 0 && (
                          <div style={{ marginTop: 8, fontSize: 10, color: "#334155", textAlign: "center" }}>
                            ≈ R$ {fmtBRL(receita * 12)} / ano em receita
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* ════ STEP 6: Síndico Virtual IA ════ */}
            {obStep === 6 && (() => {
              const personaPreview: Record<string, string> = {
                formal: `Prezado(a) condômino(a),\n\nInformo que a assembleia ordinária está agendada para o dia 20 de abril às 19h, no salão de festas.\n\nContamos com sua presença.\n\nAtenciosamente,\nSíndico Virtual — ${obCondo.nome || "Condomínio"}`,
                amigavel: `Olá! 😊\n\nLembrando que nossa assembleia é dia 20/04 às 19h no salão de festas!\n\nVamos juntos tornar nosso condomínio ainda melhor! 🏢✨\n\nAté lá!\nSeu Síndico Virtual`,
                tecnico: `NOTIFICAÇÃO TÉCNICA — Ref: AGO/2024\n\nData: 20/04 · 19h00 · Local: Salão de Festas\nPauta: Prestação de contas, eleição de conselho, obras de manutenção preventiva.\n\nPresença obrigatória para quórum de deliberação.\n\n[Sistema ImobCore AI]`,
                direto: `📢 Assembleia: 20/04, 19h, salão de festas.\n\nPautas: contas + eleição + obras.\n\nConfirme presença.\n\n— Síndico Virtual`,
              };
              const preview = personaPreview[obIA.persona] || personaPreview.formal;
              return (
                <div style={{ animation: "fadeIn .25s ease" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🤖 Síndico Virtual IA</div>
                  <div style={{ fontSize: 13, color: "#64748B", marginBottom: 18 }}>Configure o comportamento e tom do assistente inteligente</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

                    {/* ── Config form ── */}
                    <div>
                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "18px 18px", marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 14 }}>🎭 Tom de comunicação</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {[["formal", "👔", "Formal"], ["amigavel", "😊", "Amigável"], ["tecnico", "🔬", "Técnico"], ["direto", "⚡", "Direto"]].map(([v, ic, l]) => (
                            <button key={v} onClick={() => setObIA(p => ({ ...p, persona: v }))}
                              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid", fontSize: 13, cursor: "pointer", transition: "all .15s", fontFamily: "inherit",
                                borderColor: obIA.persona === v ? "#6366F1" : "#334155",
                                background: obIA.persona === v ? "rgba(99,102,241,.18)" : "rgba(30,41,59,.5)",
                                color: obIA.persona === v ? "#A5B4FC" : "#64748B", fontWeight: obIA.persona === v ? 600 : 400 }}>
                              {ic} {l}
                            </button>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: "#475569" }}>
                          {obIA.persona === "formal" && "Comunicações formais, linguagem de ofício. Ideal para condomínios corporativos."}
                          {obIA.persona === "amigavel" && "Tom descontraído e positivo. Ótimo para condomínios residenciais familiares."}
                          {obIA.persona === "tecnico" && "Linguagem técnica com referências precisas. Ideal para síndicos profissionais."}
                          {obIA.persona === "direto" && "Mensagens curtas e objetivas. Máxima eficiência para moradores ocupados."}
                        </div>
                      </div>

                      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "18px 18px", marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 14 }}>⚡ Automações</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {([
                            ["greet", "🌅 Saudação automática ao abrir o chat", "IA cumprimenta o usuário com resumo do dia"],
                            ["auto_com", "📢 Comunicados automáticos por IA", "Gera e publica comunicados baseados em eventos"],
                          ] as [keyof typeof obIA, string, string][]).map(([k, lbl, desc]) => (
                            <div key={k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div onClick={() => setObIA(p => ({ ...p, [k]: !p[k] }))} style={{ width: 42, height: 24, borderRadius: 12, background: obIA[k] ? "#6366F1" : "#1E293B", border: "1.5px solid", borderColor: obIA[k] ? "#6366F1" : "#334155", position: "relative", transition: "all .2s", flexShrink: 0, cursor: "pointer" }}>
                                <div style={{ position: "absolute", top: 3, left: obIA[k] ? 20 : 3, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, color: obIA[k] ? "#C4B5FD" : "#64748B", fontWeight: obIA[k] ? 600 : 400 }}>{lbl}</div>
                                <div style={{ fontSize: 10, color: "#334155", marginTop: 1 }}>{desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.1)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 24 }}>🧠</div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#C4B5FD" }}>Claude claude-sonnet-4-6</div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>Anthropic · Contexto 200k · Português nativo · Raciocínio avançado</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Preview de chat ── */}
                    <div style={{ position: "sticky", top: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                        Preview — Tom &ldquo;{obIA.persona}&rdquo;
                      </div>
                      <div style={{ background: "rgba(15,23,42,.8)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, overflow: "hidden" }}>
                        {/* Chat header */}
                        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#E2E8F0" }}>Síndico Virtual IA</div>
                            <div style={{ fontSize: 9, color: "#10B981" }}>● online</div>
                          </div>
                        </div>
                        {/* Chat bubble */}
                        <div style={{ padding: 14 }}>
                          <div style={{ background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.15)", borderRadius: "12px 12px 12px 3px", padding: "10px 12px", maxWidth: "95%" }}>
                            <div style={{ fontSize: 11, color: "#C4B5FD", whiteSpace: "pre-line", lineHeight: 1.5 }}>{preview}</div>
                          </div>
                          <div style={{ fontSize: 9, color: "#334155", marginTop: 4, marginLeft: 2 }}>Síndico Virtual · agora</div>
                        </div>
                        {/* Input mock */}
                        <div style={{ padding: "0 14px 12px" }}>
                          <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "#334155" }}>Pergunte ao Síndico IA...</span>
                            <span style={{ fontSize: 11, color: "#6366F1" }}>⬆</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* ════ STEP 7: Ativação ════ */}
            {obStep === 7 && (() => {
              const totalUnits = obTorres.reduce((s, t) => s + t.andares * t.unidades_por_andar, 0) || Number(obCondo.unidades) || 0;
              const receita = Number(obTaxaMensal) * (Number(obCondo.unidades) || totalUnits);
              const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

              const checks = [
                { label: "Condomínio", ok: !!obCondo.nome.trim(), detail: obCondo.nome || "Não preenchido" },
                { label: "Estrutura", ok: obTorres.length > 0, detail: `${obTorres.length} torre(s) · ${totalUnits} unidades` },
                { label: "Moradores", ok: true, detail: obMoradores.length > 0 ? `${obMoradores.length} cadastrado(s)` : "Opcional — nenhum ainda", optional: true },
                { label: "Sensores IoT", ok: obHasSensors !== null, detail: obHasSensors === "nao" ? "Sem sensores (configurar depois)" : obHasSensors === "sim" ? `${obSensors.length} sensor(es)` : "Não configurado" },
                { label: "Financeiro", ok: Number(obTaxaMensal) > 0, detail: Number(obTaxaMensal) > 0 ? `R$ ${fmtBRL(Number(obTaxaMensal))}/un.` : "Taxa não definida" },
                { label: "Síndico IA", ok: true, detail: `Tom: ${obIA.persona}`, optional: true },
              ];
              const requiredOk = checks.filter(c => !c.optional).every(c => c.ok);

              const sections = [
                {
                  icon: "🏢", title: "Condomínio",
                  items: [
                    ["Nome", obCondo.nome || "–"],
                    ["Cidade / Estado", obCondo.cidade ? `${obCondo.cidade}${obCondo.estado ? " / " + obCondo.estado : ""}` : "–"],
                    ["CNPJ", obCondo.cnpj || "–"],
                    ["Síndico", obCondo.sindico_nome || "–"],
                    ["E-mail síndico", obCondo.sindico_email || "–"],
                  ]
                },
                {
                  icon: "🏗️", title: "Estrutura",
                  items: [
                    ["Torres / Blocos", `${obTorres.length}`],
                    ["Unidades totais", `${totalUnits}`],
                    ["Moradores", `${obMoradores.length} cadastrado(s)`],
                    ["Áreas comuns", [obInfra.churrasqueira && "Churrasqueira", obInfra.salao && "Salão", obInfra.piscina && "Piscina", obInfra.academia && "Academia"].filter(Boolean).join(", ") || "–"],
                  ]
                },
                {
                  icon: "💧", title: "Sensores IoT",
                  items: obHasSensors === "nao"
                    ? [["Status", "Sem sensores físicos"], ["Monitoramento", "Ativado depois da instalação"]]
                    : [
                        ["Sensores configurados", `${obSensors.length}`],
                        ["Nível médio", obSensors.length ? `${Math.round(obSensors.reduce((a, s) => a + (Number(s.nivel_atual) || 0), 0) / obSensors.length)}%` : "–"],
                        ["Cap. total", `${obSensors.reduce((a, s) => a + (Number(s.capacidade_litros) || 0), 0).toLocaleString("pt-BR")} L`],
                      ]
                },
                {
                  icon: "💰", title: "Financeiro",
                  items: [
                    ["Saldo inicial", `R$ ${fmtBRL(Number(obSaldo) || 0)}`],
                    ["Taxa mensal / un.", `R$ ${fmtBRL(Number(obTaxaMensal) || 0)}`],
                    ["Receita mensal est.", `R$ ${fmtBRL(receita)}`],
                    ["Vencimento", `Dia ${obVencimento || "10"}`],
                  ]
                },
                {
                  icon: "🤖", title: "Síndico IA",
                  items: [
                    ["Modelo", "Claude Sonnet"],
                    ["Tom", obIA.persona],
                    ["Saudação auto", obIA.greet ? "✓ Ativado" : "✗ Desativado"],
                    ["Comunicados auto", obIA.auto_com ? "✓ Ativado" : "✗ Desativado"],
                  ]
                },
              ];

              return (
                <div style={{ animation: "fadeIn .25s ease" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🚀 Revisão & Ativação</div>
                  <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>Revise as configurações antes de ativar o ImobCore.</div>

                  {/* ── Checklist de completude ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
                    {checks.map(c => (
                      <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10,
                        background: c.ok ? "rgba(16,185,129,.06)" : c.optional ? "rgba(99,102,241,.05)" : "rgba(239,68,68,.06)",
                        border: `1px solid ${c.ok ? "rgba(16,185,129,.18)" : c.optional ? "rgba(99,102,241,.12)" : "rgba(239,68,68,.2)"}` }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{c.ok ? "✅" : c.optional ? "ℹ️" : "⚠️"}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: c.ok ? "#6EE7B7" : c.optional ? "#A5B4FC" : "#FCA5A5" }}>{c.label}</div>
                          <div style={{ fontSize: 10, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary sections */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {sections.map(sec => (
                      <div key={sec.title} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                          {sec.icon} {sec.title}
                        </div>
                        {sec.items.map(([lbl, val]) => (
                          <div key={lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, paddingBottom: 4, borderBottom: "1px solid rgba(255,255,255,.03)", marginBottom: 4 }}>
                            <span style={{ color: "#475569" }}>{lbl}</span>
                            <span style={{ color: "#CBD5E1", fontWeight: 600, textAlign: "right", maxWidth: "55%" }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Torres chips */}
                  {obTorres.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                      {obTorres.map((t, i) => {
                        const COLORS = ["#6366F1","#14B8A6","#F59E0B","#EF4444","#A855F7"];
                        return (
                          <div key={i} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: COLORS[i % COLORS.length] + "18", border: `1px solid ${COLORS[i % COLORS.length]}35`, color: COLORS[i % COLORS.length] }}>
                            {t.nome} · {t.andares * t.unidades_por_andar} un.
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {obIsReset && (
                    <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.18)", borderRadius: 10, marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F87171" }}>⚠️ Modo Reconfiguração</div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>Todos os dados existentes serão substituídos por esta configuração.</div>
                    </div>
                  )}

                  {!requiredOk && (
                    <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 10, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: "#FCA5A5" }}>⚠️ Preencha os itens obrigatórios antes de ativar: {checks.filter(c => !c.ok && !c.optional).map(c => c.label).join(", ")}.</div>
                    </div>
                  )}

                  <button className="btn-ativar" onClick={ativarImobCore} disabled={obLoading || !requiredOk} style={{ marginTop: 4, width: "100%", opacity: (!requiredOk && !obLoading) ? .5 : 1 }}>
                    {obLoading
                      ? <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span> Ativando ImobCore...</>
                      : <><span>🚀</span> Ativar ImobCore &rarr;</>}
                  </button>
                  <div style={{ textAlign: "center", fontSize: 11, color: "#334155", marginTop: 8 }}>
                    A ativação leva menos de 5 segundos — você será redirecionado ao Painel Gestor.
                  </div>
                </div>
              );
            })()}

          </div>{/* /ob-body */}

          {/* ── Footer (navegação) ── */}
          <div className="ob-footer">
            {/* Back / Cancel */}
            {obStep === 0 ? (
              hasCondo
                ? <button className="btn-ob-back" onClick={() => setView("gestor")}>✕ Voltar ao painel</button>
                : <span />
            ) : (
              <button className="btn-ob-back" onClick={obPrevStep}>← Voltar</button>
            )}

            {/* Counter + Próximo (hidden on step 0 — CTAs are inline) */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#334155" }}>{obStep + 1} / {OB_STEPS.length}</span>
              {obStep > 0 && obStep < OB_STEPS.length - 1 && (
                <button className="btn-ob-next" onClick={obNextStep} disabled={obLoading}>
                  {obLoading ? "💾 Salvando..." : obStep === 1 ? "💾 Salvar e continuar →" : obStep === 2 ? "🏗️ Salvar estrutura →" : obStep === 3 ? `👥 ${obMoradores.length > 0 ? `Salvar ${obMoradores.length} morador(es) →` : "Pular (opcional) →"}` : "Próximo →"}
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ── QR Modal ── */}
        {obQRModal !== null && obSensorQRs[obQRModal] && (
          <div onClick={() => setObQRModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(99,102,241,.3)", borderRadius: 20, padding: "28px 32px", textAlign: "center", maxWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#A5B4FC", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
                📡 QR Code do Sensor
              </div>
              <img src={obSensorQRs[obQRModal]} alt="QR" style={{ width: 180, height: 180, borderRadius: 10 }} />
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{obSensors[obQRModal]?.nome}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>📍 {obSensors[obQRModal]?.local}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>ID: {obSensors[obQRModal]?.sensor_id}</div>
              </div>
              <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(99,102,241,.08)", borderRadius: 8, fontSize: 10, color: "#64748B" }}>
                Imprima e fixe no reservatório físico
              </div>
              <button onClick={() => setObQRModal(null)} style={{ marginTop: 14, padding: "8px 20px", borderRadius: 9, background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.25)", color: "#A5B4FC", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render Phone Sub-Screen ───────────────────────────────────────────────
  const renderSindicoScreen = () => {
    if (!sindicoScreen) return null;

    const screenTitle: Record<string, string> = {
      planejamento: "👤 Meu Perfil",
      sindico: "🤖 Síndico Virtual IA",
      iot: "📡 Monitor IoT",
      agua: "💧 Água & Reservatórios",
      financeiro: "💰 Financeiro",
      misp: "🚨 Alertas MISP",
      energia: "⚡ Módulo Energia",
      gas: "🔥 Módulo Gás",
      manutencao: "🔧 Manutenção",
      crm: "👥 CRM – Moradores",
      comunicados: "📢 Comunicados",
      insights: "💡 Insights & Análises",
      fornecedores: "🏢 Fornecedores e Contatos",
      encomendas: "📦 Encomendas",
      piscina: "🏊 Piscina & Qualidade",
    };

    return (
      <div className="ph-subscreen">
        <div style={{ height: 30, flexShrink: 0 }} />
        <div className="ph-sub-header">
          <button className="back-btn" onClick={() => setSindicoScreen(null)}>←</button>
          <div className="ph-sub-title">{screenTitle[sindicoScreen]}</div>
          {sseOnline && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />}
        </div>

        {/* USUÁRIO: Perfil do síndico */}
        {sindicoScreen === "planejamento" && (
          <div className="ph-sub-body" style={{ paddingBottom: 32 }}>
            {/* Avatar + nome */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"24px 0 20px" }}>
              <div style={{ width:80, height:80, borderRadius:"50%", background:"var(--neu-grad)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:34, fontWeight:900, color:"#fff", boxShadow:"var(--neu-out-lg)" }}>
                S
              </div>
              <div style={{ fontSize:18, fontWeight:900, color:"var(--neu-text)", fontFamily:"Nunito, sans-serif" }}>Carlos Silva</div>
              <div style={{ padding:"4px 14px", borderRadius:20, background:"linear-gradient(135deg,var(--neu-purple),var(--neu-purple-2))", color:"#fff", fontSize:11, fontWeight:800, letterSpacing:".06em" }}>🛡️ SÍNDICO</div>
            </div>

            {/* Info cards */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { icon:"👤", label:"Nome completo",  value:"Carlos Silva" },
                { icon:"🏠", label:"Apartamento",    value:"101" },
                { icon:"🏢", label:"Bloco",           value:"Bloco A" },
                { icon:"✉️", label:"E-mail",          value:"carlos.silva@email.com" },
              ].map(f => (
                <div key={f.label} style={{ background:"var(--neu-bg)", borderRadius:14, boxShadow:"var(--neu-out-sm)", padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:12, boxShadow:"var(--neu-in-sm)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                    {f.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:"var(--neu-text-2)", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:".06em", marginBottom:2 }}>{f.label}</div>
                    <div style={{ fontSize:14, fontWeight:800, color:"var(--neu-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{f.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Condomínio */}
            <div style={{ margin:"16px 0 0", background:"linear-gradient(135deg,rgba(124,92,252,.12),rgba(168,85,247,.08))", border:"1.5px solid rgba(124,92,252,.25)", borderRadius:14, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:22 }}>🏘️</span>
              <div>
                <div style={{ fontSize:10, color:"var(--neu-purple)", fontWeight:800, textTransform:"uppercase" as const, letterSpacing:".06em" }}>Condomínio</div>
                <div style={{ fontSize:13, fontWeight:800, color:"var(--neu-text)" }}>Residencial Parque das Flores</div>
              </div>
            </div>

            {/* Botão SAIR */}
            <button onClick={() => setView("login")} style={{ marginTop:24, width:"100%", padding:"16px", borderRadius:16, background:"rgba(239,68,68,.12)", border:"1.5px solid rgba(239,68,68,.3)", color:"#EF4444", fontSize:15, fontWeight:900, fontFamily:"Nunito, sans-serif", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, boxShadow:"none" }}>
              🚪 Sair
            </button>
          </div>
        )}

        {/* SÍNDICO IA: chat fullscreen */}
        {sindicoScreen === "sindico" && (
          <>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "6px 12px", borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
              {[["📊 Resumo", "Resumo rápido do condomínio"], ["🔴 Urgentes", "Quais OSs urgentes?"], ["💧 Água", "Status dos sensores"], ["🔧 Manutenção", "Análise dos equipamentos e planos de manutenção"], ["⚙️ Críticos", "Quais equipamentos precisam de atenção imediata?"]].map(([l, m]) => (
                <button key={l} className="chip" style={{ whiteSpace: "nowrap", fontSize: 11 }}
                  onClick={() => sendChat(m, mobileHistory, setMobileMsgs, setMobileTyping, setMobileHistory)}>{l}</button>
              ))}
            </div>
            <div className="ph-sub-body" style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 8 }}
              ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
              {mobileMsgs.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="msg-bubble" style={{ fontSize: 12 }}>{m.content}</div>
                  <div className="msg-time">{m.time}</div>
                </div>
              ))}
              {mobileTyping && <TypingIndicator />}
            </div>
            <div className="ph-sub-footer">
              <div style={{ display: "flex", gap: 6 }}>
                <textarea className="fc" value={mobileInput} onChange={e => setMobileInput(e.target.value)} placeholder="Pergunte ao Síndico IA..." rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(mobileInput, mobileHistory, setMobileMsgs, setMobileTyping, setMobileHistory); setMobileInput(""); } }}
                  style={{ flex: 1, fontSize: 12 }} />
                <button className="btn-send" style={{ padding: "8px 12px" }} disabled={mobileTyping}
                  onClick={() => { sendChat(mobileInput, mobileHistory, setMobileMsgs, setMobileTyping, setMobileHistory); setMobileInput(""); }}>
                  ➤
                </button>
              </div>
            </div>
          </>
        )}

        {/* MONITOR IoT: SSE log */}
        {sindicoScreen === "iot" && (
          <div className="ph-sub-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>{sseCount} eventos recebidos</span>
              <span className={`status-badge ${sseOnline ? "badge-online" : "badge-offline"}`}>● {sseOnline ? "live" : "offline"}</span>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
              {logs.slice(0, 50).map((l, i) => (
                <div key={i} className="ph-log-entry">
                  <div className="ph-log-time">{l.time}</div>
                  <span style={{ color: logColor(l.ev), fontWeight: 600 }}>{l.ev}</span>
                  <div style={{ color: "#475569", marginTop: 1, wordBreak: "break-all" }}>{l.data}</div>
                </div>
              ))}
              {logs.length === 0 && <div style={{ color: "#334155", textAlign: "center", padding: 20 }}>Aguardando eventos SSE...</div>}
            </div>
          </div>
        )}

        {/* ÁGUA IoT: sensor rings */}
        {sindicoScreen === "agua" && (
          <div className="ph-sub-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>Nível médio: <strong style={{ color: "var(--cyan)" }}>{nivelMedio}%</strong></span>
              <span style={{ fontSize: 10, color: "#334155" }}>↻ 10s</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(dash?.sensores || []).map(s => <SensorRing key={s.id} sensor={s} small />)}
            </div>
          </div>
        )}

        {/* FINANCEIRO */}
        {sindicoScreen === "financeiro" && (
          <div className="ph-sub-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
              {[
                { label: "Saldo", val: fmtBRL(t?.saldo || 0), color: "var(--green)" },
                { label: "Receitas", val: fmtBRL(t?.total_receitas || 0), color: "var(--cyan)" },
                { label: "Despesas", val: fmtBRL(t?.total_despesas || 0), color: "var(--red)" },
              ].map(k => (
                <div key={k.label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#64748B", marginBottom: 2 }}>{k.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: k.color }}>{k.val}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#34D399", marginBottom: 6 }}>📈 Receitas</div>
            {(dash?.receitas || []).map(r => (
              <div key={r.id} className="ph-fin-item">
                <div><div className="ph-fin-label">{r.descricao}</div><div className="ph-fin-sub">{r.categoria}</div></div>
                <div className="ph-fin-val" style={{ color: "var(--green)" }}>{fmtBRLFull(r.valor)}</div>
              </div>
            ))}
            <div style={{ fontSize: 12, fontWeight: 600, color: "#F87171", marginBottom: 6, marginTop: 12 }}>📉 Despesas</div>
            {(dash?.despesas || []).map(d => (
              <div key={d.id} className="ph-fin-item">
                <div><div className="ph-fin-label">{d.descricao}</div><div className="ph-fin-sub">{d.fornecedor || d.categoria}</div></div>
                <div className="ph-fin-val" style={{ color: "var(--red)" }}>-{fmtBRLFull(d.valor)}</div>
              </div>
            ))}
          </div>
        )}

        {/* MISP */}
        {sindicoScreen === "misp" && (
          <div className="ph-sub-body">
            {(dash?.alertas_publicos || []).length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: "#334155", fontSize: 12 }}>✅ Nenhum alerta ativo</div>
            )}
            {(dash?.alertas_publicos || []).map(a => {
              const nc = { alto: "#EF4444", medio: "#F59E0B", baixo: "#10B981" }[a.nivel] || "#94A3B8";
              return (
                <div key={a.id} className="ph-os-item" style={{ borderColor: nc + "40" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div className="ph-os-titulo">{a.titulo}</div>
                    <span style={{ fontSize: 10, color: nc, fontWeight: 600, marginLeft: 6 }}>{a.nivel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{a.descricao}</div>
                  <div className="ph-os-meta">
                    <span style={{ color: "#475569" }}>{a.tipo}</span>
                    <span style={{ color: "#334155" }}>· {a.cidade}, {a.bairro}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ENERGIA ──────────────────────────────────────────────────── */}
        {sindicoScreen === "energia" && (
          <div className="ph-sub-body">
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {[
                { label: "Consumo Atual", val: "284 kWh", icon: "⚡", color: "#F59E0B" },
                { label: "Meta Mensal", val: "320 kWh", icon: "🎯", color: "#6366F1" },
                { label: "Geração Solar", val: "62 kWh", icon: "☀️", color: "#10B981" },
                { label: "Economia", val: "R$186", icon: "💚", color: "#14B8A6" },
              ].map(k => (
                <div key={k.label} className="ph-os-item" style={{ textAlign: "center", padding: "10px 8px" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.val}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{k.label}</div>
                </div>
              ))}
            </div>
            {/* Alerts */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>⚡ Alertas de Energia</div>
            {[
              { msg: "Pico de consumo no elevador Torre A – 14h", level: "#F59E0B" },
              { msg: "Geração solar abaixo do esperado – nebulosidade", level: "#94A3B8" },
              { msg: "Tarifa fora de ponta ativa", level: "#10B981" },
            ].map((a, i) => (
              <div key={i} className="ph-os-item" style={{ borderColor: a.level + "40", marginBottom: 8 }}>
                <div style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.level, flexShrink: 0 }} />
                  {a.msg}
                </div>
              </div>
            ))}
            {/* Occurrences */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", margin: "14px 0 8px" }}>📋 Ocorrências Recentes</div>
            {energiaOcorrencias.slice(0, 3).map(o => (
              <div key={o.id} className="ph-os-item" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{o.titulo}</span>
                  <span style={{ fontSize: 10, color: { queda:"#EF4444", sobretensao:"#F59E0B", manutencao:"#6366F1", outro:"#94A3B8" }[o.tipo] || "#94A3B8" }}>{o.tipo}</span>
                </div>
                <div style={{ fontSize: 10, color: "#475569" }}>{fmtDate(o.data)}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── GÁS ──────────────────────────────────────────────────────── */}
        {sindicoScreen === "gas" && (() => {
          const nivelAtual = gasLeituras[0]?.nivel ?? 0;
          const isLow = nivelAtual < 20;
          const barColor = nivelAtual > 50 ? "#10B981" : nivelAtual > 20 ? "#F59E0B" : "#EF4444";
          return (
            <div className="ph-sub-body">
              {isLow && (
                <div className="ph-os-item" style={{ borderColor: "#EF444440", background: "rgba(239,68,68,.08)", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171" }}>🚨 NÍVEL CRÍTICO – Solicitar recarga urgente!</div>
                </div>
              )}
              {/* Level indicator */}
              <div className="ph-os-item" style={{ textAlign: "center", padding: 20, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>NÍVEL ATUAL</div>
                <div style={{ fontSize: 42, fontWeight: 800, color: barColor }}>{nivelAtual}%</div>
                <div style={{ margin: "12px auto", width: "100%", height: 12, background: "rgba(255,255,255,.06)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${nivelAtual}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width .5s" }} />
                </div>
                <div style={{ fontSize: 11, color: "#475569" }}>Fornecedora: Ultragaz · Próxima leitura: 15 dias</div>
              </div>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "Mín", val: Math.min(...gasLeituras.map(l=>l.nivel)) + "%", color: "#EF4444" },
                  { label: "Médio", val: Math.round(gasLeituras.reduce((s,l)=>s+l.nivel,0)/gasLeituras.length) + "%", color: "#F59E0B" },
                  { label: "Máx", val: Math.max(...gasLeituras.map(l=>l.nivel)) + "%", color: "#10B981" },
                ].map(k => (
                  <div key={k.label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {/* Recent readings */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>📋 Leituras Recentes</div>
              {gasLeituras.slice(0, 5).map((l, i) => (
                <div key={i} className="ph-fin-item">
                  <div>
                    <div className="ph-fin-label">Leitura {i + 1}</div>
                    <div className="ph-fin-sub">{l.obs || "—"}</div>
                  </div>
                  <div className="ph-fin-val" style={{ color: l.nivel < 20 ? "#EF4444" : l.nivel < 50 ? "#F59E0B" : "#10B981" }}>{l.nivel}%</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── MANUTENÇÃO ───────────────────────────────────────────────── */}
        {sindicoScreen === "manutencao" && (() => {
          const orcTotal = planoList.reduce((s,p) => s + (Number(p.custo_total)||0), 0);
          const equipCobertos = new Set(planoList.flatMap(p => (p.equipamentos_itens||[]).map(e => e.equipId))).size;
          const proxExec = planoList.filter(p=>p.proxima_execucao).sort((a,b)=>a.proxima_execucao.localeCompare(b.proxima_execucao))[0]?.proxima_execucao || "—";
          const planosAtivos = planoList.filter(p => p.status !== "inativo");
          const mTipoColor: Record<string,string> = { preventiva:"#10B981", corretiva:"#EF4444", preditiva:"#3B82F6", "inspeção":"#F59E0B" };
          const mTipoIcon: Record<string,string>  = { preventiva:"🛡️", corretiva:"🔧", preditiva:"🔮", "inspeção":"🔍" };
          const mPeriodIcon: Record<string,string> = { "diário":"🔄","semanal":"📆","quinzenal":"📆","mensal":"🗓️","bimestral":"🗓️","trimestral":"📊","semestral":"📅","anual":"🏆" };
          const mEqStatusColor: Record<string,{bg:string;c:string;icon:string}> = {
            operacional: { bg:"rgba(16,185,129,.18)", c:"#34D399", icon:"✅" },
            atencao:     { bg:"rgba(245,158,11,.18)", c:"#FBBF24", icon:"⚠️" },
            manutencao:  { bg:"rgba(239,68,68,.18)",  c:"#F87171", icon:"🔧" },
            inativo:     { bg:"rgba(100,116,139,.18)", c:"#94A3B8", icon:"⬛" },
          };
          return (
            <div className="ph-sub-body">
              {/* ── Dashboard Stats — cards coloridos ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {[
                  { label:"Total Planos",    val:String(planoList.length),
                    icon:"📋", color:"#A78BFA", bg:"rgba(167,139,250,.18)", border:"rgba(167,139,250,.35)" },
                  { label:"Orçamento",       val:orcTotal>=1000?`R$${(orcTotal/1000).toFixed(1)}k`:`R$${orcTotal.toFixed(0)}`,
                    icon:"💰", color:"#34D399", bg:"rgba(52,211,153,.15)",   border:"rgba(52,211,153,.35)" },
                  { label:"Equip. Cobertos", val:String(equipCobertos),
                    icon:"⚙️", color:"#FBBF24", bg:"rgba(251,191,36,.15)",   border:"rgba(251,191,36,.35)" },
                  { label:"Próx. Execução",  val:proxExec!=="—"?proxExec.slice(5).split("-").reverse().join("/"):"—",
                    icon:"📅", color:"#38BDF8", bg:"rgba(56,189,248,.15)",   border:"rgba(56,189,248,.35)" },
                ].map(k => (
                  <div key={k.label} style={{ background:k.bg, border:`1.5px solid ${k.border}`, borderRadius:12, padding:"12px 10px 10px", textAlign:"center" as const }}>
                    <div style={{ fontSize:26, marginBottom:4 }}>{k.icon}</div>
                    <div style={{ fontSize:18, fontWeight:800, color:k.color, lineHeight:1.1 }}>{k.val}</div>
                    <div style={{ fontSize:9, color:"#64748B", fontWeight:600, marginTop:3, textTransform:"uppercase" as const, letterSpacing:".04em" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Planos de Manutenção ── */}
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontWeight:800, color:"#A5B4FC", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:".05em" }}>
                <span style={{ fontSize:14 }}>📋</span> Planos de Manutenção
              </div>
              {planosAtivos.length === 0 ? (
                <div style={{ textAlign:"center", padding:"24px 0", color:"#475569", fontSize:12 }}>Nenhum plano cadastrado</div>
              ) : (
                planosAtivos.map(p => {
                  const tc   = mTipoColor[p.tipo]   || "#94A3B8";
                  const tic  = mTipoIcon[p.tipo]    || "📋";
                  const pic  = mPeriodIcon[p.periodicidade] || "🗓️";
                  return (
                    <div key={p.id} className="ph-os-item" style={{ marginBottom:10, padding:"12px 12px 10px", borderLeft:`3px solid ${tc}`, borderRadius:10, background:"rgba(255,255,255,.035)" }}>
                      {/* Header: ícone tipo + código + nome */}
                      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:`${tc}22`, border:`1px solid ${tc}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                          {tic}
                        </div>
                        <div style={{ flex:1 }}>
                          {p.codigo && <div style={{ fontSize:9, color:"#64748B", fontWeight:700, marginBottom:1 }}>#{p.codigo}</div>}
                          <div style={{ fontSize:12, fontWeight:800, color:"#F1F5F9", lineHeight:1.3 }}>{p.nome}</div>
                        </div>
                      </div>
                      {/* Badges: tipo + periodicidade */}
                      <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" as const }}>
                        <span style={{ fontSize:9, padding:"3px 8px", borderRadius:20, fontWeight:700, background:`${tc}25`, color:tc, border:`1px solid ${tc}55` }}>
                          {tic} {p.tipo}
                        </span>
                        <span style={{ fontSize:9, padding:"3px 8px", borderRadius:20, fontWeight:700, background:"rgba(99,102,241,.15)", color:"#A5B4FC", border:"1px solid rgba(99,102,241,.3)" }}>
                          {pic} {p.periodicidade}
                        </span>
                      </div>
                      {/* Equipment items */}
                      {(p.equipamentos_itens||[]).length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4, marginBottom:8 }}>
                          {(p.equipamentos_itens||[]).map((ei,i) => (
                            <span key={i} style={{ fontSize:9, padding:"2px 8px", borderRadius:6, background:`${tc}12`, border:`1px solid ${tc}30`, color:"#CBD5E1", display:"flex", alignItems:"center", gap:3 }}>
                              ⚙️ {ei.equipNome}
                              {ei.custo_previsto > 0 && <span style={{ color:"#FBBF24", fontWeight:700, marginLeft:2 }}>R${Number(ei.custo_previsto).toLocaleString("pt-BR",{maximumFractionDigits:0})}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Footer */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:`1px solid ${tc}20`, paddingTop:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#64748B" }}>
                          📅 <span style={{ color:"#38BDF8", fontWeight:700 }}>{p.proxima_execucao || "—"}</span>
                        </div>
                        {p.custo_total > 0 && (
                          <span style={{ fontSize:11, fontWeight:800, color:"#34D399", background:"rgba(52,211,153,.12)", borderRadius:6, padding:"2px 8px" }}>
                            R$ {Number(p.custo_total).toLocaleString("pt-BR",{minimumFractionDigits:2})}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* ── Equipamentos Resumo ── */}
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontWeight:800, color:"#94A3B8", margin:"16px 0 10px", textTransform:"uppercase" as const, letterSpacing:".05em" }}>
                <span style={{ fontSize:14 }}>⚙️</span> Equipamentos ({equipList.length})
              </div>
              {equipList.map(eq => {
                const st = mEqStatusColor[eq.status] || mEqStatusColor["inativo"];
                return (
                  <div key={eq.id} className="ph-os-item" style={{ marginBottom:8, borderLeft:`3px solid ${st.c}`, padding:"10px 12px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13 }}>{st.icon}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:"#F1F5F9" }}>{eq.nome}</span>
                        </div>
                        <div style={{ fontSize:10, color:"#64748B", marginTop:2, paddingLeft:19 }}>{eq.categoria} · {eq.local}</div>
                      </div>
                      <span style={{ fontSize:9, padding:"3px 9px", borderRadius:20, fontWeight:700, background:st.bg, color:st.c, border:`1px solid ${st.c}44`, whiteSpace:"nowrap" as const }}>
                        {eq.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── CRM – MORADORES ──────────────────────────────────────────── */}
        {sindicoScreen === "crm" && (() => {
          const [srch, setSrch] = [crmSearch, setCrmSearch];
          const lista = crmMoradores.filter(m =>
            m.nome.toLowerCase().includes(srch.toLowerCase()) ||
            m.email.toLowerCase().includes(srch.toLowerCase()) ||
            m.bloco.toLowerCase().includes(srch.toLowerCase())
          );
          return (
            <div className="ph-sub-body">
              {/* Search */}
              <div style={{ position: "relative", marginBottom: 12 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
                <input
                  value={srch} onChange={e => setSrch(e.target.value)}
                  placeholder="Buscar morador, e-mail, bloco..."
                  style={{ width: "100%", padding: "9px 12px 9px 36px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#E2E8F0", fontSize: 12, fontFamily: "Inter, sans-serif", boxSizing: "border-box" as const }}
                />
              </div>
              {/* Stats */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Total", val: crmMoradores.length, color: "#6366F1" },
                  { label: "Pet Owners", val: crmMoradores.filter(m=>m.pet).length, color: "#10B981" },
                  { label: "Home Office", val: crmMoradores.filter(m=>m.homeOffice).length, color: "#A855F7" },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Residents list */}
              {lista.map(m => (
                <div key={m.id} className="ph-os-item" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#A855F7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {m.nome.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{m.nome}</div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Bloco {m.bloco} · Apto {m.apto}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{m.email}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" as const }}>
                        {m.segmentos.slice(0,2).map((s: string) => (
                          <span key={s} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(99,102,241,.15)", color: "#A5B4FC", fontWeight: 600 }}>{s}</span>
                        ))}
                        {m.pet && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(16,185,129,.15)", color: "#34D399", fontWeight: 600 }}>🐾 Pet</span>}
                        {m.homeOffice && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(168,85,247,.15)", color: "#C084FC", fontWeight: 600 }}>💻 HO</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: m.score >= 80 ? "#10B981" : m.score >= 60 ? "#F59E0B" : "#EF4444" }}>{m.score}</div>
                  </div>
                </div>
              ))}
              {lista.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#334155", fontSize: 12 }}>Nenhum morador encontrado</div>}
            </div>
          );
        })()}

        {/* ── COMUNICADOS ──────────────────────────────────────────────── */}
        {sindicoScreen === "comunicados" && (
          <div className="ph-sub-body">
            {/* Quick generate */}
            <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#A5B4FC", marginBottom: 8 }}>🤖 Gerar Comunicado com IA</div>
              <select value={comTema} onChange={e => setComTema(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: "#E2E8F0", fontSize: 12, fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
                <option value="">Selecione um tema...</option>
                {["Manutenção Programada","Água – Interrupção","Assembleia","Segurança","Regras do Condomínio","Festividades"].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <button className="btn-primary btn" onClick={gerarComunicado}
                style={{ width: "100%", padding: "9px", fontSize: 12, borderRadius: 8 }}>
                {comLoading ? "Gerando..." : "✨ Gerar com IA"}
              </button>
            </div>
            {/* List */}
            {(dash?.comunicados || []).length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#334155", fontSize: 12 }}>Nenhum comunicado ainda</div>}
            {(dash?.comunicados || []).map(c => (
              <div key={c.id} className="ph-os-item" style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{c.titulo}</div>
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 6 }}>
                  {c.corpo?.substring(0, 120)}{(c.corpo?.length ?? 0) > 120 ? "..." : ""}
                </div>
                <div style={{ fontSize: 10, color: "#334155" }}>{fmtDate(c.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── INSIGHTS & ANÁLISES ──────────────────────────────────────── */}
        {sindicoScreen === "insights" && (
          <>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "6px 12px", borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
              {[["💡 Resumo", "Gere insights executivos sobre o condomínio agora"],
                ["🔴 Riscos", "Quais são os principais riscos e vulnerabilidades?"],
                ["💰 Financeiro", "Análise financeira: eficiência e oportunidades de economia"],
                ["🔧 Manutenção", "Relatório completo de manutenção: equipamentos críticos, custos, cronograma de planos"],
                ["📈 Tendências", "Tendências de consumo de água, energia e gás do mês"]
              ].map(([l, m]) => (
                <button key={l} className="chip" style={{ whiteSpace: "nowrap", fontSize: 11 }}
                  onClick={() => sendChat(m, deskHistory, setDeskMsgs, setDeskTyping, setDeskHistory)}>{l}</button>
              ))}
            </div>
            <div className="ph-sub-body" style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 8 }}
              ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
              {deskMsgs.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="msg-bubble" style={{ fontSize: 12 }}>{m.content}</div>
                  <div className="msg-time">{m.time}</div>
                </div>
              ))}
              {deskTyping && <TypingIndicator />}
            </div>
            <div className="ph-sub-footer">
              <div style={{ display: "flex", gap: 6 }}>
                <textarea className="fc" placeholder="Pergunte sobre insights..." rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const v = (e.target as HTMLTextAreaElement).value; sendChat(v, deskHistory, setDeskMsgs, setDeskTyping, setDeskHistory); (e.target as HTMLTextAreaElement).value = ""; }}}
                  style={{ flex: 1, fontSize: 12 }} />
                <button className="btn-send" style={{ padding: "8px 12px" }} disabled={deskTyping}>➤</button>
              </div>
            </div>
          </>
        )}
        {sindicoScreen === "piscina" && (() => {
          const ideal = {
            ph:           { min:7.2, max:7.6, unit:"",     label:"pH" },
            cloro:        { min:1.0, max:3.0, unit:" ppm", label:"Cloro" },
            temperatura:  { min:24,  max:30,  unit:"°C",   label:"Temp" },
            alcalinidade: { min:80,  max:120, unit:" ppm", label:"Alc." },
            dureza_calcica:{ min:200,max:400, unit:" ppm", label:"Dureza" },
          } as const;
          type PKey2 = keyof typeof ideal;
          const isOk2 = (key: PKey2, v?: number) => v===undefined||v===null ? true : v>=ideal[key].min && v<=ideal[key].max;
          const last = piscinaList[0];
          const allOk = last ? (isOk2("ph",last.ph)&&isOk2("cloro",last.cloro)&&isOk2("temperatura",last.temperatura)&&isOk2("alcalinidade",last.alcalinidade)&&isOk2("dureza_calcica",last.dureza_calcica)) : null;
          const colPiscMap: Record<PKey2,string> = { ph:"#0EA5E9", cloro:"#22C55E", temperatura:"#F97316", alcalinidade:"#6366F1", dureza_calcica:"#A855F7" };
          const fmtDt = (iso: string) => new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
          return (
            <div className="ph-sub-body" style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:12 }}>
              {/* Status geral */}
              <div style={{ borderRadius:14, padding:"12px 14px", background: allOk===null?"var(--neu-bg)":allOk?"rgba(34,197,94,.12)":"rgba(239,68,68,.12)", border:`1px solid ${allOk===null?"var(--card-border)":allOk?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}`, display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:28 }}>🏊</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:"var(--neu-text)" }}>
                    {allOk===null ? "Sem leituras registradas" : allOk ? "Água em boas condições" : "⚠️ Parâmetros fora do ideal"}
                  </div>
                  {last && <div style={{ fontSize:11, color:"var(--neu-text-2)", marginTop:2 }}>Última leitura: {fmtDt(last.created_at)}</div>}
                </div>
                {allOk!==null && (
                  <span style={{ background:allOk?"#22C55E22":"#EF444422", color:allOk?"#16A34A":"#DC2626", border:`1px solid ${allOk?"#22C55E55":"#EF444455"}`, borderRadius:20, padding:"4px 10px", fontSize:10, fontWeight:800 }}>
                    {allOk?"✓ OK":"⚠ ALERTA"}
                  </span>
                )}
              </div>

              {/* Parâmetros da última leitura */}
              {last && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"var(--neu-text-2)", textTransform:"uppercase", letterSpacing:".06em" }}>Parâmetros Atuais</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {(["ph","cloro","temperatura","alcalinidade","dureza_calcica"] as PKey2[]).map(key => {
                      const cfg=ideal[key]; const val=(last as Record<string,number|undefined>)[key] as number|undefined;
                      const ok=isOk2(key,val); const col=colPiscMap[key];
                      return (
                        <div key={key} style={{ background:`${col}12`, border:`1px solid ${col}25`, borderRadius:12, padding:"10px 12px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                            <span style={{ fontSize:10, fontWeight:700, color:col, textTransform:"uppercase" }}>{cfg.label}</span>
                            {val!=null ? <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:99, background:ok?"#22C55E22":"#EF444422", color:ok?"#16A34A":"#DC2626" }}>{ok?"OK":"!"}</span> : null}
                          </div>
                          <div style={{ fontSize:20, fontWeight:800, color:"var(--neu-text)", lineHeight:1.1 }}>
                            {val!=null ? `${val}${cfg.unit}` : <span style={{ color:"var(--neu-text-2)", fontSize:12 }}>N/A</span>}
                          </div>
                          <div style={{ fontSize:9, color:"var(--neu-text-2)", marginTop:2 }}>Ideal: {cfg.min}–{cfg.max}{cfg.unit}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Botão adicionar leitura */}
              <button
                onClick={() => { setPiscModal(true); setPiscEditId(null); setPiscForm(emptyPiscinaForm()); }}
                style={{ background:"linear-gradient(135deg,#0EA5E9,#0284C7)", border:"none", borderRadius:12, padding:"12px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                ＋ Registrar Nova Leitura
              </button>

              {/* Histórico */}
              <div style={{ fontSize:11, fontWeight:800, color:"var(--neu-text-2)", textTransform:"uppercase", letterSpacing:".06em" }}>Histórico</div>
              {piscinaLoading && <div style={{ textAlign:"center", padding:24, color:"var(--neu-text-2)" }}>Carregando...</div>}
              {!piscinaLoading && piscinaList.length===0 && (
                <div style={{ textAlign:"center", padding:24, color:"var(--neu-text-2)", fontSize:13 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🏊</div>Sem leituras registradas.
                </div>
              )}
              {!piscinaLoading && piscinaList.slice(0,10).map(l => (
                <div key={l.id} style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:12, padding:"10px 12px", display:"flex", flexDirection:"column", gap:4 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"var(--neu-text-2)" }}>{fmtDt(l.created_at)}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:l.status==="ok"?"#22C55E22":"#EF444422", color:l.status==="ok"?"#16A34A":"#DC2626" }}>{l.status.toUpperCase()}</span>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#0EA5E9" }}>pH {l.ph}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:"#22C55E" }}>Cl {l.cloro}ppm</span>
                    {l.temperatura!=null && <span style={{ fontSize:12, fontWeight:700, color:"#F97316" }}>{l.temperatura}°C</span>}
                    {l.alcalinidade!=null && <span style={{ fontSize:12, fontWeight:700, color:"#6366F1" }}>Alc {l.alcalinidade}ppm</span>}
                  </div>
                  {l.observacoes && <div style={{ fontSize:11, color:"var(--neu-text-2)", fontStyle:"italic" }}>{l.observacoes}</div>}
                </div>
              ))}
            </div>
          );
        })()}

        {sindicoScreen === "encomendas" && (() => {
          const ENC_STATUS_SIND: Record<Encomenda["status"], { label: string; color: string; bg: string }> = {
            aguardando_retirada: { label:"AGUARDANDO",  color:"#F59E0B", bg:"rgba(245,158,11,.15)" },
            notificado:          { label:"NOTIFICADO",  color:"#3B82F6", bg:"rgba(59,130,246,.15)" },
            retirado:            { label:"RETIRADO",    color:"#10B981", bg:"rgba(16,185,129,.15)" },
            devolvido:           { label:"DEVOLVIDO",   color:"#EF4444", bg:"rgba(239,68,68,.15)"  },
          };
          const pendentes = encList.filter(e=>e.status==="aguardando_retirada");
          const recentes = [...encList].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,20);
          const fmtD = (iso:string) => new Date(iso).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
          return (
            <div className="ph-sub-body" style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {/* Resumo rápido */}
              <div style={{ display:"flex", gap:8 }}>
                {[
                  { label:"Total",      val:encList.length,                                          color:"#6366f1" },
                  { label:"Aguardando", val:encList.filter(e=>e.status==="aguardando_retirada").length, color:"#F59E0B" },
                  { label:"Notificado", val:encList.filter(e=>e.status==="notificado").length,          color:"#3B82F6" },
                  { label:"Retirado",   val:encList.filter(e=>e.status==="retirado").length,            color:"#10B981" },
                ].map(s=>(
                  <div key={s.label} style={{ flex:1, background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:10, padding:"10px 0", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}</div>
                    <div style={{ fontSize:9, color:"var(--neu-text-2)", fontWeight:700, marginTop:1 }}>{s.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              {/* Alerta pendentes */}
              {pendentes.length>0 && (
                <div style={{ background:"rgba(245,158,11,.12)", border:"1px solid rgba(245,158,11,.30)", borderRadius:12, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>📬</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:"#F59E0B" }}>{pendentes.length} encomenda{pendentes.length>1?"s":""} aguardando retirada</div>
                    <div style={{ fontSize:11, color:"var(--neu-text-2)" }}>Notifique os moradores</div>
                  </div>
                </div>
              )}

              {/* Lista */}
              <div style={{ fontSize:11, fontWeight:800, color:"var(--neu-text-2)", textTransform:"uppercase", letterSpacing:".06em", marginTop:4 }}>Recentes</div>
              {recentes.length===0 && (
                <div style={{ textAlign:"center", padding:24, color:"var(--neu-text-2)", fontSize:13 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📦</div>Sem encomendas registradas.
                </div>
              )}
              {recentes.map(enc=>{
                const st = ENC_STATUS_SIND[enc.status];
                return (
                  <div key={enc.id} style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:12, padding:"12px 14px", display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--neu-text)" }}>{enc.morador_nome}</div>
                      <span style={{ background:st.bg, color:st.color, borderRadius:20, padding:"2px 8px", fontSize:9, fontWeight:800, letterSpacing:".04em" }}>{st.label}</span>
                    </div>
                    <div style={{ display:"flex", gap:12, fontSize:11, color:"var(--neu-text-2)" }}>
                      <span>🏠 Bl.{enc.bloco} — Ap.{enc.unidade}</span>
                      <span>📅 {fmtD(enc.received_at)}</span>
                      {enc.codigo_rastreio && <span>🔍 {enc.codigo_rastreio}</span>}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {enc.tipos.map(t=>(
                        <span key={t} style={{ background:"rgba(99,102,241,.12)", color:"#6366f1", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{t}</span>
                      ))}
                    </div>
                    {enc.status==="aguardando_retirada" && (
                      <button onClick={()=>encUpdateStatus(enc.id,"notificado")}
                        style={{ marginTop:4, background:"linear-gradient(135deg,#3B82F6,#2563EB)", border:"none", borderRadius:8, padding:"7px", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        🔔 Notificar Morador
                      </button>
                    )}
                    {enc.status==="notificado" && (
                      <button onClick={()=>encUpdateStatus(enc.id,"retirado")}
                        style={{ marginTop:4, background:"linear-gradient(135deg,#10B981,#059669)", border:"none", borderRadius:8, padding:"7px", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        ✅ Confirmar Retirada
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {sindicoScreen === "fornecedores" && (() => {
          const sfDetail = sindFornecDetail ? fornecList.find(f=>f.id===sindFornecDetail) : null;
          return (
            <div className="ph-sub-body" style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {fornecList.length === 0 && (
                <div style={{ textAlign:"center", padding:32, color:"var(--neu-text-2)", fontSize:13 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🏢</div>
                  Nenhum fornecedor cadastrado.
                </div>
              )}
              {sfDetail ? (
                <div>
                  <button onClick={()=>setSindFornecDetail(null)} style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", border:"none", borderRadius:8, padding:"6px 12px", color:"var(--neu-purple)", fontSize:12, cursor:"pointer", marginBottom:14 }}>← Voltar</button>
                  <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16 }}>
                    <div style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:12, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>{sfDetail.icone||"🏢"}</div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:16, color:"var(--neu-text)" }}>{sfDetail.nome}</div>
                      <span style={{ background:"rgba(16,185,129,.15)", color:"#059669", border:"1px solid rgba(16,185,129,.3)", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{sfDetail.categoria}</span>
                    </div>
                  </div>
                  {([
                    sfDetail.telefone   ? { icon:"📞", label:"Telefone",  val:sfDetail.telefone   } : null,
                    sfDetail.whatsapp   ? { icon:"💬", label:"WhatsApp",  val:sfDetail.whatsapp   } : null,
                    sfDetail.email      ? { icon:"✉️",  label:"E-mail",   val:sfDetail.email      } : null,
                    sfDetail.endereco   ? { icon:"📍", label:"Endereço",  val:sfDetail.endereco   } : null,
                    sfDetail.observacoes? { icon:"📝", label:"Obs.",      val:sfDetail.observacoes} : null,
                  ] as ({icon:string;label:string;val:string}|null)[]).filter(Boolean).map((r, i) => r && (
                    <div key={i} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:"1px solid var(--card-border)", fontSize:13 }}>
                      <span style={{ fontSize:16 }}>{r.icon}</span>
                      <div><div style={{ fontSize:10, color:"var(--neu-text-2)", fontWeight:700 }}>{r.label}</div><div style={{ color:"var(--neu-text)" }}>{r.val}</div></div>
                    </div>
                  ))}
                  <button onClick={()=>fornecWhatsApp(sfDetail)} disabled={!(sfDetail.whatsapp||sfDetail.telefone)}
                    style={{ marginTop:18, width:"100%", background:"linear-gradient(135deg,#25D366,#128C7E)", border:"none", borderRadius:12, padding:"12px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    💬 Enviar WhatsApp
                  </button>
                </div>
              ) : (
                fornecList.map(f => (
                  <div key={f.id} onClick={()=>setSindFornecDetail(f.id)}
                    style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:12, padding:"12px 14px", cursor:"pointer", display:"flex", gap:12, alignItems:"center" }}>
                    <div style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-in-sm)", borderRadius:10, width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{f.icone||"🏢"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"var(--neu-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.nome}</div>
                      <div style={{ fontSize:11, color:"var(--neu-text-2)" }}>{f.categoria}{f.telefone ? " · "+f.telefone : ""}</div>
                    </div>
                    <button onClick={e=>{ e.stopPropagation(); fornecWhatsApp(f); }} disabled={!(f.whatsapp||f.telefone)}
                      style={{ background:f.whatsapp||f.telefone?"linear-gradient(135deg,#25D366,#128C7E)":"var(--neu-bg)", boxShadow:f.whatsapp||f.telefone?"none":"var(--neu-out-sm)", border:"none", borderRadius:8, padding:"7px 10px", color:f.whatsapp||f.telefone?"#fff":"var(--neu-text-2)", fontSize:11, fontWeight:600, cursor:f.whatsapp||f.telefone?"pointer":"not-allowed", whiteSpace:"nowrap", flexShrink:0 }}>
                      💬 WA
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })()}

      </div>
    );
  };

  const renderMoradorScreen = () => {
    if (!moradorScreen) return null;

    const screenTitle: Record<string, string> = {
      reserva: "📅 Reservar Espaço",
      visitante: "🚗 Autorizar Visitante",
      boletos: "💳 Boletos",
      agua: "💧 Status da Água",
      comunicados: "📢 Comunicados",
      misp: "🚨 Alertas Públicos",
      encomendas: "📦 Minhas Encomendas",
      fornecedores: "🏢 Fornecedores e Contatos",
    };

    return (
      <div className="ph-subscreen">
        <div style={{ height: 30, flexShrink: 0 }} />
        <div className="ph-sub-header">
          <button className="back-btn" onClick={() => setMoradorScreen(null)}>←</button>
          <div className="ph-sub-title">{screenTitle[moradorScreen]}</div>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: sseOnline ? "#10B981" : "#EF4444" }} />
        </div>

        {/* RESERVAR: calendário */}
        {moradorScreen === "reserva" && (
          <div className="ph-sub-body">
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>Salão de Festas — {now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
            <div className="cal-grid">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="cal-day-hdr">{d}</div>)}
              {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {Array(daysInMonth).fill(null).map((_, i) => {
                const day = i + 1;
                const isToday = day === now.getDate();
                const isAvail = availDays.has(day) && !isToday;
                const isTaken = takenDays.has(day);
                return (
                  <div key={day} className={`cal-day ${isToday ? "today" : isAvail ? "avail" : isTaken ? "taken" : ""}`}
                    style={calSel === day ? { background: "rgba(99,102,241,.4)", borderColor: "var(--indigo)", color: "#fff" } : {}}
                    onClick={() => isAvail && setCalSel(calSel === day ? null : day)}>
                    {day}
                  </div>
                );
              })}
            </div>
            {calSel && (
              <div className="cal-sel">
                ✅ {calSel}/{now.getMonth() + 1} selecionado
                <div style={{ marginTop: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}>Confirmar Reserva</button>
                </div>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 10, color: "#334155", display: "flex", gap: 10 }}>
              <span style={{ color: "#34D399" }}>■ Disponível</span>
              <span style={{ color: "#6366F1" }}>■ Hoje</span>
              <span style={{ color: "#334155" }}>■ Ocupado</span>
            </div>
          </div>
        )}

        {/* VISITANTE: formulário */}
        {moradorScreen === "visitante" && (
          <div className="ph-sub-body">
            {visitanteSent ? (
              <div style={{ textAlign: "center", padding: 30 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#34D399", marginBottom: 6 }}>Visitante Autorizado!</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>A portaria foi notificada sobre {visitante.nome}.</div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => { setVisitanteSent(false); setVisitante({ nome: "", documento: "", motivo: "", unidade: "204", placa: "" }); }}>
                  Novo visitante
                </button>
              </div>
            ) : (
              <>
                {[
                  { label: "Nome completo *", key: "nome", placeholder: "Ex: João da Silva" },
                  { label: "Documento (CPF/RG)", key: "documento", placeholder: "000.000.000-00" },
                  { label: "Motivo da visita", key: "motivo", placeholder: "Ex: Visita familiar" },
                  { label: "Placa do veículo", key: "placa", placeholder: "ABC-1234 (opcional)" },
                ].map(f => (
                  <div key={f.key} className="form-group">
                    <label className="form-label">{f.label}</label>
                    <input className="form-control" style={{ fontSize: 13 }} placeholder={f.placeholder}
                      value={(visitante as Record<string, string>)[f.key]}
                      onChange={e => setVisitante(v => ({ ...v, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <button className="btn btn-primary" style={{ width: "100%" }}
                  onClick={() => { if (!visitante.nome.trim()) { showToast("Informe o nome", "warn"); return; } setVisitanteSent(true); showToast("✅ Visitante autorizado!", "success"); }}>
                  ✅ Autorizar Entrada
                </button>
              </>
            )}
          </div>
        )}

        {/* BOLETOS: lançamentos */}
        {moradorScreen === "boletos" && (
          <div className="ph-sub-body">
            <div style={{ background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#FCD34D", marginBottom: 2 }}>⚠️ Vencimento próximo</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Taxa condominial Abril 2026</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)", marginTop: 4 }}>R$ 648,00</div>
              <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>Vence em 10/04/2026</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 8 }}>Histórico de Pagamentos</div>
            {([...(dash?.receitas || []), ...(dash?.despesas?.slice(0, 2) || [])]).slice(0, 6).map((item, i) => (
              <div key={i} className="ph-fin-item">
                <div>
                  <div className="ph-fin-label">{(item as Receita).descricao}</div>
                  <div className="ph-fin-sub">{(item as Receita).categoria}</div>
                </div>
                <div>
                  <div className="ph-fin-val" style={{ color: "var(--green)" }}>{fmtBRLFull((item as Receita).valor)}</div>
                  <div style={{ fontSize: 9, color: "#334155", textAlign: "right" }}>pago</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ÁGUA: nível médio */}
        {moradorScreen === "agua" && (
          <div className="ph-sub-body" style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 8, fontSize: 12, color: "#475569" }}>Nível médio atualizado a cada 10s</div>
            <div className="avg-ring-wrap" style={{ margin: "0 auto 16px" }}>
              {(() => {
                const R = 50, C = 2 * Math.PI * R, arc = C * 0.75;
                const filled = arc * (nivelMedio / 100);
                const color = nivelMedio >= 60 ? "#10B981" : nivelMedio >= 30 ? "#F59E0B" : "#EF4444";
                return (
                  <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, transform: "rotate(-135deg)" }}>
                    <circle className="ring-bg" cx="60" cy="60" r={R} strokeDasharray={`${arc} ${C - arc}`} />
                    <circle className="ring-fg" cx="60" cy="60" r={R} stroke={color} strokeDasharray={`${filled} ${(arc - filled) + (C - arc)}`} />
                  </svg>
                );
              })()}
              <div className="ring-label" style={{ fontSize: 22, color: nivelMedio >= 60 ? "#10B981" : nivelMedio >= 30 ? "#F59E0B" : "#EF4444" }}>
                {nivelMedio}%
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
              {nivelMedio >= 60 ? "✅ Abastecimento normal" : nivelMedio >= 30 ? "⚠️ Atenção ao consumo" : "🔴 Nível crítico!"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(dash?.sensores || []).map(s => <SensorRing key={s.id} sensor={s} small />)}
            </div>
          </div>
        )}

        {/* COMUNICADOS */}
        {moradorScreen === "comunicados" && (
          <div className="ph-sub-body">
            {(dash?.comunicados || []).length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: "#334155", fontSize: 12 }}>Nenhum comunicado</div>
            )}
            {(dash?.comunicados || []).map(c => (
              <div key={c.id} className="ph-os-item" style={{ marginBottom: 10 }}>
                <div className="ph-os-titulo">{c.titulo}</div>
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4, marginTop: 4 }}>{c.corpo}</div>
                <div className="ph-os-meta" style={{ marginTop: 6 }}>
                  {c.gerado_por_ia && <span style={{ color: "var(--purple)", fontSize: 10 }}>✨ IA</span>}
                  <span style={{ color: "#334155" }}>{fmtDate(c.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MISP morador */}
        {moradorScreen === "misp" && (
          <div className="ph-sub-body">
            <div style={{ fontSize: 11, color: "var(--neu-text-2)", marginBottom: 10 }}>Alertas públicos da região – atualizado via Supabase</div>
            {(dash?.alertas_publicos || []).length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: "var(--neu-text-2)", fontSize: 12 }}>✅ Sem alertas ativos</div>
            )}
            {(dash?.alertas_publicos || []).map(a => {
              const nc = { alto: "#EF4444", medio: "#F59E0B", baixo: "#10B981" }[a.nivel] || "#94A3B8";
              return (
                <div key={a.id} className="ph-os-item" style={{ borderColor: nc + "40" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div className="ph-os-titulo">{a.titulo}</div>
                    <span style={{ fontSize: 10, color: nc, fontWeight: 600 }}>{a.nivel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--neu-text-2)", marginBottom: 4 }}>{a.descricao}</div>
                  <div style={{ fontSize: 10, color: "var(--neu-text-2)" }}>{a.cidade} – {a.bairro}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* MORADOR: Minhas Encomendas */}
        {moradorScreen === "encomendas" && (() => {
          const ENC_ST: Record<Encomenda["status"], { label: string; color: string; emoji: string }> = {
            aguardando_retirada: { label:"Aguardando Retirada", color:"#F59E0B", emoji:"⏳" },
            notificado:          { label:"Você foi notificado", color:"#3B82F6", emoji:"🔔" },
            retirado:            { label:"Retirado",            color:"#10B981", emoji:"✅" },
            devolvido:           { label:"Devolvido",           color:"#EF4444", emoji:"↩️" },
          };
          const minhas = encList.filter(e => e.morador_nome.toLowerCase().includes("fabio") || e.unidade === "101A");
          const pendentes = minhas.filter(e => e.status !== "retirado" && e.status !== "devolvido");
          const fmtD = (iso?: string|null) => iso ? new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "–";
          return (
            <div className="ph-sub-body" style={{ paddingBottom: 24 }}>
              {/* Banner pendentes */}
              {pendentes.length > 0 && (
                <div style={{ background:"linear-gradient(135deg,rgba(245,158,11,.18),rgba(245,158,11,.06))", border:"1.5px solid rgba(245,158,11,.35)", borderRadius:16, padding:"14px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:24 }}>📦</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:"#F59E0B" }}>Você tem {pendentes.length} encomenda{pendentes.length>1?"s":""} pendente{pendentes.length>1?"s":""}!</div>
                    <div style={{ fontSize:11, color:"var(--neu-text-2)", marginTop:2 }}>Passe na portaria para retirar</div>
                  </div>
                </div>
              )}
              {minhas.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 20px", color:"var(--neu-text-2)" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"var(--neu-text)" }}>Nenhuma encomenda</div>
                  <div style={{ fontSize:12, marginTop:4 }}>Suas encomendas aparecerão aqui quando chegarem na portaria</div>
                </div>
              )}
              {minhas.map(enc => {
                const st = ENC_ST[enc.status];
                return (
                  <div key={enc.id} style={{ background:"var(--neu-bg)", borderRadius:16, boxShadow:"var(--neu-out)", padding:"16px", marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                        {enc.tipos.map(t => <span key={t} style={{ padding:"3px 10px", borderRadius:8, background:"rgba(124,92,252,.12)", color:"var(--neu-purple)", fontSize:11, fontWeight:700 }}>{t==="pacote"?"📦":t==="correio"?"✉️":t==="documento"?"📄":"⚠️"} {t}</span>)}
                      </div>
                      <span style={{ fontSize:10, fontWeight:800, color:st.color, background:`${st.color}20`, padding:"3px 9px", borderRadius:8 }}>{st.emoji} {st.label}</span>
                    </div>
                    {enc.codigo_rastreio && <div style={{ fontSize:11, color:"var(--neu-text-2)", marginBottom:6 }}>🏷️ Rastreio: <span style={{ color:"var(--neu-purple)", fontWeight:700 }}>{enc.codigo_rastreio}</span></div>}
                    <div style={{ fontSize:11, color:"var(--neu-text-2)", marginBottom:4 }}>📍 Portaria – {enc.bloco} · Unidade {enc.unidade}</div>
                    <div style={{ height:1, background:"rgba(124,92,252,.12)", margin:"10px 0" }}/>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div style={{ fontSize:10, color:"var(--neu-text-2)" }}>🕐 Chegou: <span style={{ color:"var(--neu-text)", fontWeight:600 }}>{fmtD(enc.received_at)}</span></div>
                      {enc.notified_at && <div style={{ fontSize:10, color:"var(--neu-text-2)" }}>🔔 Notificado: <span style={{ color:"var(--neu-text)", fontWeight:600 }}>{fmtD(enc.notified_at)}</span></div>}
                      {enc.withdrawn_at && <div style={{ fontSize:10, color:"var(--neu-text-2)" }}>✅ Retirado: <span style={{ color:"#10B981", fontWeight:600 }}>{fmtD(enc.withdrawn_at)}</span></div>}
                      {enc.returned_at && <div style={{ fontSize:10, color:"var(--neu-text-2)" }}>↩️ Devolvido: <span style={{ color:"#EF4444", fontWeight:600 }}>{fmtD(enc.returned_at)}</span></div>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* MORADOR: Fornecedores (read-only) */}
        {moradorScreen === "fornecedores" && (() => {
          const mfDetail = morFornecDetail ? fornecList.find(f=>f.id===morFornecDetail) : null;
          return (
            <div className="ph-sub-body" style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {fornecList.length === 0 && (
                <div style={{ textAlign:"center", padding:32, color:"var(--neu-text-2)", fontSize:13 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🏢</div>
                  Nenhum fornecedor disponível.
                </div>
              )}
              {mfDetail ? (
                <div>
                  <button onClick={()=>setMorFornecDetail(null)} style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", border:"none", borderRadius:8, padding:"6px 12px", color:"var(--neu-purple)", fontSize:12, cursor:"pointer", marginBottom:14 }}>← Voltar</button>
                  <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16 }}>
                    <div style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:12, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>{mfDetail.icone||"🏢"}</div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:16, color:"var(--neu-text)" }}>{mfDetail.nome}</div>
                      <span style={{ background:"rgba(16,185,129,.15)", color:"#059669", border:"1px solid rgba(16,185,129,.3)", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{mfDetail.categoria}</span>
                    </div>
                  </div>
                  {([
                    mfDetail.telefone    ? { icon:"📞", label:"Telefone",  val:mfDetail.telefone    } : null,
                    mfDetail.whatsapp    ? { icon:"💬", label:"WhatsApp",  val:mfDetail.whatsapp    } : null,
                    mfDetail.email       ? { icon:"✉️",  label:"E-mail",   val:mfDetail.email       } : null,
                    mfDetail.endereco    ? { icon:"📍", label:"Endereço",  val:mfDetail.endereco    } : null,
                    mfDetail.observacoes ? { icon:"📝", label:"Obs.",      val:mfDetail.observacoes } : null,
                  ] as ({icon:string;label:string;val:string}|null)[]).filter(Boolean).map((r, i) => r && (
                    <div key={i} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:"1px solid var(--card-border)", fontSize:13 }}>
                      <span style={{ fontSize:16 }}>{r.icon}</span>
                      <div><div style={{ fontSize:10, color:"var(--neu-text-2)", fontWeight:700 }}>{r.label}</div><div style={{ color:"var(--neu-text)" }}>{r.val}</div></div>
                    </div>
                  ))}
                  <button onClick={()=>fornecWhatsApp(mfDetail)} disabled={!(mfDetail.whatsapp||mfDetail.telefone)}
                    style={{ marginTop:18, width:"100%", background:"linear-gradient(135deg,#25D366,#128C7E)", border:"none", borderRadius:12, padding:"12px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    💬 Enviar WhatsApp
                  </button>
                </div>
              ) : (
                fornecList.map(f => (
                  <div key={f.id} onClick={()=>setMorFornecDetail(f.id)}
                    style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-out-sm)", borderRadius:12, padding:"12px 14px", cursor:"pointer", display:"flex", gap:12, alignItems:"center" }}>
                    <div style={{ background:"var(--neu-bg)", boxShadow:"var(--neu-in-sm)", borderRadius:10, width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{f.icone||"🏢"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"var(--neu-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.nome}</div>
                      <div style={{ fontSize:11, color:"var(--neu-text-2)" }}>{f.categoria}{f.telefone ? " · "+f.telefone : ""}</div>
                    </div>
                    <button onClick={e=>{ e.stopPropagation(); fornecWhatsApp(f); }} disabled={!(f.whatsapp||f.telefone)}
                      style={{ background:f.whatsapp||f.telefone?"linear-gradient(135deg,#25D366,#128C7E)":"var(--neu-bg)", boxShadow:f.whatsapp||f.telefone?"none":"var(--neu-out-sm)", border:"none", borderRadius:8, padding:"7px 10px", color:f.whatsapp||f.telefone?"#fff":"var(--neu-text-2)", fontSize:11, fontWeight:600, cursor:f.whatsapp||f.telefone?"pointer":"not-allowed", whiteSpace:"nowrap", flexShrink:0 }}>
                      💬 WA
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  /* ── LOGIN SCREEN ────────────────────────────────────────────────────── */
  if (view === "login") {
    const modeInfo = {
      morador:  { icon: "🏠", label: "Morador",       dest: "morador"  as const, btnLabel: "Entrar como Morador",  desc: "App Mobile do Morador" },
      sindico:  { icon: "🛡️", label: "Síndico",       dest: "sindico"  as const, btnLabel: "Entrar como Síndico",  desc: "App Mobile do Síndico" },
      gestor:   { icon: "⚡", label: "Painel Gestor",  dest: "gestor"   as const, btnLabel: "Acessar Painel Gestor", desc: "Interface Desktop" },
    }[loginMode];

    const handleLogin = () => {
      if (!loginEmail.trim()) { showToast("Informe o e-mail", "warn"); return; }
      if (!loginPass.trim())  { showToast("Informe a senha", "warn"); return; }
      setView("selector");
    };

    return (
      <>
        <style>{CSS}</style>
        <div className="toast-container">
          {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
        </div>
        <div className="login-root">
          <div className="login-card">
            {/* Logo */}
            <div className="login-logo-row">
              <div className="login-logo-icon">🏢</div>
              <div className="login-logo-text">
                <span className="login-logo-title">ImobCore</span>
                <span className="login-logo-sub">Gestão Inteligente</span>
              </div>
            </div>

            {/* Welcome */}
            <div className="login-welcome">
              <div className="login-welcome-h">👋 Bem-vindo</div>
              <div className="login-welcome-sub">Acesse seu condomínio</div>
            </div>

            {/* 3 Access tabs */}
            <div className="login-tabs">
              {(["morador","sindico","gestor"] as const).map(m => (
                <button key={m} className={`login-tab ${loginMode === m ? "active" : ""}`} onClick={() => setLoginMode(m)}>
                  <span>{modeInfo.icon && m === loginMode ? { morador:"🏠", sindico:"🛡️", gestor:"⚡" }[m] : { morador:"🏠", sindico:"🛡️", gestor:"⚡" }[m]}</span>
                  <span>{{ morador:"Morador", sindico:"Síndico", gestor:"Gestor" }[m]}</span>
                </button>
              ))}
            </div>

            {/* Form card */}
            <form className="login-form-card" onSubmit={e => { e.preventDefault(); handleLogin(); }}>
              <div className="login-field">
                <label className="login-field-label">Email</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">✉️</span>
                  <input
                    className="login-input"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="login-field">
                <label className="login-field-label">Senha</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">🔑</span>
                  <input
                    className="login-input"
                    type={showLoginPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPass}
                    onChange={e => setLoginPass(e.target.value)}
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button type="button" className="login-eye" onClick={() => setShowLoginPass(s => !s)}>
                    {showLoginPass ? "🙈" : "👁️"}
                  </button>
                </div>
                <div className="login-forgot"><a onClick={() => showToast("Recuperação de senha enviada para o e-mail", "success")}>Esqueci a senha</a></div>
              </div>
              <input type="submit" style={{ display: "none" }} />
            </form>

            {/* Login button */}
            <button className="login-btn" onClick={handleLogin}>
              {modeInfo.btnLabel}
            </button>

            {/* Divider */}
            <div className="login-divider">
              <div className="login-divider-line" />
              <span className="login-divider-text">Acesso Rápido</span>
              <div className="login-divider-line" />
            </div>

            {/* Biometria + Face ID */}
            <div className="login-quick">
              <button className="login-quick-btn" onClick={() => showToast("Autenticação biométrica ativada", "success")}>
                <div className="login-quick-icon">
                  {/* Fingerprint SVG */}
                  <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="32" cy="32" r="3" fill="#38BDF8"/>
                    <path d="M32 26 C28.7 26 26 28.7 26 32 C26 36 28 38 28 42" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                    <path d="M32 26 C35.3 26 38 28.7 38 32 C38 36 36 39 35 43" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                    <path d="M22 34 C22 26.3 26.3 21 32 21 C37.7 21 42 26.3 42 32 C42 38 40 42 38 46" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.8"/>
                    <path d="M18 33 C18 22.5 24.3 16 32 16 C39.7 16 46 22.5 46 32 C46 39 43 44 40 49" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.55"/>
                    <path d="M14 30 C14 18 22 11 32 11 C42 11 50 18 50 30 C50 40 46 47 42 52" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.3"/>
                  </svg>
                </div>
                <span className="login-quick-label">Biometria</span>
              </button>
              <button className="login-quick-btn" onClick={() => showToast("Face ID ativado", "success")}>
                <div className="login-quick-icon faceid">
                  {/* Face ID SVG */}
                  <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Corner brackets */}
                    <path d="M14 24 L14 14 L24 14" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M40 14 L50 14 L50 24" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M50 40 L50 50 L40 50" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M24 50 L14 50 L14 40" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Face: head */}
                    <circle cx="32" cy="26" r="7" stroke="#38BDF8" strokeWidth="1.7" fill="none"/>
                    {/* Face: eyes */}
                    <circle cx="29" cy="25" r="1.2" fill="#38BDF8"/>
                    <circle cx="35" cy="25" r="1.2" fill="#38BDF8"/>
                    {/* Face: smile */}
                    <path d="M29 28.5 Q32 31 35 28.5" stroke="#38BDF8" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
                    {/* Body arc */}
                    <path d="M20 47 C20 40 25.4 35 32 35 C38.6 35 44 40 44 47" stroke="#38BDF8" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.8"/>
                  </svg>
                </div>
                <span className="login-quick-label">Face ID</span>
              </button>
            </div>

            {/* Footer links */}
            <div className="login-footer-link">
              Não tem conta? <a onClick={() => showToast("Entre em contato com o síndico para solicitar acesso", "success")}>Solicitar acesso</a>
            </div>
            <div className="login-version">ImobCore v2.4.1 · {modeInfo.desc}</div>
          </div>
        </div>
      </>
    );
  }

  // ── SELECTOR SCREEN ────────────────────────────────────────────────────────
  if (view === "selector") {
    const emailName = loginEmail.split("@")[0] || "Usuário";
    const displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    const avatarLetter = displayName.charAt(0).toUpperCase();
    const roleLabel = { morador: "MORADOR", sindico: "SÍNDICO", gestor: "GESTOR" }[loginMode];
    const condoName = dash?.condominios?.[0]?.nome || "Residencial Parque das Flores";

    const options = [
      {
        id: "sindico",
        label: "App Síndico",
        sub: "Dashboard completo, IoT, IA e gestão",
        color: "#3B82F6",
        bg: "rgba(59,130,246,.12)",
        dest: "sindico" as const,
        icon: (
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <path d="M16 3 L28 8 L28 17 C28 23 22.5 28.5 16 30 C9.5 28.5 4 23 4 17 L4 8 Z" stroke="#60A5FA" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
            <path d="M11 16 L14.5 19.5 L21 13" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        id: "gestor",
        label: "Painel Admin",
        sub: "Visão desktop com todos os módulos",
        color: "#6366F1",
        bg: "rgba(99,102,241,.12)",
        dest: "gestor" as const,
        icon: (
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect x="3" y="5" width="26" height="17" rx="2.5" stroke="#818CF8" strokeWidth="1.8" fill="none"/>
            <path d="M10 28 L22 28" stroke="#818CF8" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M16 22 L16 28" stroke="#818CF8" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="16" cy="13" r="4" stroke="#818CF8" strokeWidth="1.5" fill="none"/>
          </svg>
        ),
      },
      {
        id: "morador",
        label: "App Morador",
        sub: "Boletos, reservas, ocorrências",
        color: "#10B981",
        bg: "rgba(16,185,129,.12)",
        dest: "morador" as const,
        icon: (
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <path d="M4 14 L16 4 L28 14 L28 28 L4 28 Z" stroke="#34D399" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
            <rect x="12" y="20" width="8" height="8" rx="1" stroke="#34D399" strokeWidth="1.5" fill="none"/>
            <path d="M12 20 L12 24 M20 20 L20 24" stroke="#34D399" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
          </svg>
        ),
      },
    ];

    return (
      <>
        <style>{CSS}</style>
        <style>{`
          .sel-screen{min-height:100vh;background:#060d18;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;font-family:'Inter',sans-serif}
          .sel-card{width:100%;max-width:380px;display:flex;flex-direction:column;gap:0}
          .sel-header{display:flex;align-items:center;gap:14px;margin-bottom:28px;padding:0 2px}
          .sel-avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#6366F1);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 4px 16px rgba(99,102,241,.35)}
          .sel-name{font-size:22px;font-weight:800;color:#F1F5F9;line-height:1.1}
          .sel-role{font-size:11px;font-weight:600;color:#64748B;letter-spacing:.06em;margin-top:3px}
          .sel-prompt{font-size:14px;color:#94A3B8;margin-bottom:20px;padding:0 2px;font-weight:400;line-height:1.5}
          .sel-option{display:flex;align-items:center;gap:14px;background:#0d1625;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px 16px;margin-bottom:10px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
          .sel-option:hover{background:#101e30;border-color:rgba(255,255,255,.14);transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,0,0,.25)}
          .sel-option:active{transform:translateY(0);box-shadow:none}
          .sel-opt-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
          .sel-opt-body{flex:1;min-width:0}
          .sel-opt-title{font-size:15px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
          .sel-opt-sub{font-size:12px;color:#64748B;line-height:1.4}
          .sel-opt-arrow{font-size:18px;color:#334155;flex-shrink:0;transition:all .2s}
          .sel-option:hover .sel-opt-arrow{color:#94A3B8;transform:translateX(3px)}
          .sel-signout{display:block;width:100%;margin-top:10px;padding:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;color:#475569;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;transition:all .2s}
          .sel-signout:hover{background:rgba(255,255,255,.07);color:#94A3B8}
          .sel-footer{text-align:center;font-size:11px;color:#1E3A5F;margin-top:22px;letter-spacing:.04em}
        `}</style>
        <div className="sel-screen">
          <div className="sel-card">
            {/* Header */}
            <div className="sel-header">
              <div className="sel-avatar">{avatarLetter}</div>
              <div>
                <div className="sel-name">Olá, {displayName}!</div>
                <div className="sel-role">{roleLabel} · {condoName}</div>
              </div>
            </div>

            <div className="sel-prompt">Escolha como deseja acessar o sistema:</div>

            {/* Options */}
            {options.map(opt => (
              <div key={opt.id} className="sel-option" onClick={() => setView(opt.dest)}>
                <div className="sel-opt-icon" style={{ background: opt.bg }}>
                  {opt.icon}
                </div>
                <div className="sel-opt-body">
                  <div className="sel-opt-title">{opt.label}</div>
                  <div className="sel-opt-sub">{opt.sub}</div>
                </div>
                <div className="sel-opt-arrow">→</div>
              </div>
            ))}

            {/* Sign out */}
            <button className="sel-signout" onClick={() => { setLoginEmail(""); setLoginPass(""); setView("login"); }}>
              Sair da conta
            </button>

            {/* Footer */}
            <div className="sel-footer">ImobCore SaaS v3.0 · 3 interfaces integradas</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>

      {/* TOPBAR */}
      <div className="topbar" style={{ display: (view === "sindico" || view === "morador") ? "none" : "flex" }}>
        <div className="logo"><span>🤖</span> ImobCore <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 600, background: "rgba(99,102,241,.1)", padding: "2px 6px", borderRadius: 4 }}>v2</span></div>

        {/* Main view buttons — hide when in onboarding with no condo */}
        {((dash?.condominios?.length ?? 0) > 0 || view !== "onboarding") && (
          <div className="view-btns">
            <button className={`view-btn ${view === "gestor" ? "active" : ""}`} onClick={() => setView("gestor")}>⚡ Painel Gestor</button>
            <button className={`view-btn ${view === "sindico" ? "active" : ""}`} onClick={() => setView("sindico")}>📱 App Síndico</button>
            <button className={`view-btn ${view === "morador" ? "active" : ""}`} onClick={() => setView("morador")}>🏠 App Morador</button>
          </div>
        )}

        {/* ── Condo selector dropdown ── */}
        {(dash?.condominios?.length ?? 0) > 0 && (() => {
          const currentCondo = dash!.condominios.find(c => c.id === condId) ?? dash!.condominios[0];
          return (
            <div style={{ position:"relative" as const, marginLeft:4 }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCondDropOpen(false); }}>
              <button
                title="Trocar condomínio ativo"
                onClick={() => setCondDropOpen(o => !o)}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 12px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, cursor:"pointer", color:"var(--c-text)", fontSize:12, fontWeight:600, fontFamily:"inherit", minWidth:160 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background: currentCondo?.cor_primaria || "#7C5CFC", flexShrink:0, boxShadow:`0 0 6px ${currentCondo?.cor_primaria || "#7C5CFC"}88` }} />
                <span style={{ maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{currentCondo?.nome ?? "Condomínio"}</span>
                <span style={{ fontSize:9, opacity:.6, marginLeft:"auto" }}>▾</span>
              </button>
              {condDropOpen && (
                <div tabIndex={-1} style={{ position:"absolute" as const, top:"calc(100% + 8px)", left:0, width:260, background:"#0D1321", border:"1px solid rgba(255,255,255,.1)", borderRadius:12, padding:8, zIndex:9999, boxShadow:"0 20px 40px rgba(0,0,0,.6)" }}>
                  <div style={{ fontSize:10, color:"#475569", fontWeight:700, padding:"4px 12px 8px", textTransform:"uppercase" as const, letterSpacing:1 }}>Condomínios</div>
                  {dash!.condominios.map(c => {
                    const active = c.id === (condId ?? dash!.condominios[0].id);
                    const planBadge: Record<string,string> = { free:"#475569", starter:"#0D9488", pro:"#7C5CFC", admin_plus:"#D97706" };
                    return (
                      <div key={c.id} tabIndex={0} onClick={() => { setCondDropOpen(false); loadDashboard(c.id); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, cursor:"pointer", background: active ? "rgba(255,255,255,.07)" : "transparent", transition:"background .15s" }}>
                        <span style={{ width:10, height:10, borderRadius:"50%", background: c.cor_primaria || "#7C5CFC", flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:active?700:500, color: active ? "#fff" : "#94A3B8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{c.nome}</div>
                          <div style={{ fontSize:10, color:"#475569" }}>{c.cidade}{c.estado ? ` · ${c.estado}` : ""}</div>
                        </div>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4, background: planBadge[c.plano||"free"]+"22", color: planBadge[c.plano||"free"], border:`1px solid ${planBadge[c.plano||"free"]}44`, textTransform:"uppercase" as const }}>{c.plano||"free"}</span>
                        {active && <span style={{ fontSize:10, color:c.cor_primaria||"#7C5CFC" }}>✓</span>}
                      </div>
                    );
                  })}
                  <div style={{ borderTop:"1px solid rgba(255,255,255,.07)", marginTop:8, paddingTop:6 }}>
                    <div tabIndex={0} onClick={() => { setPanel("condominios"); setView("gestor"); setCondDropOpen(false); }} style={{ padding:"8px 12px", fontSize:12, color:"#A5B4FC", cursor:"pointer", borderRadius:8, display:"flex", alignItems:"center", gap:6 }}>
                      🏢 Gerenciar condomínios
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Onboarding button — pulsing if no condo yet */}
        {(dash?.condominios?.length ?? 0) === 0 ? (
          <button className="btn-onboard" onClick={() => { setObStep(0); setObIsReset(false); setView("onboarding"); }}>
            ⚙️ Configurar ImobCore
          </button>
        ) : (
          <>
            <div className="topbar-sep" />
            <button className={`view-btn ${view === "onboarding" ? "active" : ""}`}
              onClick={() => { setObStep(0); setObIsReset(false); setView("onboarding"); }}
              style={{ fontSize: 11 }}>
              ⚙️ Onboarding
            </button>
            <button className="btn-reconfig"
              onClick={() => { setObStep(0); setObIsReset(true); setView("onboarding"); }}
              title="Apagar tudo e reconfigurar do zero">
              🔄 Reconfigurar
            </button>
          </>
        )}

        <div className={`rt-badge ${sseOnline ? "" : "offline"}`} style={{ marginLeft: "auto" }}>
          <div className={`dot ${sseOnline ? "pulse" : ""}`} />
          <span>{sseOnline ? "Realtime Ativo" : "Conectando..."}</span>
        </div>
        <div className="clock">{clock}</div>
        <button className="theme-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title={theme === "dark" ? "Mudar para Tema Claro" : "Mudar para Tema Escuro"}>
          {theme === "dark" ? "☀️ Claro" : "🌙 Escuro"}
        </button>
        <button className="theme-toggle" style={{ borderColor: "rgba(239,68,68,.3)", color: "#F87171" }} onClick={() => setView("selector")} title="Trocar interface">
          🔀 Interfaces
        </button>
      </div>

      {/* ══ VIEW 1: PAINEL GESTOR ═════════════════════════════════════════════ */}
      <div className={`view ${view === "gestor" ? "active" : ""}`}>
        <div className="sidebar">
          <div className="sb-label">Síndico Virtual</div>
          {[
            { id: "sv-chat", icon: "💬", label: "Chat IA" },
            { id: "sv-insights", icon: "💡", label: "Insights" },
            { id: "sv-comunicados", icon: "📢", label: "Comunicados" },
          ].map(i => (
            <div key={i.id} className={`sb-item ${panel === i.id ? "active" : ""}`} onClick={() => setPanel(i.id)}>
              <span className="sb-icon">{i.icon}</span>{i.label}
            </div>
          ))}
          <div className="sb-label">Plataforma</div>
          <div className={`sb-item ${panel === "condominios" ? "active" : ""}`} onClick={() => setPanel("condominios")} style={{ borderLeft: panel === "condominios" ? `3px solid ${dash?.condominios?.find(c=>c.id===condId)?.cor_primaria||"#7C5CFC"}` : undefined }}>
            <span className="sb-icon">🏢</span> Meus Condomínios
            <span className="sb-badge" style={{ background:"rgba(99,102,241,.2)", color:"#A5B4FC" }}>{dash?.condominios?.length ?? 0}</span>
          </div>
          <div className="sb-label">Módulos</div>
          <div className={`sb-item ${panel === "operacao" ? "active" : ""}`} onClick={() => setPanel("operacao")}>
            <span className="sb-icon">🔧</span> Ordens de Serviço<span className="sb-badge">{t?.os_abertas || 0}</span>
          </div>
          <div className={`sb-item ${panel === "financeiro" ? "active" : ""}`} onClick={() => setPanel("financeiro")}>
            <span className="sb-icon">💰</span> Financeiro
          </div>
          <div className={`sb-item ${panel === "iot" ? "active" : ""}`} onClick={() => setPanel("iot")}>
            <span className="sb-icon">💧</span> Água & Reservatórios
          </div>
          <div className={`sb-item ${panel === "misp" ? "active" : ""}`} onClick={() => setPanel("misp")}>
            <span className="sb-icon">🚨</span> MISP<span className="sb-badge">{t?.alertas_ativos || 0}</span>
          </div>
          <div className={`sb-item ${panel === "diagnostico" ? "active" : ""}`} onClick={() => setPanel("diagnostico")}>
            <span className="sb-icon">🫀</span> Diagnóstico
            {mispCalc(mispAnswers).answered > 0 && (
              <span className="sb-badge" style={{ background: mispCalc(mispAnswers).nivelColor + "22", color: mispCalc(mispAnswers).nivelColor, border: `1px solid ${mispCalc(mispAnswers).nivelColor}55`, minWidth:28, textAlign:"center" }}>
                {mispCalc(mispAnswers).score}
              </span>
            )}
          </div>
          <div className={`sb-item ${panel === "crm" ? "active" : ""}`} onClick={() => setPanel("crm")}>
            <span className="sb-icon">👥</span> CRM Inteligente
          </div>
          <div className={`sb-item ${panel === "manutencao" ? "active" : ""}`} onClick={() => setPanel("manutencao")}>
            <span className="sb-icon">🏗️</span> Manutenção
            <span className="sb-badge" style={{ background: equipList.filter(e=>e.status==="manutencao"||e.status==="atencao").length>0?"#EF4444":"#1e293b" }}>{equipList.filter(e=>e.status==="manutencao"||e.status==="atencao").length}</span>
          </div>
          <div className={`sb-item ${panel === "energia" ? "active" : ""}`} onClick={() => setPanel("energia")}>
            <span className="sb-icon">⚡</span> Energia
          </div>
          <div className={`sb-item ${panel === "gas" ? "active" : ""}`} onClick={() => setPanel("gas")}>
            <span className="sb-icon">🔥</span> Gás
            {gasLeituras.some(l=>l.nivel<20) && <span className="sb-badge" style={{ background:"#EF4444" }}>!</span>}
          </div>
          <div className={`sb-item ${panel === "piscina" ? "active" : ""}`} onClick={() => { setPanel("piscina"); if(condId) loadPiscina(condId); }}>
            <span className="sb-icon">🏊</span> Piscina
            {piscinaList.some(l=>l.status==="alerta") && <span className="sb-badge" style={{ background:"#EF4444" }}>!</span>}
          </div>
          <div className={`sb-item ${panel === "encomendas" ? "active" : ""}`} onClick={() => { setPanel("encomendas"); fetchEncomendas(); }}>
            <span className="sb-icon">📦</span> Encomendas
            {encList.filter(e=>e.status==="aguardando_retirada").length > 0 && <span className="sb-badge" style={{ background:"#F59E0B" }}>{encList.filter(e=>e.status==="aguardando_retirada").length}</span>}
          </div>
          <div className={`sb-item ${panel === "fornecedores" ? "active" : ""}`} onClick={() => { setPanel("fornecedores"); if(condId) loadFornecedores(condId); }}>
            <span className="sb-icon">🏢</span> Fornecedores
            {fornecList.length > 0 && <span className="sb-badge" style={{ background:"rgba(16,185,129,.2)", color:"#34D399" }}>{fornecList.length}</span>}
          </div>
          <div className="sb-label">Acesso</div>
          <div className={`sb-item ${panel === "usuarios" ? "active" : ""}`} onClick={() => { setPanel("usuarios"); if (!usuariosLoaded) loadUsuarios(); }}>
            <span className="sb-icon">👥</span> Usuários
            <span className="sb-badge" style={{ background:"rgba(37,99,235,.2)", color:"#93C5FD" }}>{usuarios.length || ""}</span>
          </div>
          <div className="sb-label">Sistema</div>
          <div className={`sb-item ${panel === "supabase" ? "active" : ""}`} onClick={() => setPanel("supabase")}>
            <span className="sb-icon">🗄️</span> SSE Live Log
          </div>
        </div>

        <div className="main-area">
          {/* KPIs */}
          <div className="kpi-row">
            {[
              { label: "OSs Abertas", val: String(t?.os_abertas || 0), sub: `${urgentes} urgentes`, color: "var(--red)" },
              { label: "Saldo", val: fmtBRL(t?.saldo || 0), sub: "em caixa", color: (t?.saldo || 0) >= 0 ? "var(--green)" : "var(--red)" },
              { label: "Água Média", val: (nivelMedio || 0) + "%", sub: "nível médio", color: "var(--cyan)" },
              { label: "Alertas MISP", val: String(t?.alertas_ativos || 0), sub: "ativos", color: "var(--amber)" },
              { label: "Score Cond.", val: String(diagAutoResult?.score.total ?? mispCalc(mispAnswers).score), sub: diagAutoResult?.score.nivel ?? (mispCalc(mispAnswers).answered > 0 ? mispCalc(mispAnswers).nivel : "–"), color: (diagAutoResult?.score.total ?? mispCalc(mispAnswers).score) >= 80 ? "#10B981" : (diagAutoResult?.score.total ?? mispCalc(mispAnswers).score) >= 60 ? "#F59E0B" : "#EF4444" },
            ].map(k => (
              <div key={k.label} className="kpi-card">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{ color: k.color }}>{k.val}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* PANEL: SV CHAT */}
          <div className={`panel ${panel === "sv-chat" ? "active" : ""} card`}>
            <div className="card-title">🤖 Síndico Virtual IA
              <span className={`status-badge ${sseOnline ? "badge-online" : "badge-offline"}`}>● {sseOnline ? "online" : "offline"}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>{tokenInfo}</span>
            </div>
            <div className="gestor-chat">
              <div className="chat-chips">
                {[["📊 Resumo executivo", "Faça um resumo executivo do condomínio agora"], ["🔴 OSs urgentes", "Quais são as OSs urgentes pendentes?"], ["💧 Água + IoT", "Como está a situação da água e sensores IoT?"], ["💰 Financeiro", "Análise financeira completa"], ["🔧 Manutenção", "Análise completa do módulo de manutenção: equipamentos com problema, custos, planos agendados e recomendações"], ["⚙️ Equipamentos críticos", "Quais equipamentos precisam de atenção imediata? Liste por prioridade com impacto e custo estimado"], ["📅 Planos de manutenção", "Quais planos de manutenção vencem nos próximos 30 dias? Faça um cronograma de execução"], ["⭐ Score", "Como melhorar o score do condomínio?"]].map(([l, m]) => (
                  <button key={l} className="chip" onClick={() => { sendChat(m, deskHistory, setDeskMsgs, setDeskTyping, setDeskHistory); setSideMsgs(p => [...p, { role: "user", content: m, time: fmtTime() }]); }}>{l}</button>
                ))}
              </div>
              <div className="chat-area" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                {deskMsgs.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    <div className="msg-bubble">{m.content}</div>
                    <div className="msg-time">{m.time}</div>
                  </div>
                ))}
                {deskTyping && <TypingIndicator />}
              </div>
              <div className="chat-input-row">
                <textarea className="chat-input" value={deskInput} onChange={e => setDeskInput(e.target.value)} placeholder="Digite sua mensagem..." rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(deskInput, deskHistory, setDeskMsgs, setDeskTyping, setDeskHistory); setDeskInput(""); } }} />
                <button className="btn-send" disabled={deskTyping} onClick={() => { sendChat(deskInput, deskHistory, setDeskMsgs, setDeskTyping, setDeskHistory); setDeskInput(""); }}>Enviar</button>
              </div>
            </div>
          </div>

          {/* PANEL: INSIGHTS */}
          <div className={`panel ${panel === "sv-insights" ? "active" : ""} card`}>
            <div className="card-title">💡 Insights do Condomínio</div>
            {insightsLoading && <div style={{ color: "#94A3B8", textAlign: "center", padding: 30 }}>🔮 Gerando insights via IA...</div>}
            {insights && <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--c-text)", whiteSpace: "pre-wrap" }}>{insights}</div>}
            {!insights && !insightsLoading && <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 30 }}>Clique para gerar análise automática via IA</div>}
            <button className="btn btn-primary" onClick={async () => {
              setInsightsLoading(true); setInsights("");
              try {
                const r = await fetch("/api/sindico/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Gere uma análise executiva completa com insights sobre financeiro, OSs, água, alertas e recomendações. Use emojis.", history: [], condominio_id: condId }) });
                const res = await r.json(); setInsights(res.reply);
              } catch { setInsights("Erro ao gerar insights."); }
              setInsightsLoading(false);
            }} disabled={insightsLoading} style={{ marginTop: 12 }}>
              🔮 {insightsLoading ? "Gerando..." : "Gerar Insights IA"}
            </button>
          </div>

          {/* PANEL: COMUNICADOS */}
          <div className={`panel ${panel === "sv-comunicados" ? "active" : ""} card`}>
            <div className="card-title">📢 Gerar Comunicado via IA</div>
            <div className="form-group">
              <label className="form-label">Tema</label>
              <input className="form-control" value={comTema} onChange={e => setComTema(e.target.value)} placeholder="Ex: Manutenção do elevador na próxima segunda-feira..." />
            </div>
            <button className="btn btn-primary" onClick={gerarComunicado} disabled={comLoading} style={{ marginBottom: 14 }}>
              ✨ {comLoading ? "Gerando..." : "Gerar via IA"}
            </button>
            {comPreview && (
              <div className="com-preview" style={{ borderColor: "rgba(99,102,241,.3)", background: "rgba(99,102,241,.06)" }}>
                <div className="com-titulo" style={{ color: "#A5B4FC" }}>{comPreview.titulo}</div>
                <div className="com-corpo" style={{ overflow: "visible", WebkitLineClamp: "unset" }}>{comPreview.corpo}</div>
              </div>
            )}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 12, marginTop: 4 }}>
              <div className="card-title">📋 Histórico</div>
              {(dash?.comunicados || []).slice(0, 5).map(c => (
                <div key={c.id} className="com-preview">
                  <div className="com-titulo">{c.titulo}</div>
                  <div className="com-corpo">{c.corpo}</div>
                  <div className="com-meta">
                    {c.gerado_por_ia && <span style={{ color: "var(--purple)" }}>✨ IA</span>}
                    <span>{fmtDate(c.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PANEL: OS */}
          <div className={`panel ${panel === "operacao" ? "active" : ""}`}>
            {(() => {
              const allOs = dash?.ordens_servico || [];
              const displayed = osFiltered(allOs);
              const stats = {
                total: allOs.length,
                abertas: allOs.filter(o => o.status === "aberta").length,
                andamento: allOs.filter(o => o.status === "em_andamento").length,
                concluidas: allOs.filter(o => o.status === "fechada").length,
                urgentes: allOs.filter(o => o.prioridade === "urgente" && o.status !== "fechada").length,
              };
              const catIcon: Record<string, string> = { hidraulica: "💧", eletrica: "⚡", estrutural: "🏗️", limpeza: "🧹", seguranca: "🔒", equipamento: "⚙️", outros: "📋" };
              const catColor: Record<string, string> = { hidraulica: "#3B82F6", eletrica: "#EAB308", estrutural: "#F97316", limpeza: "#14B8A6", seguranca: "#8B5CF6", equipamento: "#6366F1", outros: "#64748B" };
              const priColor: Record<string, string> = { urgente: "#EF4444", alta: "#F59E0B", media: "#3B82F6", baixa: "#10B981" };
              const priLabel: Record<string, string> = { urgente: "🔴 URGENTE", alta: "🟡 Alta", media: "🔵 Média", baixa: "🟢 Baixa" };
              const stsColor: Record<string, string> = { aberta: "#F59E0B", em_andamento: "#06B6D4", fechada: "#10B981" };
              const stsLabel: Record<string, string> = { aberta: "● Aberta", em_andamento: "▶ Em andamento", fechada: "✓ Concluída" };
              const stsIcon: Record<string, string> = { aberta: "📋", em_andamento: "🔄", fechada: "✅" };
              const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–";

              return (
                <>
                  {/* ── Stats Bar ── */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                    {[
                      { icon: "📊", label: "Total", val: stats.total, color: "#94A3B8", bg: "rgba(148,163,184,.1)", border: "rgba(148,163,184,.2)" },
                      { icon: "📋", label: "Abertas", val: stats.abertas, color: "#F59E0B", bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.3)" },
                      { icon: "🔄", label: "Em andamento", val: stats.andamento, color: "#06B6D4", bg: "rgba(6,182,212,.1)", border: "rgba(6,182,212,.3)" },
                      { icon: "✅", label: "Concluídas", val: stats.concluidas, color: "#10B981", bg: "rgba(16,185,129,.1)", border: "rgba(16,185,129,.3)" },
                      { icon: "🚨", label: "Urgentes", val: stats.urgentes, color: "#EF4444", bg: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.35)" },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "10px 16px", minWidth: 100, textAlign: "center", flex: "1 1 90px" }}>
                        <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: s.color, marginTop: 3, fontWeight: 600, opacity: .8 }}>{s.label}</div>
                      </div>
                    ))}
                    <button onClick={openCriarOS} style={{ marginLeft: "auto", padding: "0 20px", background: "linear-gradient(135deg,#6366F1,#818CF8)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: ".03em", boxShadow: "0 4px 14px rgba(99,102,241,.4)" }}>
                      + Nova OS
                    </button>
                  </div>

                  {/* ── Toolbar ── */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      placeholder="🔍 Buscar por título, unidade, responsável..."
                      value={osSearch} onChange={e => setOsSearch(e.target.value)}
                      style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, color: "#F1F5F9", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                    {(["status","categoria","prioridade"] as const).map(key => (
                      <select key={key} value={osFilter[key]} onChange={e => setOsFilter(f => ({ ...f, [key]: e.target.value }))}
                        style={{ padding: "8px 10px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, color: "#CBD5E1", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                        <option value="todos">Todos {key === "status" ? "status" : key === "categoria" ? "categorias" : "prioridades"}</option>
                        {key === "status" && [["aberta","📋 Aberta"],["em_andamento","🔄 Em andamento"],["fechada","✅ Concluída"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        {key === "categoria" && [["hidraulica","💧 Hidráulica"],["eletrica","⚡ Elétrica"],["estrutural","🏗️ Estrutural"],["limpeza","🧹 Limpeza"],["seguranca","🔒 Segurança"],["equipamento","⚙️ Equipamento"],["outros","📋 Outros"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        {key === "prioridade" && [["baixa","🟢 Baixa"],["media","🔵 Média"],["alta","🟡 Alta"],["urgente","🔴 Urgente"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ))}
                    <div style={{ display: "flex", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, overflow: "hidden" }}>
                      {(["tabela","cards"] as const).map(m => (
                        <button key={m} onClick={() => setOsViewMode(m)}
                          style={{ padding: "8px 14px", background: osViewMode === m ? "rgba(99,102,241,.35)" : "transparent", border: "none", color: osViewMode === m ? "#A5B4FC" : "#475569", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
                          {m === "tabela" ? "☰" : "⊞"}
                        </button>
                      ))}
                    </div>
                    {(osSearch || osFilter.status !== "todos" || osFilter.categoria !== "todos" || osFilter.prioridade !== "todos") && (
                      <button onClick={() => { setOsSearch(""); setOsFilter({ status: "todos", categoria: "todos", prioridade: "todos" }); }}
                        style={{ padding: "8px 12px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 9, color: "#FCA5A5", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                        ✕ Limpar filtros
                      </button>
                    )}
                  </div>

                  {/* ── Resultados ── */}
                  {displayed.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>{allOs.length === 0 ? "✅" : "🔍"}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#64748B" }}>{allOs.length === 0 ? "Nenhuma OS cadastrada" : "Nenhuma OS encontrada"}</div>
                      <div style={{ fontSize: 12, marginTop: 6, color: "#334155" }}>{allOs.length === 0 ? "Crie a primeira ordem de serviço" : "Tente ajustar os filtros"}</div>
                      {allOs.length === 0 && <button onClick={openCriarOS} style={{ marginTop: 20, padding: "10px 24px", background: "linear-gradient(135deg,#6366F1,#818CF8)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>+ Nova OS</button>}
                    </div>
                  ) : osViewMode === "tabela" ? (
                    /* ── Tabela ── */
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {/* Header */}
                      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 130px 130px 160px 90px auto", gap: 8, padding: "6px 14px", background: "rgba(255,255,255,.03)", borderRadius: 8, fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".06em" }}>
                        <div>#</div><div>Título</div><div>Categoria</div><div>Prioridade</div><div>Status</div><div>Unidade</div><div>Ações</div>
                      </div>
                      {displayed.map(o => {
                        const pc = priColor[o.prioridade] || "#475569";
                        const sc = stsColor[o.status] || "#475569";
                        const cc = catColor[o.categoria] || "#475569";
                        return (
                          <div key={o.id} onClick={() => openEditarOS(o)}
                            style={{ display: "grid", gridTemplateColumns: "80px 1fr 130px 130px 160px 90px auto", gap: 8, padding: "10px 14px", background: "rgba(255,255,255,.025)", border: `1px solid rgba(255,255,255,.06)`, borderLeft: `3px solid ${pc}`, borderRadius: 10, cursor: "pointer", alignItems: "center", transition: "background .12s" }}>
                            {/* Nº */}
                            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#818CF8", fontWeight: 800 }}>OS‑{String(o.numero || "?").padStart(3, "0")}</div>
                            {/* Título */}
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "#F1F5F9" }}>{o.titulo}</div>
                              {o.descricao && <div style={{ fontSize: 10, color: "#475569", marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{o.descricao}</div>}
                              {Array.isArray(o.equipamento_ids) && o.equipamento_ids.length > 0 && (
                                <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" as const }}>
                                  {equipList.filter(eq => (o.equipamento_ids || []).includes(eq.id)).slice(0, 2).map(eq => (
                                    <span key={eq.id} style={{ fontSize: 9, background: "rgba(99,102,241,.2)", color: "#C7D2FE", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>{eq.catIcon} {eq.nome.slice(0, 14)}</span>
                                  ))}
                                  {(o.equipamento_ids || []).length > 2 && <span style={{ fontSize: 9, color: "#6366F1", fontWeight: 700 }}>+{(o.equipamento_ids || []).length - 2}</span>}
                                </div>
                              )}
                            </div>
                            {/* Categoria */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 18, background: cc + "22", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{catIcon[o.categoria] || "📋"}</span>
                              <span style={{ fontSize: 10, color: cc, fontWeight: 700 }}>{o.categoria}</span>
                            </div>
                            {/* Prioridade */}
                            <div>
                              <span style={{ fontSize: 10, fontWeight: 800, color: pc, background: pc + "22", border: `1px solid ${pc}55`, borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" as const }}>{priLabel[o.prioridade] || o.prioridade}</span>
                            </div>
                            {/* Status */}
                            <div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: sc, background: sc + "22", border: `1px solid ${sc}44`, borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap" as const }}>{stsLabel[o.status] || o.status}</span>
                            </div>
                            {/* Unidade */}
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>{o.unidade || <span style={{ color: "#334155" }}>–</span>}</div>
                            {/* Ações */}
                            <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                              {o.status === "aberta" && (
                                <button title="Iniciar" onClick={() => updateOSStatus(o.id, "em_andamento")}
                                  style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(6,182,212,.15)", border: "1px solid rgba(6,182,212,.3)", color: "#67E8F9", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}>▶ Iniciar</button>
                              )}
                              {o.status === "em_andamento" && (
                                <button title="Concluir" onClick={() => updateOSStatus(o.id, "fechada")}
                                  style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.3)", color: "#6EE7B7", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}>✓ Concluir</button>
                              )}
                              {o.status === "fechada" && (
                                <button title="Reabrir" onClick={() => updateOSStatus(o.id, "aberta")}
                                  style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.2)", color: "#94A3B8", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>↺ Reabrir</button>
                              )}
                              <button title="Editar" onClick={() => openEditarOS(o)}
                                style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(99,102,241,.12)", border: "1px solid rgba(99,102,241,.25)", color: "#A5B4FC", cursor: "pointer", fontSize: 12 }}>✏️</button>
                              <button title="Excluir" onClick={() => setOsDeleteId(o.id)}
                                style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#FCA5A5", cursor: "pointer", fontSize: 12 }}>🗑</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ── Cards ── */
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
                      {displayed.map(o => {
                        const pc = priColor[o.prioridade] || "#475569";
                        const sc = stsColor[o.status] || "#475569";
                        const cc = catColor[o.categoria] || "#475569";
                        return (
                          <div key={o.id} onClick={() => openEditarOS(o)}
                            style={{ background: "rgba(15,23,42,.8)", border: `1px solid ${pc}44`, borderRadius: 14, overflow: "hidden", cursor: "pointer", transition: "border-color .15s, transform .12s" }}>
                            {/* Topo colorido */}
                            <div style={{ height: 4, background: `linear-gradient(90deg, ${pc}, ${cc})` }} />
                            <div style={{ padding: "14px 16px" }}>
                              {/* Header */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: cc + "22", border: `1px solid ${cc}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{catIcon[o.categoria] || "📋"}</div>
                                  <div>
                                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#818CF8", fontWeight: 800 }}>OS‑{String(o.numero || "?").padStart(3, "0")}</div>
                                    <div style={{ fontSize: 10, color: cc, fontWeight: 700 }}>{o.categoria}</div>
                                  </div>
                                </div>
                                <span style={{ fontSize: 9, fontWeight: 800, color: pc, background: pc + "22", border: `1px solid ${pc}55`, borderRadius: 6, padding: "3px 7px", whiteSpace: "nowrap" as const }}>{priLabel[o.prioridade] || o.prioridade}</span>
                              </div>
                              {/* Título */}
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", marginBottom: 5, lineHeight: 1.3 }}>{o.titulo}</div>
                              {/* Descrição */}
                              {o.descricao && <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, lineHeight: 1.5 }}>{o.descricao.slice(0, 90)}{o.descricao.length > 90 ? "…" : ""}</div>}
                              {/* Equipamentos */}
                              {Array.isArray(o.equipamento_ids) && o.equipamento_ids.length > 0 && (
                                <div style={{ display: "flex", gap: 4, marginBottom: 9, flexWrap: "wrap" as const }}>
                                  {equipList.filter(eq => (o.equipamento_ids || []).includes(eq.id)).slice(0, 3).map(eq => (
                                    <span key={eq.id} style={{ fontSize: 9, background: "rgba(99,102,241,.2)", color: "#C7D2FE", borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>{eq.catIcon} {eq.nome.slice(0, 16)}</span>
                                  ))}
                                  {(o.equipamento_ids || []).length > 3 && <span style={{ fontSize: 9, color: "#6366F1", fontWeight: 700 }}>+{(o.equipamento_ids || []).length - 3}</span>}
                                </div>
                              )}
                              {/* Meta: unidade + responsável */}
                              {(o.unidade || o.responsavel) && (
                                <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#64748B", marginBottom: 10 }}>
                                  {o.unidade && <span>🏠 {o.unidade}</span>}
                                  {o.responsavel && <span>👤 {o.responsavel}</span>}
                                </div>
                              )}
                              {/* Status + ações */}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: sc, background: sc + "22", border: `1px solid ${sc}44`, borderRadius: 6, padding: "3px 8px" }}>{stsIcon[o.status] || "●"} {stsLabel[o.status]?.split(" ").slice(1).join(" ") || o.status}</span>
                                <div style={{ display: "flex", gap: 5 }} onClick={e => e.stopPropagation()}>
                                  {o.status === "aberta" && (
                                    <button onClick={() => updateOSStatus(o.id, "em_andamento")}
                                      style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(6,182,212,.15)", border: "1px solid rgba(6,182,212,.3)", color: "#67E8F9", cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: 700 }}>▶ Iniciar</button>
                                  )}
                                  {o.status === "em_andamento" && (
                                    <button onClick={() => updateOSStatus(o.id, "fechada")}
                                      style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.3)", color: "#6EE7B7", cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: 700 }}>✓ Concluir</button>
                                  )}
                                  <button onClick={() => setOsDeleteId(o.id)}
                                    style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#FCA5A5", cursor: "pointer", fontSize: 11 }}>🗑</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Modal Criar/Editar ── */}
                  {osModal && (
                    <div onClick={() => setOsModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                      <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(99,102,241,.25)", borderRadius: 18, padding: "28px 28px 24px", width: "100%", maxWidth: 560 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{osModal === "criar" ? "🔧 Nova Ordem de Serviço" : "✏️ Editar OS"}</div>
                          <button onClick={() => setOsModal(null)} style={{ background: "none", border: "none", color: "#475569", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>✕</button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div className="form-group" style={{ gridColumn: "1/-1" }}>
                            <label className="form-label">Título *</label>
                            <input className="form-control" value={osForm.titulo} onChange={e => setOsForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Vazamento no teto do Apto 302" autoFocus />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Nº OS</label>
                            <input className="form-control" type="number" min="1" value={osForm.numero} onChange={e => setOsForm(f => ({ ...f, numero: e.target.value }))} placeholder="Auto" style={{ fontFamily: "monospace" }} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Prioridade</label>
                            <select className="form-control" value={osForm.prioridade} onChange={e => setOsForm(f => ({ ...f, prioridade: e.target.value }))}>
                              {[["baixa","🟢 Baixa"],["media","🔵 Média"],["alta","🟡 Alta"],["urgente","🔴 Urgente"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Categoria</label>
                            <select className="form-control" value={osForm.categoria} onChange={e => setOsForm(f => ({ ...f, categoria: e.target.value }))}>
                              {[["hidraulica","💧 Hidráulica"],["eletrica","⚡ Elétrica"],["estrutural","🏗️ Estrutural"],["limpeza","🧹 Limpeza"],["seguranca","🔒 Segurança"],["equipamento","⚙️ Equipamento"],["outros","📋 Outros"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Unidade</label>
                            <input className="form-control" value={osForm.unidade} onChange={e => setOsForm(f => ({ ...f, unidade: e.target.value }))} placeholder="Ex: Apto 101, Área comum" />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Responsável</label>
                            <input className="form-control" value={osForm.responsavel} onChange={e => setOsForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Ex: João Manutenção" />
                          </div>
                          <div className="form-group" style={{ gridColumn: "1/-1" }}>
                            <label className="form-label">Descrição</label>
                            <textarea className="fc" value={osForm.descricao} onChange={e => setOsForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Descreva o problema detalhadamente..." style={{ width: "100%", resize: "vertical" }} />
                          </div>
                          {osModal === "editar" && (
                            <div className="form-group">
                              <label className="form-label">Status</label>
                              <select className="form-control" value={osForm.prioridade} onChange={() => {}}>
                                <option>— Mudar status abaixo —</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {/* ── Equipamentos vinculados ── */}
                        {(() => {
                          const statusColors: Record<string,string> = { operacional:"#10B981", atencao:"#F59E0B", manutencao:"#EF4444", inativo:"#475569" };
                          const toggleEquip = (eq: Equipamento) => {
                            setOsEquipLinks(prev => {
                              const exists = prev.find(e => e.id === eq.id);
                              if (exists) return prev.filter(e => e.id !== eq.id);
                              // auto-set categoria to "equipamento" se estava como padrão
                              if (osForm.categoria === "hidraulica") setOsForm(f => ({ ...f, categoria: "equipamento" }));
                              return [...prev, { id: eq.id, nome: eq.nome, catIcon: eq.catIcon, categoria: eq.categoria, local: eq.local, status: eq.status }];
                            });
                          };
                          const equipSearched = equipList.filter(eq => {
                            const q = osEquipSearch.toLowerCase();
                            if (!q) return true;
                            return eq.nome.toLowerCase().includes(q) || eq.local.toLowerCase().includes(q) || eq.categoria.toLowerCase().includes(q);
                          }).slice(0, 30);
                          return (
                            <div style={{ marginBottom: 16, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8" }}>⚙️ Equipamentos Vinculados</span>
                                {osEquipLinks.length > 0 && <span style={{ background: "rgba(99,102,241,.2)", color: "#A5B4FC", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px" }}>{osEquipLinks.length}</span>}
                              </div>
                              {/* Chips dos selecionados */}
                              {osEquipLinks.length > 0 && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                                  {osEquipLinks.map(eq => (
                                    <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 5, background: (EQUIP_CAT_COLORS[eq.categoria]??EQUIP_CAT_COLORS["outros"]).bg, border: `1px solid ${(EQUIP_CAT_COLORS[eq.categoria]??EQUIP_CAT_COLORS["outros"]).border}`, borderRadius: 6, padding: "4px 8px" }}>
                                      <span style={{ fontSize: 13 }}>{eq.catIcon}</span>
                                      <span style={{ fontSize: 11, color: (EQUIP_CAT_COLORS[eq.categoria]??EQUIP_CAT_COLORS["outros"]).text, fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{eq.nome}</span>
                                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColors[eq.status] || "#475569", flexShrink: 0 }} />
                                      <button onClick={() => setOsEquipLinks(p => p.filter(e => e.id !== eq.id))} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Busca */}
                              <input
                                value={osEquipSearch} onChange={e => setOsEquipSearch(e.target.value)}
                                placeholder={equipList.length > 0 ? `🔍 Buscar entre ${equipList.length} equipamentos...` : "Nenhum equipamento cadastrado"}
                                disabled={equipList.length === 0}
                                style={{ width: "100%", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 7, padding: "7px 10px", color: "#E2E8F0", fontSize: 11, boxSizing: "border-box" as const, marginBottom: 8, fontFamily: "inherit" }}
                              />
                              {/* Lista de equipamentos */}
                              {equipList.length > 0 && (
                                <div style={{ maxHeight: 170, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                                  {equipSearched.map(eq => {
                                    const selected = !!osEquipLinks.find(e => e.id === eq.id);
                                    return (
                                      <div key={eq.id} onClick={() => toggleEquip(eq)}
                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, cursor: "pointer", background: selected ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.03)", border: `1px solid ${selected ? "rgba(99,102,241,.35)" : "rgba(255,255,255,.06)"}`, transition: "all .12s" }}>
                                        <span style={{ fontSize: 15, flexShrink: 0 }}>{eq.catIcon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 12, fontWeight: selected ? 700 : 500, color: selected ? "#C7D2FE" : "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{eq.nome}</div>
                                          <div style={{ fontSize: 10, color: "#475569" }}>{eq.local} · {eq.categoria}</div>
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: statusColors[eq.status] || "#475569", background: (statusColors[eq.status] || "#475569") + "22", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{eq.status}</span>
                                        {selected && <span style={{ color: "#818CF8", fontSize: 14, flexShrink: 0 }}>✓</span>}
                                      </div>
                                    );
                                  })}
                                  {equipSearched.length === 0 && <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: "12px 0" }}>Nenhum equipamento encontrado</div>}
                                </div>
                              )}
                              {equipList.length === 0 && (
                                <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: "10px 0" }}>
                                  Cadastre equipamentos no módulo Manutenção para vinculá-los aqui
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {osModal === "editar" && (
                            <>
                              {(dash?.ordens_servico || []).find(o => o.id === osEditId)?.status !== "fechada" && (
                                <>
                                  {(dash?.ordens_servico || []).find(o => o.id === osEditId)?.status === "aberta" && (
                                    <button onClick={() => { updateOSStatus(osEditId!, "em_andamento"); setOsModal(null); }} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(6,182,212,.15)", border: "1px solid rgba(6,182,212,.25)", color: "#67E8F9", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>▶ Iniciar</button>
                                  )}
                                  {(dash?.ordens_servico || []).find(o => o.id === osEditId)?.status === "em_andamento" && (
                                    <button onClick={() => { updateOSStatus(osEditId!, "fechada"); setOsModal(null); }} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.25)", color: "#6EE7B7", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>✓ Concluir</button>
                                  )}
                                </>
                              )}
                              <button onClick={() => setOsDeleteId(osEditId!)} style={{ padding: "9px 14px", borderRadius: 9, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#FCA5A5", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🗑 Excluir</button>
                            </>
                          )}
                          <button onClick={() => setOsModal(null)} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#64748B", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Cancelar</button>
                          <button onClick={osModal === "criar" ? criarOS : salvarEditOS} style={{ padding: "9px 20px", borderRadius: 9, background: "linear-gradient(135deg,#6366F1,#818CF8)", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                            {osModal === "criar" ? "✓ Criar OS" : "💾 Salvar alterações"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Confirm Delete ── */}
                  {osDeleteId && (
                    <div onClick={() => setOsDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 910, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(239,68,68,.3)", borderRadius: 16, padding: "28px 32px", maxWidth: 360, textAlign: "center" }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>🗑️</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginBottom: 6 }}>Excluir Ordem de Serviço?</div>
                        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 20 }}>Esta ação não pode ser desfeita.</div>
                        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                          <button onClick={() => setOsDeleteId(null)} style={{ padding: "9px 20px", borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#94A3B8", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Cancelar</button>
                          <button onClick={() => deleteOS(osDeleteId)} style={{ padding: "9px 20px", borderRadius: 9, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#FCA5A5", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Excluir</button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              MODAL: LANÇAMENTO FINANCEIRO
          ══════════════════════════════════════════════════════════════ */}
          {finModal.open && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:4000 }}>
              <div style={{ background:"#121826", border:"1px solid rgba(255,255,255,.1)", borderRadius:16, padding:28, width:480, maxWidth:"95vw" }}>
                <div style={{ fontSize:16, fontWeight:800, marginBottom:20, color:"#E2E8F0" }}>
                  {finModal.editing ? "✏️ Editar Lançamento" : "➕ Novo Lançamento"}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Tipo *</div>
                    <select value={finForm.tipo||"receita"} onChange={e=>setFinForm(f=>({...f,tipo:e.target.value as "receita"|"despesa"}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12 }}>
                      <option value="receita">📈 Receita</option>
                      <option value="despesa">📉 Despesa</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Status *</div>
                    <select value={finForm.status||"previsto"} onChange={e=>setFinForm(f=>({...f,status:e.target.value as "previsto"|"pago"|"atrasado"}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12 }}>
                      <option value="previsto">⏳ Previsto</option>
                      <option value="pago">✅ Pago/Recebido</option>
                      <option value="atrasado">🔴 Atrasado</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Categoria *</div>
                    <input value={finForm.categoria||""} onChange={e=>setFinForm(f=>({...f,categoria:e.target.value}))}
                      list="fin-cats"
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12, boxSizing:"border-box" as const }}
                      placeholder="ex: taxa condominial" />
                    <datalist id="fin-cats">
                      {["taxa condominial","fundo reserva","água","energia","gás","limpeza","segurança","manutenção","administração","seguro","obras","outros"].map(c=><option key={c} value={c}/>)}
                    </datalist>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Subcategoria</div>
                    <input value={finForm.subcategoria||""} onChange={e=>setFinForm(f=>({...f,subcategoria:e.target.value}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12, boxSizing:"border-box" as const }}
                      placeholder="detalhe (opcional)" />
                  </div>
                  <div style={{ gridColumn:"1/-1" }}>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Descrição *</div>
                    <input value={finForm.descricao||""} onChange={e=>setFinForm(f=>({...f,descricao:e.target.value}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12, boxSizing:"border-box" as const }}
                      placeholder="ex: Taxa condominial Março/2026" />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Valor (R$) *</div>
                    <input type="number" step="0.01" min="0" value={finForm.valor||""} onChange={e=>setFinForm(f=>({...f,valor:Number(e.target.value)}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12, boxSizing:"border-box" as const }}
                      placeholder="0,00" />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Data *</div>
                    <input type="date" value={finForm.data||""} onChange={e=>setFinForm(f=>({...f,data:e.target.value}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12, boxSizing:"border-box" as const }} />
                  </div>
                  <div style={{ gridColumn:"1/-1" }}>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Competência (mês de referência)</div>
                    <input type="month" value={finForm.competencia||""} onChange={e=>setFinForm(f=>({...f,competencia:e.target.value}))}
                      style={{ width:"100%", background:"#0B0F1A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:12, boxSizing:"border-box" as const }} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                  <button onClick={()=>setFinModal({open:false,editing:null})} style={{ padding:"8px 18px", borderRadius:8, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                  <button onClick={finSalvarLancamento} disabled={finSaving}
                    style={{ padding:"8px 22px", borderRadius:8, background: finForm.tipo==="receita" ? "#06B6D4" : "#EF4444", border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", opacity:finSaving?.7:1 }}>
                    {finSaving ? "⏳ Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PANEL: FINANCEIRO */}
          <div className={`panel ${panel === "financeiro" ? "active" : ""}`}>
            {(() => {
              // ── dados legados do dashboard ──
              const receitas = dash?.receitas || [];
              const despesas = dash?.despesas || [];
              const saldo = t?.saldo || 0;
              const totalRec = t?.total_receitas || 0;
              const totalDesp = t?.total_despesas || 0;
              const resultado = totalRec - totalDesp;

              // ── Inadimplência: receitas não pagas ──────────────────────
              const inadimplentes = receitas.filter(r => r.status && !["pago","paga","recebido","recebida","confirmado","confirmada"].includes(r.status.toLowerCase()));
              const vlrInad = inadimplentes.reduce((s, r) => s + r.valor, 0);
              const txInad = totalRec > 0 ? Math.round((vlrInad / totalRec) * 100) : 0;

              // ── Score de Saúde Financeira (0–100) ─────────────────────
              // Critérios: saldo positivo (30), resultado positivo (25), inadimplência baixa (25), reserva suficiente (20)
              const scoreSaldo = saldo > 0 ? Math.min(30, Math.round((Math.min(saldo, 100000) / 100000) * 30)) : 0;
              const scoreResult = resultado >= 0 ? 25 : Math.max(0, 25 + Math.round((resultado / (totalRec || 1)) * 25));
              const scoreInad = txInad <= 5 ? 25 : txInad <= 15 ? 15 : txInad <= 30 ? 8 : 0;
              const scoreReserva = saldo >= totalDesp * 3 ? 20 : saldo >= totalDesp ? 12 : saldo > 0 ? 6 : 0;
              const score = Math.min(100, scoreSaldo + scoreResult + scoreInad + scoreReserva);
              const scoreColor = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : score >= 40 ? "#F97316" : "#EF4444";
              const scoreLabel = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Regular" : "Crítico";

              // ── Donut: despesas por categoria ──────────────────────────
              const despCat: Record<string, number> = {};
              despesas.forEach(d => { despCat[d.categoria || "outros"] = (despCat[d.categoria || "outros"] || 0) + d.valor; });
              const pieData = Object.entries(despCat).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
              const PIE_COLORS = ["#6366F1","#06B6D4","#10B981","#F59E0B","#EF4444","#A855F7","#EC4899","#14B8A6"];

              // ── Fluxo de caixa mês a mês ───────────────────────────────
              const now2 = new Date();
              const monthsMap: Record<string, { rec: number; desp: number }> = {};
              const getMonth = (d?: string) => {
                if (!d) return null;
                const dt = new Date(d);
                return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
              };
              // Seed last 6 months
              for (let i = 5; i >= 0; i--) {
                const dt = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
                const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
                monthsMap[key] = { rec: 0, desp: 0 };
              }
              receitas.forEach(r => { const m = getMonth(r.created_at); if (m && monthsMap[m]) monthsMap[m].rec += r.valor; });
              despesas.forEach(d => { const m = getMonth(d.created_at); if (m && monthsMap[m]) monthsMap[m].desp += d.valor; });
              const lineData = Object.entries(monthsMap).map(([mes, v]) => ({
                mes: mes.slice(5) + "/" + mes.slice(2, 4),
                Receitas: Math.round(v.rec),
                Despesas: Math.round(v.desp),
                Resultado: Math.round(v.rec - v.desp),
              }));

              // ── Projeção 3 meses (baseado na média dos últimos 3 meses) ─
              const last3 = lineData.slice(-3);
              const avgRec = last3.length ? last3.reduce((s, m) => s + m.Receitas, 0) / last3.length : 0;
              const avgDesp = last3.length ? last3.reduce((s, m) => s + m.Despesas, 0) / last3.length : 0;
              const projData = [];
              let saldoProj = saldo;
              for (let i = 1; i <= 3; i++) {
                const d = new Date(now2.getFullYear(), now2.getMonth() + i, 1);
                const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)} ▸`;
                saldoProj += avgRec - avgDesp;
                projData.push({ mes: label, SaldoProjetado: Math.round(saldoProj), Receitas: Math.round(avgRec), Despesas: Math.round(avgDesp) });
              }

              const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v}`;

              // ── Cats para autocomplete nos lançamentos ──
              const allCats = Array.from(new Set(lancamentos.map(l => l.categoria).filter(Boolean)));
              // ── lançamentos filtrados ──
              const lancFiltrados = lancamentos.filter(l => {
                if (finLancFilter.tipo && l.tipo !== finLancFilter.tipo) return false;
                if (finLancFilter.cat && l.categoria !== finLancFilter.cat) return false;
                if (finLancFilter.mes && !(l.data || "").startsWith(finLancFilter.mes)) return false;
                return true;
              });
              // ── totais dos lançamentos ──
              const lancRec = lancamentos.filter(l => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0);
              const lancDesp = lancamentos.filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0);
              const lancSaldo = lancRec - lancDesp;
              const lancInad = lancamentos.filter(l => l.tipo === "receita" && l.status === "atrasado").reduce((s, l) => s + Number(l.valor), 0);
              const lancTxInad = lancRec > 0 ? Math.round((lancInad / lancRec) * 100) : 0;
              // ── cats de despesas para orçamento ──
              const despCatMap: Record<string, number> = {};
              lancamentos.filter(l => l.tipo === "despesa").forEach(l => { despCatMap[l.categoria || "outros"] = (despCatMap[l.categoria || "outros"] || 0) + Number(l.valor); });
              const despCatEntries = Object.entries(despCatMap).sort((a, b) => b[1] - a[1]);
              // ── fluxo de caixa (lançamentos) ──
              const now3 = new Date();
              const fluxoMap: Record<string, { rec: number; desp: number }> = {};
              for (let i = 5; i >= 0; i--) {
                const dt = new Date(now3.getFullYear(), now3.getMonth() - i, 1);
                const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
                fluxoMap[key] = { rec: 0, desp: 0 };
              }
              lancamentos.forEach(l => {
                const key = (l.data || "").slice(0, 7);
                if (fluxoMap[key]) { if (l.tipo === "receita") fluxoMap[key].rec += Number(l.valor); else fluxoMap[key].desp += Number(l.valor); }
              });
              const fluxoData = Object.entries(fluxoMap).map(([m, v]) => ({
                mes: m.slice(5) + "/" + m.slice(2, 4),
                Receitas: Math.round(v.rec), Despesas: Math.round(v.desp), Resultado: Math.round(v.rec - v.desp),
              }));
              // ── projeção 3 meses (lançamentos) ──
              const last3Lanc = fluxoData.slice(-3);
              const avgRecLanc = last3Lanc.length ? last3Lanc.reduce((s, m) => s + m.Receitas, 0) / last3Lanc.length : avgRec ?? 0;
              const avgDespLanc = last3Lanc.length ? last3Lanc.reduce((s, m) => s + m.Despesas, 0) / last3Lanc.length : avgDesp ?? 0;
              let saldoProj2 = lancSaldo;
              const projLanc = [1, 2, 3].map(i => {
                const dt = new Date(now3.getFullYear(), now3.getMonth() + i, 1);
                saldoProj2 += avgRecLanc - avgDespLanc;
                return { mes: `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(2)} ▸`, Receitas: Math.round(avgRecLanc), Despesas: Math.round(avgDespLanc), SaldoProjetado: Math.round(saldoProj2) };
              });

              // ── status colors ──
              const stColor = (s: string) => s === "pago" ? "#10B981" : s === "atrasado" ? "#EF4444" : "#F59E0B";
              const stBg = (s: string) => s === "pago" ? "rgba(16,185,129,.15)" : s === "atrasado" ? "rgba(239,68,68,.12)" : "rgba(245,158,11,.12)";
              const fmtK2 = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${Math.round(v)}`;

              // ── FIN TAB BUTTON ──
              const ftBtn = (id: FinTab, icon: string, label: string, col: string) => (
                <button key={id} onClick={() => setFinTab(id)} style={{
                  padding:"10px 16px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit",
                  background: finTab === id ? col : "rgba(255,255,255,.03)",
                  color: finTab === id ? "#fff" : col,
                  fontSize:11, fontWeight:700, display:"flex", flexDirection:"column" as const, alignItems:"center", gap:4,
                  outline: finTab !== id ? "1px solid rgba(255,255,255,.07)" : "none",
                }}>
                  <span style={{ fontSize:18 }}>{icon}</span>
                  <span>{label}</span>
                </button>
              );

              return (
                <div style={{ padding:20 }}>
                  {/* ── Header ── */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                    <div>
                      <div style={{ fontSize:22, fontWeight:800, marginBottom:2 }}>💰 Financeiro Inteligente</div>
                      <div style={{ fontSize:12, color:"#475569" }}>Gestão financeira · Fluxo de caixa · Previsões · Insights IA</div>
                    </div>
                    <button onClick={() => { setFinForm({ tipo:"receita", status:"previsto", categoria:"", descricao:"", valor:0, data: new Date().toISOString().slice(0,10) }); setFinModal({open:true,editing:null}); }}
                      style={{ background:"#06B6D4", border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      + Novo Lançamento
                    </button>
                  </div>

                  {/* ── KPI topo ── */}
                  <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" as const }}>
                    {[
                      { label:"Saldo Total", val: fmtBRLFull(lancamentos.length > 0 ? lancSaldo : saldo), color: (lancamentos.length > 0 ? lancSaldo : saldo) >= 0 ? "#10B981" : "#EF4444", icon:"💰", sub: lancamentos.length > 0 ? "via lançamentos" : "via dashboard" },
                      { label:"Receitas", val: fmtBRLFull(lancamentos.length > 0 ? lancRec : totalRec), color:"#06B6D4", icon:"📈", sub: `${lancamentos.filter(l=>l.tipo==="receita").length || receitas.length} lançamentos` },
                      { label:"Despesas", val: fmtBRLFull(lancamentos.length > 0 ? lancDesp : totalDesp), color:"#EF4444", icon:"📉", sub: `${lancamentos.filter(l=>l.tipo==="despesa").length || despesas.length} lançamentos` },
                      { label:"Inadimplência", val: `${lancamentos.length > 0 ? lancTxInad : txInad}%`, color: (lancamentos.length > 0 ? lancTxInad : txInad) <= 5 ? "#10B981" : "#EF4444", icon:"⚠️", sub: lancamentos.length > 0 ? fmtBRLFull(lancInad) + " em aberto" : fmtBRLFull(vlrInad) + " em aberto" },
                    ].map(k => (
                      <div key={k.label} style={{ flex:1, minWidth:150, background:"#121826", border:`1px solid rgba(255,255,255,.06)`, borderRadius:12, padding:"14px 16px", borderLeft:`3px solid ${k.color}` }}>
                        <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>{k.icon} {k.label.toUpperCase()}</div>
                        <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.val}</div>
                        <div style={{ fontSize:10, color:"#334155", marginTop:3 }}>{k.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── Tab bar ── */}
                  <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" as const }}>
                    {ftBtn("dashboard",   "📊", "Dashboard",   "#6366F1")}
                    {ftBtn("lancamentos", "📋", "Lançamentos", "#06B6D4")}
                    {ftBtn("orcamento",   "🗓️",  "Orçamento",   "#10B981")}
                    {ftBtn("previsao",    "🔮", "Previsão",    "#8B5CF6")}
                    {ftBtn("insights",    "🤖", "Insights IA", "#F59E0B")}
                  </div>

                  {/* ══════════════ ABA: DASHBOARD ══════════════ */}
                  {finTab === "dashboard" && (<>

                  {/* ── Score + Inadimplência ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    {/* Score */}
                    <div style={{ background: "#121826", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "16px 20px" }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>💚 SAÚDE FINANCEIRA</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ position: "relative", width: 72, height: 72 }}>
                          <svg viewBox="0 0 36 36" style={{ width: 72, height: 72, transform: "rotate(-90deg)" }}>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3"
                              strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor }}>{score}</div>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{scoreLabel}</div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 4, lineHeight: 1.6 }}>
                            Saldo: {scoreSaldo}/30 · Resultado: {scoreResult}/25<br/>
                            Inadimpl.: {scoreInad}/25 · Reserva: {scoreReserva}/20
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Inadimplência */}
                    <div style={{ background: "#121826", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "16px 20px" }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>⚠️ INADIMPLÊNCIA</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: txInad <= 5 ? "#10B981" : txInad <= 15 ? "#F59E0B" : "#EF4444" }}>{txInad}%</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{inadimplentes.length} lançamento(s) pendentes</div>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 3, marginBottom: 8 }}>
                        <div style={{ width: `${Math.min(txInad, 100)}%`, height: "100%", background: txInad <= 5 ? "#10B981" : txInad <= 15 ? "#F59E0B" : "#EF4444", borderRadius: 3, transition: "width .4s" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#475569" }}>
                        {txInad <= 5 ? "✅ Excelente — abaixo de 5%" : txInad <= 15 ? "🟡 Atenção — entre 5% e 15%" : "🔴 Crítico — acima de 15%"}
                        {vlrInad > 0 && ` · ${fmtBRLFull(vlrInad)} em aberto`}
                      </div>
                    </div>
                  </div>

                  {/* ── Charts row ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12, marginBottom: 16 }}>
                    {/* Donut: despesas por categoria */}
                    <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "16px" }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 12 }}>🍩 DESPESAS POR CATEGORIA</div>
                      {pieData.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 20, color: "#334155", fontSize: 12 }}>Nenhuma despesa registrada</div>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={3} dataKey="value">
                                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                              </Pie>
                              <Tooltip formatter={(v: number) => fmtBRLFull(v)} contentStyle={{ background: "#0F172A", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {pieData.slice(0, 5).map((d, i) => (
                              <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                  <span style={{ color: "#94A3B8" }}>{d.name}</span>
                                </div>
                                <span style={{ color: "#64748B" }}>{fmtK(d.value)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Line: fluxo de caixa */}
                    <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "16px" }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 12 }}>📊 FLUXO DE CAIXA — ÚLTIMOS 6 MESES</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={lineData} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                          <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={50} />
                          <Tooltip formatter={(v: number) => fmtBRLFull(v)} contentStyle={{ background: "#0F172A", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10, color: "#475569" }} />
                          <Line type="monotone" dataKey="Receitas" stroke="#06B6D4" strokeWidth={2} dot={{ r: 3, fill: "#06B6D4" }} />
                          <Line type="monotone" dataKey="Despesas" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: "#EF4444" }} />
                          <Line type="monotone" dataKey="Resultado" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2, fill: "#10B981" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ── Projeção 3 meses ── */}
                  <div style={{ background: "rgba(99,102,241,.04)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#6366F1", marginBottom: 12 }}>🔮 PROJEÇÃO — PRÓXIMOS 3 MESES (baseado na média dos últimos 3 meses)</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {projData.map((p, i) => (
                        <div key={i} style={{ flex: 1, minWidth: 160, background: "rgba(255,255,255,.02)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,.05)" }}>
                          <div style={{ fontSize: 10, color: "#6366F1", fontWeight: 700, marginBottom: 6 }}>{p.mes}</div>
                          <div style={{ fontSize: 11, color: "#06B6D4", marginBottom: 2 }}>📈 Rec. prev. {fmtBRLFull(p.Receitas)}</div>
                          <div style={{ fontSize: 11, color: "#EF4444", marginBottom: 6 }}>📉 Desp. prev. {fmtBRLFull(p.Despesas)}</div>
                          <div style={{ height: 1, background: "rgba(255,255,255,.06)", marginBottom: 6 }} />
                          <div style={{ fontSize: 14, fontWeight: 700, color: p.SaldoProjetado >= 0 ? "#10B981" : "#EF4444" }}>
                            {p.SaldoProjetado >= 0 ? "✅" : "⚠️"} Saldo proj. {fmtBRLFull(p.SaldoProjetado)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 10 }}>
                      Média usada: receitas {fmtBRLFull(Math.round(avgRec))}/mês · despesas {fmtBRLFull(Math.round(avgDesp))}/mês
                      {avgRec === 0 && avgDesp === 0 && " · Adicione lançamentos com data para gerar projeção precisa"}
                    </div>
                  </div>

                  {/* ── Lançamentos lado a lado ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#06B6D4", marginBottom: 10 }}>📈 RECEITAS ({receitas.length})</div>
                      {receitas.length === 0 && <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: 16 }}>Nenhuma receita registrada</div>}
                      {receitas.map(r => (
                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <div>
                            <div style={{ fontSize: 12 }}>{r.descricao}</div>
                            <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{r.categoria} · <span style={{ color: ["pago","paga","recebido","recebida"].includes((r.status||"").toLowerCase()) ? "#10B981" : "#F59E0B" }}>{r.status}</span></div>
                          </div>
                          <div style={{ color: "#06B6D4", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{fmtBRLFull(r.valor)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 10 }}>📉 DESPESAS ({despesas.length})</div>
                      {despesas.length === 0 && <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: 16 }}>Nenhuma despesa registrada</div>}
                      {despesas.map(d => (
                        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <div>
                            <div style={{ fontSize: 12 }}>{d.descricao}</div>
                            <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{d.fornecedor || d.categoria}</div>
                          </div>
                          <div style={{ color: "#EF4444", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>-{fmtBRLFull(d.valor)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  </>)} {/* /finTab === dashboard */}

                  {/* ══════════════ ABA: LANÇAMENTOS ══════════════ */}
                  {finTab === "lancamentos" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {/* Filtros */}
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, alignItems:"center" }}>
                        <select value={finLancFilter.tipo} onChange={e=>setFinLancFilter(f=>({...f,tipo:e.target.value as ""| "receita"|"despesa"}))}
                          style={{ background:"#121826", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 12px", color:"#E2E8F0", fontSize:11, cursor:"pointer" }}>
                          <option value="">📋 Todos tipos</option>
                          <option value="receita">📈 Receitas</option>
                          <option value="despesa">📉 Despesas</option>
                        </select>
                        <input type="month" value={finLancFilter.mes} onChange={e=>setFinLancFilter(f=>({...f,mes:e.target.value}))}
                          style={{ background:"#121826", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 12px", color:"#E2E8F0", fontSize:11 }} />
                        <select value={finLancFilter.cat} onChange={e=>setFinLancFilter(f=>({...f,cat:e.target.value}))}
                          style={{ background:"#121826", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 12px", color:"#E2E8F0", fontSize:11, cursor:"pointer" }}>
                          <option value="">🏷️ Todas categorias</option>
                          {allCats.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                        {(finLancFilter.tipo || finLancFilter.mes || finLancFilter.cat) && (
                          <button onClick={()=>setFinLancFilter({tipo:"",mes:"",cat:""})}
                            style={{ padding:"7px 12px", borderRadius:8, background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", color:"#FCA5A5", fontSize:11, cursor:"pointer" }}>
                            ✕ Limpar
                          </button>
                        )}
                        <span style={{ marginLeft:"auto", fontSize:11, color:"#475569" }}>{lancFiltrados.length} lançamentos</span>
                      </div>

                      {/* Totais filtrados */}
                      {lancFiltrados.length > 0 && (() => {
                        const fr = lancFiltrados.filter(l=>l.tipo==="receita").reduce((s,l)=>s+Number(l.valor),0);
                        const fd = lancFiltrados.filter(l=>l.tipo==="despesa").reduce((s,l)=>s+Number(l.valor),0);
                        return (
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                            <div style={{ padding:"6px 14px", borderRadius:8, background:"rgba(6,182,212,.1)", border:"1px solid rgba(6,182,212,.2)", fontSize:11, color:"#67E8F9" }}>📈 Receitas: {fmtBRLFull(fr)}</div>
                            <div style={{ padding:"6px 14px", borderRadius:8, background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.2)", fontSize:11, color:"#FCA5A5" }}>📉 Despesas: {fmtBRLFull(fd)}</div>
                            <div style={{ padding:"6px 14px", borderRadius:8, background:(fr-fd)>=0?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)", border:`1px solid ${(fr-fd)>=0?"rgba(16,185,129,.25)":"rgba(239,68,68,.25)"}`, fontSize:11, color:(fr-fd)>=0?"#6EE7B7":"#FCA5A5" }}>💰 Saldo: {fmtBRLFull(fr-fd)}</div>
                          </div>
                        );
                      })()}

                      {/* Tabela de lançamentos */}
                      {lancFiltrados.length === 0 ? (
                        <div style={{ textAlign:"center", padding:40, color:"#334155", fontSize:13 }}>
                          <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
                          <div>Nenhum lançamento encontrado</div>
                          <div style={{ fontSize:11, marginTop:6, color:"#475569" }}>Clique em "Novo Lançamento" para adicionar</div>
                        </div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {lancFiltrados.map(l => {
                            const isRec = l.tipo === "receita";
                            const sc = stColor(l.status);
                            const sbg = stBg(l.status);
                            return (
                              <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, background:"#121826", border:`1px solid rgba(255,255,255,.06)`, borderRadius:10, padding:"10px 14px", borderLeft:`3px solid ${isRec?"#06B6D4":"#EF4444"}` }}>
                                <div style={{ width:32, height:32, borderRadius:8, background:isRec?"rgba(6,182,212,.15)":"rgba(239,68,68,.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                                  {isRec ? "📈" : "📉"}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:12, fontWeight:600, color:"#E2E8F0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{l.descricao}</div>
                                  <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{l.categoria}{l.subcategoria ? ` › ${l.subcategoria}` : ""} · {l.data}</div>
                                </div>
                                <div style={{ fontSize:14, fontWeight:800, color:isRec?"#06B6D4":"#EF4444", whiteSpace:"nowrap" as const }}>{isRec?"+":"-"}{fmtBRLFull(Number(l.valor))}</div>
                                <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:5, background:sbg, color:sc, border:`1px solid ${sc}44`, whiteSpace:"nowrap" as const }}>
                                  {l.status === "pago" ? "✓ PAGO" : l.status === "atrasado" ? "⚠ ATRASADO" : "⏳ PREVISTO"}
                                </span>
                                <div style={{ display:"flex", gap:4 }}>
                                  <button onClick={()=>{ setFinForm({...l}); setFinModal({open:true,editing:l}); }}
                                    style={{ padding:"4px 8px", borderRadius:6, background:"rgba(99,102,241,.1)", border:"1px solid rgba(99,102,241,.2)", color:"#A5B4FC", fontSize:10, cursor:"pointer" }}>✏️</button>
                                  <button onClick={()=>finDeletarLancamento(l.id)}
                                    style={{ padding:"4px 8px", borderRadius:6, background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", color:"#FCA5A5", fontSize:10, cursor:"pointer" }}>🗑️</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ══════════════ ABA: ORÇAMENTO ══════════════ */}
                  {finTab === "orcamento" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      <div style={{ fontSize:12, color:"#475569" }}>Comparativo previsto × realizado por categoria — {new Date().getFullYear()}</div>
                      {despCatEntries.length === 0 && orcamento.length === 0 ? (
                        <div style={{ textAlign:"center", padding:40, color:"#334155" }}>
                          <div style={{ fontSize:32 }}>📭</div>
                          <div style={{ marginTop:10, fontSize:13 }}>Sem dados de orçamento</div>
                          <div style={{ fontSize:11, color:"#475569", marginTop:6 }}>Adicione lançamentos de despesa para ver o comparativo</div>
                        </div>
                      ) : (
                        <>
                          {/* BarChart: previsto vs. real */}
                          {despCatEntries.length > 0 && (
                            <div style={{ background:"#121826", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:16 }}>
                              <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>🗓️ DESPESAS REAIS POR CATEGORIA</div>
                              <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={despCatEntries.map(([cat, val]) => {
                                  const orçEntry = orcamento.find(o => o.categoria === cat);
                                  return { cat, Real: Math.round(val), Previsto: orçEntry ? Math.round(orçEntry.valor_previsto) : 0 };
                                })} margin={{ top:4, right:10, bottom:30, left:0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                                  <XAxis dataKey="cat" tick={{ fontSize:9, fill:"#475569" }} angle={-25} textAnchor="end" interval={0} />
                                  <YAxis tick={{ fontSize:10, fill:"#475569" }} tickFormatter={fmtK2} width={48} />
                                  <Tooltip formatter={(v: number) => fmtBRLFull(v)} contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} />
                                  <Legend wrapperStyle={{ fontSize:10, color:"#475569" }} />
                                  <Bar dataKey="Real" fill="#EF4444" radius={[4,4,0,0]} />
                                  <Bar dataKey="Previsto" fill="#6366F1" radius={[4,4,0,0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          {/* Tabela detalhada */}
                          <div style={{ background:"#121826", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:16 }}>
                            <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>📊 DETALHAMENTO POR CATEGORIA</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:"6px 16px", alignItems:"center" }}>
                              <div style={{ fontSize:10, color:"#334155", fontWeight:700 }}>Categoria</div>
                              <div style={{ fontSize:10, color:"#334155", fontWeight:700, textAlign:"right" as const }}>Previsto</div>
                              <div style={{ fontSize:10, color:"#334155", fontWeight:700, textAlign:"right" as const }}>Real</div>
                              <div style={{ fontSize:10, color:"#334155", fontWeight:700, textAlign:"right" as const }}>Δ</div>
                              {despCatEntries.map(([cat, real]) => {
                                const orcEntry = orcamento.find(o => o.categoria === cat);
                                const prev = orcEntry ? Number(orcEntry.valor_previsto) : 0;
                                const diff = real - prev;
                                return [
                                  <div key={`${cat}-n`} style={{ fontSize:12, color:"#E2E8F0" }}>{cat}</div>,
                                  <div key={`${cat}-p`} style={{ fontSize:12, color:"#6366F1", textAlign:"right" as const }}>{prev > 0 ? fmtBRLFull(prev) : "—"}</div>,
                                  <div key={`${cat}-r`} style={{ fontSize:12, color:"#EF4444", textAlign:"right" as const }}>{fmtBRLFull(real)}</div>,
                                  <div key={`${cat}-d`} style={{ fontSize:12, color: prev === 0 ? "#475569" : diff > 0 ? "#EF4444" : "#10B981", textAlign:"right" as const }}>{prev > 0 ? (diff > 0 ? `+${fmtBRLFull(diff)}` : fmtBRLFull(diff)) : "—"}</div>,
                                ];
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ══════════════ ABA: PREVISÃO ══════════════ */}
                  {finTab === "previsao" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      <div style={{ fontSize:12, color:"#475569" }}>Projeção baseada na média dos últimos 3 meses · usando lançamentos cadastrados</div>

                      {/* Cards 3 meses */}
                      <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const }}>
                        {projLanc.map((p, i) => (
                          <div key={i} style={{ flex:1, minWidth:180, background:"#121826", border:"1px solid rgba(99,102,241,.2)", borderRadius:12, padding:"16px 18px" }}>
                            <div style={{ fontSize:11, color:"#6366F1", fontWeight:700, marginBottom:10 }}>{p.mes}</div>
                            <div style={{ fontSize:12, color:"#06B6D4", marginBottom:4 }}>📈 Rec. prev. {fmtBRLFull(p.Receitas)}</div>
                            <div style={{ fontSize:12, color:"#EF4444", marginBottom:10 }}>📉 Desp. prev. {fmtBRLFull(p.Despesas)}</div>
                            <div style={{ height:1, background:"rgba(255,255,255,.06)", marginBottom:10 }} />
                            <div style={{ fontSize:16, fontWeight:800, color:p.SaldoProjetado>=0?"#10B981":"#EF4444" }}>
                              {p.SaldoProjetado>=0?"✅":"⚠️"} {fmtBRLFull(p.SaldoProjetado)}
                            </div>
                            <div style={{ fontSize:10, color:"#334155", marginTop:4 }}>saldo projetado</div>
                          </div>
                        ))}
                        {projLanc.length === 0 && (
                          <div style={{ flex:1, textAlign:"center", padding:40, color:"#334155", fontSize:13 }}>
                            <div style={{ fontSize:32 }}>🔮</div>
                            <div style={{ marginTop:10 }}>Sem dados para projeção</div>
                            <div style={{ fontSize:11, color:"#475569", marginTop:6 }}>Cadastre lançamentos com data para gerar previsão</div>
                          </div>
                        )}
                      </div>

                      {/* Fluxo de caixa dos lançamentos */}
                      {fluxoData.some(d => d.Receitas > 0 || d.Despesas > 0) && (
                        <div style={{ background:"#121826", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:16 }}>
                          <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>📊 FLUXO DE CAIXA — ÚLTIMOS 6 MESES (lançamentos)</div>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={fluxoData} margin={{ top:4, right:10, bottom:4, left:0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                              <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} tickFormatter={fmtK2} width={50} />
                              <Tooltip formatter={(v: number) => fmtBRLFull(v)} contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} />
                              <Legend wrapperStyle={{ fontSize:10, color:"#475569" }} />
                              <Line type="monotone" dataKey="Receitas" stroke="#06B6D4" strokeWidth={2} dot={{ r:3, fill:"#06B6D4" }} />
                              <Line type="monotone" dataKey="Despesas" stroke="#EF4444" strokeWidth={2} dot={{ r:3, fill:"#EF4444" }} />
                              <Line type="monotone" dataKey="Resultado" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" dot={{ r:2, fill:"#10B981" }} />
                            </LineChart>
                          </ResponsiveContainer>
                          <div style={{ fontSize:10, color:"#334155", marginTop:8 }}>
                            Média: receitas {fmtBRLFull(Math.round(avgRecLanc))}/mês · despesas {fmtBRLFull(Math.round(avgDespLanc))}/mês
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ══════════════ ABA: INSIGHTS IA ══════════════ */}
                  {finTab === "insights" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      {/* Trigger + pergunta personalizada */}
                      <div style={{ background:"linear-gradient(135deg, rgba(245,158,11,.08), rgba(251,191,36,.05))", border:"1px solid rgba(245,158,11,.2)", borderRadius:14, padding:"20px 22px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14 }}>
                          <div style={{ fontSize:40 }}>🤖</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:800, color:"#FCD34D" }}>Síndico Virtual — Análise Financeira</div>
                            <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>IA com contexto completo dos seus lançamentos · Powered by Claude</div>
                          </div>
                          <button onClick={() => finGerarInsights()} disabled={finInsightLoading}
                            style={{ padding:"10px 20px", borderRadius:10, background: finInsightLoading ? "rgba(245,158,11,.2)" : "#F59E0B", border:"none", color: finInsightLoading ? "#FCD34D" : "#000", fontSize:12, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap" as const }}>
                            {finInsightLoading ? "⏳ Analisando..." : "⚡ Relatório Completo"}
                          </button>
                        </div>
                        {/* Campo de pergunta personalizada */}
                        <div style={{ display:"flex", gap:8 }}>
                          <input
                            id="fin-pergunta"
                            placeholder="Pergunte algo específico ao Síndico (ex: como reduzir custos com manutenção?)"
                            style={{ flex:1, background:"rgba(0,0,0,.3)", border:"1px solid rgba(245,158,11,.3)", borderRadius:8, padding:"9px 14px", color:"#E2E8F0", fontSize:12, outline:"none" }}
                            onKeyDown={e => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { finGerarInsights(v); (e.target as HTMLInputElement).value = ""; } } }}
                          />
                          <button
                            onClick={() => { const el = document.getElementById("fin-pergunta") as HTMLInputElement; const v = el?.value.trim(); if (v) { finGerarInsights(v); el.value = ""; } else finGerarInsights(); }}
                            disabled={finInsightLoading}
                            style={{ padding:"9px 16px", borderRadius:8, background:"rgba(245,158,11,.15)", border:"1px solid rgba(245,158,11,.3)", color:"#FCD34D", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            Perguntar
                          </button>
                        </div>
                        {/* Chips de perguntas rápidas */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, marginTop:10 }}>
                          {["Onde posso reduzir despesas?", "Como melhorar a inadimplência?", "Qual a previsão para os próximos 3 meses?", "Compare receitas x despesas por categoria"].map(q => (
                            <button key={q} onClick={() => finGerarInsights(q)} disabled={finInsightLoading}
                              style={{ padding:"4px 10px", borderRadius:20, background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.2)", color:"#F59E0B", fontSize:10, cursor:"pointer", transition:"background .15s" }}>
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Result */}
                      {finInsight && (
                        <>
                          {/* Score card */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
                            {[
                              { label:"Score", val:`${finInsight.score}/100`, color: finInsight.score>=80?"#10B981":finInsight.score>=60?"#F59E0B":finInsight.score>=40?"#F97316":"#EF4444", icon:"💚" },
                              { label:"Inadimplência", val:`${finInsight.inadimplencia}%`, color: finInsight.inadimplencia<=5?"#10B981":finInsight.inadimplencia<=15?"#F59E0B":"#EF4444", icon:"⚠️" },
                              { label:"Saldo", val:fmtBRLFull(finInsight.saldo), color: finInsight.saldo>=0?"#10B981":"#EF4444", icon:"💰" },
                              { label:"Risco", val:finInsight.risco, color: finInsight.risco==="baixo"?"#10B981":finInsight.risco==="moderado"?"#F59E0B":finInsight.risco==="alto"?"#F97316":"#EF4444", icon:"📊" },
                            ].map(k => (
                              <div key={k.label} style={{ background:"#121826", border:`1px solid rgba(255,255,255,.06)`, borderRadius:10, padding:"12px 14px", borderLeft:`3px solid ${k.color}` }}>
                                <div style={{ fontSize:10, color:"#475569" }}>{k.icon} {k.label.toUpperCase()}</div>
                                <div style={{ fontSize:18, fontWeight:800, color:k.color, marginTop:4, textTransform:"capitalize" as const }}>{k.val}</div>
                              </div>
                            ))}
                          </div>

                          {/* Resposta completa do Síndico — exibe seções ou texto corrido */}
                          {finInsight.reply && !finInsight.riscos && !finInsight.recomendacoes ? (
                            <div style={{ background:"rgba(245,158,11,.05)", border:"1px solid rgba(245,158,11,.15)", borderRadius:12, padding:"18px 20px" }}>
                              <div style={{ fontSize:12, fontWeight:700, color:"#FCD34D", marginBottom:10 }}>🤖 SÍNDICO VIRTUAL</div>
                              <div style={{ fontSize:13, color:"#CBD5E1", lineHeight:1.7, whiteSpace:"pre-wrap" as const }}>{finInsight.reply}</div>
                            </div>
                          ) : (
                            <>
                              {/* Análise */}
                              <div style={{ background:"rgba(245,158,11,.05)", border:"1px solid rgba(245,158,11,.15)", borderRadius:12, padding:"18px 20px" }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"#FCD34D", marginBottom:10 }}>📋 ANÁLISE GERAL</div>
                                <div style={{ fontSize:13, color:"#CBD5E1", lineHeight:1.7, whiteSpace:"pre-wrap" as const }}>{finInsight.analise}</div>
                              </div>
                              {/* Riscos */}
                              {finInsight.riscos && (
                                <div style={{ background:"rgba(239,68,68,.05)", border:"1px solid rgba(239,68,68,.15)", borderRadius:12, padding:"18px 20px" }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#FCA5A5", marginBottom:10 }}>🚨 RISCOS IDENTIFICADOS</div>
                                  <div style={{ fontSize:12, color:"#CBD5E1", lineHeight:1.8, whiteSpace:"pre-wrap" as const }}>{finInsight.riscos}</div>
                                </div>
                              )}
                              {/* Recomendações */}
                              {finInsight.recomendacoes && (
                                <div style={{ background:"rgba(16,185,129,.05)", border:"1px solid rgba(16,185,129,.15)", borderRadius:12, padding:"18px 20px" }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#6EE7B7", marginBottom:10 }}>✅ RECOMENDAÇÕES</div>
                                  <div style={{ fontSize:12, color:"#CBD5E1", lineHeight:1.8, whiteSpace:"pre-wrap" as const }}>{finInsight.recomendacoes}</div>
                                </div>
                              )}
                            </>
                          )}

                          <div style={{ fontSize:10, color:"#334155", textAlign:"right" as const }}>
                            Análise gerada em {new Date(finInsight.gerado_em).toLocaleString("pt-BR")} · Síndico Virtual (Claude)
                          </div>
                        </>
                      )}

                      {!finInsight && !finInsightLoading && (
                        <div style={{ textAlign:"center", padding:40, color:"#334155", fontSize:13 }}>
                          <div style={{ fontSize:48, marginBottom:12 }}>🤖</div>
                          <div>Clique em "Gerar Análise" para que o Síndico Virtual avalie a saúde financeira do condomínio</div>
                          <div style={{ fontSize:11, color:"#475569", marginTop:8 }}>Baseado nos lançamentos cadastrados · Powered by Claude AI</div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })()}
          </div>

          {/* PANEL: IoT */}
          {/* PANEL: ÁGUA & RESERVATÓRIOS */}
          {panel === "iot" && (() => {
            // ── Demo reservoir ─────────────────────────────────────────
            const sensores = dash?.sensores || [];
            const nivelMedioSensores = sensores.length
              ? Math.round(sensores.reduce((s, x) => s + x.nivel_atual, 0) / sensores.length)
              : 45;
            const volTotal = sensores.length
              ? sensores.reduce((s, x) => s + x.volume_litros, 0)
              : 22500;
            const CAPACIDADE = 50000;
            const autonomia = volTotal > 0 ? Math.round(volTotal / 4500) : 5;
            const ultimaLeit = aguaLeituras[0];

            const cfOnlineCount = resList.filter(r=>r.cf_online).length;
            const whOnlineCount = resList.filter(r=>r.wh_online).length;
            const tabDef: [typeof aguaTab, string, string, string][] = [
              ["reservatorios", "🗂️", `Reservatórios (${resList.length})`, "#3B82F6"],
              ["leituras",      "📋", `Leituras (${aguaLeituras.length})`, "#06B6D4"],
              ["hidrometro",    "🔵", "Hidrômetro (1)",       "#6366F1"],
              ["historico",     "📊", "Histórico",            "#10B981"],
              ["fornecedora",   "🏢", "Fornecedora",          "#F59E0B"],
              ["alertas",       "🔔", "Alertas Inteligentes", "#EF4444"],
              ["integracao",    "☁️", `Integração CF/WH`, "#8B5CF6"],
            ];

            const tabBtn = (id: typeof aguaTab, icon: string, label: string, col: string) => (
              <button key={id} onClick={() => setAguaTab(id)} style={{
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
                padding:"14px 16px", borderRadius:10, cursor:"pointer", minWidth:110, border:"none",
                background: aguaTab === id ? "#3B82F6" : "rgba(255,255,255,.03)",
                color: aguaTab === id ? "#fff" : col,
                fontWeight: aguaTab === id ? 800 : 500, fontSize:11, transition:"all .15s",
                outline: aguaTab !== id ? "1px solid rgba(255,255,255,.07)" : "none",
              }}>
                <span style={{ fontSize:22 }}>{icon}</span>
                <span style={{ textAlign:"center", lineHeight:1.3 }}>{label}</span>
              </button>
            );

            return (
              <div style={{ padding:20 }}>
                {/* ── Header ── */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, marginBottom:2 }}>💧 Água & Reservatórios</div>
                    <div style={{ fontSize:12, color:"#475569" }}>Monitoramento de níveis e qualidade da água</div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>setAguaNovoResModal(true)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 14px", color:"#E2E8F0", fontSize:12, cursor:"pointer" }}>
                      + Novo Reservatório
                    </button>
                    <button onClick={()=>setAguaNovaLeitModal(true)} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                      + Nova Leitura
                    </button>
                  </div>
                </div>

                {/* ── KPI Cards ── */}
                <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                  {[
                    { label:"Nível Médio",         val:`${nivelMedioSensores}%`,                    icon:"💧", bg:"rgba(59,130,246,.1)",  border:"rgba(59,130,246,.2)" },
                    { label:"Volume Disponível",   val:`${(volTotal/1000).toFixed(0)}k L`,            icon:"💧", bg:"rgba(6,182,212,.08)",  border:"rgba(6,182,212,.2)" },
                    { label:"Autonomia Estimada",  val:`${autonomia} dias`,                           icon:"🕐", bg:"rgba(16,185,129,.08)", border:"rgba(16,185,129,.2)" },
                    { label:"Reservatórios",       val:`1 cadastrados`,                               icon:"🔵", bg:"rgba(168,85,247,.08)", border:"rgba(168,85,247,.2)" },
                  ].map(k => (
                    <div key={k.label} style={{ flex:1, minWidth:150, background:k.bg, border:`1px solid ${k.border}`, borderRadius:12, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>{k.label}</div>
                        <div style={{ fontSize:22, fontWeight:800 }}>{k.val}</div>
                      </div>
                      <div style={{ fontSize:24, opacity:0.6 }}>{k.icon}</div>
                    </div>
                  ))}
                </div>

                {/* ── Webhook banner ── */}
                <div style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.2)", borderRadius:10, padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ color:"#10B981", fontSize:16 }}>📡</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#10B981" }}>Webhook Sensor IoT</div>
                      <div style={{ fontSize:10, color:"#475569" }}>Receba dados do sensor de nível em tempo real via HTTP</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <code style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, padding:"4px 10px", fontSize:11, color:"#94A3B8" }}>/api/webhook/sensor</code>
                    <button onClick={()=>setAguaTab("reservatorios")} style={{ background:"#3B82F6", border:"none", borderRadius:6, padding:"5px 12px", color:"#fff", fontSize:11, cursor:"pointer", fontWeight:600 }}>📊 Dashboard</button>
                    <button onClick={()=>setAguaTab("leituras")} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, padding:"5px 12px", color:"#94A3B8", fontSize:11, cursor:"pointer" }}>📥 Inbox</button>
                  </div>
                </div>

                {/* ── Tab bar ── */}
                <div style={{ display:"flex", gap:8, marginBottom:20, overflowX:"auto", paddingBottom:4 }}>
                  {tabDef.map(([id, icon, label, col]) => tabBtn(id, icon, label, col))}
                </div>

                {/* Modals */}
                {aguaNovoResModal && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setAguaNovoResModal(false)}>
                    <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:28, width:440 }} onClick={e=>e.stopPropagation()}>
                      <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>🗂️ Novo Reservatório</div>
                      {[["Nome","text","nome","Ex: Bloco B"],["Local","text","local","Ex: Cobertura"],["Capacidade (L)","number","capacidade","Ex: 50000"],["ID Dispositivo (MAC)","text","mac","F8:83:87:00:00:00"]].map(([label,type,field,ph])=>(
                        <div key={field} style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>{label}</div>
                          <input type={type} value={(aguaNovoResForm as any)[field]} onChange={e=>setAguaNovoResForm(f=>({...f,[field]:e.target.value}))} placeholder={ph} style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:12, boxSizing:"border-box" }}/>
                        </div>
                      ))}
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
                        <button onClick={()=>setAguaNovoResModal(false)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 16px", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                        <button onClick={()=>{ setAguaNovoResForm({nome:"",local:"",capacidade:"",mac:""}); setAguaNovoResModal(false); }} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>Salvar</button>
                      </div>
                    </div>
                  </div>
                )}
                {aguaNovaLeitModal && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setAguaNovaLeitModal(false)}>
                    <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:28, width:420 }} onClick={e=>e.stopPropagation()}>
                      <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>📋 Nova Leitura</div>
                      {[["Nível (%)","number","nivel","0–100"],["Distância sensor (cm)","number","distancia","Ex: 55"],["Observação","text","obs","Opcional"]].map(([label,type,field,ph])=>(
                        <div key={field} style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>{label}</div>
                          <input type={type} value={(aguaNovaLeitForm as any)[field]} onChange={e=>setAguaNovaLeitForm(f=>({...f,[field]:e.target.value}))} placeholder={ph} style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:12, boxSizing:"border-box" }}/>
                        </div>
                      ))}
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
                        <button onClick={()=>setAguaNovaLeitModal(false)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 16px", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                        <button onClick={()=>{
                          if (!aguaNovaLeitForm.nivel) return;
                          const now = new Date();
                          const nv = Number(aguaNovaLeitForm.nivel);
                          setAguaLeituras(prev=>[{
                            id:`l${Date.now()}`, res:aguaNovaLeitForm.reservatorio, nivel:nv,
                            volume:Math.round(nv/100*CAPACIDADE), dist:Number(aguaNovaLeitForm.distancia)||0,
                            data:`${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`,
                            hora:`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`,
                            fonte:"Manual",
                          },...prev]);
                          setAguaNovaLeitForm({reservatorio:"Bloco A",nivel:"",distancia:"",obs:""});
                          setAguaNovaLeitModal(false);
                        }} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>Salvar</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: RESERVATÓRIOS
                ════════════════════════════════════════════════════ */}
                {aguaTab === "reservatorios" && (
                  <div>
                    {/* ── AguaModule Dashboard ── */}
                    <AguaModule
                      resList={resList}
                      resNivels={resNivels}
                      resHistorico={resHistorico}
                      sensoresManaged={sensoresManaged}
                      resNivelsExtra={resNivels}
                      onNovoReservatorio={() => { setResEditId(null); setResForm(EMPTY_RES_FORM); setResShowForm(true); }}
                      onEditReservatorio={(r) => resEdit(r as Reservatorio)}
                      onDeleteReservatorio={(id) => resDelete(id)}
                      resEditId={resEditId}
                      SensorRingComponent={SensorRing}
                      condId={condId}
                    />
                    {/* ── SENSORES CADASTRADOS (mantido) ── */}
                    <div style={{ marginTop:16, fontSize:11, color:"#64748B", fontWeight:700, marginBottom:8, letterSpacing:".04em", textTransform:"uppercase" as const }}>
                      Sensores cadastrados
                    </div>
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.08)", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1.2fr 1fr 90px 80px 70px 110px", padding:"10px 16px", background:"rgba(255,255,255,.04)", fontSize:11, fontWeight:700, color:"#64748B", borderBottom:"1px solid rgba(255,255,255,.06)", letterSpacing:".04em", textTransform:"uppercase" as const }}>
                        <span>Sensor ID</span><span>Nome</span><span>Local</span><span>Capacidade</span><span>Nível</span><span>Status</span><span>Ações</span>
                      </div>
                      {sensoresManaged.length === 0 && (
                        <div style={{ padding:"32px", textAlign:"center", color:"#475569", fontSize:13 }}>Nenhum sensor cadastrado. Use <strong>＋ Novo</strong> para adicionar.</div>
                      )}
                      {sensoresManaged.map((s, i) => {
                        const nv = resNivels[s.sensor_id];
                        const nivel = nv?.nivel ?? s.nivel_atual;
                        const clr = nivel >= 60 ? "#10B981" : nivel >= 30 ? "#F59E0B" : "#EF4444";
                        return (
                          <div key={s.id} style={{ display:"grid", gridTemplateColumns:"1.2fr 1.2fr 1fr 90px 80px 70px 110px", padding:"12px 16px", borderBottom: i < sensoresManaged.length-1 ? "1px solid rgba(255,255,255,.05)" : "none", alignItems:"center", fontSize:12, background: sensorEditId===s.sensor_id ? "rgba(59,130,246,.08)" : "transparent" }}>
                            <span style={{ fontWeight:700, color:"#E2E8F0", fontSize:11 }}>{s.sensor_id}</span>
                            <span style={{ color:"#94A3B8" }}>{s.nome || "—"}</span>
                            <span style={{ color:"#64748B" }}>{s.local || "—"}</span>
                            <span style={{ color:"#94A3B8" }}>{Number(s.capacidade_litros).toLocaleString("pt-BR")}L</span>
                            <span style={{ fontWeight:700, color:clr }}>{nivel}%</span>
                            <span>
                              <span style={{ background:s.status==="normal"?"rgba(16,185,129,.15)":"rgba(239,68,68,.15)", color:s.status==="normal"?"#10B981":"#EF4444", borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                                {s.status || "—"}
                              </span>
                            </span>
                            <span style={{ display:"flex", gap:8 }}>
                              <button onClick={() => sensorEdit(s)} style={{ color:"#3B82F6", background:"none", border:"none", fontSize:12, fontWeight:700, cursor:"pointer", padding:0 }}>Editar</button>
                              <button onClick={() => sensorDelete(s)} style={{ color:"#EF4444", background:"none", border:"none", fontSize:12, fontWeight:700, cursor:"pointer", padding:0 }}>Excluir</button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* legado: header row oculto — substituído pelo AguaModule */}
                    {false && <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800 }}>💧 Caixas d'água</div>
                        <div style={{ fontSize:11, color:"#475569" }}>IETEC • IoT em tempo real</div>
                      </div>
                    </div>}

                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: LEITURAS
                ════════════════════════════════════════════════════ */}
                {aguaTab === "leituras" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
                      <button onClick={()=>setAguaNovaLeitModal(true)} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>+ Nova Leitura</button>
                    </div>
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, overflow:"hidden" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 90px 80px 70px 60px", gap:0, padding:"10px 16px", borderBottom:"1px solid rgba(255,255,255,.08)", fontSize:10, color:"#475569", fontWeight:600, letterSpacing:.5 }}>
                        <span>RESERVATÓRIO</span><span style={{ textAlign:"right" }}>NÍVEL</span><span style={{ textAlign:"right" }}>VOLUME</span><span style={{ textAlign:"right" }}>DISTÂNCIA</span><span style={{ textAlign:"center" }}>FONTE</span><span style={{ textAlign:"right" }}>DATA</span>
                      </div>
                      {aguaLeituras.map((l, i) => (
                        <div key={l.id} style={{ display:"grid", gridTemplateColumns:"1fr 80px 90px 80px 70px 60px", gap:0, padding:"11px 16px", borderBottom: i<aguaLeituras.length-1?"1px solid rgba(255,255,255,.04)":"none", fontSize:12, alignItems:"center" }}>
                          <div>
                            <div style={{ fontWeight:600 }}>{l.res}</div>
                            <div style={{ fontSize:10, color:"#475569" }}>{l.data}, {l.hora}</div>
                          </div>
                          <div style={{ textAlign:"right", fontWeight:700, color:l.nivel<30?"#EF4444":l.nivel<50?"#F59E0B":"#3B82F6" }}>{l.nivel}%</div>
                          <div style={{ textAlign:"right", color:"#06B6D4", fontWeight:600 }}>{l.volume.toLocaleString("pt-BR")}L</div>
                          <div style={{ textAlign:"right", color:"#A5B4FC" }}>{l.dist}cm</div>
                          <div style={{ textAlign:"center" }}>
                            <span style={{ background:l.fonte==="IoT"?"rgba(16,185,129,.15)":"rgba(99,102,241,.15)", color:l.fonte==="IoT"?"#10B981":"#A5B4FC", borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{l.fonte}</span>
                          </div>
                          <div style={{ textAlign:"right", fontSize:10, color:"#475569" }}>{l.data}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                      {[
                        { label:"Média de Nível", val:`${Math.round(aguaLeituras.reduce((s,l)=>s+l.nivel,0)/aguaLeituras.length)}%`, color:"#3B82F6" },
                        { label:"Maior Volume",   val:`${Math.max(...aguaLeituras.map(l=>l.volume)).toLocaleString("pt-BR")}L`, color:"#10B981" },
                        { label:"Menor Nível",    val:`${Math.min(...aguaLeituras.map(l=>l.nivel))}%`, color:"#F59E0B" },
                      ].map(k=>(
                        <div key={k.label} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"12px 14px" }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:3 }}>{k.label}</div>
                          <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{k.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: HIDRÔMETRO
                ════════════════════════════════════════════════════ */}
                {aguaTab === "hidrometro" && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                      <div style={{ background:"rgba(59,130,246,.08)", border:"1px solid rgba(59,130,246,.2)", borderRadius:12, padding:"20px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:8, fontWeight:600 }}>🔵 HIDRÔMETRO PRINCIPAL</div>
                        {[
                          ["Modelo",         "ZENNER MTK-I 1½\""],
                          ["Número de série","HM-9847213"],
                          ["Instalação",     "Jan/2022"],
                          ["Leitura atual",  "3.421 m³"],
                          ["Última leitura", "15/03/2026"],
                          ["Tarifa CASAN",   "R$ 3,50/m³"],
                        ].map(([l,v])=>(
                          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,.05)", fontSize:12 }}>
                            <span style={{ color:"#475569" }}>{l}</span>
                            <span style={{ color:"#E2E8F0", fontWeight:600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"20px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:12, fontWeight:600 }}>📅 HISTÓRICO DE CONSUMO</div>
                        {aguaHidroLeituras.map(h=>(
                          <div key={h.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                            <div>
                              <div style={{ fontWeight:600 }}>{h.mes}</div>
                              <div style={{ fontSize:10, color:"#475569" }}>{h.data}</div>
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ color:"#3B82F6", fontWeight:700 }}>{h.m3} m³</div>
                              <div style={{ fontSize:10, color:"#475569" }}>R$ {h.custo}</div>
                            </div>
                          </div>
                        ))}
                        <div style={{ marginTop:12, padding:"8px 0", borderTop:"1px solid rgba(255,255,255,.06)", display:"flex", justifyContent:"space-between", fontSize:12 }}>
                          <span style={{ color:"#475569" }}>Média mensal</span>
                          <span style={{ color:"#10B981", fontWeight:700 }}>{Math.round(aguaHidroLeituras.reduce((s,h)=>s+h.m3,0)/aguaHidroLeituras.length)} m³</span>
                        </div>
                      </div>
                    </div>

                    {/* Visual gauge */}
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px" }}>
                      <div style={{ fontSize:11, color:"#475569", fontWeight:600, marginBottom:14 }}>📊 CONSUMO MENSAL (m³)</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={aguaHidroLeituras.slice().reverse()} margin={{ top:4, right:10, bottom:4, left:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
                          <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} width={40}/>
                          <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} formatter={(v:number)=>[`${v} m³`,"Consumo"]}/>
                          <Bar dataKey="m3" fill="#3B82F6" radius={[4,4,0,0]} name="Consumo (m³)"/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: HISTÓRICO
                ════════════════════════════════════════════════════ */}
                {aguaTab === "historico" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <div style={{ fontSize:11, color:"#475569", fontWeight:600 }}>📈 VOLUME POR RESERVATÓRIO — HISTÓRICO DE LEITURAS</div>
                      <button onClick={()=>loadResHistorico(resList)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, padding:"4px 12px", color:"#94A3B8", fontSize:11, cursor:"pointer" }}>⟳ Atualizar</button>
                    </div>

                    {resList.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"48px 0", color:"#475569" }}>
                        <div style={{ fontSize:40, marginBottom:12 }}>🗂️</div>
                        <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Nenhum reservatório cadastrado</div>
                        <div style={{ fontSize:12 }}>Adicione um reservatório na aba Reservatórios para ver o gráfico aqui.</div>
                      </div>
                    ) : (
                      resList.map((res, ri) => {
                        const hist = [...(resHistorico[res.sensor_id] || [])].reverse();
                        const colors = ["#3B82F6","#06B6D4","#10B981","#8B5CF6","#F59E0B","#EF4444"];
                        const col = colors[ri % colors.length];
                        const chartData = hist.map(h => ({
                          ts: new Date(h.received_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}),
                          nivel: h.nivel,
                          volume: +(h.volume_litros/1000).toFixed(1),
                        }));
                        const hasData = chartData.length > 0;
                        const nivelAtual = resNivels[res.sensor_id]?.nivel ?? (hasData ? hist[hist.length-1].nivel : 0);
                        const volAtual = resNivels[res.sensor_id]?.volume ?? (hasData ? hist[hist.length-1].volume_litros : 0);
                        return (
                          <div key={res.id} style={{ background:"rgba(255,255,255,.02)", border:`1px solid ${col}30`, borderRadius:14, padding:"18px 20px", marginBottom:18 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                              <div>
                                <div style={{ fontSize:14, fontWeight:800, color:col }}>💧 {res.nome || res.sensor_id}</div>
                                <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>{res.local || "—"} · Cap: {res.capacidade_litros.toLocaleString("pt-BR")}L · ID: {res.sensor_id}</div>
                              </div>
                              <div style={{ display:"flex", gap:10 }}>
                                <div style={{ background:`${col}15`, border:`1px solid ${col}30`, borderRadius:8, padding:"6px 12px", textAlign:"center" }}>
                                  <div style={{ fontSize:10, color:"#475569" }}>Nível atual</div>
                                  <div style={{ fontSize:18, fontWeight:800, color: nivelAtual >= 60 ? "#10B981" : nivelAtual >= 30 ? "#F59E0B" : "#EF4444" }}>{nivelAtual}%</div>
                                </div>
                                <div style={{ background:"rgba(6,182,212,.08)", border:"1px solid rgba(6,182,212,.2)", borderRadius:8, padding:"6px 12px", textAlign:"center" }}>
                                  <div style={{ fontSize:10, color:"#475569" }}>Volume atual</div>
                                  <div style={{ fontSize:18, fontWeight:800, color:"#06B6D4" }}>{(volAtual/1000).toFixed(1)}kL</div>
                                </div>
                              </div>
                            </div>
                            {hasData ? (
                              <>
                                <ResponsiveContainer width="100%" height={200}>
                                  <LineChart data={chartData} margin={{ top:4, right:10, bottom:4, left:0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)"/>
                                    <XAxis dataKey="ts" tick={{ fontSize:8, fill:"#475569" }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                                    <YAxis yAxisId="left" tick={{ fontSize:9, fill:"#475569" }} axisLine={false} tickLine={false} width={35} tickFormatter={(v:number)=>`${v}%`} domain={[0,100]}/>
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize:9, fill:"#475569" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v:number)=>`${v}k`}/>
                                    <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} formatter={(v:number,n:string)=>n==="nivel"?[`${v}%`,"Nível"]:[`${v}kL`,"Volume"]}/>
                                    <Legend wrapperStyle={{ fontSize:10 }}/>
                                    <Line yAxisId="left" type="monotone" dataKey="nivel" stroke={col} strokeWidth={2} dot={{ r:2 }} name="Nível (%)"/>
                                    <Line yAxisId="right" type="monotone" dataKey="volume" stroke="#06B6D4" strokeWidth={2} dot={{ r:2 }} name="Volume (kL)" strokeDasharray="4 2"/>
                                  </LineChart>
                                </ResponsiveContainer>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:10 }}>
                                  {[
                                    { label:"Nível Máx",  val:`${Math.max(...hist.map(h=>h.nivel))}%`,  color:"#10B981" },
                                    { label:"Nível Mín",  val:`${Math.min(...hist.map(h=>h.nivel))}%`,  color:"#EF4444" },
                                    { label:"Nível Médio",val:`${Math.round(hist.reduce((s,h)=>s+h.nivel,0)/hist.length)}%`, color:col },
                                    { label:"Vol. Médio", val:`${(hist.reduce((s,h)=>s+h.volume_litros,0)/hist.length/1000).toFixed(1)}kL`, color:"#06B6D4" },
                                  ].map(k=>(
                                    <div key={k.label} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.05)", borderRadius:8, padding:"9px 12px" }}>
                                      <div style={{ fontSize:10, color:"#475569", marginBottom:3 }}>{k.label}</div>
                                      <div style={{ fontSize:16, fontWeight:800, color:k.color }}>{k.val}</div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div style={{ textAlign:"center", padding:"28px 0", color:"#475569" }}>
                                <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
                                <div style={{ fontSize:12, fontWeight:600 }}>Aguardando primeiras leituras</div>
                                <div style={{ fontSize:11, marginTop:4 }}>O gráfico aparecerá quando o sensor enviar dados via webhook</div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: FORNECEDORA
                ════════════════════════════════════════════════════ */}
                {aguaTab === "fornecedora" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"18px 20px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#3B82F6", marginBottom:14 }}>🏢 DADOS DA CONCESSIONÁRIA</div>
                      {[
                        ["Nome",         "CASAN – Cia. Catarinense de Águas e Saneamento"],
                        ["CNPJ",         "82.508.433/0001-17"],
                        ["Sede",         "Florianópolis – SC"],
                        ["Telefone",     "(48) 3331-2000"],
                        ["Emergência",   "0800 644 0195 (24h)"],
                        ["Site",         "casan.com.br"],
                        ["Número conta", "CA-48219-3"],
                        ["Vencimento",   "Todo dia 15"],
                      ].map(([l,v])=>(
                        <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                          <span style={{ color:"#475569" }}>{l}</span>
                          <span style={{ color:"#E2E8F0", fontWeight:600, maxWidth:"55%", textAlign:"right", fontSize:11 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"18px 20px", marginBottom:12 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#10B981", marginBottom:14 }}>💰 TARIFAS VIGENTES</div>
                        {[
                          ["Tarifa básica (0–10 m³)",  "R$ 35,00 (fixo)"],
                          ["Tarifa residencial",        "R$ 3,50/m³"],
                          ["Tarifa comercial (Bloco)","R$ 5,80/m³"],
                          ["Esgoto (% sobre água)",   "80%"],
                          ["Taxa saneamento",          "R$ 12,00/mês"],
                        ].map(([l,v])=>(
                          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                            <span style={{ color:"#475569" }}>{l}</span>
                            <span style={{ color:"#10B981", fontWeight:700 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px" }}>
                        <div style={{ fontSize:11, color:"#F59E0B", fontWeight:700, marginBottom:10 }}>📅 ÚLTIMAS FATURAS</div>
                        {aguaHidroLeituras.slice(0,4).map(h=>(
                          <div key={h.id} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                            <span style={{ color:"#94A3B8" }}>{h.mes}</span>
                            <div style={{ textAlign:"right" }}>
                              <span style={{ color:"#F59E0B", fontWeight:700 }}>R$ {h.custo}</span>
                              <span style={{ color:"#475569", marginLeft:8, fontSize:10 }}>{h.m3}m³</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: ALERTAS INTELIGENTES
                ════════════════════════════════════════════════════ */}
                {aguaTab === "alertas" && (
                  <div>
                    <div style={{ fontSize:12, color:"#475569", marginBottom:16 }}>Alertas gerados automaticamente com base no nível dos reservatórios, consumo e padrões históricos.</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {[
                        { nivel:"alto",  icone:"⚠️", titulo:"Nível crítico detectado em 04/02/2026", desc:"Reservatório Bloco A atingiu 35% (< 40%). Avalie reposição ou redução de consumo.", acao:"Ver histórico", abaAlvo:"historico" as typeof aguaTab },
                        { nivel:"medio", icone:"📈", titulo:"Consumo acima da média em Março",       desc:"Mar/26 apresenta consumo 5% acima de Fev/26. Possível vazamento ou uso excessivo.", acao:"Ver hidrômetro", abaAlvo:"hidrometro" as typeof aguaTab },
                        { nivel:"medio", icone:"🔧", titulo:"Revisão preventiva do hidrômetro",      desc:"Último calibração há mais de 12 meses. Agende visita técnica com a CASAN.", acao:null, abaAlvo:null },
                        { nivel:"baixo", icone:"💧", titulo:"Nível estável nos últimos 7 dias",      desc:"Nível médio de 48% — dentro do parâmetro ideal (40–70%).", acao:null, abaAlvo:null },
                        { nivel:"baixo", icone:"✅", titulo:"Última sincronização IoT OK",            desc:"Sensor F8:83:87:90:9F:78 sincronizando normalmente a cada 10 segundos.", acao:"Ver reservatórios", abaAlvo:"reservatorios" as typeof aguaTab },
                      ].map((a,i)=>{
                        const nc = { alto:"#EF4444", medio:"#F59E0B", baixo:"#10B981" }[a.nivel] || "#475569";
                        return (
                          <div key={i} style={{ background:"rgba(255,255,255,.02)", border:`1px solid ${nc}22`, borderRadius:12, padding:"14px 18px", display:"flex", gap:14, alignItems:"flex-start" }}>
                            <div style={{ width:40, height:40, borderRadius:"50%", background:`${nc}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{a.icone}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                                <div style={{ fontSize:13, fontWeight:700 }}>{a.titulo}</div>
                                <span style={{ background:`${nc}18`, color:nc, border:`1px solid ${nc}33`, borderRadius:12, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{a.nivel}</span>
                              </div>
                              <div style={{ fontSize:12, color:"#64748B", lineHeight:1.5 }}>{a.desc}</div>
                              {a.acao && a.abaAlvo && (
                                <div style={{ marginTop:8 }}>
                                  <span style={{ fontSize:11, color:"#3B82F6", cursor:"pointer", textDecoration:"underline" }} onClick={()=>setAguaTab(a.abaAlvo!)}>{a.acao} →</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════
                    ABA: INTEGRAÇÃO CLOUDFLARE / WEBHOOK
                ════════════════════════════════════════════════════ */}
                {aguaTab === "integracao" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

                    {/* ── Status geral ── */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                      {[
                        { icon:"☁️", label:"Cloudflare Worker", val:`${cfOnlineCount}/${resList.length} online`, color:"#8B5CF6", bg:"rgba(139,92,246,.1)", border:"rgba(139,92,246,.25)", ok: cfOnlineCount === resList.length },
                        { icon:"🔗", label:"Webhooks ativos",   val:`${whOnlineCount}/${resList.length} online`, color:"#06B6D4", bg:"rgba(6,182,212,.1)",  border:"rgba(6,182,212,.25)",  ok: whOnlineCount === resList.length },
                        { icon:"📡", label:"Reservatórios IoT", val:`${resList.length} cadastrados`,             color:"#3B82F6", bg:"rgba(59,130,246,.1)", border:"rgba(59,130,246,.25)", ok: true },
                      ].map(s => (
                        <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                          <div style={{ fontSize:28 }}>{s.icon}</div>
                          <div>
                            <div style={{ fontSize:10, color:"#475569", fontWeight:600 }}>{s.label}</div>
                            <div style={{ fontSize:18, fontWeight:800, color:s.ok?s.color:"#EF4444" }}>{s.val}</div>
                          </div>
                          <div style={{ marginLeft:"auto", width:10, height:10, borderRadius:"50%", background:s.ok?"#10B981":"#EF4444", boxShadow:`0 0 8px ${s.ok?"#10B981":"#EF4444"}` }} />
                        </div>
                      ))}
                    </div>

                    {/* ── Cloudflare Worker config ── */}
                    <div style={{ background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.2)", borderRadius:14, padding:"20px 22px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                        <div style={{ width:38, height:38, borderRadius:10, background:"rgba(139,92,246,.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>☁️</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:800, color:"#C4B5FD" }}>Cloudflare Worker</div>
                          <div style={{ fontSize:11, color:"#475569" }}>Proxy IoT — recebe dados do sensor e repassa ao ImobCore</div>
                        </div>
                        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                          <button onClick={testAllCF} style={{ padding:"7px 14px", borderRadius:8, background:"rgba(139,92,246,.15)", border:"1px solid rgba(139,92,246,.3)", color:"#C4B5FD", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                            ⚡ Testar todos
                          </button>
                        </div>
                      </div>

                      {/* URL global config */}
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11, color:"#94A3B8", fontWeight:600, marginBottom:6 }}>URL do Worker (global)</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <input value={cfGlobalUrl} onChange={e=>setCfGlobalUrl(e.target.value)}
                            style={{ flex:1, background:"rgba(0,0,0,.3)", border:"1px solid rgba(139,92,246,.3)", borderRadius:8, padding:"9px 12px", color:"#E2E8F0", fontSize:12, fontFamily:"monospace", outline:"none" }}
                            placeholder="https://imobcore1.fmsilvestri39.workers.dev" />
                          <button onClick={applyGlobalCF} style={{ padding:"9px 16px", borderRadius:8, background:"rgba(139,92,246,.2)", border:"1px solid rgba(139,92,246,.35)", color:"#C4B5FD", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const }}>
                            Aplicar a todos
                          </button>
                        </div>
                      </div>

                      {/* Payload preview — Cloudflare Worker format */}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:"#64748B", marginBottom:6 }}>📦 Payload que o Worker envia ao ImobCore:</div>
                        <pre style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:"12px 14px", fontSize:11, color:"#A5B4FC", margin:0, overflowX:"auto" as const }}>
{`// Campos normalizados pelo Worker:
{
  "device_id":    "agua-01",        // data.device || data.id
  "distancia_cm": 56,               // data.distancia || data.distance
  "nivel_percent": 72,              // data.nivel || data.level  (0–100)
  "volume_litros": 14400,           // data.volume
  "bateria":       85,              // data.bateria || data.bat
  "raw": { ... },                   // payload original do ESP32
  "received_at": "2026-03-19T..."
}`}
                        </pre>
                        <div style={{ fontSize:10, color:"#8B5CF6", marginTop:8, padding:"8px 10px", background:"rgba(139,92,246,.08)", borderRadius:8, border:"1px solid rgba(139,92,246,.2)" }}>
                          💡 O ImobCore mapeia automaticamente <code style={{color:"#C4B5FD"}}>device_id</code> para o <code style={{color:"#C4B5FD"}}>sensor_id</code> ou <code style={{color:"#C4B5FD"}}>mac_address</code> do reservatório cadastrado.
                        </div>
                      </div>

                      {/* Per-reservoir CF status */}
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div style={{ fontSize:11, color:"#64748B", fontWeight:600 }}>Status por reservatório:</div>
                        {resList.map(r => {
                          const testing = resPerTesting[r.id]?.cf;
                          return (
                            <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(0,0,0,.25)", border:`1px solid rgba(139,92,246,.15)`, borderRadius:10, padding:"10px 14px" }}>
                              <div style={{ width:8, height:8, borderRadius:"50%", background:r.cf_online?"#10B981":"#EF4444", boxShadow:`0 0 6px ${r.cf_online?"#10B981":"#EF4444"}`, flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"#E2E8F0" }}>{r.nome || r.sensor_id}</div>
                                <div style={{ fontSize:10, color:"#475569", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{r.cf_url}</div>
                              </div>
                              <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:5, background:r.cf_online?"rgba(16,185,129,.15)":"rgba(239,68,68,.12)", color:r.cf_online?"#6EE7B7":"#FCA5A5", border:`1px solid ${r.cf_online?"rgba(16,185,129,.3)":"rgba(239,68,68,.25)"}` }}>
                                {r.cf_online ? "✓ ONLINE" : "✗ OFFLINE"}
                              </span>
                              <button onClick={()=>resTestCFById(r)} disabled={testing}
                                style={{ padding:"5px 12px", borderRadius:7, background:"rgba(139,92,246,.15)", border:"1px solid rgba(139,92,246,.3)", color:"#C4B5FD", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:testing?.6:1 }}>
                                {testing ? "⏳" : "☁️ Testar"}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* CF test log */}
                      {cfTestLog.length > 0 && (
                        <div style={{ marginTop:14 }}>
                          <div style={{ fontSize:10, color:"#475569", fontWeight:600, marginBottom:6 }}>📋 Log de testes (Cloudflare):</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:120, overflowY:"auto" }}>
                            {cfTestLog.slice(0,8).map((l,i) => (
                              <div key={i} style={{ display:"flex", gap:8, fontSize:10, padding:"3px 8px", background:"rgba(0,0,0,.2)", borderRadius:5 }}>
                                <span style={{ color:l.ok?"#6EE7B7":"#FCA5A5", fontWeight:700 }}>{l.ok?"✓":"✗"}</span>
                                <span style={{ color:"#64748B" }}>{l.ts}</span>
                                <span style={{ color:"#94A3B8" }}>{resList.find(r=>r.id===l.id)?.nome || l.id}</span>
                                <span style={{ marginLeft:"auto", fontFamily:"monospace", color:l.ok?"#6EE7B7":"#FCA5A5" }}>HTTP {l.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Webhook config ── */}
                    <div style={{ background:"rgba(6,182,212,.05)", border:"1px solid rgba(6,182,212,.2)", borderRadius:14, padding:"20px 22px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                        <div style={{ width:38, height:38, borderRadius:10, background:"rgba(6,182,212,.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🔗</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:800, color:"#67E8F9" }}>Webhook de Retorno</div>
                          <div style={{ fontSize:11, color:"#475569" }}>ImobCore recebe os dados processados do Cloudflare via webhook</div>
                        </div>
                        <button onClick={testAllWH} style={{ marginLeft:"auto", padding:"7px 14px", borderRadius:8, background:"rgba(6,182,212,.15)", border:"1px solid rgba(6,182,212,.3)", color:"#67E8F9", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                          ⚡ Testar todos
                        </button>
                      </div>

                      {/* URL + Protocol + Port */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:11, color:"#94A3B8", fontWeight:600, marginBottom:6 }}>URL do Webhook (global)</div>
                          <input value={whGlobalUrl} onChange={e=>setWhGlobalUrl(e.target.value)}
                            style={{ width:"100%", background:"rgba(0,0,0,.3)", border:"1px solid rgba(6,182,212,.25)", borderRadius:8, padding:"9px 12px", color:"#E2E8F0", fontSize:12, fontFamily:"monospace", outline:"none", boxSizing:"border-box" as const }}
                            placeholder="https://seu-app.replit.app/api/webhook" />
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:"#94A3B8", fontWeight:600, marginBottom:6 }}>Protocolo</div>
                          <select value={whGlobalProtocolo} onChange={e=>setWhGlobalProtocolo(e.target.value)}
                            style={{ background:"rgba(6,22,45,.98)", border:"1px solid rgba(6,182,212,.25)", borderRadius:8, padding:"9px 12px", color:"#E2E8F0", fontSize:12, cursor:"pointer" }}>
                            <option>HTTPS POST</option>
                            <option>HTTP POST</option>
                            <option>MQTT</option>
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:"#94A3B8", fontWeight:600, marginBottom:6 }}>Porta</div>
                          <input type="number" value={whGlobalPorta} onChange={e=>setWhGlobalPorta(Number(e.target.value))}
                            style={{ width:80, background:"rgba(0,0,0,.3)", border:"1px solid rgba(6,182,212,.25)", borderRadius:8, padding:"9px 12px", color:"#E2E8F0", fontSize:12, fontFamily:"monospace", outline:"none" }}
                            placeholder="443" />
                        </div>
                      </div>
                      <button onClick={applyGlobalWH} style={{ marginBottom:16, padding:"8px 16px", borderRadius:8, background:"rgba(6,182,212,.15)", border:"1px solid rgba(6,182,212,.3)", color:"#67E8F9", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                        Aplicar a todos os reservatórios
                      </button>

                      {/* Endpoint interno */}
                      <div style={{ marginBottom:16, background:"rgba(0,0,0,.25)", border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:"12px 14px" }}>
                        <div style={{ fontSize:11, color:"#64748B", marginBottom:8 }}>📡 Endpoint ImobCore (para configurar no Cloudflare Worker):</div>
                        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" as const }}>
                          <code style={{ fontSize:12, color:"#67E8F9", fontFamily:"monospace", background:"rgba(6,182,212,.1)", borderRadius:6, padding:"4px 10px", border:"1px solid rgba(6,182,212,.2)" }}>
                            POST /api/webhook/sensor
                          </code>
                          <span style={{ fontSize:11, color:"#475569" }}>— aceita leituras do sensor em JSON</span>
                        </div>
                        <div style={{ marginTop:10 }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:6 }}>📦 Formato aceito (Cloudflare Worker):</div>
                          <pre style={{ background:"rgba(0,0,0,.4)", borderRadius:6, padding:"8px 12px", fontSize:10, color:"#A5B4FC", margin:0 }}>
{`POST /api/webhook
Content-Type: application/json

{
  "device_id":    "agua-01",   // mapeado para sensor_id/mac do reservatório
  "nivel_percent": 72,         // nível 0–100%
  "distancia_cm":  56,
  "volume_litros": 14400,      // calculado auto se omitido
  "bateria":       85,
  "received_at":  "..."
}

// Formato legado também aceito:
{ "sensor_id": "...", "nivel": 72, "volume_litros": ... }`}
                          </pre>
                        </div>
                      </div>

                      {/* Per-reservoir WH status */}
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div style={{ fontSize:11, color:"#64748B", fontWeight:600 }}>Status por reservatório:</div>
                        {resList.map(r => {
                          const testing = resPerTesting[r.id]?.wh;
                          return (
                            <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(0,0,0,.25)", border:`1px solid rgba(6,182,212,.12)`, borderRadius:10, padding:"10px 14px" }}>
                              <div style={{ width:8, height:8, borderRadius:"50%", background:r.wh_online?"#10B981":"#EF4444", boxShadow:`0 0 6px ${r.wh_online?"#10B981":"#EF4444"}`, flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"#E2E8F0" }}>{r.nome || r.sensor_id}</div>
                                <div style={{ display:"flex", gap:8, fontSize:10, color:"#475569", marginTop:2 }}>
                                  <span>{r.protocolo}</span>
                                  <span>:{r.porta}</span>
                                  <span style={{ color:"#334155", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{r.wh_url}</span>
                                </div>
                              </div>
                              <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:5, background:r.wh_online?"rgba(16,185,129,.15)":"rgba(239,68,68,.12)", color:r.wh_online?"#6EE7B7":"#FCA5A5", border:`1px solid ${r.wh_online?"rgba(16,185,129,.3)":"rgba(239,68,68,.25)"}` }}>
                                {r.wh_online ? "✓ ONLINE" : "✗ OFFLINE"}
                              </span>
                              <button onClick={()=>resTestWHById(r)} disabled={testing}
                                style={{ padding:"5px 12px", borderRadius:7, background:"rgba(6,182,212,.12)", border:"1px solid rgba(6,182,212,.25)", color:"#67E8F9", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:testing?.6:1 }}>
                                {testing ? "⏳" : "🔗 Testar"}
                              </button>
                              <button onClick={()=>resEdit(r)} style={{ padding:"5px 8px", borderRadius:7, background:"rgba(99,102,241,.1)", border:"1px solid rgba(99,102,241,.2)", color:"#A5B4FC", fontSize:10, cursor:"pointer" }}>
                                ✏️
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* WH test log */}
                      {whTestLog.length > 0 && (
                        <div style={{ marginTop:14 }}>
                          <div style={{ fontSize:10, color:"#475569", fontWeight:600, marginBottom:6 }}>📋 Log de testes (Webhook):</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:120, overflowY:"auto" }}>
                            {whTestLog.slice(0,8).map((l,i) => (
                              <div key={i} style={{ display:"flex", gap:8, fontSize:10, padding:"3px 8px", background:"rgba(0,0,0,.2)", borderRadius:5 }}>
                                <span style={{ color:l.ok?"#6EE7B7":"#FCA5A5", fontWeight:700 }}>{l.ok?"✓":"✗"}</span>
                                <span style={{ color:"#64748B" }}>{l.ts}</span>
                                <span style={{ color:"#94A3B8" }}>{resList.find(r=>r.id===l.id)?.nome || l.id}</span>
                                <span style={{ marginLeft:"auto", fontFamily:"monospace", color:l.ok?"#6EE7B7":"#FCA5A5" }}>HTTP {l.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Guia de integração ── */}
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"18px 22px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#94A3B8", marginBottom:14 }}>📖 Como configurar a integração</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[
                          { n:1, title:"Cloudflare Worker recebe do sensor", desc:"O sensor IoT (ESP32 / Raspberry Pi) envia leitura em JSON para o Cloudflare Worker via HTTPS POST.", color:"#8B5CF6" },
                          { n:2, title:"Worker repassa ao ImobCore", desc:`O Worker em imobcore1.fmsilvestri39.workers.dev encaminha os dados via POST para o endpoint /api/webhook/sensor deste sistema.`, color:"#6366F1" },
                          { n:3, title:"ImobCore processa e atualiza dashboard", desc:"O servidor atualiza o nível do reservatório, dispara alertas automáticos e notifica o síndico via SSE.", color:"#3B82F6" },
                          { n:4, title:"Teste a conexão", desc:"Use os botões '⚡ Testar' acima para verificar que cada etapa está respondendo corretamente.", color:"#10B981" },
                        ].map(s => (
                          <div key={s.n} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                            <div style={{ width:26, height:26, borderRadius:"50%", background:s.color+"22", border:`1px solid ${s.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:s.color, flexShrink:0 }}>{s.n}</div>
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:"#CBD5E1" }}>{s.title}</div>
                              <div style={{ fontSize:11, color:"#475569", marginTop:2, lineHeight:1.5 }}>{s.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            );
          })()}

          {/* PANEL: MEUS CONDOMÍNIOS */}
          {panel === "condominios" && (() => {
            const planLabel: Record<string,string> = { free:"Free", starter:"Starter", pro:"Pro", admin_plus:"Admin+" };
            const planColor: Record<string,string> = { free:"#475569", starter:"#0D9488", pro:"#7C5CFC", admin_plus:"#D97706" };
            const statusColor: Record<string,string> = { ativo:"#10B981", trial:"#F59E0B", suspenso:"#EF4444" };
            const statusLabel: Record<string,string> = { ativo:"Ativo", trial:"Trial", suspenso:"Suspenso" };
            const condos = dash?.condominios || [];
            return (
              <div className="panel active card">
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                  <div>
                    <div className="card-title" style={{ marginBottom:2 }}>🏢 Meus Condomínios</div>
                    <div style={{ fontSize:11, color:"#475569" }}>{condos.length} condomínio{condos.length !== 1 ? "s" : ""} cadastrado{condos.length !== 1 ? "s" : ""}</div>
                  </div>
                  <button title="Adicionar novo condomínio" onClick={() => { setObStep(0); setObIsReset(false); setView("onboarding"); }} style={{ background:"rgba(99,102,241,.2)", border:"1px solid rgba(99,102,241,.35)", borderRadius:8, padding:"8px 16px", color:"#A5B4FC", fontSize:12, fontWeight:700, cursor:"pointer" }}>＋ Novo</button>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:16 }}>
                  {condos.map(c => {
                    const isActive = c.id === condId;
                    const accent = c.cor_primaria || "#7C5CFC";
                    const st = (c.status || "trial") as string;
                    const pl = (c.plano || "free") as string;
                    return (
                      <div key={c.id} style={{ background: isActive ? `linear-gradient(135deg, ${accent}12 0%, rgba(15,23,42,.95) 100%)` : "rgba(255,255,255,.03)", border:`1px solid ${isActive ? accent+"44" : "rgba(255,255,255,.08)"}`, borderRadius:14, overflow:"hidden", transition:"all .2s" }}>
                        {/* Color accent bar */}
                        <div style={{ height:4, background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />
                        <div style={{ padding:"16px 18px" }}>
                          {/* Header */}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:800, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{c.nome}</div>
                              <div style={{ fontSize:11, color:"#64748B" }}>{c.cidade}{c.estado ? ` · ${c.estado}` : ""}</div>
                            </div>
                            <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"flex-end", gap:4 }}>
                              <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, background: planColor[pl]+"22", color: planColor[pl], border:`1px solid ${planColor[pl]}44`, textTransform:"uppercase" as const }}>{planLabel[pl]||pl}</span>
                              <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, background: statusColor[st]+"22", color: statusColor[st], border:`1px solid ${statusColor[st]}44` }}>{statusLabel[st]||st}</span>
                            </div>
                          </div>

                          {/* Stats row */}
                          <div style={{ display:"flex", gap:16, marginBottom:14 }}>
                            <div style={{ textAlign:"center" as const }}>
                              <div style={{ fontSize:18, fontWeight:900, color: accent }}>{c.total_unidades || c.unidades || 0}</div>
                              <div style={{ fontSize:9, color:"#475569" }}>Unidades</div>
                            </div>
                            <div style={{ textAlign:"center" as const }}>
                              <div style={{ fontSize:18, fontWeight:900 }}>{c.moradores || 0}</div>
                              <div style={{ fontSize:9, color:"#475569" }}>Moradores</div>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{c.sindico_nome || "–"}</div>
                              <div style={{ fontSize:9, color:"#475569" }}>Síndico</div>
                            </div>
                          </div>

                          {/* Trial warning */}
                          {st === "trial" && c.trial_expires_at && (
                            <div style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.2)", borderRadius:6, padding:"6px 10px", fontSize:10, color:"#FCD34D", marginBottom:10 }}>
                              ⏳ Trial expira em {new Date(c.trial_expires_at).toLocaleDateString("pt-BR")}
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display:"flex", gap:8 }}>
                            {isActive ? (
                              <div style={{ flex:1, textAlign:"center" as const, padding:"8px", fontSize:11, fontWeight:700, color: accent, background: accent+"15", borderRadius:8, border:`1px solid ${accent}33` }}>✓ Ativo</div>
                            ) : (
                              <button title={`Mudar para ${c.nome}`} onClick={() => loadDashboard(c.id)} style={{ flex:1, background: accent+"22", border:`1px solid ${accent}44`, borderRadius:8, padding:"8px", color: accent, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                                Selecionar
                              </button>
                            )}
                            <button title="Editar dados do condomínio" onClick={() => { setObSavedCondoId(c.id); setObCondo({ nome:c.nome||"", cnpj:c.cnpj||"", endereco:c.endereco||"", cidade:c.cidade||"", estado:c.estado||"SC", sindico_nome:c.sindico_nome||"", sindico_email:c.sindico_email||"", sindico_tel:c.sindico_tel||"", unidades:String(c.total_unidades||c.unidades||84) }); setObIsReset(false); setObStep(0); setView("onboarding"); }} style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#64748B", fontSize:12, cursor:"pointer" }}>✏️</button>
                            <button title="Excluir condomínio" onClick={async () => {
                              if (!window.confirm(`Excluir "${c.nome}" permanentemente?\n\nTodos os dados (financeiro, OS, sensores, comunicados) serão removidos. Esta ação não pode ser desfeita.`)) return;
                              try {
                                const r = await fetch(`/api/condominios/${c.id}`, { method: "DELETE" });
                                const d = await r.json();
                                if (!r.ok) { showToast("Erro ao excluir: " + d.error, "error"); return; }
                                showToast("Condomínio excluído", "success");
                                if (isActive) { setCondId(null); condIdRef.current = null; }
                                await loadDashboard();
                              } catch { showToast("Erro ao excluir condomínio", "error"); }
                            }} style={{ background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", borderRadius:8, padding:"8px 12px", color:"#EF4444", fontSize:12, cursor:"pointer" }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* PANEL: MISP – Alertas Públicos */}
          <div className={`panel ${panel === "misp" ? "active" : ""} card`}>
            <div className="card-title">🚨 Alertas Públicos – MISP</div>
            {(dash?.alertas_publicos || []).length === 0 && <div style={{ color: "#475569", textAlign: "center", padding: 20, fontSize: 13 }}>Nenhum alerta ativo no momento</div>}
            {(dash?.alertas_publicos || []).map(a => {
              const nc = { alto: "pill-red", medio: "pill-amber", baixo: "pill-green" }[a.nivel] || "pill-gray";
              return (
                <div key={a.id} className="misp-card">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.titulo}</div>
                    <span className={`pill ${nc}`}>{a.nivel}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>{a.descricao}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                    <span className="pill pill-gray">{a.tipo}</span>
                    <span className="pill pill-gray">{a.cidade} – {a.bairro}</span>
                    <span className="pill pill-blue">{a.origem}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PANEL: DIAGNÓSTICO DE SAÚDE */}
          {panel === "diagnostico" && (() => {
            const calc = mispCalc(mispAnswers);
            const pilarItems = (p: string) => MISP_ITEMS.filter(it => it.pilar === p);
            const answered = (p: string) => pilarItems(p).filter(it => mispAnswers[it.id]).length;
            const nivelBg = calc.score >= 80 ? "rgba(16,185,129,.12)" : calc.score >= 60 ? "rgba(245,158,11,.12)" : calc.score >= 40 ? "rgba(249,115,22,.12)" : "rgba(239,68,68,.12)";
            const pct = calc.total > 0 ? Math.round(calc.answered / calc.total * 100) : 0;
            return (
              <div className="panel active card" style={{ padding:0, overflow:"hidden" }}>

                {/* ══ SCORE CARD — sempre visível ══ */}
                <div style={{ background: `linear-gradient(135deg, ${calc.nivelColor}18 0%, rgba(15,23,42,0) 100%)`, borderBottom:"1px solid rgba(255,255,255,.07)", padding:"20px 24px" }}>
                  <div style={{ fontSize:11, color:"#475569", fontWeight:600, letterSpacing:1, textTransform:"uppercase" as const, marginBottom:12 }}>🫀 Diagnóstico de Saúde do Condomínio</div>
                  <div style={{ display:"flex", alignItems:"center", gap:20 }}>
                    {/* Gauge circle */}
                    <div style={{ position:"relative" as const, width:80, height:80, flexShrink:0 }}>
                      <svg width="80" height="80" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="8"/>
                        <circle cx="40" cy="40" r="34" fill="none" stroke={calc.nivelColor} strokeWidth="8"
                          strokeDasharray={`${2*Math.PI*34}`}
                          strokeDashoffset={`${2*Math.PI*34*(1-calc.score/100)}`}
                          strokeLinecap="round"
                          transform="rotate(-90 40 40)"
                          style={{ transition:"stroke-dashoffset .4s ease" }}
                        />
                      </svg>
                      <div style={{ position:"absolute" as const, inset:0, display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:20, fontWeight:900, color:calc.nivelColor, lineHeight:1 }}>{calc.score}</span>
                        <span style={{ fontSize:8, color:"#64748B", fontWeight:600 }}>/ 100</span>
                      </div>
                    </div>
                    {/* Details */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:18, fontWeight:800, color:calc.nivelColor, marginBottom:2 }}>{calc.nivel}</div>
                      <div style={{ fontSize:11, color:"#64748B", marginBottom:8 }}>{calc.answered} de {calc.total} itens respondidos</div>
                      <div style={{ height:5, background:"rgba(255,255,255,.06)", borderRadius:3 }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:`linear-gradient(90deg, ${calc.nivelColor}88, ${calc.nivelColor})`, borderRadius:3, transition:"width .3s" }}/>
                      </div>
                      <div style={{ fontSize:10, color:"#475569", marginTop:4 }}>{pct}% concluído</div>
                    </div>
                    {/* Pilar mini scores */}
                    <div style={{ display:"flex", gap:10, flexShrink:0 }}>
                      {MISP_PILARES.map(p => {
                        const items = MISP_ITEMS.filter(it => it.pilar === p);
                        const ans = items.filter(it => mispAnswers[it.id]).length;
                        return (
                          <div key={p} style={{ textAlign:"center", cursor:"pointer" }} onClick={() => { setMispTab("checklist"); setMispActivePilar(p); }}>
                            <div style={{ fontSize:18, marginBottom:2 }}>{MISP_PILAR_ICONS[p]}</div>
                            <div style={{ fontSize:10, fontWeight:700, color: ans === items.length ? MISP_PILAR_COLORS[p] : "#475569" }}>{ans}/{items.length}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ padding:"16px 24px" }}>
                {/* Tab bar */}
                <div style={{ display:"flex", gap:6, marginBottom:20 }}>
                  {([["automatico","🤖 Automático"],["checklist","📋 Checklist"],["resultado","📊 Resultado"],["historico","📅 Histórico"]] as [typeof mispTab, string][]).map(([k,l])=>(
                    <button key={k} onClick={()=>setMispTab(k)} style={{ background:mispTab===k?"rgba(99,102,241,.25)":"transparent", border:mispTab===k?"1px solid rgba(99,102,241,.4)":"1px solid rgba(255,255,255,.08)", borderRadius:8, padding:"7px 16px", color:mispTab===k?"#A5B4FC":"#475569", fontSize:12, fontWeight:mispTab===k?700:400, cursor:"pointer" }}>{l}</button>
                  ))}
                </div>

                {/* ── TELA 0: DIAGNÓSTICO AUTOMÁTICO ── */}
                {mispTab === "automatico" && (
                  <div>
                    {/* Hero button — calcular */}
                    <div style={{ textAlign:"center", marginBottom:24 }}>
                      <div style={{ fontSize:13, color:"#64748B", marginBottom:16, lineHeight:1.6 }}>
                        O diagnóstico automático analisa dados reais do condomínio (financeiro, ordens de serviço, sensores IoT) e gera um score de saúde com insights do Síndico Virtual IA.
                      </div>
                      <button onClick={calcDiagAuto} disabled={diagAutoLoading} style={{ background:"linear-gradient(135deg,#6366F1,#8B5CF6)", border:"none", borderRadius:12, padding:"14px 32px", color:"#fff", fontSize:15, fontWeight:800, cursor:diagAutoLoading?"not-allowed":"pointer", boxShadow:"0 4px 20px rgba(99,102,241,.4)", display:"inline-flex", alignItems:"center", gap:10, opacity:diagAutoLoading?.7:1 }}>
                        {diagAutoLoading ? <>⏳ Calculando…</> : <>🤖 Calcular Saúde Agora</>}
                      </button>
                      {diagAutoResult && <div style={{ fontSize:10, color:"#475569", marginTop:8 }}>Última análise: {new Date(diagAutoResult.calculado_em).toLocaleString("pt-BR")}</div>}
                    </div>

                    {diagAutoResult && (() => {
                      const s = diagAutoResult.score;
                      const d = diagAutoResult.dados;
                      const scoreColor = s.total >= 80 ? "#10B981" : s.total >= 60 ? "#F59E0B" : s.total >= 40 ? "#F97316" : "#EF4444";
                      return (
                        <>
                          {/* Score gauge + nivel */}
                          <div style={{ display:"flex", alignItems:"center", gap:24, background:"rgba(255,255,255,.03)", border:`1px solid ${scoreColor}33`, borderRadius:16, padding:"20px 24px", marginBottom:20 }}>
                            <div style={{ position:"relative", width:90, height:90, flexShrink:0 }}>
                              <svg width="90" height="90" viewBox="0 0 90 90">
                                <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9"/>
                                <circle cx="45" cy="45" r="38" fill="none" stroke={scoreColor} strokeWidth="9"
                                  strokeDasharray={`${2*Math.PI*38}`}
                                  strokeDashoffset={`${2*Math.PI*38*(1-s.total/100)}`}
                                  strokeLinecap="round" transform="rotate(-90 45 45)"
                                  style={{ transition:"stroke-dashoffset .5s ease" }}/>
                              </svg>
                              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                                <span style={{ fontSize:22, fontWeight:900, color:scoreColor, lineHeight:1 }}>{s.total}</span>
                                <span style={{ fontSize:9, color:"#64748B" }}>/ 100</span>
                              </div>
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:22, fontWeight:900, color:scoreColor, marginBottom:4 }}>{s.nivel}</div>
                              <div style={{ fontSize:12, color:"#64748B", marginBottom:12 }}>Score de Saúde do Condomínio</div>
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                                {[["💰 Financeiro", s.financeiro], ["🔧 Manutenção", s.manutencao], ["💧 IoT", s.iot], ["📊 Gestão", s.gestao]].map(([label, val]) => (
                                  <div key={String(label)} style={{ textAlign:"center" }}>
                                    <div style={{ fontSize:16, fontWeight:800, color:Number(val)>=80?"#10B981":Number(val)>=60?"#F59E0B":"#EF4444" }}>{val}</div>
                                    <div style={{ fontSize:9, color:"#475569" }}>{label}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Métricas reais */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                            {[
                              { icon:"💰", label:"Inadimplência", val:`${d.inadimplencia_pct.toFixed(0)}%`, ok:d.inadimplencia_pct<=10, warn:d.inadimplencia_pct<=25 },
                              { icon:"✅", label:"Saldo", val:d.saldo_positivo?"Positivo":"Negativo", ok:d.saldo_positivo, warn:d.saldo_positivo },
                              { icon:"🔧", label:"OS Atrasadas", val:String(d.os_atrasadas), ok:d.os_atrasadas===0, warn:d.os_atrasadas<=3 },
                              { icon:"🚨", label:"OS Urgentes", val:String(d.os_urgentes), ok:d.os_urgentes===0, warn:d.os_urgentes<=2 },
                              { icon:"📡", label:"Sensores Offline", val:String(d.sensores_offline), ok:d.sensores_offline===0, warn:d.sensores_offline<=1 },
                              { icon:"💧", label:"Nível Médio Água", val:`${d.nivel_medio_agua}%`, ok:d.nivel_medio_agua>=50, warn:d.nivel_medio_agua>=25 },
                            ].map(m=>{
                              const color = m.ok?"#10B981":m.warn?"#F59E0B":"#EF4444";
                              return (
                                <div key={m.label} style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${color}22`, borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
                                  <span style={{ fontSize:20 }}>{m.icon}</span>
                                  <div>
                                    <div style={{ fontSize:16, fontWeight:800, color }}>{m.val}</div>
                                    <div style={{ fontSize:10, color:"#475569" }}>{m.label}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Insights */}
                          {diagAutoResult.insights.length > 0 && (
                            <div style={{ marginBottom:20 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:"#94A3B8", marginBottom:10 }}>⚡ Insights Automáticos</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                {diagAutoResult.insights.map((ins, i) => {
                                  const c = ins.prioridade==="alta"?"#EF4444":ins.prioridade==="media"?"#F59E0B":"#10B981";
                                  return (
                                    <div key={i} style={{ background:`${c}0D`, border:`1px solid ${c}33`, borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
                                      <span style={{ fontSize:16 }}>{ins.prioridade==="alta"?"🔴":ins.prioridade==="media"?"🟡":"🟢"}</span>
                                      <div style={{ flex:1 }}>
                                        <span style={{ fontWeight:700, color:c, textTransform:"uppercase", fontSize:10, marginRight:8 }}>{ins.tipo}</span>
                                        <span style={{ color:"#CBD5E1" }}>{ins.mensagem}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Análise IA */}
                          {diagAutoResult.ia_analise && (
                            <div style={{ background:"rgba(99,102,241,.08)", border:"1px solid rgba(99,102,241,.2)", borderRadius:12, padding:"16px 20px" }}>
                              <div style={{ fontSize:11, fontWeight:700, color:"#818CF8", marginBottom:10 }}>🤖 Síndico Virtual — Análise de Saúde</div>
                              <div style={{ fontSize:12, color:"#C7D2FE", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{diagAutoResult.ia_analise}</div>
                            </div>
                          )}
                          {!diagAutoResult.ia_analise && (
                            <div style={{ textAlign:"center", padding:16, color:"#334155", fontSize:12 }}>Análise IA não disponível neste momento.</div>
                          )}
                        </>
                      );
                    })()}
                    {!diagAutoResult && !diagAutoLoading && (
                      <div style={{ textAlign:"center", padding:40, color:"#334155", fontSize:13 }}>
                        <div style={{ fontSize:48, marginBottom:12 }}>🏥</div>
                        Clique em <strong style={{ color:"#A5B4FC" }}>Calcular Saúde Agora</strong> para analisar os dados reais do condomínio com inteligência artificial.
                      </div>
                    )}
                  </div>
                )}

                {/* ── TELA 1: CHECKLIST ── */}
                {mispTab === "checklist" && (
                  <div>
                    {/* Progress bar */}
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748B", marginBottom:6 }}>
                        <span>{calc.answered}/{calc.total} itens respondidos</span>
                        <span style={{ color:calc.nivelColor, fontWeight:700 }}>Score: {calc.score}/100 – {calc.nivel}</span>
                      </div>
                      <div style={{ height:6, background:"rgba(255,255,255,.06)", borderRadius:3 }}>
                        <div style={{ width:`${Math.round(calc.answered/calc.total*100)}%`, height:"100%", background:"#6366F1", borderRadius:3, transition:"width .3s" }} />
                      </div>
                    </div>

                    {/* Pilar tabs */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, marginBottom:16 }}>
                      {MISP_PILARES.map(p => (
                        <button key={p} onClick={()=>setMispActivePilar(p)} style={{ background:mispActivePilar===p ? MISP_PILAR_COLORS[p]+"22" : "rgba(255,255,255,.03)", border:`1px solid ${mispActivePilar===p ? MISP_PILAR_COLORS[p]+"66" : "rgba(255,255,255,.08)"}`, borderRadius:8, padding:"6px 12px", color:mispActivePilar===p ? MISP_PILAR_COLORS[p] : "#64748B", fontSize:11, fontWeight:mispActivePilar===p?700:400, cursor:"pointer" }}>
                          {MISP_PILAR_ICONS[p]} {p} <span style={{ opacity:.7 }}>({answered(p)}/{pilarItems(p).length})</span>
                        </button>
                      ))}
                    </div>

                    {/* Items for active pilar */}
                    <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
                      {pilarItems(mispActivePilar).map(it => {
                        const resp = mispAnswers[it.id];
                        return (
                          <div key={it.id} style={{ background: resp ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)", border:`1px solid ${resp==="sim"?"rgba(16,185,129,.3)":resp==="parcial"?"rgba(245,158,11,.3)":resp==="nao"?"rgba(239,68,68,.2)":"rgba(255,255,255,.07)"}`, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{it.nome} <span style={{ fontSize:10, color:"#475569", fontWeight:400 }}>peso {it.peso}</span></div>
                                <div style={{ fontSize:11, color:"#64748B" }}>{it.desc}</div>
                              </div>
                              <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                                {(["sim","parcial","nao"] as const).map(r=>(
                                  <button key={r} onClick={()=>setMispAnswers(a=>({...a,[it.id]:r}))} style={{ background: resp===r ? (r==="sim"?"#10B981":r==="parcial"?"#F59E0B":"#EF4444") : "rgba(255,255,255,.06)", border:"none", borderRadius:6, padding:"5px 10px", color: resp===r ? "#fff" : "#64748B", fontSize:11, fontWeight:resp===r?700:400, cursor:"pointer", transition:"all .15s" }}>
                                    {r==="sim"?"✅ Sim":r==="parcial"?"⚠️ Parcial":"❌ Não"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Finalizar button */}
                    <div style={{ marginTop:20, display:"flex", gap:10 }}>
                      <button title="Salvar este diagnóstico no histórico e ver o resultado" onClick={mispFinalize} style={{ background:"#6366F1", border:"none", borderRadius:10, padding:"12px 28px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>📊 Finalizar Diagnóstico</button>
                      <button title="Apagar todas as respostas e recomeçar do zero" onClick={()=>{ if(confirm("Limpar todas as respostas?")) setMispAnswers({}); }} style={{ background:"transparent", border:"1px solid rgba(255,255,255,.1)", borderRadius:10, padding:"12px 20px", color:"#64748B", fontSize:13, cursor:"pointer" }}>Limpar</button>
                    </div>
                  </div>
                )}

                {/* ── TELA 2: RESULTADO ── */}
                {mispTab === "resultado" && (
                  <div>
                    {/* Score card */}
                    <div style={{ background:nivelBg, border:`1px solid ${calc.nivelColor}33`, borderRadius:12, padding:"20px 24px", marginBottom:20, textAlign:"center" }}>
                      <div style={{ fontSize:52, fontWeight:900, color:calc.nivelColor, lineHeight:1 }}>{calc.score}</div>
                      <div style={{ fontSize:16, fontWeight:700, color:calc.nivelColor, marginBottom:4 }}>{calc.nivel}</div>
                      <div style={{ fontSize:12, color:"#64748B" }}>{calc.answered} de {calc.total} itens respondidos</div>
                    </div>

                    {/* KPI cards */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                      {[
                        { label:"Score Total", val:`${calc.score}/100`, color:calc.nivelColor },
                        { label:"Itens Críticos", val:String(MISP_ITEMS.filter(it=>mispAnswers[it.id]==="nao"&&it.peso>=4).length), color:"#EF4444" },
                        { label:"Itens Parciais", val:String(MISP_ITEMS.filter(it=>mispAnswers[it.id]==="parcial").length), color:"#F59E0B" },
                        { label:"% Preenchido", val:`${Math.round(calc.answered/calc.total*100)}%`, color:"#6366F1" },
                      ].map(k=>(
                        <div key={k.label} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:10, padding:"12px 16px", textAlign:"center" }}>
                          <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.val}</div>
                          <div style={{ fontSize:10, color:"#64748B", marginTop:3 }}>{k.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Radar Chart */}
                    <div style={{ marginBottom:20 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#94A3B8", marginBottom:10 }}>📡 Score por Pilar</div>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadarChart data={calc.radarData}>
                          <PolarGrid stroke="rgba(255,255,255,.08)" />
                          <PolarAngleAxis dataKey="pilar" tick={{ fill:"#64748B", fontSize:11 }} />
                          <Radar dataKey="score" stroke="#6366F1" fill="#6366F1" fillOpacity={0.25} />
                          <Tooltip formatter={(v:number)=>[`${v}%`,"Score"]} contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:12 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Lists */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#EF4444", marginBottom:8 }}>🔴 CRÍTICOS (Não, peso ≥ 4)</div>
                        {MISP_ITEMS.filter(it=>mispAnswers[it.id]==="nao"&&it.peso>=4).map(it=>(
                          <div key={it.id} style={{ background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.15)", borderRadius:8, padding:"8px 10px", marginBottom:6, fontSize:11 }}>
                            <div style={{ fontWeight:600 }}>{it.nome}</div>
                            <div style={{ color:"#64748B", fontSize:10 }}>{MISP_PILAR_ICONS[it.pilar]} {it.pilar}</div>
                          </div>
                        ))}
                        {MISP_ITEMS.filter(it=>mispAnswers[it.id]==="nao"&&it.peso>=4).length===0 && <div style={{ color:"#334155", fontSize:11 }}>Nenhum item crítico</div>}
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#F59E0B", marginBottom:8 }}>🟡 ATENÇÃO (Parcial, peso ≥ 3)</div>
                        {MISP_ITEMS.filter(it=>mispAnswers[it.id]==="parcial"&&it.peso>=3).map(it=>(
                          <div key={it.id} style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.15)", borderRadius:8, padding:"8px 10px", marginBottom:6, fontSize:11 }}>
                            <div style={{ fontWeight:600 }}>{it.nome}</div>
                            <div style={{ color:"#64748B", fontSize:10 }}>{MISP_PILAR_ICONS[it.pilar]} {it.pilar}</div>
                          </div>
                        ))}
                        {MISP_ITEMS.filter(it=>mispAnswers[it.id]==="parcial"&&it.peso>=3).length===0 && <div style={{ color:"#334155", fontSize:11 }}>Nenhum item em atenção</div>}
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#10B981", marginBottom:8 }}>🟢 POSITIVOS (Sim, peso ≥ 4)</div>
                        {MISP_ITEMS.filter(it=>mispAnswers[it.id]==="sim"&&it.peso>=4).map(it=>(
                          <div key={it.id} style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.15)", borderRadius:8, padding:"8px 10px", marginBottom:6, fontSize:11 }}>
                            <div style={{ fontWeight:600 }}>{it.nome}</div>
                            <div style={{ color:"#64748B", fontSize:10 }}>{MISP_PILAR_ICONS[it.pilar]} {it.pilar}</div>
                          </div>
                        ))}
                        {MISP_ITEMS.filter(it=>mispAnswers[it.id]==="sim"&&it.peso>=4).length===0 && <div style={{ color:"#334155", fontSize:11 }}>Nenhum ponto forte</div>}
                      </div>
                    </div>

                    {/* AI + Export buttons */}
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, marginBottom:16 }}>
                      <button onClick={async ()=>{
                        setMispAiLoading(true); setMispAiResult("");
                        const criticos = MISP_ITEMS.filter(it=>mispAnswers[it.id]==="nao"&&it.peso>=4).map(it=>it.nome).join(", ");
                        const parciais = MISP_ITEMS.filter(it=>mispAnswers[it.id]==="parcial").map(it=>it.nome).join(", ");
                        const prompt = `Diagnóstico MISP do condomínio: Score ${calc.score}/100 (${calc.nivel}). ${calc.answered}/${calc.total} itens respondidos. Itens críticos (Não com peso≥4): ${criticos||"nenhum"}. Itens parciais: ${parciais||"nenhum"}. Scores por pilar: ${calc.radarData.map(d=>d.pilar+": "+d.score+"%").join(", ")}. Forneça: 1) Diagnóstico executivo 2) Top 5 prioridades de ação 3) Estimativa de impacto no score se as prioridades forem corrigidas. Seja direto e prático.`;
                        try {
                          const r = await fetch("/api/ai/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message: prompt }) });
                          const data = await r.json();
                          setMispAiResult(data.reply || data.message || JSON.stringify(data));
                        } catch { setMispAiResult("Erro ao contatar o Síndico Virtual."); }
                        setMispAiLoading(false);
                      }} style={{ background:"rgba(99,102,241,.2)", border:"1px solid rgba(99,102,241,.4)", borderRadius:10, padding:"10px 20px", color:"#A5B4FC", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                        {mispAiLoading ? "⏳ Analisando..." : "🤖 Análise IA – Síndico Virtual"}
                      </button>
                      <button title="Exportar relatório detalhado do diagnóstico em PDF" onClick={()=>exportDiagPDF(mispAnswers, mispAiResult)} style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.12)", borderRadius:10, padding:"10px 20px", color:"#94A3B8", fontSize:13, cursor:"pointer" }}>🖨️ Exportar PDF</button>
                    </div>

                    {mispAiResult && (
                      <div style={{ background:"rgba(99,102,241,.08)", border:"1px solid rgba(99,102,241,.2)", borderRadius:12, padding:"16px 20px", fontSize:12, color:"#C7D2FE", lineHeight:1.7, whiteSpace:"pre-wrap" as const }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#818CF8", marginBottom:8 }}>🤖 Síndico Virtual – Diagnóstico de Saúde</div>
                        {mispAiResult}
                      </div>
                    )}
                  </div>
                )}

                {/* ── TELA 3: HISTÓRICO ── */}
                {mispTab === "historico" && (() => {
                  const nivelC = (s: number) => s >= 80 ? "#10B981" : s >= 60 ? "#F59E0B" : s >= 40 ? "#F97316" : "#EF4444";

                  const generateDiagPDF = (h: DiagHistorico, condNome: string) => {
                    const nc = nivelC(h.score_total);
                    const pilares = [
                      { label:"Financeiro", score: h.score_financeiro ?? 0, icon:"💰" },
                      { label:"Manutenção", score: h.score_manutencao ?? 0, icon:"🔧" },
                      { label:"IoT/Sensores", score: h.score_iot ?? 0, icon:"💧" },
                      { label:"Gestão", score: h.score_gestao ?? 0, icon:"📊" },
                    ];
                    const pilarRows = pilares.map(p => {
                      const pc = nivelC(p.score);
                      return `<tr><td>${p.icon} ${p.label}</td><td style="font-weight:700;color:${pc}">${p.score}/100</td><td><div style="height:8px;background:#e2e8f0;border-radius:4px;width:200px"><div style="width:${p.score}%;height:100%;background:${pc};border-radius:4px"></div></div></td></tr>`;
                    }).join("");
                    const dadosRows = h.dados ? [
                      ["Inadimplência", `${h.dados.inadimplencia_pct?.toFixed(1) ?? 0}%`],
                      ["OS Atrasadas", String(h.dados.os_atrasadas ?? 0)],
                      ["OS Urgentes", String(h.dados.os_urgentes ?? 0)],
                      ["Sensores Offline", String(h.dados.sensores_offline ?? 0)],
                      ["Nível Médio Água", `${h.dados.nivel_medio_agua ?? 0}%`],
                      ["Saldo Financeiro", h.dados.saldo_positivo ? "Positivo ✅" : "Negativo ❌"],
                    ].map(([k,v]) => `<tr><td>${k}</td><td style="font-weight:600">${v}</td></tr>`).join("") : "";
                    const insightRows = (h.insights || []).map(i => {
                      const ic = i.prioridade === "alta" ? "#dc2626" : i.prioridade === "media" ? "#d97706" : "#16a34a";
                      return `<tr><td style="color:${ic};font-weight:700;text-transform:uppercase;font-size:11px">${i.prioridade}</td><td style="color:#374151;font-weight:600;font-size:11px">${i.tipo}</td><td style="font-size:12px">${i.mensagem}</td></tr>`;
                    }).join("");
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Diagnóstico ImobCore</title><style>
                      *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1e293b;padding:32px;background:#f8fafc}
                      .header{display:flex;align-items:center;gap:20px;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid ${nc}}
                      .score-circle{width:100px;height:100px;border-radius:50%;background:${nc}18;border:5px solid ${nc};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
                      .score-num{font-size:32px;font-weight:900;color:${nc}}
                      .score-label{font-size:11px;color:#64748b;font-weight:600}
                      h1{color:#1e293b;font-size:22px}h2{font-size:15px;color:#374151;margin:22px 0 10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
                      table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0}
                      th{background:#f1f5f9;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase}
                      .nivel-badge{display:inline-block;padding:4px 14px;border-radius:20px;background:${nc}22;color:${nc};font-weight:800;font-size:13px;border:1px solid ${nc}55}
                      .ia-box{background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;font-size:13px;line-height:1.7;color:#312e81;white-space:pre-wrap}
                      .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}
                    </style></head><body>
                    <div class="header">
                      <div class="score-circle"><div class="score-num">${h.score_total}</div><div class="score-label">/ 100</div></div>
                      <div>
                        <h1>🫀 Diagnóstico de Saúde do Condomínio</h1>
                        <div style="font-size:14px;color:#64748b;margin:6px 0">${condNome}</div>
                        <div style="font-size:12px;color:#94a3b8">Calculado em ${new Date(h.calculado_em).toLocaleString("pt-BR")}</div>
                        <div style="margin-top:8px"><span class="nivel-badge">${h.nivel}</span></div>
                      </div>
                    </div>
                    <h2>📊 Score por Pilar</h2>
                    <table><thead><tr><th>Pilar</th><th>Score</th><th>Barra</th></tr></thead><tbody>${pilarRows}</tbody></table>
                    ${h.dados ? `<h2>📋 Dados Operacionais</h2><table><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>${dadosRows}</tbody></table>` : ""}
                    ${(h.insights || []).length > 0 ? `<h2>💡 Insights & Recomendações</h2><table><thead><tr><th>Prioridade</th><th>Tipo</th><th>Recomendação</th></tr></thead><tbody>${insightRows}</tbody></table>` : ""}
                    ${h.ia_analise ? `<h2>🤖 Análise do Síndico Virtual (IA)</h2><div class="ia-box">${h.ia_analise}</div>` : ""}
                    <div class="footer">Gerado pelo ImobCore v2 — Plataforma de Gestão Inteligente de Condomínios</div>
                    </body></html>`;
                    const w = window.open("","_blank","width=960,height=720");
                    if (w) { w.document.write(html); w.document.close(); w.print(); }
                  };

                  const condNome = dash?.condominios?.find(c => c.id === condId)?.nome ?? "Condomínio";
                  const chartData = [...diagHistorico].reverse().map((h, i) => ({
                    name: new Date(h.calculado_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }),
                    score: h.score_total,
                    fin: h.score_financeiro ?? 0,
                    man: h.score_manutencao ?? 0,
                    iot: h.score_iot ?? 0,
                  }));

                  return (
                  <div>
                    {/* Header */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:"var(--c-text)" }}>📅 Histórico de Diagnósticos IA</div>
                        <div style={{ fontSize:11, color:"#64748B", marginTop:2 }}>{diagHistorico.length} análise{diagHistorico.length !== 1 ? "s" : ""} salva{diagHistorico.length !== 1 ? "s" : ""} no banco</div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        {condId && <button onClick={()=>loadDiagHistorico(condId)} style={{ background:"none", border:"1px solid rgba(255,255,255,.1)", borderRadius:7, padding:"6px 12px", color:"#94A3B8", cursor:"pointer", fontSize:11 }}>↻ Atualizar</button>}
                        <button onClick={()=>{ setMispTab("automatico"); }} style={{ background:"#6366F1", border:"none", borderRadius:8, padding:"6px 16px", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>🤖 Novo Diagnóstico</button>
                      </div>
                    </div>

                    {diagHistLoading && <div style={{ textAlign:"center", color:"#334155", padding:32, fontSize:13 }}>Carregando histórico...</div>}

                    {/* Evolution chart */}
                    {!diagHistLoading && chartData.length > 1 && (
                      <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--c-text)", marginBottom:12 }}>📈 Evolução do Score — Últimos {chartData.length} diagnósticos</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={chartData} margin={{ top:4, right:10, bottom:4, left:-20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" />
                            <XAxis dataKey="name" tick={{ fill:"#475569", fontSize:10 }} />
                            <YAxis domain={[0,100]} tick={{ fill:"#475569", fontSize:10 }} />
                            <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.15)", borderRadius:8, fontSize:12, color:"#E2E8F0" }} />
                            <Legend wrapperStyle={{ fontSize:11 }} />
                            <Line type="monotone" dataKey="score" name="Score Geral" stroke="#6366F1" strokeWidth={2.5} dot={{ fill:"#6366F1", r:4 }} activeDot={{ r:6 }} />
                            <Line type="monotone" dataKey="fin" name="Financeiro" stroke="#10B981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                            <Line type="monotone" dataKey="man" name="Manutenção" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                            <Line type="monotone" dataKey="iot" name="IoT" stroke="#3B82F6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                          </LineChart>
                        </ResponsiveContainer>
                        {diagHistorico.length >= 2 && (
                          <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap" }}>
                            {[
                              { label:"Melhor Score", val: Math.max(...diagHistorico.map(h=>h.score_total)), col:"#10B981" },
                              { label:"Pior Score",   val: Math.min(...diagHistorico.map(h=>h.score_total)), col:"#EF4444" },
                              { label:"Variação Geral", val: (diagHistorico[0].score_total > diagHistorico[diagHistorico.length-1].score_total ? "+" : "") + (diagHistorico[0].score_total - diagHistorico[diagHistorico.length-1].score_total) + " pts", col: diagHistorico[0].score_total >= diagHistorico[diagHistorico.length-1].score_total ? "#10B981" : "#EF4444" },
                            ].map(k => (
                              <div key={k.label} style={{ background:"rgba(255,255,255,.03)", borderRadius:8, padding:"8px 14px", flex:1, minWidth:90, textAlign:"center" }}>
                                <div style={{ fontSize:15, fontWeight:800, color:k.col }}>{k.val}</div>
                                <div style={{ fontSize:10, color:"#64748B", marginTop:2 }}>{k.label}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI History list */}
                    {!diagHistLoading && diagHistorico.length === 0 && (
                      <div style={{ textAlign:"center", color:"#334155", padding:40, fontSize:13 }}>
                        <div style={{ fontSize:40, marginBottom:12 }}>🏥</div>
                        Nenhum diagnóstico IA realizado ainda.<br/>
                        <button onClick={()=>setMispTab("automatico")} style={{ marginTop:12, background:"#6366F1", border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontSize:13, cursor:"pointer", fontWeight:700 }}>Calcular Primeiro Diagnóstico</button>
                      </div>
                    )}

                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {diagHistorico.map((h, i) => {
                        const nc = nivelC(h.score_total);
                        const prev = diagHistorico[i + 1];
                        const delta = prev ? h.score_total - prev.score_total : null;
                        return (
                          <div key={h.id} style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${nc}22`, borderRadius:12, padding:"14px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              {/* Score badge */}
                              <div style={{ width:52, height:52, borderRadius:"50%", background:`${nc}18`, border:`3px solid ${nc}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <div style={{ fontSize:17, fontWeight:900, color:nc, lineHeight:1 }}>{h.score_total}</div>
                                <div style={{ fontSize:8, color:nc, fontWeight:600 }}>/100</div>
                              </div>
                              {/* Info */}
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                  <span style={{ fontSize:13, fontWeight:700, color:"var(--c-text)" }}>Diagnóstico #{diagHistorico.length - i}</span>
                                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, background:`${nc}22`, color:nc, fontWeight:700, border:`1px solid ${nc}44` }}>{h.nivel}</span>
                                  {delta !== null && <span style={{ fontSize:10, color: delta >= 0 ? "#10B981" : "#EF4444", fontWeight:700 }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts</span>}
                                </div>
                                <div style={{ fontSize:11, color:"#64748B", marginTop:3 }}>{new Date(h.calculado_em).toLocaleString("pt-BR")}</div>
                                {/* Mini pilar scores */}
                                <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap" }}>
                                  {[{l:"💰 Fin",v:h.score_financeiro},{l:"🔧 Man",v:h.score_manutencao},{l:"💧 IoT",v:h.score_iot},{l:"📊 Gest",v:h.score_gestao}].filter(p=>p.v!==null).map(p=>(
                                    <div key={p.l} style={{ fontSize:11 }}>
                                      <span style={{ color:"#64748B" }}>{p.l}: </span>
                                      <span style={{ fontWeight:700, color:nivelC(p.v!) }}>{p.v}</span>
                                    </div>
                                  ))}
                                </div>
                                {/* Top insight */}
                                {(h.insights || []).length > 0 && (
                                  <div style={{ marginTop:6, fontSize:11, color:"#94A3B8", fontStyle:"italic", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                    💡 {h.insights![0].mensagem}
                                  </div>
                                )}
                              </div>
                              {/* PDF button */}
                              <button
                                onClick={() => generateDiagPDF(h, condNome)}
                                title="Exportar PDF detalhado"
                                style={{ background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", borderRadius:8, padding:"8px 12px", color:"#818CF8", cursor:"pointer", fontSize:11, fontWeight:700, flexShrink:0, whiteSpace:"nowrap" }}
                              >📄 PDF</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* MISP checklist history (secondary) */}
                    {mispHistory.length > 0 && (
                      <div style={{ marginTop:24 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:".5px", marginBottom:10 }}>📋 Checklist Manual (MISP — local)</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {mispHistory.map((h, i) => {
                            const nc = nivelC(h.score);
                            return (
                              <div key={i} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                <div>
                                  <div style={{ fontSize:11, fontWeight:700 }}>Checklist #{mispHistory.length - i}</div>
                                  <div style={{ fontSize:10, color:"#64748B" }}>{h.date}</div>
                                </div>
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:18, fontWeight:900, color:nc }}>{h.score}</div>
                                  <div style={{ fontSize:9, color:nc, fontWeight:700 }}>{h.nivel}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {mispHistory.length > 1 && (
                      <div style={{ marginTop:12, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, padding:"12px 16px" }}>
                        <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>📊 Variação (Checklist)</div>
                        <div style={{ fontSize:12, color: mispHistory[0].score >= mispHistory[1].score ? "#10B981" : "#EF4444" }}>
                          {mispHistory[0].score >= mispHistory[1].score ? "▲" : "▼"} {Math.abs(mispHistory[0].score - mispHistory[1].score)} pontos em relação ao diagnóstico anterior ({mispHistory[1].score} → {mispHistory[0].score})
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}
                </div>{/* end padding wrapper */}
              </div>
            );
          })()}

          {/* PANEL: MANUTENÇÃO */}
          {panel === "manutencao" && (() => {
            // ── helpers ────────────────────────────────────────────────
            const stColor = { operacional:"#10B981", atencao:"#F59E0B", manutencao:"#EF4444", inativo:"#475569" } as const;
            const stLabel = { operacional:"Operacional", atencao:"Atenção", manutencao:"Em Manutenção", inativo:"Inativo" } as const;
            const vidaPct = (e: Equipamento) => Math.min(100, Math.round((e.instaladoHa / e.vidaUtilAnos) * 100));
            const vidaColor = (p: number) => p < 50 ? "#10B981" : p < 75 ? "#F59E0B" : "#EF4444";

            // ── Aba 1: filtros ──────────────────────────────────────────
            const cats = ["todos", ...Array.from(new Set(equipList.map(e => e.categoria)))];
            const filtered = equipList.filter(e => {
              const q = mantSearch.toLowerCase();
              const matchQ = !q || e.nome.toLowerCase().includes(q) || e.local.toLowerCase().includes(q) || e.fabricante.toLowerCase().includes(q);
              const matchC = mantCatFilter === "todos" || e.categoria === mantCatFilter;
              const matchS = mantStatusFilter === "todos" || e.status === mantStatusFilter;
              return matchQ && matchC && matchS;
            });

            // ── Aba 3: dados para chart ─────────────────────────────────
            const schedCostData = MANUT_SCHEDULE.map(m => ({
              mes: m.mes,
              Preventiva: m.items.filter(i => i.tipo === "preventiva").reduce((s, i) => s + i.custo, 0),
              Corretiva: m.items.filter(i => i.tipo === "corretiva").reduce((s, i) => s + i.custo, 0),
            }));
            const currMonthIdx = mantPlanMonth;
            const currSched = MANUT_SCHEDULE[currMonthIdx];

            // ── Aba 6: dados para charts ────────────────────────────────
            const catCounts: Record<string,{count:number;custo:number}> = {};
            equipList.forEach(e => {
              catCounts[e.categoria] = catCounts[e.categoria] || { count:0, custo:0 };
              catCounts[e.categoria].count++;
              catCounts[e.categoria].custo += e.custoManutencao;
            });
            const pieDat = Object.entries(catCounts).map(([name,v]) => ({ name, value: v.count, custo: v.custo }));
            const PC = ["#6366F1","#06B6D4","#10B981","#F59E0B","#EF4444","#A855F7","#EC4899","#14B8A6"];

            const falhasData = [
              { mes:"Out/25", falhas:1 },{ mes:"Nov/25", falhas:0 },{ mes:"Dez/25", falhas:2 },
              { mes:"Jan/26", falhas:1 },{ mes:"Feb/26", falhas:2 },{ mes:"Mar/26", falhas:3 },
            ];

            // Score saúde equipamentos
            const nOp = equipList.filter(e=>e.status==="operacional").length;
            const nAt = equipList.filter(e=>e.status==="atencao").length;
            const nMt = equipList.filter(e=>e.status==="manutencao").length;
            const nIn = equipList.filter(e=>e.status==="inativo").length;
            const scoreEquip = Math.round(((nOp*100 + nAt*60 + nMt*30 + nIn*0) / equipList.length));
            const scoreEquipColor = scoreEquip >= 80 ? "#10B981" : scoreEquip >= 60 ? "#F59E0B" : "#EF4444";
            const scoreEquipLabel = scoreEquip >= 80 ? "Excelente" : scoreEquip >= 60 ? "Bom" : "Crítico";

            // Mapa pins positions (SVG 500×340)
            // Gera pins do mapa dinamicamente a partir dos equipamentos reais
            const MAP_W = 500, MAP_H = 340, MAP_COLS = 6;
            const mapPins = equipList.map((eq, i) => {
              const col = i % MAP_COLS;
              const row = Math.floor(i / MAP_COLS);
              const x = 55 + col * Math.floor((MAP_W - 80) / (MAP_COLS - 1 || 1));
              const y = 50 + row * 80;
              return { id: eq.id, x, y, label: eq.nome.slice(0, 8) };
            });

            const tabStyle = (t: string) => ({
              padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", borderRadius: 8,
              background: mantTab === t ? "rgba(99,102,241,.35)" : "rgba(255,255,255,.04)",
              color: mantTab === t ? "#C4B5FD" : "#94A3B8",
              border: mantTab === t ? "1px solid rgba(99,102,241,.6)" : "1px solid rgba(255,255,255,.08)",
              boxShadow: mantTab === t ? "0 0 12px rgba(99,102,241,.2)" : "none",
              transition: "all .15s",
            });

            return (
              <div style={{ padding: 20 }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:12 }}>
                  <div>
                    <div style={{ fontSize:20, fontWeight:800, color:"var(--c-text)" }}>🏗️ Gestão da Manutenção</div>
                    <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                      {([
                        { label:`${equipList.length} total`,  col:"#64748B" },
                        { label:`${nOp} operacionais`,        col:"#10B981" },
                        { label:`${nAt} atenção`,             col:"#F59E0B" },
                        { label:`${nMt} manutenção`,          col:"#EF4444" },
                        { label:`${nIn} inativos`,            col:"#475569" },
                      ] as {label:string;col:string}[]).map(s => (
                        <span key={s.label} style={{ background:`${s.col}22`, color:s.col, border:`1px solid ${s.col}55`, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{s.label}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <span style={{ background:scoreEquipColor+"22", color:scoreEquipColor, borderRadius:20, padding:"6px 16px", fontSize:13, fontWeight:800, border:`1px solid ${scoreEquipColor}55`, boxShadow:`0 0 14px ${scoreEquipColor}33` }}>
                      Score {isNaN(scoreEquip) ? "—" : scoreEquip}/100 · {isNaN(scoreEquip) ? "—" : scoreEquipLabel}
                    </span>
                  </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
                  {([["equip","📋 Equipamentos e Estruturas"],["mapa","🗺️ Mapa"],["plano","📅 Plano"],["os","🔧 OS Integrado"],["qr","📱 QR Codes"],["ia","🤖 Dashboard IA"]] as [typeof mantTab, string][]).map(([k,l]) => (
                    <button key={k} style={tabStyle(k)} onClick={() => setMantTab(k)}>{l}</button>
                  ))}
                </div>

                {/* ── ABA 1: EQUIPAMENTOS ─────────────────────────────── */}
                {mantTab === "equip" && (
                  <div>
                    {/* ── Action Bar (Topo) ── */}
                    <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"stretch" }}>
                      <button
                        title="Exportar relatório PDF completo de todos os equipamentos e estruturas"
                        onClick={() => {
                          const condNome = dash?.condominios?.find(c=>c.id===condId)?.nome ?? "Condomínio";
                          const now = new Date().toLocaleString("pt-BR");
                          const scoreColor = scoreEquipColor;
                          const statusIcon = (s: string) => s==="operacional"?"✅":s==="atencao"?"⚠️":s==="manutencao"?"🔧":"⬛";
                          const vidaUtilColor = (p: number) => p < 50 ? "#16a34a" : p < 75 ? "#d97706" : "#dc2626";
                          const custoTotal = equipList.reduce((s, e) => s + (e.custoManutencao || 0), 0);
                          const fmtBRL = (v: number) => v > 0 ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";
                          const rows = equipList.map((e, i) => {
                            const pct = Math.min(100, Math.round((e.instaladoHa / e.vidaUtilAnos) * 100));
                            const fv = e.fornecedor_id ? fornecList.find(f=>f.id===e.fornecedor_id) : null;
                            const stC = e.status==="operacional"?"#16a34a":e.status==="atencao"?"#d97706":e.status==="manutencao"?"#dc2626":"#6b7280";
                            const vc  = vidaUtilColor(pct);
                            const custo = e.custoManutencao || 0;
                            return `<tr style="background:${i%2===0?"#f8fafc":"#ffffff"}"><td>${i+1}</td><td><strong>${e.catIcon} ${e.nome}</strong><br/><span style="color:#6b7280;font-size:10px">${e.modelo||""}</span></td><td>${e.categoria}</td><td>${e.local}</td><td style="color:${stC};font-weight:600">${statusIcon(e.status)} ${e.status}</td><td style="color:${vc};font-weight:600">${pct}%</td><td>${e.proxManutencao||"—"}</td><td style="color:#d97706;font-weight:600">${fmtBRL(custo)}</td><td style="color:#2563eb">${fv?.nome||"—"}</td></tr>`;
                          }).join("");
                          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Equipamentos — ${condNome}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1e293b}h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#475569;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1e293b;color:#fff;padding:8px 10px;text-align:left}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}.total-row{background:#fefce8;font-weight:700}.footer{margin-top:24px;font-size:10px;color:#94a3b8;text-align:center}.custo-box{display:inline-block;background:#fef3c7;border:1px solid #d97706;border-radius:8px;padding:10px 20px;margin:16px 0;font-size:14px;font-weight:700;color:#92400e}</style></head><body><h1>📋 Equipamentos e Estruturas</h1><h2>${condNome} · Score: <span style="color:${scoreColor}">${scoreEquip}/100</span></h2><div class="custo-box">💰 Custo Total de Manutenção (por ciclo): ${fmtBRL(custoTotal)}</div><table><thead><tr><th>#</th><th>Nome</th><th>Categoria</th><th>Local</th><th>Status</th><th>Vida Útil</th><th>Próx. Manut.</th><th>Custo Manutenção</th><th>Fornecedor</th></tr></thead><tbody>${rows}<tr class="total-row"><td colspan="7" style="text-align:right;padding:8px 10px">Total custo manutenção:</td><td style="color:#b45309;padding:8px 10px">${fmtBRL(custoTotal)}</td><td></td></tr></tbody></table><div class="footer">ImobCore v2 — Plataforma de Gestão Inteligente de Condomínios · ${now}</div></body></html>`;
                          const w = window.open("","_blank","width=1100,height=750");
                          if (w) { w.document.write(html); w.document.close(); w.print(); }
                        }}
                        style={{ display:"flex", alignItems:"center", gap:10, background:"linear-gradient(135deg,#312e81,#4338ca)", border:"1.5px solid #6366F1", borderRadius:12, padding:"13px 22px", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 16px rgba(99,102,241,.35)", letterSpacing:".01em", whiteSpace:"nowrap" as const }}
                      >
                        <span style={{ fontSize:20 }}>📄</span> Exportar PDF
                      </button>
                      <button
                        title="Cadastrar um novo equipamento ou estrutura no sistema"
                        onClick={()=>{ setEquipEditId(null); setEquipForm(EMPTY_EQ); setEquipShowEdit(true); }}
                        style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:"linear-gradient(135deg,#065f46,#059669)", border:"1.5px solid #10B981", borderRadius:12, padding:"13px 22px", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 16px rgba(16,185,129,.35)", letterSpacing:".01em" }}
                      >
                        <span style={{ fontSize:20 }}>➕</span> Novo Equipamento/Estrutura
                      </button>
                    </div>

                    {/* Filters */}
                    <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                      <input value={mantSearch} onChange={e=>setMantSearch(e.target.value)}
                        placeholder="🔍 Buscar equipamento..." style={{ flex:1, minWidth:180, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 12px", color:"#fff", fontSize:12 }} />
                      <select value={mantCatFilter} onChange={e=>setMantCatFilter(e.target.value)} style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", color:"#94A3B8", fontSize:12 }}>
                        <option value="todos">🗂️ Todas categorias</option>
                        {cats.filter(c=>c!=="todos").map(c => <option key={c} value={c}>{(EQUIP_CAT_ICONS[c]||"📦")} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                      </select>
                      <select value={mantStatusFilter} onChange={e=>setMantStatusFilter(e.target.value)} style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", color:"#94A3B8", fontSize:12 }}>
                        {["todos","operacional","atencao","manutencao","inativo"].map(s => <option key={s} value={s}>{s==="todos"?"Todos status":stLabel[s as keyof typeof stLabel]||s}</option>)}
                      </select>
                      <span style={{ fontSize:11, color:"#475569", alignSelf:"center" }}>{filtered.length} resultado{filtered.length!==1?"s":""}</span>
                    </div>

                    {/* Detail modal */}
                    {mantSelEquip && (
                      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setMantSelEquip(null)}>
                        <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:16, padding:28, width:500, maxHeight:"80vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                            <div style={{ fontSize:18, fontWeight:800 }}>{mantSelEquip.catIcon} {mantSelEquip.nome}</div>
                            <button onClick={()=>setMantSelEquip(null)} style={{ background:"none", border:"none", color:"#475569", fontSize:20, cursor:"pointer" }}>✕</button>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                            {[["Categoria", mantSelEquip.categoria],["Local", mantSelEquip.local],["Fabricante", mantSelEquip.fabricante],["Modelo", mantSelEquip.modelo],["Nº Série", mantSelEquip.serie],["Instalado em", mantSelEquip.dataInstalacao],["Vida útil", `${mantSelEquip.vidaUtilAnos} anos`],["Instalado há", `${mantSelEquip.instaladoHa} anos`],["Consumo", mantSelEquip.consumoKwh ? `${mantSelEquip.consumoKwh} kWh` : "—"],["Horas/dia", mantSelEquip.horasDia ? `${mantSelEquip.horasDia}h` : "—"],["Última manut.", mantSelEquip.ultimaManutencao],["Próxima manut.", mantSelEquip.proxManutencao]].map(([l,v]) => (
                              <div key={l} style={{ background:"rgba(255,255,255,.03)", borderRadius:8, padding:"8px 12px" }}>
                                <div style={{ fontSize:10, color:"#475569" }}>{l}</div>
                                <div style={{ fontSize:13, fontWeight:600, marginTop:2 }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ background:"rgba(255,255,255,.03)", borderRadius:8, padding:"10px 14px", marginBottom:12 }}>
                            <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>Descrição</div>
                            <div style={{ fontSize:13, lineHeight:1.6 }}>{mantSelEquip.descricao}</div>
                          </div>
                          <div style={{ marginBottom:12 }}>
                            <div style={{ fontSize:10, color:"#475569", marginBottom:6 }}>Vida Útil Consumida</div>
                            <div style={{ height:10, background:"rgba(255,255,255,.06)", borderRadius:5 }}>
                              <div style={{ width:`${vidaPct(mantSelEquip)}%`, height:"100%", background:vidaColor(vidaPct(mantSelEquip)), borderRadius:5, transition:"width .5s" }} />
                            </div>
                            <div style={{ fontSize:10, color:"#475569", marginTop:4 }}>{vidaPct(mantSelEquip)}% consumido · {mantSelEquip.vidaUtilAnos - mantSelEquip.instaladoHa} anos restantes</div>
                          </div>
                          <div style={{ fontSize:10, color:"#475569" }}>Custo manutenção/ciclo: <span style={{ color:"#F59E0B", fontWeight:700 }}>{fmtBRLFull(mantSelEquip.custoManutencao)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* Table */}
                    <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid rgba(255,255,255,.08)" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ background:"rgba(99,102,241,.12)", borderBottom:"2px solid rgba(99,102,241,.3)" }}>
                            {["#","Equipamento","Categoria","Local","Status","Vida Útil","Fabricante","Custo Manut.","Próx. Manut.","Ações"].map(h => (
                              <th key={h} style={{ padding:"11px 12px", textAlign:"left", color:"#C4B5FD", fontWeight:700, fontSize:11, whiteSpace:"nowrap", textTransform:"uppercase", letterSpacing:".05em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((e, i) => (
                            <tr key={e.id} style={{ borderBottom:"1px solid rgba(255,255,255,.05)", transition:"background .1s", background: i%2===0 ? "rgba(255,255,255,.01)" : "transparent" }}
                              onMouseEnter={ev=>(ev.currentTarget.style.background="rgba(99,102,241,.08)")}
                              onMouseLeave={ev=>(ev.currentTarget.style.background= i%2===0 ? "rgba(255,255,255,.01)" : "transparent")}>
                              <td style={{ padding:"12px 12px", color:"#64748B", fontWeight:600, fontSize:12 }}>{i+1}</td>
                              <td style={{ padding:"10px 12px" }}>
                                {(() => {
                                  const cc = EQUIP_CAT_COLORS[e.categoria] ?? EQUIP_CAT_COLORS["outros"];
                                  return (
                                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                                      <span style={{ fontSize:20, lineHeight:1, width:36, height:36, background:cc.bg, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`1.5px solid ${cc.border}`, boxShadow:`0 0 8px ${cc.border}` }}>{e.catIcon}</span>
                                      <div>
                                        <div style={{ fontWeight:700, color:"#E2E8F0", fontSize:13 }}>{e.nome}</div>
                                        {e.modelo && <div style={{ fontSize:10, color:"#64748B", marginTop:1 }}>{e.modelo}</div>}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td style={{ padding:"12px 12px" }}>
                                {(() => { const cc = EQUIP_CAT_COLORS[e.categoria] ?? EQUIP_CAT_COLORS["outros"]; return <span style={{ background:cc.bg, color:cc.text, border:`1px solid ${cc.border}`, borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700, whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:4 }}>{EQUIP_CAT_ICONS[e.categoria]||"📦"} {EQUIP_CAT_LABELS[e.categoria]||e.categoria}</span>; })()}
                              </td>
                              <td style={{ padding:"12px 12px", color:"#CBD5E1", maxWidth:130 }}>{e.local}</td>
                              <td style={{ padding:"12px 12px" }}>
                                <span style={{ background:stColor[e.status]+"33", color:stColor[e.status], border:`1px solid ${stColor[e.status]}66`, borderRadius:20, padding:"4px 10px", fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>
                                  {e.status === "operacional" ? "✅" : e.status === "atencao" ? "⚠️" : e.status === "manutencao" ? "🔧" : "⬛"} {stLabel[e.status]}
                                </span>
                              </td>
                              <td style={{ padding:"12px 12px", minWidth:110 }}>
                                <div style={{ height:8, background:"rgba(255,255,255,.08)", borderRadius:4, marginBottom:4 }}>
                                  <div style={{ width:`${vidaPct(e)}%`, height:"100%", background:vidaColor(vidaPct(e)), borderRadius:4, boxShadow:`0 0 6px ${vidaColor(vidaPct(e))}66` }} />
                                </div>
                                <div style={{ fontSize:10, color:vidaColor(vidaPct(e)), fontWeight:700 }}>{vidaPct(e)}% utilizado</div>
                              </td>
                              <td style={{ padding:"12px 12px" }}>
                                {(() => {
                                  const fv = e.fornecedor_id ? fornecList.find(f=>f.id===e.fornecedor_id) : null;
                                  return fv ? (
                                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                      <span style={{ fontSize:14 }}>{fv.icone}</span>
                                      <div>
                                        <div style={{ fontSize:11, fontWeight:700, color:"#34D399" }}>{fv.nome}</div>
                                        <div style={{ fontSize:9, color:"#64748B" }}>{e.fabricante || fv.categoria}</div>
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ color:"#94A3B8", fontSize:12 }}>{e.fabricante || <span style={{ color:"#334155" }}>—</span>}</span>
                                  );
                                })()}
                              </td>
                              <td style={{ padding:"12px 12px", whiteSpace:"nowrap" }}>
                                <span style={{ background:"rgba(16,185,129,.12)", color:"#34D399", border:"1px solid rgba(16,185,129,.3)", borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700 }}>
                                  {e.custoManutencao > 0 ? `R$ ${e.custoManutencao.toLocaleString("pt-BR", { minimumFractionDigits:2 })}` : "—"}
                                </span>
                              </td>
                              <td style={{ padding:"12px 12px", color:"#CBD5E1", whiteSpace:"nowrap", fontWeight:600 }}>{e.proxManutencao}</td>
                              <td style={{ padding:"12px 10px" }}>
                                <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                                  <button title="Ver detalhes do equipamento" onClick={()=>setMantSelEquip(e)} style={{ background:"rgba(99,102,241,.22)", border:"1px solid rgba(99,102,241,.5)", borderRadius:7, padding:"5px 10px", color:"#C4B5FD", fontSize:11, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>👁 Ver</button>
                                  <button title="Editar equipamento" onClick={()=>equipEdit(e)} style={{ background:"rgba(59,130,246,.22)", border:"1px solid rgba(59,130,246,.5)", borderRadius:7, padding:"5px 10px", color:"#93C5FD", fontSize:11, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>✏️ Editar</button>
                                  <button title="Duplicar equipamento — cria novo cadastro com as mesmas configurações" onClick={()=>equipDuplicate(e)} style={{ background:"rgba(245,158,11,.2)", border:"1px solid rgba(245,158,11,.5)", borderRadius:7, padding:"5px 10px", color:"#FCD34D", fontSize:11, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>📋 Copiar</button>
                                  <button title="Excluir equipamento" onClick={()=>equipDelete(e.id)} style={{ background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.4)", borderRadius:7, padding:"5px 10px", color:"#FCA5A5", fontSize:11, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>🗑️</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {equipLoading && <div style={{ textAlign:"center", color:"#475569", padding:30, fontSize:13 }}>⏳ Carregando equipamentos...</div>}
                      {!equipLoading && filtered.length === 0 && <div style={{ textAlign:"center", color:"#334155", padding:30, fontSize:13 }}>Nenhum equipamento encontrado</div>}
                    </div>

                    {/* Edit / Add Modal */}
                    {equipShowEdit && (
                      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setEquipShowEdit(false)}>
                        <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:16, padding:28, width:560, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                            <div style={{ fontSize:16, fontWeight:800 }}>{equipEditId ? "✏️ Editar Equipamento" : "➕ Novo Equipamento"}</div>
                            <button title="Fechar" onClick={()=>setEquipShowEdit(false)} style={{ background:"none", border:"none", color:"#475569", fontSize:20, cursor:"pointer" }}>✕</button>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                            {([["Nome *","nome","text",""],["Local","local","text",""],["Fabricante","fabricante","text",""],["Modelo","modelo","text",""],["Nº Série","serie","text",""],["Data Instalação","dataInstalacao","date",""],["Vida Útil (anos)","vidaUtilAnos","number",""],["Instalado há (anos)","instaladoHa","number",""],["Quantidade (unid.)","quantidade","number",""],["Consumo kWh/h (unit.)","consumoKwh","number",""],["Horas/dia","horasDia","number",""],["Custo Manutenção R$ (unit.)","custoManutencao","number",""],["Próx. Manutenção","proxManutencao","date",""],["Última Manutenção","ultimaManutencao","date",""]] as [string,string,string,string][]).map(([label,key,type]) => (
                              <div key={key}>
                                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>{label}</div>
                                <input type={type} min={type==="number"?"0":undefined} value={String(equipForm[key as keyof typeof equipForm]||"")} onChange={e=>setEquipForm(f=>({...f,[key]:type==="number"?Number(e.target.value):e.target.value}))} style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#fff", fontSize:12, boxSizing:"border-box" as const }} />
                              </div>
                            ))}
                            <div>
                              <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Categoria</div>
                              <select value={equipForm.categoria} onChange={e=>setEquipForm(f=>({...f,categoria:e.target.value,catIcon:EQUIP_CAT_ICONS[e.target.value]||"📦"}))} style={{ width:"100%", background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#fff", fontSize:12, boxSizing:"border-box" as const }}>
                                {EQUIP_CATS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Status</div>
                              <select value={equipForm.status} onChange={e=>setEquipForm(f=>({...f,status:e.target.value as "operacional"|"atencao"|"manutencao"|"inativo"}))} style={{ width:"100%", background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#fff", fontSize:12, boxSizing:"border-box" as const }}>
                                <option value="operacional">Operacional</option>
                                <option value="atencao">Atenção</option>
                                <option value="manutencao">Em Manutenção</option>
                                <option value="inativo">Inativo</option>
                              </select>
                            </div>
                          </div>
                          {/* ── Totais calculados ─────────────────────────── */}
                          {(equipForm.quantidade > 1) && (
                            <div style={{ marginTop:12, background:"rgba(99,102,241,.08)", border:"1px solid rgba(99,102,241,.25)", borderRadius:10, padding:"12px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                              <div style={{ textAlign:"center" }}>
                                <div style={{ fontSize:10, color:"#94A3B8", marginBottom:3 }}>Qtd. Cadastrada</div>
                                <div style={{ fontSize:20, fontWeight:800, color:"#A5B4FC" }}>{equipForm.quantidade}</div>
                                <div style={{ fontSize:10, color:"#64748B" }}>unidades</div>
                              </div>
                              <div style={{ textAlign:"center" }}>
                                <div style={{ fontSize:10, color:"#94A3B8", marginBottom:3 }}>Consumo Total</div>
                                <div style={{ fontSize:20, fontWeight:800, color:"#06B6D4" }}>{(equipForm.consumoKwh * equipForm.quantidade).toFixed(2)}</div>
                                <div style={{ fontSize:10, color:"#64748B" }}>kWh/h ({equipForm.consumoKwh} × {equipForm.quantidade})</div>
                              </div>
                              <div style={{ textAlign:"center" }}>
                                <div style={{ fontSize:10, color:"#94A3B8", marginBottom:3 }}>Custo Total Manutenção</div>
                                <div style={{ fontSize:20, fontWeight:800, color:"#F59E0B" }}>R$ {(equipForm.custoManutencao * equipForm.quantidade).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                                <div style={{ fontSize:10, color:"#64748B" }}>R$ {equipForm.custoManutencao} × {equipForm.quantidade}</div>
                              </div>
                            </div>
                          )}
                          {/* Fornecedor vinculado */}
                          <div style={{ marginTop:12 }}>
                            <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>🏢 Fornecedor Vinculado</div>
                            <select value={equipForm.fornecedor_id} onChange={e=>setEquipForm(f=>({...f,fornecedor_id:e.target.value}))} style={{ width:"100%", background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color: equipForm.fornecedor_id ? "#fff" : "#64748B", fontSize:12, boxSizing:"border-box" as const }}>
                              <option value="">— Nenhum fornecedor vinculado —</option>
                              {fornecList.map(f => (
                                <option key={f.id} value={f.id}>{f.icone} {f.nome} · {f.categoria}</option>
                              ))}
                            </select>
                            {fornecList.length === 0 && (
                              <div style={{ fontSize:10, color:"#64748B", marginTop:4 }}>Cadastre fornecedores no módulo Fornecedores para vincular aqui.</div>
                            )}
                            {equipForm.fornecedor_id && (() => {
                              const fv = fornecList.find(f=>f.id===equipForm.fornecedor_id);
                              return fv ? (
                                <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8, background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.25)", borderRadius:8, padding:"8px 12px" }}>
                                  <span style={{ fontSize:18 }}>{fv.icone}</span>
                                  <div>
                                    <div style={{ fontSize:12, fontWeight:700, color:"#34D399" }}>{fv.nome}</div>
                                    <div style={{ fontSize:10, color:"#64748B" }}>{fv.telefone || fv.email || fv.categoria}</div>
                                  </div>
                                  <a href={`tel:${fv.telefone}`} style={{ marginLeft:"auto", color:"#34D399", fontSize:11, textDecoration:"none" }}>{fv.telefone}</a>
                                </div>
                              ) : null;
                            })()}
                          </div>

                          <div style={{ marginTop:12 }}>
                            <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Descrição</div>
                            <textarea value={equipForm.descricao} onChange={e=>setEquipForm(f=>({...f,descricao:e.target.value}))} rows={3} style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#fff", fontSize:12, boxSizing:"border-box" as const, resize:"vertical" as const }} />
                          </div>
                          <div style={{ display:"flex", gap:10, marginTop:18 }}>
                            <button title="Salvar alterações do equipamento" disabled={equipSaving} onClick={equipSave} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"10px 24px", color:"#fff", fontSize:13, fontWeight:700, cursor:equipSaving?"not-allowed":"pointer", opacity:equipSaving?.7:1 }}>{equipSaving ? "⏳ Salvando..." : "💾 Salvar"}</button>
                            <button title="Cancelar sem salvar" onClick={()=>setEquipShowEdit(false)} style={{ background:"transparent", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"10px 18px", color:"#64748B", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                            {equipEditId && <button title="Excluir este equipamento permanentemente" onClick={()=>{ equipDelete(equipEditId); setEquipShowEdit(false); }} style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", borderRadius:8, padding:"10px 18px", color:"#F87171", fontSize:13, cursor:"pointer", marginLeft:"auto" }}>🗑️ Excluir</button>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ABA 2: MAPA ─────────────────────────────────────── */}
                {mantTab === "mapa" && (
                  <div>
                    <div style={{ fontSize:12, color:"#475569", marginBottom:14 }}>Clique em um pin para ver detalhes do equipamento</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 200px", gap:16 }}>
                      {/* SVG Floor Plan */}
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.08)", borderRadius:12, padding:12, position:"relative" }}>
                        <svg viewBox="0 0 500 340" style={{ width:"100%", maxHeight:380 }}>
                          {/* Ground */}
                          <rect x="0" y="0" width="500" height="340" fill="#0F172A" rx="8" />
                          {/* Torre A */}
                          <rect x="30" y="60" width="180" height="220" fill="rgba(99,102,241,.06)" stroke="rgba(99,102,241,.3)" strokeWidth="1.5" rx="4"/>
                          <text x="120" y="185" textAnchor="middle" fill="#475569" fontSize="12" fontWeight="bold">TORRE A</text>
                          {/* Torre B */}
                          <rect x="290" y="60" width="180" height="220" fill="rgba(6,182,212,.06)" stroke="rgba(6,182,212,.3)" strokeWidth="1.5" rx="4"/>
                          <text x="380" y="185" textAnchor="middle" fill="#475569" fontSize="12" fontWeight="bold">TORRE B</text>
                          {/* Área Central */}
                          <rect x="195" y="100" width="110" height="180" fill="rgba(16,185,129,.04)" stroke="rgba(16,185,129,.2)" strokeWidth="1" rx="4"/>
                          <text x="250" y="200" textAnchor="middle" fill="#334155" fontSize="9">ÁREA COMUM</text>
                          {/* Piscina */}
                          <ellipse cx="250" cy="270" rx="50" ry="30" fill="rgba(6,182,212,.1)" stroke="rgba(6,182,212,.4)" strokeWidth="1"/>
                          <text x="250" y="275" textAnchor="middle" fill="#475569" fontSize="9">PISCINA</text>
                          {/* Garagem */}
                          <rect x="30" y="290" width="440" height="40" fill="rgba(255,255,255,.02)" stroke="rgba(255,255,255,.06)" strokeWidth="1" rx="4"/>
                          <text x="250" y="315" textAnchor="middle" fill="#334155" fontSize="9">GARAGEM / SUBSOLO</text>
                          {/* Cobertura linha */}
                          <line x1="30" y1="55" x2="470" y2="55" stroke="rgba(255,255,255,.06)" strokeWidth="1" strokeDasharray="4 3"/>
                          <text x="250" y="50" textAnchor="middle" fill="#334155" fontSize="8">COBERTURA</text>

                          {/* PINS */}
                          {mapPins.map(pin => {
                            const eq = equipList.find(e => e.id === pin.id);
                            if (!eq) return null;
                            const col = stColor[eq.status] || "#475569";
                            const isHov = mantMapHover === pin.id;
                            return (
                              <g key={pin.id} style={{ cursor:"pointer" }} onClick={() => setMantSelEquip(eq)} onMouseEnter={()=>setMantMapHover(pin.id)} onMouseLeave={()=>setMantMapHover(null)}>
                                <circle cx={pin.x} cy={pin.y} r={isHov ? 14 : 10} fill={col+"33"} stroke={col} strokeWidth="2" style={{ transition:"all .15s" }}/>
                                <text x={pin.x} y={pin.y+4} textAnchor="middle" fill={col} fontSize="10">●</text>
                                {isHov && (
                                  <g>
                                    <rect x={pin.x-55} y={pin.y-52} width="110" height="46" fill="#0F172A" stroke={col} strokeWidth="1" rx="5"/>
                                    <text x={pin.x} y={pin.y-36} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">{eq.nome.slice(0,18)}</text>
                                    <text x={pin.x} y={pin.y-23} textAnchor="middle" fill={col} fontSize="8">{stLabel[eq.status] || eq.status}</text>
                                    <text x={pin.x} y={pin.y-12} textAnchor="middle" fill="#475569" fontSize="7">Manut: {eq.proxManutencao}</text>
                                  </g>
                                )}
                                <text x={pin.x} y={pin.y+23} textAnchor="middle" fill="#475569" fontSize="7">{pin.label}</text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      {/* Legenda + Contadores */}
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#94A3B8", marginBottom:4 }}>LEGENDA</div>
                        {(["operacional","atencao","manutencao","inativo"] as const).map(s => (
                          <div key={s} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                            <div style={{ width:12, height:12, borderRadius:"50%", background:stColor[s], flexShrink:0 }}/>
                            <span style={{ color:"#94A3B8" }}>{stLabel[s]}</span>
                            <span style={{ marginLeft:"auto", color:stColor[s], fontWeight:700 }}>
                              {equipList.filter(e=>e.status===s).length}
                            </span>
                          </div>
                        ))}
                        <div style={{ height:1, background:"rgba(255,255,255,.06)", margin:"8px 0" }}/>
                        <div style={{ fontSize:11, fontWeight:700, color:"#94A3B8", marginBottom:4 }}>POR ÁREA</div>
                        {equipList.length === 0
                          ? <div style={{ fontSize:10, color:"#334155" }}>Nenhum equipamento</div>
                          : Object.entries(equipList.reduce((acc, e) => {
                              const key = (e.local || "Sem localização").split(/[–,-]/)[0].trim().slice(0, 16);
                              acc[key] = (acc[key] || 0) + 1;
                              return acc;
                            }, {} as Record<string,number>)).slice(0, 6).map(([area, count]) => (
                              <div key={area} style={{ fontSize:11, display:"flex", justifyContent:"space-between", color:"#64748B" }}>
                                <span>{area}</span>
                                <span style={{ color:"#94A3B8" }}>{count}</span>
                              </div>
                            ))
                        }
                        <div style={{ height:1, background:"rgba(255,255,255,.06)", margin:"8px 0" }}/>
                        <div style={{ fontSize:10, color:"#475569" }}>Clique em qualquer pin para ver detalhes completos do equipamento.</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ABA 3: PLANO DE MANUTENÇÃO ────────────────────────── */}
                {mantTab === "plano" && (() => {
                    const planoCustoTotal = planoForm.equipamentos_itens.reduce((s,e)=>s+(Number(e.custo_previsto)||0),0);
                    const TIPOS_PLANO = ["preventiva","corretiva","preditiva","inspeção"];
                    const PERIODS = ["diário","semanal","quinzenal","mensal","bimestral","trimestral","semestral","anual"];
                    const tipoColor: Record<string,string> = { preventiva:"#10B981", corretiva:"#EF4444", preditiva:"#3B82F6", "inspeção":"#F59E0B" };
                    const tipoIcon: Record<string,string>  = { preventiva:"🛡️", corretiva:"🔧", preditiva:"🔮", "inspeção":"🔍" };
                    const periodIcon: Record<string,string> = { "diário":"🔄","semanal":"📆","quinzenal":"📆","mensal":"🗓️","bimestral":"🗓️","trimestral":"📊","semestral":"📅","anual":"🏆" };
                    const aresList = [...new Set(equipList.map(e=>e.local))].filter(Boolean);
                    return (
                    <div>
                      {/* Header */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                        <div>
                          <div style={{ fontSize:16, fontWeight:800, color:"#E2E8F0", display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:20 }}>📅</span> Planos de Manutenção
                          </div>
                          <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>Crie, edite e gerencie planos preventivos e corretivos</div>
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          {planoList.length > 0 && (
                            <button onClick={planoExportPDF}
                              style={{ background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.3)", borderRadius:10, padding:"8px 14px", color:"#FCA5A5", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              📄 Exportar PDF
                            </button>
                          )}
                          <button onClick={()=>{ setPlanoShowEdit(true); setPlanoEditId(null); setPlanoForm(emptyPlanoForm()); }}
                            style={{ background:"linear-gradient(135deg,#7C5CFC,#A78BFA)", border:"none", borderRadius:10, padding:"8px 18px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(124,92,252,.35)" }}>
                            ＋ Novo Plano
                          </button>
                        </div>
                      </div>

                      {/* Resumo orçamentário — cards coloridos com ícone grande */}
                      {planoList.length > 0 && (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                          {[
                            { label:"Total Planos", val:String(planoList.length), icon:"📋", color:"#A78BFA", bg:"rgba(167,139,250,.12)", border:"rgba(167,139,250,.25)" },
                            { label:"Orçamento", val:"R$ "+planoList.reduce((s,p)=>s+(Number(p.custo_total)||0),0).toLocaleString("pt-BR",{maximumFractionDigits:0}), icon:"💰", color:"#34D399", bg:"rgba(52,211,153,.1)", border:"rgba(52,211,153,.25)" },
                            { label:"Equip. Cobertos", val:String(new Set(planoList.flatMap(p=>(p.equipamentos_itens||[]).map(e=>e.equipId))).size), icon:"⚙️", color:"#FBBF24", bg:"rgba(251,191,36,.1)", border:"rgba(251,191,36,.25)" },
                            { label:"Próx. Execução", val:planoList.filter(p=>p.proxima_execucao).sort((a,b)=>a.proxima_execucao.localeCompare(b.proxima_execucao))[0]?.proxima_execucao?.slice(5)||"—", icon:"📅", color:"#38BDF8", bg:"rgba(56,189,248,.1)", border:"rgba(56,189,248,.25)" },
                          ].map(k=>(
                            <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.border}`, borderRadius:12, padding:"14px 14px 12px", display:"flex", flexDirection:"column" as const, gap:4 }}>
                              <div style={{ fontSize:22 }}>{k.icon}</div>
                              <div style={{ fontSize:18, fontWeight:800, color:k.color, lineHeight:1.1 }}>{k.val}</div>
                              <div style={{ fontSize:10, color:"#64748B", fontWeight:600, textTransform:"uppercase" as const, letterSpacing:".04em" }}>{k.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Lista de planos */}
                      {planoLoading && <div style={{ color:"#475569", fontSize:12, textAlign:"center", padding:20 }}>Carregando planos...</div>}
                      {!planoLoading && planoList.length === 0 && !planoShowEdit && (
                        <div style={{ background:"rgba(255,255,255,.02)", border:"1px dashed rgba(255,255,255,.1)", borderRadius:12, padding:40, textAlign:"center" }}>
                          <div style={{ fontSize:42, marginBottom:10 }}>📋</div>
                          <div style={{ color:"#64748B", fontSize:14, fontWeight:600 }}>Nenhum plano de manutenção criado ainda</div>
                          <div style={{ color:"#334155", fontSize:12, marginTop:4 }}>Clique em "＋ Novo Plano" para começar</div>
                        </div>
                      )}

                      {!planoShowEdit && planoList.map((p, idx) => {
                        const tc  = tipoColor[p.tipo] || "#94A3B8";
                        const tic = tipoIcon[p.tipo]  || "📋";
                        const pic = periodIcon[p.periodicidade] || "🗓️";
                        const itvens: PlanoEquipItem[] = Array.isArray(p.equipamentos_itens) ? p.equipamentos_itens : [];
                        return (
                          <div key={p.id} style={{ background:"rgba(255,255,255,.025)", border:`1px solid ${tc}33`, borderLeft:`4px solid ${tc}`, borderRadius:12, padding:"16px 18px", marginBottom:12, position:"relative" as const }}>
                            {/* Topo: ícone tipo + info + ações */}
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                                {/* Ícone grande do tipo */}
                                <div style={{ width:44, height:44, borderRadius:10, background:`${tc}22`, border:`1px solid ${tc}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
                                  {tic}
                                </div>
                                <div>
                                  <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" as const }}>
                                    {p.codigo && (
                                      <span style={{ fontSize:10, color:"#64748B", background:"rgba(255,255,255,.07)", borderRadius:4, padding:"2px 7px", fontWeight:700, letterSpacing:".03em" }}>{p.codigo}</span>
                                    )}
                                    <span style={{ fontSize:15, fontWeight:800, color:"#F1F5F9" }}>{p.nome}</span>
                                  </div>
                                  <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" as const }}>
                                    {/* Badge tipo */}
                                    <span style={{ background:`${tc}25`, color:tc, fontSize:11, borderRadius:20, padding:"3px 10px", fontWeight:700, border:`1px solid ${tc}55`, display:"flex", alignItems:"center", gap:4 }}>
                                      {tic} {p.tipo}
                                    </span>
                                    {/* Badge periodicidade */}
                                    <span style={{ background:"rgba(148,163,184,.1)", color:"#94A3B8", fontSize:11, borderRadius:20, padding:"3px 10px", fontWeight:600, border:"1px solid rgba(148,163,184,.2)", display:"flex", alignItems:"center", gap:4 }}>
                                      {pic} {p.periodicidade}
                                    </span>
                                  </div>
                                  {p.instrucoes && <div style={{ fontSize:11, color:"#64748B", marginTop:6, maxWidth:420, lineHeight:1.5 }}>{p.instrucoes}</div>}
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                                <button onClick={()=>{ setPlanoEditId(p.id); setPlanoForm({ codigo:p.codigo||"", nome:p.nome, tipo:p.tipo, periodicidade:p.periodicidade, equipamentos_itens:itvens, custo_total:p.custo_total, tempo_estimado_min:p.tempo_estimado_min, proxima_execucao:p.proxima_execucao||"", instrucoes:p.instrucoes||"", status:p.status }); setPlanoShowEdit(true); }}
                                  style={{ background:"rgba(99,102,241,.18)", border:"1px solid rgba(99,102,241,.35)", borderRadius:8, padding:"6px 12px", color:"#A5B4FC", fontSize:12, cursor:"pointer", fontWeight:700 }}>✏️ Editar</button>
                                <button onClick={()=>{ if(confirm(`Excluir plano "${p.nome}"?`)) planoDelete(p.id); }}
                                  style={{ background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.25)", borderRadius:8, padding:"6px 10px", color:"#F87171", fontSize:12, cursor:"pointer" }}>🗑️</button>
                              </div>
                            </div>

                            {/* Equipamentos do plano */}
                            {itvens.length > 0 && (
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, marginBottom:10 }}>
                                {itvens.map(it=>(
                                  <div key={it.equipId} style={{ background:`${tc}12`, border:`1px solid ${tc}30`, borderRadius:8, padding:"4px 10px", fontSize:11, display:"flex", alignItems:"center", gap:6 }}>
                                    <span style={{ color:tc, fontSize:13 }}>⚙️</span>
                                    <span style={{ color:"#CBD5E1", fontWeight:600 }}>{it.equipNome}</span>
                                    {it.custo_previsto > 0 && (
                                      <span style={{ color:"#FBBF24", fontWeight:700, marginLeft:2 }}>R${Number(it.custo_previsto).toLocaleString("pt-BR",{maximumFractionDigits:0})}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Rodapé plano */}
                            <div style={{ display:"flex", gap:16, fontSize:12, color:"#475569", borderTop:`1px solid ${tc}22`, paddingTop:10, alignItems:"center" }}>
                              {p.proxima_execucao && (
                                <span style={{ display:"flex", alignItems:"center", gap:5, color:"#94A3B8" }}>
                                  📅 Próxima: <strong style={{ color:"#E2E8F0" }}>{p.proxima_execucao}</strong>
                                </span>
                              )}
                              {p.tempo_estimado_min > 0 && (
                                <span style={{ display:"flex", alignItems:"center", gap:4, color:"#94A3B8" }}>
                                  ⏱️ {p.tempo_estimado_min} min
                                </span>
                              )}
                              <span style={{ marginLeft:"auto", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.25)", borderRadius:8, padding:"4px 12px", color:"#34D399", fontWeight:800, fontSize:14 }}>
                                {Number(p.custo_total||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {/* ── Formulário criar/editar ──────────────────────── */}
                      {planoShowEdit && (
                        <div style={{ background:"rgba(255,255,255,.025)", border:"1px solid rgba(99,102,241,.2)", borderRadius:14, padding:"20px 20px 24px" }}>
                          <div style={{ fontSize:15, fontWeight:800, color:"#E2E8F0", marginBottom:2 }}>
                            {planoEditId ? "✏️ Editar Plano" : "➕ Criar Plano"}
                          </div>
                          <div style={{ fontSize:11, color:"#475569", marginBottom:18 }}>
                            {planoEditId ? "Atualize os dados do plano de manutenção" : "Criar plano preventivo"}
                          </div>

                          {/* Linha 1: Código + Nome */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12, marginBottom:12 }}>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>CÓDIGO</div>
                              <input value={planoForm.codigo} onChange={e=>setPlanoForm(f=>({...f,codigo:e.target.value}))}
                                placeholder="Ex: PM-001"
                                style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                            </div>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>NOME *</div>
                              <input value={planoForm.nome} onChange={e=>setPlanoForm(f=>({...f,nome:e.target.value}))}
                                placeholder="Ex: Manutenção preventiva bombas"
                                style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                            </div>
                          </div>

                          {/* Linha 2: Tipo + Periodicidade */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>TIPO</div>
                              <select value={planoForm.tipo} onChange={e=>setPlanoForm(f=>({...f,tipo:e.target.value}))}
                                style={{ width:"100%", background:"#1E2132", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13 }}>
                                {TIPOS_PLANO.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>PERIODICIDADE</div>
                              <select value={planoForm.periodicidade} onChange={e=>setPlanoForm(f=>({...f,periodicidade:e.target.value}))}
                                style={{ width:"100%", background:"#1E2132", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13 }}>
                                {PERIODS.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Equipamentos */}
                          <div style={{ marginBottom:14 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:8 }}>EQUIPAMENTOS</div>
                            {equipList.length === 0 && (
                              <div style={{ color:"#334155", fontSize:11 }}>Nenhum equipamento cadastrado. Vá para a aba Equipamentos.</div>
                            )}
                            <div style={{ maxHeight:220, overflowY:"auto", background:"rgba(0,0,0,.15)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, padding:"6px 10px" }}>
                              {equipList.map(eq=>{
                                const sel = planoForm.equipamentos_itens.find(e=>e.equipId===eq.id);
                                return (
                                  <div key={eq.id} style={{ borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 2px" }}>
                                      <input type="checkbox" checked={!!sel} onChange={()=>planoToggleEquip({id:eq.id,nome:eq.nome})}
                                        style={{ accentColor:"#7C5CFC", width:15, height:15, cursor:"pointer", flexShrink:0 }}/>
                                      <span style={{ fontSize:12, color:sel?"#E2E8F0":"#64748B", fontWeight:sel?600:400 }}>
                                        {eq.catIcon} {eq.nome}
                                      </span>
                                      <span style={{ fontSize:10, color:"#334155", marginLeft:"auto" }}>{eq.local}</span>
                                    </div>
                                    {sel && (
                                      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 26px 8px", background:"rgba(124,92,252,.06)", borderRadius:6, marginBottom:4 }}>
                                        <span style={{ fontSize:11, color:"#64748B" }}>Custo previsto (R$):</span>
                                        <input type="number" min="0" step="0.01"
                                          value={sel.custo_previsto||""}
                                          onChange={e=>planoSetEquipCusto(eq.id, Number(e.target.value))}
                                          placeholder="0,00"
                                          style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(99,102,241,.25)", borderRadius:6, padding:"5px 8px", color:"#F59E0B", fontSize:12, width:120, fontWeight:600 }}/>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Áreas */}
                          {aresList.length > 0 && (
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:8 }}>ÁREAS COBERTAS</div>
                              <div style={{ background:"rgba(0,0,0,.1)", border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:"8px 10px" }}>
                                <div style={{ fontSize:11, color:"#475569" }}>
                                  {planoForm.equipamentos_itens.length > 0
                                    ? [...new Set(planoForm.equipamentos_itens.map(ei=>equipList.find(e=>e.id===ei.equipId)?.local||"").filter(Boolean))].map(area=>(
                                      <span key={area} style={{ display:"inline-block", background:"rgba(124,92,252,.15)", color:"#A5B4FC", borderRadius:6, padding:"2px 10px", fontSize:11, marginRight:6, marginBottom:4, border:"1px solid rgba(124,92,252,.2)" }}>{area}</span>
                                    ))
                                    : <span style={{ color:"#334155" }}>Selecione equipamentos para ver as áreas</span>
                                  }
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tempo + Previsão orçamentária */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>TEMPO ESTIMADO (MIN)</div>
                              <input type="number" min="0" value={planoForm.tempo_estimado_min||""}
                                onChange={e=>setPlanoForm(f=>({...f,tempo_estimado_min:Number(e.target.value)}))}
                                style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                            </div>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>CUSTO ESTIMADO (R$)</div>
                              <div style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.2)", borderRadius:8, padding:"8px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                <span style={{ color:"#10B981", fontWeight:800, fontSize:16 }}>
                                  {planoCustoTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                                </span>
                                <span style={{ fontSize:10, color:"#059669" }}>auto-calculado</span>
                              </div>
                              {planoForm.equipamentos_itens.filter(e=>e.custo_previsto>0).length > 0 && (
                                <div style={{ fontSize:10, color:"#334155", marginTop:4 }}>
                                  {planoForm.equipamentos_itens.filter(e=>e.custo_previsto>0).length} equip. × valores definidos
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Próxima execução */}
                          <div style={{ marginBottom:14 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>PRÓXIMA EXECUÇÃO</div>
                            <input type="date" value={planoForm.proxima_execucao}
                              onChange={e=>setPlanoForm(f=>({...f,proxima_execucao:e.target.value}))}
                              style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13, colorScheme:"dark" }}/>
                          </div>

                          {/* Instruções gerais */}
                          <div style={{ marginBottom:20 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginBottom:5 }}>INSTRUÇÕES GERAIS</div>
                            <textarea value={planoForm.instrucoes}
                              onChange={e=>setPlanoForm(f=>({...f,instrucoes:e.target.value}))}
                              rows={3} placeholder="Procedimentos, EPIs necessários, observações..."
                              style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 10px", color:"#E2E8F0", fontSize:13, resize:"vertical", boxSizing:"border-box" }}/>
                          </div>

                          {/* Previsão orçamentária detalhada */}
                          {planoForm.equipamentos_itens.length > 0 && (
                            <div style={{ background:"rgba(16,185,129,.05)", border:"1px solid rgba(16,185,129,.15)", borderRadius:10, padding:"12px 14px", marginBottom:18 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:"#10B981", marginBottom:8 }}>💰 PREVISÃO ORÇAMENTÁRIA</div>
                              {planoForm.equipamentos_itens.map(it=>(
                                <div key={it.equipId} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                                  <span style={{ color:"#94A3B8" }}>{it.equipNome}</span>
                                  <span style={{ color: it.custo_previsto>0?"#F59E0B":"#334155", fontWeight:it.custo_previsto>0?600:400 }}>
                                    {it.custo_previsto>0 ? it.custo_previsto.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—"}
                                  </span>
                                </div>
                              ))}
                              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontWeight:800, fontSize:14 }}>
                                <span style={{ color:"#E2E8F0" }}>TOTAL</span>
                                <span style={{ color:"#10B981" }}>{planoCustoTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span>
                              </div>
                            </div>
                          )}

                          {/* Botões */}
                          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                            <button onClick={()=>{ setPlanoShowEdit(false); setPlanoEditId(null); setPlanoForm(emptyPlanoForm()); }}
                              style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:9, padding:"9px 18px", color:"#94A3B8", fontSize:13, cursor:"pointer" }}>
                              Cancelar
                            </button>
                            <button onClick={planoSave} disabled={planoSaving||!planoForm.nome.trim()}
                              style={{ background: planoSaving||!planoForm.nome.trim() ? "#334155" : "linear-gradient(135deg,#7C5CFC,#A78BFA)", border:"none", borderRadius:9, padding:"9px 20px", color:"#fff", fontSize:13, fontWeight:700, cursor: planoSaving||!planoForm.nome.trim() ? "not-allowed":"pointer" }}>
                              {planoSaving ? "Salvando..." : planoEditId ? "💾 Salvar Alterações" : "✅ Criar Plano"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })()}
                {/* ── ABA 5: QR CODES ───────────────────────────────────── */}
                {mantTab === "qr" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <div style={{ fontSize:12, color:"#475569" }}>Escaneie o QR com o celular para identificar o equipamento in-loco.</div>
                      <button onClick={()=>window.print()} style={{ background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", borderRadius:8, padding:"7px 14px", color:"#A5B4FC", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                        🖨️ Imprimir todos
                      </button>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px,1fr))", gap:12 }}>
                      {equipList.map(eq => (
                        <div key={eq.id} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:14, display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                          {qrUrls[eq.id]
                            ? <img src={qrUrls[eq.id]} alt={eq.nome} style={{ width:130, height:130, borderRadius:8 }}/>
                            : <div style={{ width:130, height:130, background:"rgba(255,255,255,.04)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"#334155", fontSize:12 }}>Gerando...</div>
                          }
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontSize:11, fontWeight:700, lineHeight:1.3 }}>{eq.catIcon} {eq.nome}</div>
                            <div style={{ fontSize:9, color:"#475569", marginTop:2 }}>{eq.categoria}</div>
                            <div style={{ fontSize:9, color:"#334155", fontFamily:"monospace", marginTop:2 }}>{eq.serie}</div>
                            <div style={{ fontSize:9, color:"#334155", marginTop:2 }}>{eq.local}</div>
                          </div>
                          <span style={{ background:stColor[eq.status]+"22", color:stColor[eq.status], fontSize:9, borderRadius:10, padding:"2px 8px", border:`1px solid ${stColor[eq.status]}44` }}>{stLabel[eq.status]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ABA 6: DASHBOARD IA ───────────────────────────────── */}
                {mantTab === "ia" && (
                  <div>
                    {/* KPIs */}
                    <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
                      {[
                        { label:"Equipamentos", val:equipList.length, color:"#A5B4FC", icon:"🏗️" },
                        { label:"Operacionais", val:nOp, color:"#10B981", icon:"✅" },
                        { label:"Em Atenção/Manutenção", val:nAt+nMt, color:"#F59E0B", icon:"⚠️" },
                        { label:"Custo Anual Est.", val:fmtBRLFull(equipList.reduce((s,e)=>s+e.custoManutencao*2,0)), color:"#06B6D4", icon:"💰" },
                      ].map(k => (
                        <div key={k.label} style={{ flex:1, minWidth:160, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"12px 16px" }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>{k.icon} {k.label.toUpperCase()}</div>
                          <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Score saúde */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
                      <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"16px 20px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:10 }}>💚 SAÚDE DOS EQUIPAMENTOS</div>
                        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                          <div style={{ position:"relative", width:72, height:72 }}>
                            <svg viewBox="0 0 36 36" style={{ width:72, height:72, transform:"rotate(-90deg)" }}>
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="3"/>
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreEquipColor} strokeWidth="3" strokeDasharray={`${scoreEquip} ${100-scoreEquip}`} strokeLinecap="round"/>
                            </svg>
                            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <div style={{ fontSize:16, fontWeight:800, color:scoreEquipColor }}>{scoreEquip}</div>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize:20, fontWeight:800, color:scoreEquipColor }}>{scoreEquipLabel}</div>
                            <div style={{ fontSize:10, color:"#475569", marginTop:4, lineHeight:1.6 }}>
                              {nOp} operacionais · {nAt} atenção<br/>{nMt} manutenção · {nIn} inativos
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pizza por categoria */}
                      <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"16px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:6 }}>🍩 EQUIPAMENTOS POR CATEGORIA</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <PieChart>
                            <Pie data={pieDat} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="value">
                              {pieDat.map((_,i) => <Cell key={i} fill={PC[i%PC.length]}/>)}
                            </Pie>
                            <Tooltip formatter={(v:number,_:string,e:any)=>[`${v} equip. · ${fmtBRLFull(e.payload?.custo)}/ciclo`,e.payload?.name]} contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }}/>
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px" }}>
                          {pieDat.map((d,i)=>(
                            <div key={d.name} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10 }}>
                              <div style={{ width:8, height:8, borderRadius:2, background:PC[i%PC.length] }}/>
                              <span style={{ color:"#94A3B8" }}>{d.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Gráfico falhas mensais */}
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
                      <div style={{ fontSize:11, color:"#475569", marginBottom:10 }}>📉 FALHAS E CORRETIVAS – ÚLTIMOS 6 MESES</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={falhasData} margin={{ top:4, right:10, bottom:4, left:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)"/>
                          <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} allowDecimals={false} width={30}/>
                          <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }}/>
                          <Line type="monotone" dataKey="falhas" stroke="#EF4444" strokeWidth={2} dot={{ r:4, fill:"#EF4444" }} name="Falhas"/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Análise IA */}
                    <div style={{ background:"rgba(99,102,241,.04)", border:"1px solid rgba(99,102,241,.15)", borderRadius:12, padding:"16px 20px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#A5B4FC" }}>🤖 Diagnóstico IA – Síndico Virtual</div>
                        <button
                          disabled={mantAiLoading}
                          onClick={async () => {
                            setMantAiLoading(true);
                            setMantAiResult("");
                            const resumo = `Condomínio: Residencial Parque das Flores. Equipamentos: ${equipList.length} total, ${nOp} operacionais, ${nAt} em atenção, ${nMt} em manutenção, ${nIn} inativos. Score de saúde: ${scoreEquip}/100. Equipamentos críticos: ${equipList.filter(e=>e.status!=="operacional").map(e=>e.nome+" ("+e.status+": "+e.descricao+")").join("; ")}. Custo de manutenção anual estimado: R$ ${equipList.reduce((s,e)=>s+e.custoManutencao*2,0).toLocaleString("pt-BR")}. MTTR: 4.2 dias. MTBF: 38 dias. Disponibilidade: 89%.`;
                            try {
                              const r = await fetch("/api/sindico/chat", {
                                method:"POST",
                                headers:{"Content-Type":"application/json"},
                                body:JSON.stringify({ message:`Analise o estado dos equipamentos e manutenção do condomínio. ${resumo} Forneça: 1) diagnóstico dos equipamentos críticos 2) recomendações prioritárias 3) score de saúde explicado 4) previsão de riscos. Seja específico e técnico.`, history:[] })
                              });
                              const d = await r.json();
                              setMantAiResult(d.response || d.error || "Sem resposta");
                            } catch { setMantAiResult("Erro ao conectar com IA."); }
                            setMantAiLoading(false);
                          }}
                          style={{ background:"rgba(99,102,241,.2)", border:"1px solid rgba(99,102,241,.4)", borderRadius:8, padding:"8px 16px", color:"#A5B4FC", fontSize:12, cursor:mantAiLoading?"not-allowed":"pointer", fontWeight:600, opacity:mantAiLoading?0.6:1 }}>
                          {mantAiLoading ? "⏳ Analisando..." : "🔍 Analisar com IA"}
                        </button>
                      </div>
                      {mantAiResult && (
                        <div style={{ background:"rgba(255,255,255,.03)", borderRadius:10, padding:"14px 16px", fontSize:12, lineHeight:1.8, color:"#E2E8F0", whiteSpace:"pre-wrap" }}>
                          {mantAiResult}
                        </div>
                      )}
                      {!mantAiResult && !mantAiLoading && (
                        <div style={{ fontSize:12, color:"#334155" }}>Clique em "Analisar com IA" para receber um diagnóstico completo dos equipamentos com recomendações do Síndico Virtual.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PANEL: PISCINA */}
          {panel === "piscina" && (() => {
            const ideal = {
              ph:           { min:7.2, max:7.6, unit:"",     label:"pH" },
              cloro:        { min:1.0, max:3.0, unit:" ppm", label:"Cloro Livre" },
              temperatura:  { min:24,  max:30,  unit:"°C",   label:"Temperatura" },
              alcalinidade: { min:80,  max:120, unit:" ppm", label:"Alcalinidade" },
              dureza_calcica:{ min:200,max:400, unit:" ppm", label:"Dureza Cálcica" },
            } as const;
            type PKey = keyof typeof ideal;
            const isOk = (key: PKey, v?: number) => v === undefined || v === null ? true : v >= ideal[key].min && v <= ideal[key].max;
            const last = piscinaList[0];
            const allOk = last ? (isOk("ph",last.ph)&&isOk("cloro",last.cloro)&&isOk("temperatura",last.temperatura)&&isOk("alcalinidade",last.alcalinidade)&&isOk("dureza_calcica",last.dureza_calcica)) : null;
            const chartData = [...piscinaList].reverse().slice(-30).map(l => ({
              dt: new Date(l.created_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),
              ph: l.ph, cloro: l.cloro, temp: l.temperatura ?? null,
            }));
            const gauge = (value: number|undefined, min: number, max: number, col: string) => {
              const bg = `M 12 56 A 44 44 0 0 1 100 56`;
              if (value === undefined || value === null) return { bg, d: "", color:"#94A3B8" };
              const pct = Math.min(0.999, Math.max(0.001, (value-min)/(max-min)));
              const ang = (180+pct*180)*Math.PI/180;
              const ex = (56+44*Math.cos(ang)).toFixed(2), ey = (56+44*Math.sin(ang)).toFixed(2);
              return { bg, d:`M 12 56 A 44 44 0 0 1 ${ex} ${ey}`, color: (value>=min&&value<=max) ? col : "#EF4444" };
            };
            const piscSave = async () => {
              if (!condId||!piscForm.ph||!piscForm.cloro) { showToast("pH e Cloro são obrigatórios","warn"); return; }
              setPiscSaving(true);
              try {
                const url = piscEditId ? `/api/piscina/${piscEditId}` : `/api/piscina`;
                const r = await fetch(url, { method: piscEditId?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ condominio_id:condId, ph:Number(piscForm.ph), cloro:Number(piscForm.cloro), temperatura:piscForm.temperatura?Number(piscForm.temperatura):null, alcalinidade:piscForm.alcalinidade?Number(piscForm.alcalinidade):null, dureza_calcica:piscForm.dureza_calcica?Number(piscForm.dureza_calcica):null, observacoes:piscForm.observacoes||null }) });
                if (r.ok) { await loadPiscina(condId); setPiscModal(false); setPiscEditId(null); setPiscForm(emptyPiscinaForm()); showToast(piscEditId?"Leitura atualizada!":"Leitura registrada!","success"); }
                else { const d=await r.json(); showToast("Erro: "+(d.error||"desconhecido"),"error"); }
              } catch { showToast("Erro ao salvar","error"); }
              setPiscSaving(false);
            };
            const piscDelete = async (id: string) => {
              if (!confirm("Excluir esta leitura?")) return;
              await fetch(`/api/piscina/${id}`,{method:"DELETE"});
              if (condId) loadPiscina(condId);
              showToast("Leitura excluída","success");
            };
            const piscEdit = (l: PiscinaLeitura) => { setPiscEditId(l.id); setPiscForm({ ph:String(l.ph), cloro:String(l.cloro), temperatura:l.temperatura?String(l.temperatura):"", alcalinidade:l.alcalinidade?String(l.alcalinidade):"", dureza_calcica:l.dureza_calcica?String(l.dureza_calcica):"", observacoes:l.observacoes||"" }); setPiscModal(true); };
            const exportCSV = () => {
              const hdr = "Data,pH,Cloro (ppm),Temperatura (°C),Alcalinidade (ppm),Dureza Cálcica (ppm),Status,Observações";
              const rows = piscinaList.map(l=>[new Date(l.created_at).toLocaleString("pt-BR"),l.ph,l.cloro,l.temperatura??"",l.alcalinidade??"",l.dureza_calcica??"",l.status,l.observacoes??""]).map(r=>r.join(",")).join("\n");
              const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([hdr+"\n"+rows],{type:"text/csv"})); a.download="piscina_leituras.csv"; a.click();
            };
            const exportPDF = () => {
              const rows = piscinaList.map(l=>`<tr><td>${new Date(l.created_at).toLocaleString("pt-BR")}</td><td>${l.ph}</td><td>${l.cloro}</td><td>${l.temperatura??"—"}</td><td>${l.alcalinidade??"—"}</td><td>${l.dureza_calcica??"—"}</td><td style="color:${l.status==="ok"?"#16a34a":"#dc2626"}">${l.status.toUpperCase()}</td><td>${l.observacoes||"—"}</td></tr>`).join("");
              const html=`<html><head><title>Piscina</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{color:#0284c7}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0284c7;color:#fff;padding:8px 10px;text-align:left}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even){background:#f0f9ff}</style></head><body><h1>🏊 Piscina &amp; Qualidade da Água</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")}</p><table><thead><tr><th>Data/Hora</th><th>pH</th><th>Cloro</th><th>Temp</th><th>Alc.</th><th>Dur.</th><th>Status</th><th>Obs.</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
              const w=window.open("","_blank","width=900,height=600"); if(w){w.document.write(html);w.document.close();w.print();}
            };
            const colMap: Record<PKey,string> = { ph:"#0EA5E9", cloro:"#22C55E", temperatura:"#F97316", alcalinidade:"#6366F1", dureza_calcica:"#A855F7" };
            const paramCard = (key: PKey, value?: number) => {
              const cfg=ideal[key]; const ok=isOk(key,value); const col=colMap[key];
              return (
                <div key={key} style={{ background:`${col}12`, border:`1px solid ${col}30`, borderRadius:12, padding:"14px 16px", flex:1, minWidth:110 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:col, textTransform:"uppercase", letterSpacing:".5px" }}>{cfg.label}</span>
                    {value!==undefined&&value!==null ? <span style={{ fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:99, background:ok?"#22C55E22":"#EF444422", color:ok?"#16A34A":"#DC2626" }}>{ok?"OK":"ALERTA"}</span> : <span style={{ fontSize:10, color:"#94A3B8" }}>—</span>}
                  </div>
                  <div style={{ fontSize:24, fontWeight:700, color:"var(--c-text)", lineHeight:1.1 }}>
                    {value!==undefined&&value!==null ? `${value}${cfg.unit}` : <span style={{ color:"#94A3B8",fontSize:14 }}>Não medido</span>}
                  </div>
                  <div style={{ fontSize:10, color:"#94A3B8", marginTop:3 }}>Ideal: {cfg.min}–{cfg.max}{cfg.unit}</div>
                </div>
              );
            };
            const gPh=gauge(last?.ph,7.0,8.0,"#0EA5E9"), gCl=gauge(last?.cloro,0,5,"#22C55E"), gTp=gauge(last?.temperatura,18,36,"#F97316");
            return (
              <div style={{ padding:"24px 28px", height:"100%", overflowY:"auto" }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6, flexWrap:"wrap" }}>
                  <button onClick={()=>setPanel("sv-chat")} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18, padding:0 }}>←</button>
                  <div>
                    <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:"var(--c-text)" }}>🏊 Piscina & Qualidade da Água</h2>
                    <p style={{ margin:0, fontSize:13, color:"#64748B" }}>Monitoramento de pH, cloro e parâmetros da água</p>
                  </div>
                  <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    {last && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:99, fontWeight:700, background:allOk?"#22C55E22":"#EF444422", color:allOk?"#16A34A":"#DC2626", border:`1px solid ${allOk?"#22C55E55":"#EF444455"}` }}>{allOk?"✓ Água OK":"⚠ Atenção"}</span>}
                    {last && <span style={{ fontSize:12, color:"#64748B" }}>{new Date(last.created_at).toLocaleDateString("pt-BR")}</span>}
                    {piscinaList.length>0 && <button onClick={exportPDF} style={{ background:"#0284C7", color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, cursor:"pointer", fontWeight:600 }}>📄 PDF</button>}
                    <button onClick={()=>{setPiscModal(true);setPiscEditId(null);setPiscForm(emptyPiscinaForm());}} style={{ background:"#6366F1", color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, cursor:"pointer", fontWeight:600 }}>+ Nova Leitura</button>
                  </div>
                </div>

                {piscinaLoading && <div style={{ textAlign:"center", color:"#94A3B8", padding:40 }}>Carregando...</div>}
                {!piscinaLoading && (
                  <div style={{ display:"flex", gap:20, marginTop:16, alignItems:"flex-start" }}>
                    {/* Left */}
                    <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:16 }}>
                      <div style={{ background:"var(--c-card)", borderRadius:14, padding:20, border:"1px solid var(--c-border)" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                          <span style={{ fontWeight:700, color:"var(--c-text)", fontSize:15 }}>💧 Leitura Atual</span>
                          {last && <span style={{ fontSize:11, color:"#94A3B8" }}>{new Date(last.created_at).toLocaleString("pt-BR")}</span>}
                        </div>
                        {!last ? (
                          <div style={{ textAlign:"center", color:"#94A3B8", padding:28 }}>
                            <div style={{ fontSize:48, marginBottom:8 }}>🏊</div>
                            <div style={{ marginBottom:12 }}>Nenhuma leitura registrada ainda</div>
                            <button onClick={()=>{setPiscModal(true);setPiscEditId(null);setPiscForm(emptyPiscinaForm());}} style={{ background:"#6366F1", color:"#fff", border:"none", borderRadius:8, padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:600 }}>+ Registrar Primeira Leitura</button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                              {paramCard("ph",last.ph)}{paramCard("cloro",last.cloro)}{paramCard("temperatura",last.temperatura)}
                            </div>
                            <div style={{ display:"flex", gap:10 }}>
                              {paramCard("alcalinidade",last.alcalinidade)}{paramCard("dureza_calcica",last.dureza_calcica)}
                              {last.observacoes && <div style={{ flex:1, background:"rgba(99,102,241,.08)", border:"1px solid rgba(99,102,241,.2)", borderRadius:12, padding:"14px 16px" }}><div style={{ fontSize:10, fontWeight:700, color:"#6366F1", textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>Obs.</div><div style={{ fontSize:13, color:"var(--c-text)", lineHeight:1.4 }}>{last.observacoes}</div></div>}
                            </div>
                          </>
                        )}
                      </div>
                      {chartData.length>1 && (
                        <div style={{ background:"var(--c-card)", borderRadius:14, padding:20, border:"1px solid var(--c-border)" }}>
                          <div style={{ fontWeight:700, color:"var(--c-text)", fontSize:15, marginBottom:14 }}>📈 Histórico de Parâmetros</div>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={chartData} margin={{ top:4, right:10, bottom:4, left:-20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                              <XAxis dataKey="dt" tick={{ fontSize:11, fill:"#94A3B8" }} />
                              <YAxis tick={{ fontSize:11, fill:"#94A3B8" }} />
                              <Tooltip contentStyle={{ background:"var(--c-card)", border:"1px solid var(--c-border)", borderRadius:8, fontSize:12, color:"var(--c-text)" }} />
                              <Legend wrapperStyle={{ fontSize:12 }} />
                              <Line type="monotone" dataKey="ph" name="pH" stroke="#0EA5E9" strokeWidth={2} dot={false} activeDot={{r:4}} />
                              <Line type="monotone" dataKey="cloro" name="Cloro" stroke="#22C55E" strokeWidth={2} dot={false} activeDot={{r:4}} />
                              <Line type="monotone" dataKey="temp" name="Temp °C" stroke="#F97316" strokeWidth={2} dot={false} activeDot={{r:4}} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                    {/* Right */}
                    <div style={{ width:272, flexShrink:0, display:"flex", flexDirection:"column", gap:16 }}>
                      {last && (
                        <div style={{ background:"var(--c-card)", borderRadius:14, padding:20, border:"1px solid var(--c-border)" }}>
                          <div style={{ fontWeight:700, color:"var(--c-text)", fontSize:14, marginBottom:14 }}>⚙ Indicadores Visuais</div>
                          {[{g:gPh,label:"pH",value:last.ph,unit:"",key:"ph" as PKey},{g:gCl,label:"Cloro Livre",value:last.cloro,unit:" ppm",key:"cloro" as PKey},{g:gTp,label:"Temperatura",value:last.temperatura,unit:"°C",key:"temperatura" as PKey}].map(({g,label,value,unit,key})=>(
                            <div key={label} style={{ marginBottom:14 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                                <span style={{ fontSize:12, fontWeight:600, color:"var(--c-text-2)" }}>{label}</span>
                                <span style={{ fontSize:13, fontWeight:700, color:g.color }}>{value!==undefined&&value!==null?`${value}${unit}`:"—"}</span>
                              </div>
                              <svg viewBox="0 0 112 62" style={{ width:"100%", height:50, display:"block" }}>
                                <path d={g.bg} fill="none" stroke="var(--c-border)" strokeWidth="9" strokeLinecap="round"/>
                                {g.d && <path d={g.d} fill="none" stroke={g.color} strokeWidth="9" strokeLinecap="round"/>}
                              </svg>
                              <div style={{ fontSize:10, color:"#94A3B8", textAlign:"center", marginTop:-4 }}>Ideal: {ideal[key].min}–{ideal[key].max}{ideal[key].unit}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ background:"var(--c-card)", borderRadius:14, padding:20, border:"1px solid var(--c-border)" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                          <span style={{ fontWeight:700, color:"var(--c-text)", fontSize:14 }}>📋 Histórico</span>
                          {piscinaList.length>0 && <button onClick={exportCSV} style={{ fontSize:11, background:"none", border:"1px solid var(--c-border)", borderRadius:6, padding:"3px 9px", cursor:"pointer", color:"#64748B" }}>⬇ CSV</button>}
                        </div>
                        {piscinaList.length===0 ? <div style={{ textAlign:"center", color:"#94A3B8", fontSize:13, padding:"16px 0" }}>Sem leituras</div> : (
                          <div style={{ maxHeight:340, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
                            {piscinaList.map(l=>(
                              <div key={l.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", borderRadius:8, background:l.status==="alerta"?"rgba(239,68,68,.07)":"rgba(34,197,94,.07)", border:`1px solid ${l.status==="alerta"?"rgba(239,68,68,.2)":"rgba(34,197,94,.2)"}` }}>
                                <span style={{ fontSize:13 }}>{l.status==="ok"?"✅":"⚠️"}</span>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:12, fontWeight:600, color:"var(--c-text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>pH {l.ph} · Cl {l.cloro}{l.temperatura?` · ${l.temperatura}°C`:""}</div>
                                  <div style={{ fontSize:10, color:"#94A3B8" }}>{new Date(l.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
                                </div>
                                <button onClick={()=>piscEdit(l)} style={{ background:"none", border:"none", cursor:"pointer", color:"#6366F1", fontSize:14, padding:2 }} title="Editar">✏</button>
                                <button onClick={()=>piscDelete(l.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#EF4444", fontSize:14, padding:2 }} title="Excluir">🗑</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Modal */}
                {piscModal && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={e=>{if(e.target===e.currentTarget){setPiscModal(false);setPiscEditId(null);}}}>
                    <div style={{ background:"var(--c-card)", borderRadius:16, padding:28, width:460, maxWidth:"95vw", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
                      <h3 style={{ margin:"0 0 20px", color:"var(--c-text)", fontSize:17 }}>{piscEditId?"✏ Editar Leitura":"🏊 Nova Leitura de Piscina"}</h3>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                        {([{key:"ph",label:"pH *",placeholder:"7.4",step:"0.01"},{key:"cloro",label:"Cloro Livre (ppm) *",placeholder:"2.0",step:"0.1"},{key:"temperatura",label:"Temperatura (°C)",placeholder:"28",step:"0.1"},{key:"alcalinidade",label:"Alcalinidade (ppm)",placeholder:"100",step:"1"},{key:"dureza_calcica",label:"Dureza Cálcica (ppm)",placeholder:"300",step:"1"}] as const).map(({key,label,placeholder,step})=>(
                          <div key={key}>
                            <label style={{ fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase" }}>{label}</label>
                            <input type="number" step={step} placeholder={placeholder} value={(piscForm as Record<string,string>)[key]} onChange={e=>setPiscForm(p=>({...p,[key]:e.target.value}))} style={{ display:"block", width:"100%", marginTop:4, padding:"8px 10px", borderRadius:8, border:"1px solid var(--c-border)", background:"var(--c-bg)", color:"var(--c-text)", fontSize:14, boxSizing:"border-box" }} />
                          </div>
                        ))}
                        <div style={{ gridColumn:"1 / -1" }}>
                          <label style={{ fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase" }}>Observações</label>
                          <textarea placeholder="Observações opcionais..." value={piscForm.observacoes} onChange={e=>setPiscForm(p=>({...p,observacoes:e.target.value}))} rows={2} style={{ display:"block", width:"100%", marginTop:4, padding:"8px 10px", borderRadius:8, border:"1px solid var(--c-border)", background:"var(--c-bg)", color:"var(--c-text)", fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                        <button onClick={()=>{setPiscModal(false);setPiscEditId(null);}} style={{ padding:"8px 18px", borderRadius:8, border:"1px solid var(--c-border)", background:"none", color:"var(--c-text)", cursor:"pointer", fontSize:13 }}>Cancelar</button>
                        <button onClick={piscSave} disabled={piscSaving} style={{ padding:"8px 22px", borderRadius:8, border:"none", background:"#6366F1", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, opacity:piscSaving?.7:1 }}>
                          {piscSaving?"Salvando...":"Salvar Leitura"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PANEL: USUÁRIOS */}
          {panel === "usuarios" && (() => {
            const filtered = usuarios.filter(u => {
              const q = usuariosSearch.toLowerCase();
              const matchSearch = !q || u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.unidade||"").toLowerCase().includes(q);
              const matchPerfil = usuariosFiltroPerfl === "todos" || u.perfil === usuariosFiltroPerfl;
              const matchStatus = usuariosFiltroStatus === "todos" || u.status === usuariosFiltroStatus;
              return matchSearch && matchPerfil && matchStatus;
            });
            const perfilCounts = (["todos","gestor","sindico","morador","zelador"] as const).reduce((acc, p) => {
              acc[p] = p === "todos" ? usuarios.length : usuarios.filter(u => u.perfil === p).length;
              return acc;
            }, {} as Record<string, number>);
            const ALL_MOD_KEYS = ["chatIA","insights","comunicados","ordens","financeiro","agua","misp","diagnostico","crm","manutencao","energia","gas","encomendas","condominios","usuarios","sseLiveLog"];
            const buildPerms = (perfil: PerfilKey, existing?: Record<string,unknown>) => {
              const mods = new Set(PERFIS_CONFIG[perfil].modulos);
              return ALL_MOD_KEYS.reduce((acc,k) => {
                acc[k] = existing ? (existing[k] === true || (existing[k] === undefined && mods.has(k))) : mods.has(k);
                return acc;
              }, {} as Record<string,boolean>);
            };
            const openNew = () => {
              const perfil: PerfilKey = "morador";
              setUsuarioForm({ nome:"", email:"", telefone:"", perfil, unidade:"", status:"ativo" });
              setPermsCustom(buildPerms(perfil));
              setShowPermsPanel(false);
              setUsuarioEditId(null);
              setUsuarioModal("new");
            };
            const openEdit = (u: typeof usuarios[0]) => {
              setUsuarioForm({ nome:u.nome, email:u.email, telefone:u.telefone||"", perfil:u.perfil, unidade:u.unidade||"", status:u.status });
              setPermsCustom(buildPerms(u.perfil, u.permissoes_customizadas as Record<string,unknown>|undefined));
              setShowPermsPanel(false);
              setUsuarioEditId(u.id);
              setUsuarioModal("edit");
            };
            const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "–";

            return (
              <div className="panel active card">
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap" as const, gap:8 }}>
                  <div>
                    <div className="card-title" style={{ marginBottom:6 }}>👥 Usuários</div>
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:10, alignItems:"center" }}>
                      {(["gestor","sindico","morador","zelador"] as const).map(p => {
                        const cfg = PERFIS_CONFIG[p];
                        const n = usuarios.filter(u => u.perfil === p).length;
                        return n > 0 ? (
                          <span key={p} style={{ fontSize:11, fontWeight:600, color: cfg.cor }}>
                            {cfg.icon} {cfg.label}s: <strong>{n}</strong>
                          </span>
                        ) : null;
                      })}
                      <span style={{ fontSize:11, color:"#334155", marginLeft:4 }}>
                        · {usuarios.filter(u=>u.status==="ativo").length} ativo{usuarios.filter(u=>u.status==="ativo").length !== 1?"s":""}
                        {usuarios.filter(u=>u.status==="inativo").length > 0 && ` · ${usuarios.filter(u=>u.status==="inativo").length} inativo${usuarios.filter(u=>u.status==="inativo").length !== 1?"s":""}`}
                      </span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <button title="Recarregar lista" onClick={loadUsuarios} style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", color:"#64748B", fontSize:13, cursor:"pointer" }}>↻</button>
                    <button title="Novo usuário" onClick={openNew} style={{ background:"rgba(37,99,235,.2)", border:"1px solid rgba(37,99,235,.35)", borderRadius:8, padding:"8px 16px", color:"#93C5FD", fontSize:12, fontWeight:700, cursor:"pointer" }}>＋ Novo</button>
                  </div>
                </div>

                {/* Sub-tab bar: Lista | Permissões */}
                <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:"1px solid rgba(255,255,255,.08)", paddingBottom:12 }}>
                  {([{key:"lista",label:"📋 Lista"},{key:"permissoes",label:"🔐 Permissões"}] as const).map(({key,label}) => (
                    <button key={key} onClick={()=>setUsuariosSubtab(key)} style={{ padding:"6px 18px", borderRadius:20, fontSize:12, fontWeight:usuariosSubtab===key?700:500, cursor:"pointer", border:usuariosSubtab===key?"1px solid rgba(124,92,252,.5)":"1px solid rgba(255,255,255,.08)", background:usuariosSubtab===key?"rgba(124,92,252,.15)":"rgba(255,255,255,.03)", color:usuariosSubtab===key?"#A78BFA":"#64748B", transition:"all .15s" }}>{label}</button>
                  ))}
                </div>

                {/* ── ABA LISTA ── */}
                {usuariosSubtab === "lista" && <>

                {/* Filtro por perfil — abas */}
                <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" as const }}>
                  {(["todos","gestor","sindico","morador","zelador"] as const).map(p => {
                    const cfg = p !== "todos" ? PERFIS_CONFIG[p] : null;
                    const active = usuariosFiltroPerfl === p;
                    return (
                      <button key={p} onClick={() => setUsuariosFiltroPerfl(p)} style={{ padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:active?700:500, cursor:"pointer", border: active ? `1px solid ${cfg?.cor||"#7C5CFC"}66` : "1px solid rgba(255,255,255,.08)", background: active ? (cfg?.cor||"#7C5CFC")+"22" : "rgba(255,255,255,.03)", color: active ? (cfg?.cor||"#A5B4FC") : "#64748B", transition:"all .15s" }}>
                        {cfg ? `${cfg.icon} ${cfg.label}` : "Todos"} <span style={{ opacity:.7 }}>({perfilCounts[p]})</span>
                      </button>
                    );
                  })}
                  <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                    {(["todos","ativo","inativo"] as const).map(s => (
                      <button key={s} onClick={() => setUsuariosFiltroStatus(s)} style={{ padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight: usuariosFiltroStatus===s?700:500, cursor:"pointer", border: usuariosFiltroStatus===s ? "1px solid rgba(255,255,255,.2)" : "1px solid rgba(255,255,255,.06)", background: usuariosFiltroStatus===s ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.02)", color: usuariosFiltroStatus===s ? "#E2E8F0" : "#475569" }}>
                        {s === "todos" ? "Todos status" : s === "ativo" ? "🟢 Ativos" : "🔴 Inativos"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search */}
                <div style={{ position:"relative" as const, marginBottom:16 }}>
                  <input value={usuariosSearch} onChange={e => setUsuariosSearch(e.target.value)} placeholder="🔍  Buscar por nome, email ou unidade…" style={{ width:"100%", boxSizing:"border-box" as const, padding:"9px 14px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:8, color:"var(--c-text)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                  {usuariosSearch && <button onClick={()=>setUsuariosSearch("")} style={{ position:"absolute" as const, right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#64748B", cursor:"pointer", fontSize:14 }}>×</button>}
                </div>

                {/* Loading */}
                {usuariosLoading && <div style={{ textAlign:"center" as const, padding:40, color:"#475569" }}>Carregando usuários…</div>}

                {/* Empty */}
                {!usuariosLoading && filtered.length === 0 && (
                  <div style={{ textAlign:"center" as const, padding:50, color:"#475569" }}>
                    <div style={{ fontSize:36, marginBottom:12 }}>👥</div>
                    <div style={{ fontWeight:600, marginBottom:4 }}>{usuariosLoaded ? "Nenhum usuário encontrado" : "Clique em ↻ para carregar"}</div>
                    <div style={{ fontSize:12 }}>{usuariosSearch ? "Tente outros termos de busca" : "Ajuste os filtros ou crie um novo usuário"}</div>
                  </div>
                )}

                {/* Table */}
                {!usuariosLoading && filtered.length > 0 && (
                  <div style={{ overflowX:"auto" as const }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid rgba(255,255,255,.08)" }}>
                          {["Usuário","Perfil","Unidade","Status","Último Acesso","Ações"].map(h => (
                            <th key={h} style={{ textAlign:"left" as const, padding:"8px 12px", color:"#475569", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:.8, whiteSpace:"nowrap" as const }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((u, i) => {
                          const cfg = PERFIS_CONFIG[u.perfil] || PERFIS_CONFIG.morador;
                          const initials = u.nome.split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
                          return (
                            <tr key={u.id} style={{ borderBottom:"1px solid rgba(255,255,255,.04)", background: i%2===0 ? "transparent" : "rgba(255,255,255,.015)", transition:"background .15s" }}>
                              <td style={{ padding:"10px 12px", maxWidth:220 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ width:34, height:34, borderRadius:"50%", background:`${cfg.cor}22`, border:`2px solid ${cfg.cor}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:cfg.cor, flexShrink:0 }}>{initials}</div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.nome}</div>
                                    <div style={{ fontSize:10, color:"#475569", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.email}</div>
                                    {u.telefone && <div style={{ fontSize:10, color:"#334155" }}>{u.telefone}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding:"10px 12px", whiteSpace:"nowrap" as const }}>
                                <div style={{ display:"flex", flexDirection:"column" as const, gap:4, alignItems:"flex-start" }}>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:12, background:`${cfg.cor}22`, color:cfg.cor, border:`1px solid ${cfg.cor}44` }}>{cfg.icon} {cfg.label}</span>
                                  {(() => {
                                    const pc = u.permissoes_customizadas as Record<string,boolean>|null|undefined;
                                    if (!pc) return null;
                                    const defaultMods = new Set(PERFIS_CONFIG[u.perfil].modulos);
                                    const allKeys = ["chatIA","insights","comunicados","ordens","financeiro","agua","misp","diagnostico","crm","manutencao","energia","gas","encomendas","condominios","usuarios","sseLiveLog"];
                                    const isDiff = allKeys.some(k => {
                                      const expected = defaultMods.has(k);
                                      const actual = pc[k] !== undefined ? !!pc[k] : expected;
                                      return actual !== expected;
                                    });
                                    return isDiff ? <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:8, background:"rgba(217,119,6,.2)", color:"#FCD34D", border:"1px solid rgba(217,119,6,.4)" }}>⚙ Customizado</span> : null;
                                  })()}
                                </div>
                              </td>
                              <td style={{ padding:"10px 12px", color: u.unidade ? "#E2E8F0" : "#334155" }}>{u.unidade || "–"}</td>
                              <td style={{ padding:"10px 12px" }}>
                                <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:12, background: u.status==="ativo" ? "#10B98120" : "#EF444420", color: u.status==="ativo" ? "#10B981" : "#EF4444", border:`1px solid ${u.status==="ativo" ? "#10B98140" : "#EF444440"}` }}>
                                  {u.status==="ativo" ? "🟢 Ativo" : "🔴 Inativo"}
                                </span>
                              </td>
                              <td style={{ padding:"10px 12px", color:"#475569", fontSize:11, whiteSpace:"nowrap" as const }}>{fmtDate(u.ultimo_acesso)}</td>
                              <td style={{ padding:"10px 12px", whiteSpace:"nowrap" as const }}>
                                <div style={{ display:"flex", gap:6 }}>
                                  <button title="Editar usuário" onClick={() => openEdit(u)} style={{ background:"rgba(37,99,235,.15)", border:"1px solid rgba(37,99,235,.3)", borderRadius:6, padding:"5px 9px", color:"#93C5FD", fontSize:11, cursor:"pointer" }}>✏️</button>
                                  <button title="Permissões customizadas" onClick={() => { setUsuarioPermId(u.id); setUsuarioPermNome(u.nome); setUsuarioPermJson(u.permissoes_customizadas ? JSON.stringify(u.permissoes_customizadas, null, 2) : "{}"); setUsuarioPermJsonErr(false); }} style={{ background:"rgba(124,60,252,.12)", border:"1px solid rgba(124,60,252,.3)", borderRadius:6, padding:"5px 9px", color:"#C4B5FD", fontSize:11, cursor:"pointer" }}>🔐</button>
                                  {u.status === "ativo" && <button title="Desativar usuário" onClick={() => deleteUsuario(u.id)} style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:6, padding:"5px 9px", color:"#FCA5A5", fontSize:11, cursor:"pointer" }}>🚫</button>}
                                  {u.status === "inativo" && <button title="Reativar usuário" onClick={() => { fetch(`/api/usuarios/${u.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"ativo"})}).then(()=>{ showToast("Usuário reativado","ok"); loadUsuarios(); }); }} style={{ background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.25)", borderRadius:6, padding:"5px 9px", color:"#6EE7B7", fontSize:11, cursor:"pointer" }}>✓</button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary cards by perfil */}
                {!usuariosLoading && usuarios.length > 0 && (
                  <div style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" as const }}>
                    {(["gestor","sindico","morador","zelador"] as const).filter(p => usuarios.some(u=>u.perfil===p)).map(p => {
                      const cfg = PERFIS_CONFIG[p];
                      const count = usuarios.filter(u=>u.perfil===p).length;
                      const ativos = usuarios.filter(u=>u.perfil===p && u.status==="ativo").length;
                      return (
                        <div key={p} style={{ flex:"1 1 140px", background:`${cfg.cor}0E`, border:`1px solid ${cfg.cor}30`, borderRadius:10, padding:"12px 14px" }}>
                          <div style={{ fontSize:18, marginBottom:4 }}>{cfg.icon}</div>
                          <div style={{ fontSize:13, fontWeight:800, color:cfg.cor }}>{count}</div>
                          <div style={{ fontSize:10, color:"#64748B" }}>{cfg.label}</div>
                          <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{ativos} ativo{ativos!==1?"s":""}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                </>} {/* ── FIM ABA LISTA ── */}

                {/* ── ABA PERMISSÕES ── */}
                {usuariosSubtab === "permissoes" && (() => {
                  const ALL_MODS_LABELED: {key:string;label:string;icon:string}[] = [
                    {key:"chatIA",label:"Chat IA",icon:"🤖"},{key:"insights",label:"Insights",icon:"📊"},
                    {key:"comunicados",label:"Comunicados",icon:"📢"},{key:"ordens",label:"Ordens",icon:"📋"},
                    {key:"financeiro",label:"Financeiro",icon:"💰"},{key:"agua",label:"Água",icon:"💧"},
                    {key:"misp",label:"MISP",icon:"🎯"},{key:"diagnostico",label:"Diagnóstico",icon:"🔍"},
                    {key:"crm",label:"CRM",icon:"👥"},{key:"manutencao",label:"Manutenção",icon:"🔧"},
                    {key:"energia",label:"Energia",icon:"⚡"},{key:"gas",label:"Gás",icon:"🔥"},
                    {key:"encomendas",label:"Encomendas",icon:"📦"},{key:"condominios",label:"Condomínios",icon:"🏢"},
                    {key:"usuarios",label:"Usuários",icon:"👤"},{key:"sseLiveLog",label:"Live Log",icon:"📡"},
                  ];
                  const ALL_MOD_KEYS2 = ALL_MODS_LABELED.map(m=>m.key);
                  const buildPerms2 = (perfil: PerfilKey, existing?: Record<string,unknown>) => {
                    const mods = new Set(PERFIS_CONFIG[perfil].modulos);
                    return ALL_MOD_KEYS2.reduce((acc,k) => {
                      acc[k] = existing ? (existing[k] === true || (existing[k] === undefined && mods.has(k))) : mods.has(k);
                      return acc;
                    }, {} as Record<string,boolean>);
                  };
                  const selUser = permTabUserId ? usuarios.find(u=>u.id===permTabUserId) : null;
                  const selCfg  = selUser ? PERFIS_CONFIG[selUser.perfil] : null;
                  const enabledCount = Object.values(permTabPerms).filter(Boolean).length;

                  const savePermTab = async () => {
                    if (!permTabUserId) return;
                    setPermTabSaving(true);
                    try {
                      const r = await fetch(`/api/usuarios/${permTabUserId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ permissoes_customizadas: permTabPerms }) });
                      if (!r.ok) throw new Error();
                      showToast("Permissões salvas ✓","ok");
                      loadUsuarios();
                    } catch { showToast("Erro ao salvar permissões","error"); }
                    finally { setPermTabSaving(false); }
                  };

                  return (
                    <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
                      {/* Dropdown selecionar usuário */}
                      <div>
                        <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:1 }}>Selecionar Usuário</div>
                        <select value={permTabUserId||""} onChange={e=>{
                          const uid = e.target.value;
                          setPermTabUserId(uid||null);
                          const u = usuarios.find(u=>u.id===uid);
                          if (u) setPermTabPerms(buildPerms2(u.perfil, u.permissoes_customizadas as Record<string,unknown>|undefined));
                          else setPermTabPerms({});
                        }} style={{ width:"100%", padding:"10px 14px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, color:"var(--c-text)", fontSize:13, fontFamily:"inherit", cursor:"pointer", outline:"none" }}>
                          <option value="">— Selecione um usuário —</option>
                          {usuarios.map(u=>{
                            const cfg = PERFIS_CONFIG[u.perfil];
                            return <option key={u.id} value={u.id}>{cfg.icon} {u.nome} ({cfg.label}) {u.status==="inativo"?"[inativo]":""}</option>;
                          })}
                        </select>
                      </div>

                      {/* Matriz de controle */}
                      {selUser && selCfg && (
                        <div style={{ background:"rgba(255,255,255,.03)", borderRadius:12, border:`1px solid ${selCfg.cor}33`, overflow:"hidden" }}>
                          {/* Header do usuário selecionado */}
                          <div style={{ padding:"12px 16px", background:`${selCfg.cor}15`, borderBottom:`1px solid ${selCfg.cor}25`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:36, height:36, borderRadius:"50%", background:selCfg.cor, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, color:"#fff" }}>{selUser.nome.charAt(0).toUpperCase()}</div>
                              <div>
                                <div style={{ fontWeight:700, fontSize:13, color:"var(--c-text)" }}>{selUser.nome}</div>
                                <div style={{ fontSize:11, color:selCfg.cor }}>{selCfg.icon} {selCfg.label} · {selUser.email}</div>
                              </div>
                            </div>
                            <div style={{ fontSize:11, color:"#94a3b8" }}>{enabledCount}/{ALL_MODS_LABELED.length} módulos ativos</div>
                          </div>
                          {/* Grid de toggles */}
                          <div style={{ padding:"14px 16px", display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"10px 20px" }}>
                            {ALL_MODS_LABELED.map(m => {
                              const on = !!permTabPerms[m.key];
                              return (
                                <label key={m.key} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                                  <div onClick={()=>setPermTabPerms(p=>({...p,[m.key]:!p[m.key]}))} style={{ width:36, height:20, borderRadius:10, background: on?selCfg.cor:"rgba(255,255,255,.1)", position:"relative" as const, flexShrink:0, transition:"background .2s", cursor:"pointer" }}>
                                    <div style={{ position:"absolute" as const, top:4, left: on?18:4, width:12, height:12, borderRadius:"50%", background:"#fff", transition:"left .15s" }} />
                                  </div>
                                  <span style={{ fontSize:12, color: on?"#e2e8f0":"#475569", userSelect:"none" as const }}>{m.icon} {m.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          {/* Botões */}
                          <div style={{ padding:"10px 16px 14px", display:"flex", gap:10, justifyContent:"flex-end" }}>
                            <button onClick={()=>{ if(selUser) setPermTabPerms(buildPerms2(selUser.perfil)); }} style={{ padding:"8px 16px", borderRadius:8, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"#94a3b8", fontSize:12, cursor:"pointer" }}>↺ Restaurar Padrão</button>
                            <button onClick={savePermTab} disabled={permTabSaving} style={{ padding:"8px 20px", borderRadius:8, background:selCfg.cor, border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", opacity:permTabSaving?.6:1 }}>{permTabSaving?"Salvando…":"💾 Salvar Permissões"}</button>
                          </div>
                        </div>
                      )}

                      {!permTabUserId && (
                        <div style={{ textAlign:"center" as const, color:"#475569", fontSize:13, padding:"40px 0" }}>Selecione um usuário para visualizar e editar suas permissões</div>
                      )}
                    </div>
                  );
                })()}

                {/* Modal Novo/Editar */}
                {usuarioModal !== "none" && (
                  <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,.7)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={e => { if (e.target===e.currentTarget) setUsuarioModal("none"); }}>
                    <div style={{ background:"#0D1321", border:"1px solid rgba(255,255,255,.1)", borderRadius:16, padding:28, width:440, maxWidth:"90vw", maxHeight:"85vh", overflowY:"auto" as const }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                        <div style={{ fontSize:16, fontWeight:800 }}>{usuarioModal==="new"?"Novo Usuário":"Editar Usuário"}</div>
                        <button onClick={()=>setUsuarioModal("none")} style={{ background:"none", border:"none", color:"#64748B", fontSize:18, cursor:"pointer" }}>×</button>
                      </div>

                      <div style={{ display:"flex", flexDirection:"column" as const, gap:14 }}>
                        {/* Perfil selector */}
                        <div>
                          <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:8, textTransform:"uppercase" as const }}>Perfil *</div>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                            {(["gestor","sindico","morador","zelador"] as const).map(p => {
                              const cfg = PERFIS_CONFIG[p];
                              const sel = usuarioForm.perfil === p;
                              return <button key={p} type="button" onClick={()=>{ setUsuarioForm(f=>({...f,perfil:p})); setPermsCustom(buildPerms(p)); setShowPermsPanel(false); }} style={{ padding:"7px 14px", borderRadius:8, fontSize:11, fontWeight:sel?700:500, cursor:"pointer", border:sel?`2px solid ${cfg.cor}`:"1px solid rgba(255,255,255,.1)", background:sel?`${cfg.cor}22`:"rgba(255,255,255,.03)", color:sel?cfg.cor:"#64748B" }}>{cfg.icon} {cfg.label}</button>;
                            })}
                          </div>
                          {/* Card visual de acesso a módulos */}
                          {(() => {
                            const ALL_MODULOS: { key:string; label:string; icon:string }[] = [
                              { key:"chatIA",       label:"Chat IA",       icon:"🤖" },
                              { key:"insights",     label:"Insights",      icon:"📊" },
                              { key:"comunicados",  label:"Comunicados",   icon:"📢" },
                              { key:"ordens",       label:"Ordens",        icon:"📋" },
                              { key:"financeiro",   label:"Financeiro",    icon:"💰" },
                              { key:"agua",         label:"Água",          icon:"💧" },
                              { key:"misp",         label:"MISP",          icon:"🎯" },
                              { key:"diagnostico",  label:"Diagnóstico",   icon:"🔍" },
                              { key:"crm",          label:"CRM",           icon:"👥" },
                              { key:"manutencao",   label:"Manutenção",    icon:"🔧" },
                              { key:"energia",      label:"Energia",       icon:"⚡" },
                              { key:"gas",          label:"Gás",           icon:"🔥" },
                              { key:"encomendas",   label:"Encomendas",    icon:"📦" },
                              { key:"condominios",  label:"Condomínios",   icon:"🏢" },
                              { key:"usuarios",     label:"Usuários",      icon:"👤" },
                              { key:"sseLiveLog",   label:"Live Log",      icon:"📡" },
                            ];
                            const perfilMods = new Set(PERFIS_CONFIG[usuarioForm.perfil].modulos);
                            const perfilCor  = PERFIS_CONFIG[usuarioForm.perfil].cor;
                            return (
                              <div style={{ marginTop:10, padding:"10px 12px", background:"rgba(255,255,255,.04)", borderRadius:10, border:`1px solid ${perfilCor}33` }}>
                                <div style={{ fontSize:10, fontWeight:700, color:perfilCor, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:1 }}>Acesso a Módulos</div>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"5px 8px" }}>
                                  {ALL_MODULOS.map(m => {
                                    const ok = perfilMods.has(m.key);
                                    return (
                                      <div key={m.key} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color: ok ? "#10b981" : "#ef4444", opacity: ok ? 1 : 0.55 }}>
                                        <span style={{ fontSize:9 }}>{ok ? "✓" : "✗"}</span>
                                        <span>{m.icon} {m.label}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Seção expansível: Personalizar permissões */}
                          {(() => {
                            const ALL_MODS_LABELED: {key:string;label:string;icon:string}[] = [
                              {key:"chatIA",label:"Chat IA",icon:"🤖"},{key:"insights",label:"Insights",icon:"📊"},
                              {key:"comunicados",label:"Comunicados",icon:"📢"},{key:"ordens",label:"Ordens",icon:"📋"},
                              {key:"financeiro",label:"Financeiro",icon:"💰"},{key:"agua",label:"Água",icon:"💧"},
                              {key:"misp",label:"MISP",icon:"🎯"},{key:"diagnostico",label:"Diagnóstico",icon:"🔍"},
                              {key:"crm",label:"CRM",icon:"👥"},{key:"manutencao",label:"Manutenção",icon:"🔧"},
                              {key:"energia",label:"Energia",icon:"⚡"},{key:"gas",label:"Gás",icon:"🔥"},
                              {key:"encomendas",label:"Encomendas",icon:"📦"},{key:"condominios",label:"Condomínios",icon:"🏢"},
                              {key:"usuarios",label:"Usuários",icon:"👤"},{key:"sseLiveLog",label:"Live Log",icon:"📡"},
                            ];
                            const perfilCor2 = PERFIS_CONFIG[usuarioForm.perfil].cor;
                            const enabledCount = Object.values(permsCustom).filter(Boolean).length;
                            return (
                              <div style={{ marginTop:6, borderRadius:10, border:"1px solid rgba(255,255,255,.08)", overflow:"hidden" }}>
                                <button type="button" onClick={()=>setShowPermsPanel(v=>!v)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 12px", background:"rgba(255,255,255,.04)", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:11 }}>
                                  <span style={{ fontWeight:700, textTransform:"uppercase" as const, letterSpacing:1, color:perfilCor2 }}>🔐 Personalizar Permissões</span>
                                  <span style={{ fontSize:10 }}>{enabledCount}/{ALL_MODS_LABELED.length} ativos &nbsp;{showPermsPanel?"▲":"▼"}</span>
                                </button>
                                {showPermsPanel && (
                                  <div style={{ padding:"10px 12px", background:"rgba(0,0,0,.15)", display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"7px 12px" }}>
                                    {ALL_MODS_LABELED.map(m => {
                                      const on = !!permsCustom[m.key];
                                      return (
                                        <label key={m.key} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:11, color: on?"#e2e8f0":"#475569" }}>
                                          <div onClick={()=>setPermsCustom(p=>({...p,[m.key]:!p[m.key]}))} style={{ width:32, height:18, borderRadius:9, background: on?perfilCor2:"rgba(255,255,255,.1)", position:"relative" as const, flexShrink:0, transition:"background .2s", cursor:"pointer" }}>
                                            <div style={{ position:"absolute" as const, top:3, left: on?16:3, width:12, height:12, borderRadius:"50%", background:"#fff", transition:"left .15s" }} />
                                          </div>
                                          {m.icon} {m.label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {[
                          { label:"Nome *", key:"nome" as const, placeholder:"Nome completo" },
                          { label:"Email *", key:"email" as const, placeholder:"email@condominio.com" },
                          { label:"Telefone", key:"telefone" as const, placeholder:"(00) 00000-0000" },
                        ].map(({ label, key, placeholder }) => (
                          <div key={key}>
                            <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:6, textTransform:"uppercase" as const }}>{label}</div>
                            <input value={usuarioForm[key]} onChange={e=>setUsuarioForm(f=>({...f,[key]:e.target.value}))} placeholder={placeholder} style={{ width:"100%", boxSizing:"border-box" as const, padding:"9px 12px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, color:"var(--c-text)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                          </div>
                        ))}

                        {/* Unidade — só aparece se perfil = morador */}
                        {usuarioForm.perfil === "morador" && (
                          <div>
                            <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:6, textTransform:"uppercase" as const }}>Unidade / Apto</div>
                            <input value={usuarioForm.unidade} onChange={e=>setUsuarioForm(f=>({...f,unidade:e.target.value}))} placeholder="Ex: 102A, Bloco B / 204" style={{ width:"100%", boxSizing:"border-box" as const, padding:"9px 12px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(5,150,105,.3)", borderRadius:8, color:"var(--c-text)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                            <div style={{ fontSize:10, color:"#059669", marginTop:4 }}>Campo visível apenas para moradores</div>
                          </div>
                        )}

                        {/* Status */}
                        <div>
                          <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:8, textTransform:"uppercase" as const }}>Status</div>
                          <div style={{ display:"flex", gap:8 }}>
                            {["ativo","inativo"].map(s => (
                              <button key={s} type="button" onClick={()=>setUsuarioForm(f=>({...f,status:s}))} style={{ padding:"7px 16px", borderRadius:8, fontSize:11, fontWeight:usuarioForm.status===s?700:500, cursor:"pointer", border:usuarioForm.status===s?"1px solid rgba(255,255,255,.2)":"1px solid rgba(255,255,255,.07)", background:usuarioForm.status===s?"rgba(255,255,255,.1)":"rgba(255,255,255,.02)", color:usuarioForm.status===s?"#E2E8F0":"#475569" }}>
                                {s==="ativo"?"🟢 Ativo":"🔴 Inativo"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div style={{ display:"flex", gap:10, marginTop:24, justifyContent:"flex-end" }}>
                        <button onClick={()=>setUsuarioModal("none")} style={{ padding:"9px 20px", borderRadius:8, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"#64748B", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                        <button onClick={saveUsuario} style={{ padding:"9px 24px", borderRadius:8, background:"rgba(37,99,235,.8)", border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          {usuarioModal==="new" ? "Criar Usuário" : "Salvar Alterações"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Modal Permissões Customizadas */}
                {usuarioPermId && (
                  <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={e => { if (e.target===e.currentTarget) setUsuarioPermId(null); }}>
                    <div style={{ background:"#0D1321", border:"1px solid rgba(124,60,252,.3)", borderRadius:16, padding:28, width:500, maxWidth:"92vw", maxHeight:"85vh", overflowY:"auto" as const }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ fontSize:16, fontWeight:800 }}>🔐 Permissões Customizadas</div>
                        <button onClick={()=>setUsuarioPermId(null)} style={{ background:"none", border:"none", color:"#64748B", fontSize:18, cursor:"pointer" }}>×</button>
                      </div>
                      <div style={{ fontSize:12, color:"#475569", marginBottom:16 }}>{usuarioPermNome} — edite o JSON de permissões extras</div>

                      <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:6, textTransform:"uppercase" as const }}>JSON de Permissões</div>
                      <textarea
                        value={usuarioPermJson}
                        onChange={e => {
                          setUsuarioPermJson(e.target.value);
                          try { JSON.parse(e.target.value); setUsuarioPermJsonErr(false); } catch { setUsuarioPermJsonErr(true); }
                        }}
                        rows={12}
                        spellCheck={false}
                        style={{ width:"100%", boxSizing:"border-box" as const, padding:"10px 12px", background:"rgba(255,255,255,.04)", border:`1px solid ${usuarioPermJsonErr?"#EF4444":"rgba(255,255,255,.1)"}`, borderRadius:8, color: usuarioPermJsonErr?"#FCA5A5":"#E2E8F0", fontSize:12, fontFamily:"'Courier New', monospace", resize:"vertical" as const, outline:"none" }}
                      />
                      {usuarioPermJsonErr && <div style={{ fontSize:11, color:"#EF4444", marginTop:4 }}>⚠️ JSON inválido — corrija antes de salvar</div>}

                      <div style={{ fontSize:11, color:"#334155", marginTop:10, marginBottom:16 }}>
                        Exemplo: <code style={{ background:"rgba(255,255,255,.06)", padding:"2px 6px", borderRadius:4 }}>{`{"ver_financeiro": true, "aprovar_os": false}`}</code>
                      </div>

                      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                        <button onClick={()=>setUsuarioPermId(null)} style={{ padding:"9px 20px", borderRadius:8, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"#64748B", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                        <button disabled={usuarioPermJsonErr} onClick={async () => {
                          try {
                            const parsed = JSON.parse(usuarioPermJson);
                            const r = await fetch(`/api/usuarios/${usuarioPermId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ permissoes_customizadas: parsed }) });
                            if (!r.ok) throw new Error();
                            showToast("Permissões salvas ✓","ok");
                            setUsuarioPermId(null);
                            loadUsuarios();
                          } catch { showToast("Erro ao salvar permissões","error"); }
                        }} style={{ padding:"9px 24px", borderRadius:8, background: usuarioPermJsonErr ? "rgba(100,116,139,.3)" : "rgba(124,60,252,.8)", border:"none", color: usuarioPermJsonErr ? "#64748B" : "#fff", fontSize:12, fontWeight:700, cursor: usuarioPermJsonErr ? "not-allowed" : "pointer" }}>
                          Salvar Permissões
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            );
          })()}

          {/* PANEL: CRM INTELIGENTE */}
          {panel === "crm" && (() => {
            const lista = crmTab === "moradores" ? crmMoradores : crmInquilinos;
            const filtered = lista.filter(m =>
              !crmSearch || m.nome.toLowerCase().includes(crmSearch.toLowerCase()) ||
              m.email.toLowerCase().includes(crmSearch.toLowerCase()) ||
              m.bloco.toLowerCase().includes(crmSearch.toLowerCase()) ||
              m.apto.toLowerCase().includes(crmSearch.toLowerCase())
            );

            // ── Segment counts ─────────────────────────────────────────
            const segCounts: Record<string, number> = {};
            crmMoradores.forEach(m => m.segmentos.forEach(s => { segCounts[s] = (segCounts[s]||0)+1; }));
            const SEG_LABEL: Record<string,string> = { proprietario:"Proprietário", airbnb:"AIRBNB", outro:"Outro", inquilino:"Inquilino" };
            const SEG_COLOR: Record<string,string> = { proprietario:"#10B981", airbnb:"#EF4444", outro:"#6B7280", inquilino:"#6366F1" };

            const pieSeg = Object.entries(segCounts).map(([k,v])=>({ name: SEG_LABEL[k]||k, value:v, color: SEG_COLOR[k]||"#475569" }));

            // ── KPIs ───────────────────────────────────────────────────
            const petCount      = crmMoradores.filter(m=>m.pet).length;
            const hoCount       = crmMoradores.filter(m=>m.homeOffice).length;
            const scoreMedio    = crmMoradores.length ? (crmMoradores.reduce((s,m)=>s+m.score,0)/crmMoradores.length).toFixed(1) : "0.0";
            const pendTotal     = crmMoradores.reduce((s,m)=>s+m.pendencias,0);

            // ── ImobSpace interest counts ──────────────────────────────
            const INTERESTS = ["Esportes/Lazer","Saúde","Delivery","Estudos","Academia","Internet","Farmácia"];
            const INTEREST_ICONS: Record<string,string> = { "Esportes/Lazer":"🏃","Saúde":"❤️","Delivery":"🛵","Estudos":"📚","Academia":"💪","Internet":"🌐","Farmácia":"💊" };
            const intCounts: Record<string,number> = {};
            INTERESTS.forEach(i => {
              intCounts[i] = crmMoradores.reduce((s,m) => s + (m.interesses.includes(i)?1:0), 0);
            });

            // ── Selected morador for profile ───────────────────────────
            const perfilMorador = crmMoradores.find(m=>m.id===crmPerfilId);

            const segPill = (seg: string) => (
              <span key={seg} style={{
                background: `${SEG_COLOR[seg]||"#6B7280"}22`,
                color: SEG_COLOR[seg]||"#6B7280",
                border:`1px solid ${SEG_COLOR[seg]||"#6B7280"}44`,
                borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700,
              }}>{SEG_LABEL[seg]||seg}</span>
            );

            const saveNovoMorador = () => {
              if (!crmNovoForm.nome.trim()) return;
              setCrmMoradores(prev=>[...prev,{
                id:`cm${Date.now()}`, nome:crmNovoForm.nome, bloco:crmNovoForm.bloco, apto:crmNovoForm.apto,
                email:crmNovoForm.email, telefone:crmNovoForm.telefone, veiculo:crmNovoForm.veiculo,
                segmentos:crmNovoForm.segmentos.length?crmNovoForm.segmentos:["outro"],
                score:70, status:"ativo", pet:crmNovoForm.pet, homeOffice:crmNovoForm.homeOffice,
                pendencias:0, interesses:[],
              }]);
              setCrmNovoForm({nome:"",bloco:"",apto:"",email:"",telefone:"",veiculo:"",segmentos:[],pet:false,homeOffice:false});
              setCrmNovoModal(false);
            };

            const toggleSeg = (seg: string) => {
              setCrmNovoForm(f=>({ ...f, segmentos: f.segmentos.includes(seg) ? f.segmentos.filter(s=>s!==seg) : [...f.segmentos, seg] }));
            };

            return (
              <div style={{ padding:20 }}>
                {/* ── Header ── */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, marginBottom:2 }}>👥 CRM Inteligente</div>
                    <div style={{ fontSize:12, color:"#475569" }}>Gerencie e analise o perfil comportamental dos moradores e inquilinos</div>
                  </div>
                  <button onClick={()=>setCrmNovoModal(true)} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                    + Novo Morador
                  </button>
                </div>

                {/* ── Main tabs ── */}
                <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                  {([["moradores","👥",`Moradores (${crmMoradores.length})`,"#10B981"],["inquilinos","🏠",`Inquilinos Temporários (${crmInquilinos.length})`,"#6366F1"]] as [typeof crmTab,string,string,string][]).map(([id,icon,label,col])=>(
                    <button key={id} onClick={()=>setCrmTab(id)} style={{
                      background: crmTab===id ? col : "rgba(255,255,255,.04)",
                      border: crmTab===id ? "none" : "1px solid rgba(255,255,255,.1)",
                      borderRadius:8, padding:"7px 18px", color:crmTab===id?"#fff":"#64748B",
                      fontSize:12, fontWeight:crmTab===id?700:400, cursor:"pointer", display:"flex", alignItems:"center", gap:6,
                    }}>{icon} {label}</button>
                  ))}
                </div>

                {/* ── KPI Cards ── */}
                <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                  {[
                    { label:"Total Moradores",  val:crmMoradores.length,  sub:`${crmMoradores.filter(m=>m.status==="ativo").length} ativos`,          icon:"👤", bg:"#3B82F6" },
                    { label:"Pet Owners",        val:petCount,              sub:"moradores com pet",                                                    icon:"🐾", bg:"#10B981" },
                    { label:"Home Office",       val:hoCount,               sub:"trabalham de casa",                                                    icon:"🏠", bg:"#8B5CF6" },
                    { label:"Score Médio",       val:scoreMedio,            sub:"pontuação geral",                                                      icon:"⭐", bg:"#F59E0B" },
                    { label:"Em Branco",         val:pendTotal,             sub:"pendências abertas",                                                   icon:"⚠️", bg:"#EF4444" },
                  ].map(k=>(
                    <div key={k.label} style={{ flex:1, background:`linear-gradient(135deg, ${k.bg}cc, ${k.bg}88)`, borderRadius:12, padding:"16px 18px", position:"relative", overflow:"hidden" }}>
                      <div style={{ position:"absolute", right:12, top:12, fontSize:28, opacity:0.25 }}>{k.icon}</div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,.7)", marginBottom:6 }}>{k.label}</div>
                      <div style={{ fontSize:26, fontWeight:900, color:"#fff" }}>{k.val}</div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,.6)", marginTop:3 }}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* ── Charts row ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
                  {/* Donut */}
                  <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px" }}>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>📊 Distribuição por Segmentos</div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <PieChart width={200} height={160}>
                        <Pie data={pieSeg} cx={95} cy={75} innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                          {pieSeg.map((entry,i)=><Cell key={i} fill={entry.color}/>)}
                        </Pie>
                        <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} formatter={(v:number,n:string)=>[`${v} morador${v!==1?"es":""}`,n]}/>
                      </PieChart>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {pieSeg.map(s=>(
                          <div key={s.name} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }}/>
                            <span style={{ color:"#94A3B8" }}>{s.name}</span>
                            <span style={{ color:"#fff", fontWeight:700 }}>{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Segmentos ativos */}
                  <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px" }}>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:14 }}>Segmentos Ativos</div>
                    {Object.entries(segCounts).sort((a,b)=>b[1]-a[1]).map(([seg,count])=>(
                      <div key={seg} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                        <span style={{ background:`${SEG_COLOR[seg]||"#475569"}20`, color:SEG_COLOR[seg]||"#475569", border:`1px solid ${SEG_COLOR[seg]||"#475569"}40`, borderRadius:5, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                          {SEG_LABEL[seg]||seg}
                        </span>
                        <span style={{ fontSize:12, color:"#94A3B8" }}>{count} morador{count!==1?"es":""}</span>
                      </div>
                    ))}
                    {Object.keys(segCounts).length === 0 && <div style={{ fontSize:12, color:"#475569", textAlign:"center", padding:20 }}>Nenhum segmento cadastrado</div>}
                  </div>
                </div>

                {/* ── ImobSpace Interesses ── */}
                <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>🏠 Resumo ImobSpace – Interesses dos Moradores</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {INTERESTS.map(int=>(
                      <div key={int} style={{ flex:1, minWidth:90, textAlign:"center", padding:"14px 10px", background:"rgba(255,255,255,.03)", borderRadius:10, border:"1px solid rgba(255,255,255,.06)" }}>
                        <div style={{ fontSize:22, marginBottom:6 }}>{INTEREST_ICONS[int]||"•"}</div>
                        <div style={{ fontSize:20, fontWeight:800, color: intCounts[int]>0?"#6366F1":"#334155" }}>{intCounts[int]}</div>
                        <div style={{ fontSize:10, color:"#475569", marginTop:3 }}>{int}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Moradores table ── */}
                <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>Moradores Cadastrados</div>
                    <input value={crmSearch} onChange={e=>setCrmSearch(e.target.value)} placeholder="🔍 Buscar morador..." style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"6px 12px", color:"#fff", fontSize:12, width:200, outline:"none" }}/>
                  </div>

                  {/* Table header */}
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 100px 1.5fr 110px 1.5fr 80px auto", gap:0, padding:"8px 18px", background:"rgba(255,255,255,.02)", fontSize:10, color:"#475569", fontWeight:600, letterSpacing:.5 }}>
                    <span>NOME</span><span>BLOCO/APTO</span><span>EMAIL</span><span>VEÍCULO</span><span>INTERESSES</span><span>STATUS</span><span></span>
                  </div>

                  {filtered.length===0 && (
                    <div style={{ padding:"24px", textAlign:"center", color:"#475569", fontSize:13 }}>
                      {crmSearch ? "Nenhum morador encontrado." : "Nenhum cadastro ainda."}
                    </div>
                  )}

                  {filtered.map((m,i)=>(
                    <div key={m.id} style={{ display:"grid", gridTemplateColumns:"2fr 100px 1.5fr 110px 1.5fr 80px auto", gap:0, padding:"12px 18px", borderTop:"1px solid rgba(255,255,255,.04)", alignItems:"center", fontSize:12 }}>
                      <div style={{ fontWeight:600 }}>{m.nome}</div>
                      <div style={{ color:"#94A3B8" }}>{[m.bloco,m.apto].filter(Boolean).join(" ") || "—"}</div>
                      <div style={{ color:"#475569", fontSize:11 }}>{m.email||"—"}</div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {m.veiculo ? <span style={{ color:"#94A3B8", fontSize:11 }}>{m.veiculo}</span> : <span style={{ color:"#334155" }}>N/A</span>}
                        {m.segmentos.map(s=>segPill(s))}
                      </div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {m.interesses.length>0
                          ? m.interesses.slice(0,2).map(int=><span key={int} style={{ background:"rgba(99,102,241,.15)", color:"#A5B4FC", border:"1px solid rgba(99,102,241,.3)", borderRadius:5, padding:"2px 7px", fontSize:10 }}>{int}</span>)
                          : <span style={{ color:"#334155", fontSize:11 }}>—</span>}
                      </div>
                      <div>
                        <span style={{ background:m.status==="ativo"?"rgba(16,185,129,.15)":"rgba(239,68,68,.15)", color:m.status==="ativo"?"#10B981":"#EF4444", border:`1px solid ${m.status==="ativo"?"#10B98144":"#EF444444"}`, borderRadius:6, padding:"3px 9px", fontSize:10, fontWeight:700 }}>
                          {m.status==="ativo"?"Ativo":"Inativo"}
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:5 }}>
                        <button title="Ver perfil completo do morador" onClick={()=>setCrmPerfilId(m.id)} style={{ background:"#3B82F6", border:"none", borderRadius:6, padding:"5px 10px", color:"#fff", fontSize:10, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>Ver Perfil</button>
                        <button title="Editar dados do morador" style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, width:28, height:28, color:"#94A3B8", fontSize:12, cursor:"pointer" }}>✏️</button>
                        <button title="Remover morador da lista" onClick={()=>setCrmMoradores(prev=>prev.filter(x=>x.id!==m.id))} style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.2)", borderRadius:6, width:28, height:28, color:"#EF4444", fontSize:12, cursor:"pointer" }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Novo Morador Modal ── */}
                {crmNovoModal && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setCrmNovoModal(false)}>
                    <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:28, width:520, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
                      <div style={{ fontSize:16, fontWeight:700, marginBottom:20 }}>👤 Novo Morador</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                        {[["Nome completo*","text","nome","Ex: João Silva"],["Email","email","email","email@exemplo.com"],["Telefone","text","telefone","(48)99999-9999"],["Veículo","text","veiculo","Ex: Carro próprio"]].map(([label,type,field,ph])=>(
                          <div key={field}>
                            <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>{label}</div>
                            <input type={type} value={(crmNovoForm as any)[field]} onChange={e=>setCrmNovoForm(f=>({...f,[field]:e.target.value}))} placeholder={ph} style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:12, boxSizing:"border-box" }}/>
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                        {[["Bloco","text","bloco","Ex: A"],["Apto / Número","text","apto","Ex: 102"]].map(([label,type,field,ph])=>(
                          <div key={field}>
                            <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>{label}</div>
                            <input type={type} value={(crmNovoForm as any)[field]} onChange={e=>setCrmNovoForm(f=>({...f,[field]:e.target.value}))} placeholder={ph} style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:12, boxSizing:"border-box" }}/>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:8 }}>Segmentos</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {Object.entries(SEG_LABEL).map(([seg,label])=>(
                            <button key={seg} onClick={()=>toggleSeg(seg)} style={{ background:crmNovoForm.segmentos.includes(seg)?`${SEG_COLOR[seg]}33`:"rgba(255,255,255,.04)", border:`1px solid ${crmNovoForm.segmentos.includes(seg)?SEG_COLOR[seg]:"rgba(255,255,255,.1)"}`, borderRadius:6, padding:"5px 12px", color:crmNovoForm.segmentos.includes(seg)?SEG_COLOR[seg]:"#64748B", fontSize:11, cursor:"pointer", fontWeight:crmNovoForm.segmentos.includes(seg)?700:400 }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:16, marginBottom:18 }}>
                        {[["pet","🐾 Tem pet",crmNovoForm.pet],["homeOffice","🏠 Home Office",crmNovoForm.homeOffice]].map(([field,label,val])=>(
                          <label key={field as string} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:12, color:"#94A3B8" }}>
                            <input type="checkbox" checked={val as boolean} onChange={e=>setCrmNovoForm(f=>({...f,[field as string]:e.target.checked}))} style={{ accentColor:"#3B82F6" }}/>
                            {label as string}
                          </label>
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                        <button onClick={()=>setCrmNovoModal(false)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 16px", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                        <button onClick={saveNovoMorador} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 22px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:700 }}>Salvar Morador</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Ver Perfil Modal ── */}
                {perfilMorador && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setCrmPerfilId(null)}>
                    <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:28, width:500, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
                      {/* Avatar + name */}
                      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
                        <div style={{ width:60, height:60, borderRadius:"50%", background:"linear-gradient(135deg,#6366F1,#3B82F6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, fontWeight:800, color:"#fff" }}>
                          {perfilMorador.nome.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontSize:18, fontWeight:800 }}>{perfilMorador.nome}</div>
                          <div style={{ display:"flex", gap:5, marginTop:4 }}>
                            {perfilMorador.segmentos.map(s=>segPill(s))}
                            <span style={{ background:"rgba(16,185,129,.15)", color:"#10B981", border:"1px solid rgba(16,185,129,.3)", borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                              {perfilMorador.status==="ativo"?"Ativo":"Inativo"}
                            </span>
                          </div>
                        </div>
                        {/* Score circle */}
                        <div style={{ marginLeft:"auto", textAlign:"center" }}>
                          <svg width={64} height={64} viewBox="0 0 64 64">
                            <circle cx={32} cy={32} r={26} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={6}/>
                            <circle cx={32} cy={32} r={26} fill="none" stroke={perfilMorador.score>=80?"#10B981":perfilMorador.score>=60?"#F59E0B":"#EF4444"} strokeWidth={6} strokeDasharray={`${perfilMorador.score/100*163.4} 163.4`} strokeLinecap="round" transform="rotate(-90 32 32)"/>
                            <text x={32} y={36} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{perfilMorador.score}</text>
                          </svg>
                          <div style={{ fontSize:9, color:"#475569" }}>Score</div>
                        </div>
                      </div>

                      {/* Details grid */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
                        {[
                          ["📍 Bloco/Apto", [perfilMorador.bloco,perfilMorador.apto].filter(Boolean).join(" ")||"—"],
                          ["📧 Email", perfilMorador.email||"—"],
                          ["📞 Telefone", perfilMorador.telefone||"—"],
                          ["🚗 Veículo", perfilMorador.veiculo||"—"],
                          ["🐾 Pet", perfilMorador.pet?"Sim":"Não"],
                          ["💻 Home Office", perfilMorador.homeOffice?"Sim":"Não"],
                        ].map(([l,v])=>(
                          <div key={l} style={{ background:"rgba(255,255,255,.03)", borderRadius:8, padding:"10px 14px" }}>
                            <div style={{ fontSize:10, color:"#475569", marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:13, fontWeight:600 }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Interesses */}
                      {perfilMorador.interesses.length>0 && (
                        <div style={{ marginBottom:16 }}>
                          <div style={{ fontSize:11, color:"#475569", marginBottom:8 }}>Interesses ImobSpace</div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {perfilMorador.interesses.map(int=>(
                              <span key={int} style={{ background:"rgba(99,102,241,.15)", color:"#A5B4FC", border:"1px solid rgba(99,102,241,.3)", borderRadius:6, padding:"3px 10px", fontSize:11 }}>
                                {INTEREST_ICONS[int]||""} {int}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display:"flex", justifyContent:"flex-end" }}>
                        <button onClick={()=>setCrmPerfilId(null)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 18px", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Fechar</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PANEL: GÁS */}
          {panel === "gas" && (() => {
            // ── Chart data (oldest → newest for correct line direction) ──
            const chartData = [...gasLeituras].reverse().map(l => ({
              label: `${l.data.slice(0,5)} ${l.hora.slice(0,5)}`,
              nivel: l.nivel,
            }));

            const nivelAtual = gasLeituras[0]?.nivel ?? 0;
            const nivelMin    = Math.min(...gasLeituras.map(l => l.nivel));
            const nivelMax    = Math.max(...gasLeituras.map(l => l.nivel));
            const nivelMedio  = Math.round(gasLeituras.reduce((s,l) => s+l.nivel, 0) / gasLeituras.length);

            const nivelColor = (n: number) =>
              n < 20 ? "#EF4444" : n < 40 ? "#F59E0B" : "#10B981";

            const saveReading = () => {
              if (!gasNovaLeitForm.nivel) return;
              const now = new Date();
              setGasLeituras(prev => [{
                id: `g${Date.now()}`,
                nivel: Number(gasNovaLeitForm.nivel),
                data: `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`,
                hora: `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`,
                foto: false,
                obs: gasNovaLeitForm.obs,
              }, ...prev]);
              setGasNovaLeitForm({ nivel:"", obs:"" });
              setGasNovaLeitModal(false);
            };

            return (
              <div style={{ padding:20 }}>

                {/* ── Cross-navigation tabs (Água / Gás / Energia) ── */}
                <div style={{ display:"flex", gap:6, marginBottom:22 }}>
                  {([["iot","💧","Água"],["gas","🔥","Gás"],["energia","⚡","Energia"]] as [string,string,string][]).map(([pid,icon,label]) => (
                    <button key={pid} onClick={()=>setPanel(pid as any)} style={{
                      background: panel===pid ? (pid==="gas"?"#F97316":pid==="iot"?"#3B82F6":"#6366F1") : "rgba(255,255,255,.05)",
                      border: panel===pid ? "none" : "1px solid rgba(255,255,255,.1)",
                      borderRadius:8, padding:"6px 16px", color: panel===pid?"#fff":"#64748B",
                      fontSize:12, fontWeight: panel===pid?700:400, cursor:"pointer",
                      display:"flex", alignItems:"center", gap:6,
                    }}>{icon} {label}</button>
                  ))}
                </div>

                {/* ── Header ── */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                  <div style={{ fontSize:20, fontWeight:800 }}>🔥 Leituras de Gás</div>
                  <button onClick={()=>setGasNovaLeitModal(true)} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 18px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                    + Nova Leitura
                  </button>
                </div>

                {/* ── KPI row ── */}
                <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
                  {[
                    { label:"Nível Atual",    val:`${nivelAtual}%`,   color:nivelColor(nivelAtual) },
                    { label:"Nível Mínimo",   val:`${nivelMin}%`,     color:"#EF4444" },
                    { label:"Nível Máximo",   val:`${nivelMax}%`,     color:"#10B981" },
                    { label:"Média Período",  val:`${nivelMedio}%`,   color:"#F97316" },
                    { label:"Total Leituras", val:`${gasLeituras.length}`, color:"#A5B4FC" },
                  ].map(k=>(
                    <div key={k.label} style={{ flex:1, minWidth:110, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>{k.label}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.val}</div>
                    </div>
                  ))}
                </div>

                {/* ── Chart ── */}
                <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"18px 20px", marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Histórico de Nível de Gás</div>
                  <div style={{ fontSize:11, color:"#475569", marginBottom:16 }}>Últimas {gasLeituras.length} leituras</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top:8, right:10, bottom:4, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:9, fill:"#475569" }} axisLine={false} tickLine={false}
                        tickFormatter={(v:string)=>v.slice(0,5)}
                        interval={Math.floor(chartData.length/3)}/>
                      <YAxis domain={[0,100]} tick={{ fontSize:9, fill:"#475569" }} axisLine={false} tickLine={false} width={30}
                        tickFormatter={(v:number)=>`${v}`}/>
                      <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }}
                        formatter={(v:number)=>[`${v}%`, "Nível"]}
                        labelFormatter={(l:string)=>l}/>
                      <Line type="monotone" dataKey="nivel" stroke="#F97316" strokeWidth={2.5}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          const isKey = payload.nivel <= nivelMin || payload.nivel >= nivelMax;
                          return isKey
                            ? <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill="#F97316" stroke="#0F172A" strokeWidth={2}/>
                            : <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={0} fill="none"/>;
                        }}
                        activeDot={{ r:6, fill:"#F97316", stroke:"#0F172A", strokeWidth:2 }}
                        name="Nível (%)"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Reading list ── */}
                <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,.06)", fontSize:13, fontWeight:700 }}>
                    Histórico de Leituras
                  </div>
                  {gasLeituras.map((l, i) => {
                    const nc = nivelColor(l.nivel);
                    return (
                      <div key={l.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px",
                        borderBottom: i < gasLeituras.length-1 ? "1px solid rgba(255,255,255,.04)" : "none",
                        background: l.nivel<20?"rgba(239,68,68,.03)":l.nivel<40?"rgba(245,158,11,.02)":"" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                          {/* Avatar circle */}
                          <div style={{ width:40, height:40, borderRadius:"50%", flexShrink:0,
                            background: l.nivel<20?"rgba(239,68,68,.2)":l.nivel<40?"rgba(245,158,11,.2)":"rgba(249,115,22,.2)",
                            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
                            🔥
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:nc }}>{l.nivel}% disponível</div>
                            <div style={{ fontSize:11, color:"#475569", marginTop:1 }}>
                              Nível: {l.nivel}% · {l.data} {l.hora}
                            </div>
                            {l.obs && <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{l.obs}</div>}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          {/* Level pill */}
                          <span style={{ background:`${nc}18`, color:nc, border:`1px solid ${nc}33`, borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700 }}>
                            {l.nivel<20?"Crítico":l.nivel<40?"Baixo":"Normal"}
                          </span>
                          {/* Photo icon */}
                          {l.foto && (
                            <div title="Foto anexada" style={{ width:32, height:32, borderRadius:6, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, cursor:"pointer" }}>
                              🖼️
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Nova leitura modal ── */}
                {gasNovaLeitModal && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setGasNovaLeitModal(false)}>
                    <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:28, width:400 }} onClick={e=>e.stopPropagation()}>
                      <div style={{ fontSize:16, fontWeight:700, marginBottom:18 }}>🔥 Nova Leitura de Gás</div>
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:5 }}>Nível do Botijão / Reservatório (%)</div>
                        <input type="number" min="0" max="100" value={gasNovaLeitForm.nivel}
                          onChange={e=>setGasNovaLeitForm(f=>({...f,nivel:e.target.value}))}
                          placeholder="0 – 100"
                          style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"10px 12px", color:"#fff", fontSize:14, fontWeight:700, boxSizing:"border-box" }}/>
                        {gasNovaLeitForm.nivel && (
                          <div style={{ marginTop:10 }}>
                            <div style={{ height:8, background:"rgba(255,255,255,.06)", borderRadius:4 }}>
                              <div style={{ width:`${Math.min(100,Number(gasNovaLeitForm.nivel))}%`, height:"100%", borderRadius:4, transition:"width .3s",
                                background: Number(gasNovaLeitForm.nivel)<20?"#EF4444":Number(gasNovaLeitForm.nivel)<40?"#F59E0B":"#10B981" }}/>
                            </div>
                            <div style={{ fontSize:11, color:nivelColor(Number(gasNovaLeitForm.nivel)), marginTop:4, fontWeight:600 }}>
                              {Number(gasNovaLeitForm.nivel)<20?"⚠️ Nível crítico — abastecer urgente":Number(gasNovaLeitForm.nivel)<40?"⚡ Nível baixo — programar abastecimento":"✅ Nível adequado"}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:5 }}>Observação (opcional)</div>
                        <input type="text" value={gasNovaLeitForm.obs}
                          onChange={e=>setGasNovaLeitForm(f=>({...f,obs:e.target.value}))}
                          placeholder="Ex: Após abastecimento"
                          style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:12, boxSizing:"border-box" }}/>
                      </div>
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                        <button onClick={()=>setGasNovaLeitModal(false)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 16px", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                        <button onClick={saveReading} style={{ background:"#F97316", border:"none", borderRadius:8, padding:"8px 22px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:700 }}>Registrar</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PANEL: ENERGIA */}
          {panel === "energia" && (() => {
            // ── Demo data ─────────────────────────────────────────────────────
            const consumoMensal2026 = [
              { mes:"Jan", kWh:950,  solar:4800 },
              { mes:"Fev", kWh:1050, solar:5200 },
              { mes:"Mar", kWh:1000, solar:5000 },
              { mes:"Abr", kWh:0,    solar:0 },
              { mes:"Mai", kWh:0,    solar:0 },
              { mes:"Jun", kWh:0,    solar:0 },
              { mes:"Jul", kWh:0,    solar:0 },
              { mes:"Ago", kWh:0,    solar:0 },
              { mes:"Set", kWh:0,    solar:0 },
              { mes:"Out", kWh:0,    solar:0 },
              { mes:"Nov", kWh:0,    solar:0 },
              { mes:"Dez", kWh:0,    solar:0 },
            ];
            const consumoMensal2025 = [
              { mes:"Jan", kWh:880,  solar:4100 },{ mes:"Fev", kWh:920,  solar:4500 },{ mes:"Mar", kWh:970,  solar:4800 },
              { mes:"Abr", kWh:1050, solar:4600 },{ mes:"Mai", kWh:1100, solar:4200 },{ mes:"Jun", kWh:1080, solar:3800 },
              { mes:"Jul", kWh:1150, solar:4100 },{ mes:"Ago", kWh:1200, solar:4600 },{ mes:"Set", kWh:1050, solar:4900 },
              { mes:"Out", kWh:990,  solar:5100 },{ mes:"Nov", kWh:920,  solar:5000 },{ mes:"Dez", kWh:860,  solar:4800 },
            ];
            const anoData = energiaAno === 2026 ? consumoMensal2026 : consumoMensal2025;
            const anoFiltrado = anoData.filter(m => m.kWh > 0);

            const totalConsumo = anoFiltrado.reduce((s, m) => s + m.kWh, 0);
            const totalSolar = anoFiltrado.reduce((s, m) => s + m.solar, 0);
            const tarifa = 0.89;
            const economia = Math.round(Math.min(totalConsumo, totalSolar) * tarifa * 0.067);
            // ── Equipment estimation — derivada do módulo Manutenção ──────────
            const equipConsumoRaw = equipList
              .filter(eq => eq.consumoKwh > 0)
              .map(eq => ({ nome: eq.nome, icone: eq.catIcon, kWhMes: Math.round(eq.consumoKwh * eq.horasDia * 30) }))
              .filter(eq => eq.kWhMes > 0)
              .sort((a, b) => b.kWhMes - a.kWhMes);
            const totalEquipKwh = equipConsumoRaw.reduce((s, e) => s + e.kWhMes, 0);
            const equipConsumo = equipConsumoRaw.map(eq => ({ ...eq, pct: totalEquipKwh > 0 ? Math.round((eq.kWhMes / totalEquipKwh) * 100) : 0 }));
            const estEquipMes = totalEquipKwh;

            // ── Status atual (última ocorrência) ──────────────────────────────
            const lastOc = energiaOcorrencias[0];
            const statusAtual = lastOc?.tipo === "retorno" ? "normal" : lastOc?.tipo || "—";
            const statusColor = { normal:"#10B981", queda:"#F59E0B", falta:"#EF4444", oscilacao:"#F97316" }[statusAtual] || "#475569";

            // ── Alertas inteligentes ──────────────────────────────────────────
            const alertas = [
              { nivel:"alto",   icone:"⚡", titulo:"Queda de energia detectada",          desc:"Última queda em 29/01/2026. Verificar infraestrutura elétrica do Bloco A.", acao:"Ver ocorrências" },
              { nivel:"medio",  icone:"📈", titulo:"Consumo acima da média em Março",      desc:"Mar/26 apresenta consumo 8% acima da média dos últimos 3 meses.", acao:"Ver consumo" },
              { nivel:"medio",  icone:"☀️", titulo:"Geração solar abaixo do esperado",     desc:"Fev/26: geração foi 7% menor que o projetado. Verificar painel para incrustação.", acao:"Ver solar" },
              { nivel:"baixo",  icone:"💡", titulo:"Oportunidade: shift de horário de pico",desc:"Mover cargas flexíveis (bomba piscina, irrigação) para fora do horário de ponta reduz 12% na fatura.", acao:"Ver gráficos" },
              { nivel:"baixo",  icone:"✅", titulo:"Meta de eficiência atingida em Janeiro", desc:"Jan/26 ficou 5% abaixo do consumo de Jan/25. Ótimo desempenho.", acao:null },
            ];

            const ocBadge: Record<string,{label:string;color:string;bg:string}> = {
              queda:     { label:"queda",           color:"#F59E0B", bg:"rgba(245,158,11,.15)" },
              falta:     { label:"Falta de Energia", color:"#EF4444", bg:"rgba(239,68,68,.15)" },
              retorno:   { label:"Energia OK",       color:"#10B981", bg:"rgba(16,185,129,.15)" },
              oscilacao: { label:"Oscilação",        color:"#F97316", bg:"rgba(249,115,22,.15)" },
            };

            const tabDef: [typeof energiaTab, string, string][] = [
              ["ocorrencias",   "⚡", "Ocorrências"],
              ["consumo",       "📊", "Consumo"],
              ["equipamentos",  "🖥️", "Est. Equipamentos"],
              ["solar",         "☀️", "Placa Solar"],
              ["graficos",      "📈", "Gráficos"],
              ["fornecedora",   "ℹ️", "Informações Fornecedora"],
              ["alertas",       "🔔", "Alertas Inteligentes"],
            ];

            const tabBtn = (id: typeof energiaTab, icon: string, label: string) => (
              <button key={id} onClick={() => setEnergiaTab(id)} style={{
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
                padding:"14px 12px", borderRadius:10, cursor:"pointer", minWidth:110, border:"none",
                background: energiaTab === id ? "#F59E0B" : "rgba(255,255,255,.03)",
                color: energiaTab === id ? "#0F172A" : "#64748B",
                fontWeight: energiaTab === id ? 800 : 500, fontSize:11, transition:"all .15s",
                outline: energiaTab !== id ? "1px solid rgba(255,255,255,.07)" : "none",
              }}>
                <span style={{ fontSize:22, color: energiaTab === id ? "#0F172A" : {
                  ocorrencias:"#F59E0B", consumo:"#06B6D4", equipamentos:"#06B6D4",
                  solar:"#EAB308", graficos:"#06B6D4", fornecedora:"#10B981", alertas:"#EF4444"
                }[id] }}>{icon}</span>
                <span style={{ textAlign:"center", lineHeight:1.3 }}>{label}</span>
              </button>
            );

            return (
              <div style={{ padding:20 }}>
                {/* ── Header ── */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, marginBottom:2 }}>⚡ Energia</div>
                    <div style={{ fontSize:12, color:"#475569" }}>Monitoramento de energia, consumo e geração solar</div>
                  </div>
                  <button onClick={() => window.print()} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"8px 16px", color:"#94A3B8", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                    📄 Gerar PDF
                  </button>
                </div>

                {/* ── KPI Cards ── */}
                <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
                  {[
                    { label:"Status Atual", val:statusAtual, icon:"⚠️", bg:"rgba(245,158,11,.1)", border:"rgba(245,158,11,.2)", valColor:statusColor },
                    { label:"Consumo Total (Ano)", val:`${totalConsumo.toLocaleString("pt-BR")} kWh`, icon:"⚡", bg:"rgba(99,102,241,.08)", border:"rgba(99,102,241,.2)", valColor:"#fff" },
                    { label:"Geração Solar (Ano)", val:`${totalSolar.toLocaleString("pt-BR")} kWh`, icon:"☀️", bg:"rgba(16,185,129,.08)", border:"rgba(16,185,129,.2)", valColor:"#fff" },
                    { label:"Economia (Ano)", val:`R$ ${economia.toLocaleString("pt-BR")},00`, icon:"💜", bg:"rgba(168,85,247,.08)", border:"rgba(168,85,247,.2)", valColor:"#fff" },
                    { label:"Est. Equipamentos (Mês)", val:`${estEquipMes.toLocaleString("pt-BR")} kWh`, icon:"🖥️", bg:"rgba(6,182,212,.08)", border:"rgba(6,182,212,.2)", valColor:"#fff" },
                  ].map(k => (
                    <div key={k.label} style={{ flex:1, minWidth:150, background:k.bg, border:`1px solid ${k.border}`, borderRadius:12, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontSize:10, color:"#475569", marginBottom:6 }}>{k.label}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:k.valColor }}>{k.val}</div>
                      </div>
                      <div style={{ fontSize:24, opacity:0.7 }}>{k.icon}</div>
                    </div>
                  ))}
                </div>

                {/* ── Year selector ── */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
                  <span style={{ fontSize:12, color:"#475569" }}>Ano:</span>
                  <select value={energiaAno} onChange={e=>setEnergiaAno(Number(e.target.value))} style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"5px 12px", color:"#E2E8F0", fontSize:12 }}>
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>

                {/* ── Tab bar ── */}
                <div style={{ display:"flex", gap:8, marginBottom:20, overflowX:"auto", paddingBottom:4 }}>
                  {tabDef.map(([id, icon, label]) => tabBtn(id, icon, label))}
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    ABA: OCORRÊNCIAS
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "ocorrencias" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
                      <button onClick={()=>setEnergiaRegModal(true)} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                        + Registrar Ocorrência
                      </button>
                    </div>

                    {/* Modal Registrar */}
                    {energiaRegModal && (
                      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setEnergiaRegModal(false)}>
                        <div style={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:28, width:440 }} onClick={e=>e.stopPropagation()}>
                          <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>📝 Registrar Ocorrência</div>
                          {[["Título", "text", "titulo", "Ex: queda de energia Bloco B"],["Observações", "text", "obs", "Descreva a ocorrência..."]].map(([label, type, field, ph]) => (
                            <div key={field} style={{ marginBottom:12 }}>
                              <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>{label}</div>
                              <input type={type} value={(energiaRegForm as any)[field]} onChange={e=>setEnergiaRegForm(f=>({...f,[field]:e.target.value}))}
                                placeholder={ph} style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:12, boxSizing:"border-box" }}/>
                            </div>
                          ))}
                          <div style={{ marginBottom:16 }}>
                            <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>Tipo</div>
                            <select value={energiaRegForm.tipo} onChange={e=>setEnergiaRegForm(f=>({...f,tipo:e.target.value}))} style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", color:"#E2E8F0", fontSize:12, width:"100%" }}>
                              <option value="queda">Queda</option>
                              <option value="falta">Falta de energia</option>
                              <option value="retorno">Retorno / Energia OK</option>
                              <option value="oscilacao">Oscilação</option>
                            </select>
                          </div>
                          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                            <button onClick={()=>setEnergiaRegModal(false)} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"8px 16px", color:"#94A3B8", fontSize:12, cursor:"pointer" }}>Cancelar</button>
                            <button onClick={()=>{
                              if (!energiaRegForm.titulo.trim()) return;
                              const now = new Date();
                              const nova = { id:`oc${Date.now()}`, titulo:energiaRegForm.titulo, tipo:energiaRegForm.tipo, obs:energiaRegForm.obs,
                                data:`${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`,
                                hora:`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`,
                              };
                              setEnergiaOcorrencias(prev=>[nova,...prev]);
                              setEnergiaRegForm({ titulo:"", tipo:"queda", obs:"" });
                              setEnergiaRegModal(false);
                            }} style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>Salvar</button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, overflow:"hidden" }}>
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,.06)", fontSize:12, fontWeight:600, color:"#94A3B8", display:"flex", alignItems:"center", gap:6 }}>
                        🕐 Histórico de Ocorrências <span style={{ color:"#334155", fontWeight:400 }}>({energiaOcorrencias.length})</span>
                      </div>
                      {energiaOcorrencias.map((oc, i) => {
                        const b = ocBadge[oc.tipo] || { label:oc.tipo, color:"#94A3B8", bg:"rgba(255,255,255,.06)" };
                        const isQueda = oc.tipo === "queda" || oc.tipo === "falta";
                        return (
                          <div key={oc.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom: i < energiaOcorrencias.length-1 ? "1px solid rgba(255,255,255,.04)" : "none", background: oc.tipo==="queda"?"rgba(245,158,11,.03)":oc.tipo==="falta"?"rgba(239,68,68,.03)":"" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ width:32, height:32, borderRadius:"50%", background:isQueda?"rgba(245,158,11,.12)":"rgba(16,185,129,.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>
                                {oc.tipo==="retorno"?"✅":oc.tipo==="queda"?"⚡":oc.tipo==="falta"?"⚠️":"〰️"}
                              </div>
                              <div>
                                <div style={{ fontSize:13, fontWeight:600 }}>{oc.titulo}</div>
                                <div style={{ fontSize:11, color:"#475569", marginTop:1 }}>{oc.data}, {oc.hora}</div>
                                {oc.obs && <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{oc.obs}</div>}
                              </div>
                            </div>
                            <span style={{ background:b.bg, color:b.color, border:`1px solid ${b.color}33`, borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{b.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    ABA: CONSUMO
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "consumo" && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                      {[
                        { label:"Total Consumido",  val:`${totalConsumo.toLocaleString("pt-BR")} kWh`, sub:`${anoFiltrado.length} meses`, color:"#06B6D4" },
                        { label:"Média Mensal",      val:`${anoFiltrado.length?Math.round(totalConsumo/anoFiltrado.length).toLocaleString("pt-BR"):0} kWh`, sub:"por mês", color:"#A5B4FC" },
                        { label:"Custo Estimado",    val:`R$ ${Math.round(totalConsumo*tarifa).toLocaleString("pt-BR")}`, sub:`@ R$ ${tarifa}/kWh`, color:"#F59E0B" },
                      ].map(k => (
                        <div key={k.label} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"12px 16px" }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>{k.label}</div>
                          <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.val}</div>
                          <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{k.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:11, color:"#475569", marginBottom:10, fontWeight:600 }}>📊 CONSUMO MENSAL (kWh) — {energiaAno}</div>
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px" }}>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={anoData} margin={{ top:4, right:10, bottom:4, left:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
                          <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} width={45} tickFormatter={(v:number)=>v?`${v}`:""}/>
                          <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} formatter={(v:number)=>[`${v.toLocaleString("pt-BR")} kWh`,"Consumo"]}/>
                          <Bar dataKey="kWh" fill="#6366F1" radius={[4,4,0,0]} name="Consumo (kWh)"/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop:14, display:"flex", gap:8, flexWrap:"wrap" }}>
                      {anoData.filter(m=>m.kWh>0).map(m=>(
                        <div key={m.mes} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:"8px 12px", textAlign:"center", minWidth:60 }}>
                          <div style={{ fontSize:10, color:"#475569" }}>{m.mes}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#6366F1", marginTop:2 }}>{m.kWh.toLocaleString("pt-BR")}</div>
                          <div style={{ fontSize:9, color:"#334155" }}>kWh</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    ABA: EST. EQUIPAMENTOS
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "equipamentos" && (
                  <div>
                    {/* Origem dos dados */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, padding:"8px 12px", background:"rgba(99,102,241,.07)", border:"1px solid rgba(99,102,241,.2)", borderRadius:8 }}>
                      <span style={{ fontSize:14 }}>🔧</span>
                      <span style={{ fontSize:11, color:"#A5B4FC" }}>Dados calculados a partir do <strong>cadastro de equipamentos</strong> do Módulo Manutenção · consumo × horas/dia × 30 dias</span>
                      <button onClick={() => setPanel("manutencao")} style={{ marginLeft:"auto", background:"rgba(99,102,241,.2)", border:"1px solid rgba(99,102,241,.35)", borderRadius:6, padding:"4px 10px", color:"#A5B4FC", fontSize:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" as const }}>Ver equipamentos →</button>
                    </div>

                    {equipConsumo.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:"#475569" }}>
                        <div style={{ fontSize:32, marginBottom:10 }}>🔌</div>
                        <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Nenhum equipamento com consumo cadastrado</div>
                        <div style={{ fontSize:12, marginBottom:16 }}>Cadastre equipamentos com <strong>consumo (kWh)</strong> e <strong>horas/dia</strong> no Módulo Manutenção para ver a estimativa aqui.</div>
                        <button onClick={() => setPanel("manutencao")} style={{ background:"rgba(99,102,241,.2)", border:"1px solid rgba(99,102,241,.35)", borderRadius:8, padding:"8px 18px", color:"#A5B4FC", fontSize:12, fontWeight:700, cursor:"pointer" }}>🔧 Ir para Manutenção</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                          <div style={{ background:"rgba(6,182,212,.08)", border:"1px solid rgba(6,182,212,.2)", borderRadius:12, padding:"14px 18px" }}>
                            <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>Est. Total Mensal</div>
                            <div style={{ fontSize:24, fontWeight:800, color:"#06B6D4" }}>{totalEquipKwh.toLocaleString("pt-BR")} kWh</div>
                            <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{equipConsumo.length} equipamento{equipConsumo.length !== 1 ? "s" : ""} com consumo</div>
                          </div>
                          <div style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.2)", borderRadius:12, padding:"14px 18px" }}>
                            <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>Custo Estimado Mensal</div>
                            <div style={{ fontSize:24, fontWeight:800, color:"#F59E0B" }}>R$ {Math.round(totalEquipKwh * tarifa).toLocaleString("pt-BR")}</div>
                            <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>@ R$ {tarifa}/kWh</div>
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {equipConsumo.map(eq => (
                            <div key={eq.nome} style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"12px 16px" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <span style={{ fontSize:18 }}>{eq.icone}</span>
                                  <div>
                                    <div style={{ fontSize:13, fontWeight:600 }}>{eq.nome}</div>
                                    <div style={{ fontSize:10, color:"#475569" }}>R$ {Math.round(eq.kWhMes * tarifa).toLocaleString("pt-BR")}/mês</div>
                                  </div>
                                </div>
                                <div style={{ textAlign:"right" as const }}>
                                  <div style={{ fontSize:16, fontWeight:800, color:"#06B6D4" }}>{eq.kWhMes.toLocaleString("pt-BR")}</div>
                                  <div style={{ fontSize:9, color:"#475569" }}>kWh/mês</div>
                                </div>
                              </div>
                              <div style={{ height:6, background:"rgba(255,255,255,.06)", borderRadius:3 }}>
                                <div style={{ width:`${eq.pct}%`, height:"100%", background:`hsl(${220 - eq.pct * 1.5},70%,60%)`, borderRadius:3 }}/>
                              </div>
                              <div style={{ fontSize:9, color:"#475569", marginTop:3 }}>{eq.pct}% do total estimado</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    ABA: PLACA SOLAR
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "solar" && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                      {[
                        { label:"Geração (Ano)", val:`${totalSolar.toLocaleString("pt-BR")} kWh`, color:"#EAB308" },
                        { label:"Potência Instalada", val:"72 kWp", color:"#10B981" },
                        { label:"Painéis", val:"180 un.", color:"#A5B4FC" },
                        { label:"Eficiência Média", val:"94%", color:"#06B6D4" },
                      ].map(k => (
                        <div key={k.label} style={{ background:"rgba(234,179,8,.06)", border:"1px solid rgba(234,179,8,.15)", borderRadius:12, padding:"12px 16px" }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>{k.label}</div>
                          <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{k.val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
                      {/* Geração mensal chart */}
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:10, fontWeight:600 }}>☀️ GERAÇÃO SOLAR MENSAL (kWh)</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={anoData} margin={{ top:4, right:4, bottom:4, left:0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
                            <XAxis dataKey="mes" tick={{ fontSize:9, fill:"#475569" }} axisLine={false} tickLine={false}/>
                            <YAxis tick={{ fontSize:9, fill:"#475569" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v:number)=>v?`${(v/1000).toFixed(1)}k`:""}/>
                            <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} formatter={(v:number)=>[`${v.toLocaleString("pt-BR")} kWh`,"Geração"]}/>
                            <Bar dataKey="solar" fill="#EAB308" radius={[4,4,0,0]} name="Geração Solar"/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Info painéis */}
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:12, fontWeight:600 }}>🔧 ESPECIFICAÇÕES DO SISTEMA</div>
                        {[
                          ["Fabricante Inversor", "Fronius Symo 72kW"],
                          ["Fabricante Painel", "Canadian Solar 400W"],
                          ["Data instalação", "Abril/2022"],
                          ["Orientação", "Norte / Noroeste"],
                          ["Inclinação", "15°"],
                          ["Tensão CC", "800V"],
                          ["Garantia painel", "25 anos (produção)"],
                          ["Última vistoria", "Jan/2026"],
                          ["Próxima vistoria", "Jul/2026"],
                          ["Conexão rede", "Net metering (CELESC)"],
                        ].map(([l,v]) => (
                          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:11 }}>
                            <span style={{ color:"#475569" }}>{l}</span>
                            <span style={{ color:"#E2E8F0", fontWeight:600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Créditos de energia */}
                    <div style={{ background:"rgba(234,179,8,.06)", border:"1px solid rgba(234,179,8,.15)", borderRadius:12, padding:"14px 16px" }}>
                      <div style={{ fontSize:11, color:"#EAB308", fontWeight:700, marginBottom:8 }}>💡 CRÉDITOS DE ENERGIA — NET METERING</div>
                      <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                        {[
                          { label:"Créditos acumulados", val:"8.340 kWh" },
                          { label:"Validade créditos", val:"60 meses" },
                          { label:"Economia acumulada", val:`R$ ${Math.round(totalSolar*tarifa*0.067).toLocaleString("pt-BR")}` },
                          { label:"Redução na fatura", val:"~23% ao mês" },
                        ].map(k => (
                          <div key={k.label} style={{ flex:1, minWidth:140 }}>
                            <div style={{ fontSize:10, color:"#475569", marginBottom:2 }}>{k.label}</div>
                            <div style={{ fontSize:16, fontWeight:800, color:"#EAB308" }}>{k.val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    ABA: GRÁFICOS
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "graficos" && (
                  <div>
                    <div style={{ fontSize:11, color:"#475569", marginBottom:10, fontWeight:600 }}>📊 CONSUMO vs GERAÇÃO SOLAR — {energiaAno}</div>
                    <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px", marginBottom:16 }}>
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={anoData} margin={{ top:4, right:10, bottom:4, left:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)"/>
                          <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v:number)=>v?`${(v/1000).toFixed(1)}k`:""}/>
                          <Tooltip contentStyle={{ background:"#0F172A", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }} formatter={(v:number)=>[`${v.toLocaleString("pt-BR")} kWh`]}/>
                          <Legend wrapperStyle={{ fontSize:10 }}/>
                          <Line type="monotone" dataKey="kWh" stroke="#6366F1" strokeWidth={2} dot={{ r:4 }} name="Consumo (kWh)"/>
                          <Line type="monotone" dataKey="solar" stroke="#EAB308" strokeWidth={2} dot={{ r:4 }} name="Geração Solar (kWh)"/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {/* Distribuição horária */}
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:10, fontWeight:600 }}>🕐 DISTRIBUIÇÃO HORÁRIA TÍPICA</div>
                        {[
                          { periodo:"Ponta (18h–21h)", pct:28, color:"#EF4444" },
                          { periodo:"Fora Ponta (06h–18h)", pct:55, color:"#10B981" },
                          { periodo:"Noturno (21h–06h)", pct:17, color:"#475569" },
                        ].map(p => (
                          <div key={p.periodo} style={{ marginBottom:10 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:11 }}>
                              <span style={{ color:"#94A3B8" }}>{p.periodo}</span>
                              <span style={{ color:p.color, fontWeight:700 }}>{p.pct}%</span>
                            </div>
                            <div style={{ height:6, background:"rgba(255,255,255,.06)", borderRadius:3 }}>
                              <div style={{ width:`${p.pct}%`, height:"100%", background:p.color, borderRadius:3 }}/>
                            </div>
                          </div>
                        ))}
                        <div style={{ fontSize:10, color:"#334155", marginTop:8 }}>💡 Dica: Mover cargas para fora do horário de ponta reduz até 12% na fatura.</div>
                      </div>

                      {/* Comparativo anual */}
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:10, fontWeight:600 }}>📅 COMPARATIVO {energiaAno} vs {energiaAno-1}</div>
                        {(energiaAno === 2026 ? [
                          ["Jan", 950, 880], ["Fev", 1050, 920], ["Mar", 1000, 970]
                        ] : [
                          ["Jan", 880, 820], ["Fev", 920, 870], ["Mar", 970, 910],
                          ["Abr", 1050, 990], ["Mai", 1100, 1040], ["Jun", 1080, 1020],
                        ]).map(([mes, cur, prev]) => (
                          <div key={mes as string} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, fontSize:11 }}>
                            <span style={{ color:"#475569", width:30 }}>{mes}</span>
                            <div style={{ flex:1, height:6, background:"rgba(255,255,255,.04)", borderRadius:3, position:"relative" }}>
                              <div style={{ position:"absolute", height:"100%", width:`${Math.round((prev as number)/12)}%`, background:"rgba(100,116,139,.4)", borderRadius:3 }}/>
                              <div style={{ position:"absolute", height:"100%", width:`${Math.round((cur as number)/12)}%`, background:"#6366F1", borderRadius:3, opacity:0.8 }}/>
                            </div>
                            <span style={{ color:(cur as number)>(prev as number)?"#EF4444":"#10B981", fontWeight:600, fontSize:10, width:50, textAlign:"right" }}>
                              {(cur as number)>(prev as number)?"+":"-"}{Math.abs(Math.round(((cur as number)-(prev as number))/(prev as number)*100))}%
                            </span>
                          </div>
                        ))}
                        <div style={{ fontSize:10, color:"#334155", marginTop:8 }}>🟣 {energiaAno} &nbsp; ░ {energiaAno-1}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    ABA: INFORMAÇÕES FORNECEDORA
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "fornecedora" && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#10B981", marginBottom:14 }}>🏢 DADOS DA CONCESSIONÁRIA</div>
                        {[
                          ["Nome", "CELESC Distribuição S.A."],
                          ["CNPJ", "08.336.783/0001-90"],
                          ["Agência", "Florianópolis Centro"],
                          ["Telefone", "0800 048 0196"],
                          ["Site", "celesc.com.br"],
                          ["Emergências", "197 (24h)"],
                        ].map(([l,v]) => (
                          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                            <span style={{ color:"#475569" }}>{l}</span>
                            <span style={{ color:"#E2E8F0", fontWeight:600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"16px 20px" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#A5B4FC", marginBottom:14 }}>📋 CONTRATO E TARIFAS</div>
                        {[
                          ["Classe", "Comercial B3"],
                          ["Tensão fornecimento", "220V / 380V"],
                          ["Demanda contratada", "50 kW"],
                          ["Tarifa ponta", "R$ 0,89/kWh"],
                          ["Tarifa fora ponta", "R$ 0,67/kWh"],
                          ["Tarifa TUSD", "R$ 0,31/kWh"],
                          ["Nº Medidor", "MEL-4921-873"],
                          ["Leitura atual", "3.847 kWh"],
                          ["Próx. leitura", "15/04/2026"],
                          ["Vencimento fatura", "Todo dia 10"],
                        ].map(([l,v]) => (
                          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                            <span style={{ color:"#475569" }}>{l}</span>
                            <span style={{ color:"#E2E8F0", fontWeight:600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.2)", borderRadius:12, padding:"14px 18px", marginTop:16 }}>
                      <div style={{ fontSize:11, color:"#10B981", fontWeight:700, marginBottom:8 }}>📊 HISTÓRICO DE FATURAS — {energiaAno}</div>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                        {anoData.filter(m=>m.kWh>0).map(m=>(
                          <div key={m.mes} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:"10px 14px", minWidth:100 }}>
                            <div style={{ fontSize:10, color:"#475569" }}>{m.mes}/{energiaAno}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:"#10B981", marginTop:2 }}>R$ {Math.round(m.kWh*tarifa).toLocaleString("pt-BR")}</div>
                            <div style={{ fontSize:10, color:"#334155" }}>{m.kWh} kWh</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    ABA: ALERTAS INTELIGENTES
                ═══════════════════════════════════════════════════════════ */}
                {energiaTab === "alertas" && (
                  <div>
                    <div style={{ fontSize:12, color:"#475569", marginBottom:16 }}>Alertas gerados automaticamente com base no histórico de consumo, geração solar e padrões detectados.</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {alertas.map((a, i) => {
                        const nc = { alto:"#EF4444", medio:"#F59E0B", baixo:"#10B981" }[a.nivel] || "#475569";
                        return (
                          <div key={i} style={{ background:"rgba(255,255,255,.02)", border:`1px solid ${nc}22`, borderRadius:12, padding:"14px 18px", display:"flex", gap:14, alignItems:"flex-start" }}>
                            <div style={{ width:40, height:40, borderRadius:"50%", background:`${nc}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                              {a.icone}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                                <div style={{ fontSize:13, fontWeight:700 }}>{a.titulo}</div>
                                <span style={{ background:`${nc}18`, color:nc, border:`1px solid ${nc}33`, borderRadius:12, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{a.nivel}</span>
                              </div>
                              <div style={{ fontSize:12, color:"#64748B", lineHeight:1.5 }}>{a.desc}</div>
                              {a.acao && (
                                <div style={{ marginTop:8 }}>
                                  <span style={{ fontSize:11, color:"#6366F1", cursor:"pointer", textDecoration:"underline" }} onClick={()=>{
                                    const m: Record<string,"ocorrencias"|"consumo"|"equipamentos"|"solar"|"graficos"|"fornecedora"|"alertas"> = { "Ver ocorrências":"ocorrencias","Ver consumo":"consumo","Ver solar":"solar","Ver gráficos":"graficos" };
                                    if (m[a.acao]) setEnergiaTab(m[a.acao]);
                                  }}>{a.acao} →</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PANEL: ENCOMENDAS */}
          {panel === "encomendas" && (() => {
            const ENC_STATUS: Record<Encomenda["status"], { label: string; color: string; bg: string }> = {
              aguardando_retirada: { label:"AGUARDANDO RETIRADA", color:"#F59E0B", bg:"rgba(245,158,11,.18)" },
              notificado:          { label:"NOTIFICADO",          color:"#3B82F6", bg:"rgba(59,130,246,.18)" },
              retirado:            { label:"RETIRADO",            color:"#10B981", bg:"rgba(16,185,129,.18)" },
              devolvido:           { label:"DEVOLVIDO",           color:"#EF4444", bg:"rgba(239,68,68,.18)" },
            };
            const totais = { total: encList.length, aguardando: encList.filter(e=>e.status==="aguardando_retirada").length, notificado: encList.filter(e=>e.status==="notificado").length, retirado: encList.filter(e=>e.status==="retirado").length, devolvido: encList.filter(e=>e.status==="devolvido").length };
            const tmMedio = (() => {
              const retirados = encList.filter(e=>e.status==="retirado"&&e.withdrawn_at);
              if (!retirados.length) return "N/A";
              const avg = retirados.reduce((s,e)=>s+(new Date(e.withdrawn_at!).getTime()-new Date(e.received_at).getTime()),0)/retirados.length;
              return Math.round(avg/3600000)+"h";
            })();
            const filtered = encList.filter(e =>
              (encFilter === "todos" || e.status === encFilter) &&
              (!encSearch.trim() || [e.morador_nome, e.unidade, e.bloco, e.codigo_rastreio||""].some(v=>v.toLowerCase().includes(encSearch.toLowerCase())))
            );
            const fmtEncDate = (iso?: string|null) => iso ? new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "–";
            return (
              <div className="panel" style={{ display:"flex", flexDirection:"column", height:"100%", gap:0 }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"18px 24px 14px", borderBottom:"1px solid var(--c-divider)", flexShrink:0 }}>
                  <div style={{ fontSize:28 }}>📦</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:18, fontWeight:700 }}>Encomendas</div>
                    <div style={{ fontSize:12, color:"var(--c-text-muted)" }}>Gerencie as encomendas e entregas do condomínio</div>
                  </div>
                  <button onClick={() => { setEncShowForm(!encShowForm); setEncEditId(null); setEncForm({morador_nome:"",bloco:"",unidade:"",tipos:["pacote"],codigo_rastreio:""}); }} style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,background:"var(--indigo)",border:"none",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer" }}>
                    ＋ Nova Encomenda
                  </button>
                </div>

                {/* Form modal */}
                {encShowForm && (
                  <div style={{ padding:"16px 24px", background:"rgba(99,102,241,.07)", borderBottom:"1px solid var(--c-divider)", flexShrink:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>{encEditId ? "✏️ Editar Encomenda" : "＋ Registrar Nova Encomenda"}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:10, marginBottom:12 }}>
                      {[["Morador","morador_nome","text"],["Bloco","bloco","text"],["Unidade","unidade","text"],["Cód. Rastreio","codigo_rastreio","text"]].map(([lbl,field]) => (
                        <div key={field}>
                          <div style={{ fontSize:11, color:"var(--c-text-muted)", marginBottom:4 }}>{lbl}</div>
                          <input value={(encForm as Record<string,string|string[]>)[field] as string} onChange={e => setEncForm(f=>({...f,[field]:e.target.value}))} style={{ width:"100%",padding:"7px 10px",background:"var(--c-input)",border:"1px solid var(--c-input-border)",borderRadius:7,color:"var(--c-text)",fontSize:13 }} placeholder={lbl as string}/>
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize:11, color:"var(--c-text-muted)", marginBottom:4 }}>Tipos</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {["pacote","correio","documento","fragil"].map(t => (
                            <label key={t} style={{ display:"flex",alignItems:"center",gap:4,fontSize:12,cursor:"pointer",color:encForm.tipos.includes(t)?"var(--indigo)":"var(--c-text-muted)" }}>
                              <input type="checkbox" checked={encForm.tipos.includes(t)} onChange={e => setEncForm(f=>({...f,tipos:e.target.checked?[...f.tipos,t]:f.tipos.filter(x=>x!==t)}))} style={{ accentColor:"var(--indigo)" }}/>{t}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={encCreate} style={{ padding:"8px 18px",borderRadius:7,background:"var(--indigo)",border:"none",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer" }}>Salvar</button>
                      <button onClick={() => setEncShowForm(false)} style={{ padding:"8px 18px",borderRadius:7,background:"transparent",border:"1px solid var(--c-divider)",color:"var(--c-text-muted)",fontSize:13,cursor:"pointer" }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* KPI Cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, padding:"14px 24px", flexShrink:0 }}>
                  {[
                    { label:"Total", val:totais.total, color:"#6366F1" },
                    { label:"Aguardando", val:totais.aguardando, color:"#F59E0B" },
                    { label:"Notificados", val:totais.notificado, color:"#3B82F6" },
                    { label:"Retirados", val:totais.retirado, color:"#10B981" },
                    { label:"Devolvidos", val:totais.devolvido, color:"#EF4444" },
                    { label:"Tempo Médio", val:tmMedio, color:"#A855F7" },
                  ].map(k => (
                    <div key={k.label} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"14px 16px" }}>
                      <div style={{ fontSize:28, fontWeight:900, color:k.color }}>{k.val}</div>
                      <div style={{ fontSize:11, color:"var(--c-text-muted)", marginTop:4, textTransform:"uppercase" as const, letterSpacing:".06em" }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Filter tabs + search */}
                <div style={{ padding:"0 24px 12px", flexShrink:0 }}>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, marginBottom:10 }}>
                    {([["todos","Todos",totais.total],["aguardando_retirada","Aguardando",totais.aguardando],["notificado","Notificado",totais.notificado],["retirado","Retirado",totais.retirado],["devolvido","Devolvido",totais.devolvido]] as [string,string,number][]).map(([v,lbl,cnt]) => (
                      <button key={v} onClick={() => setEncFilter(v as typeof encFilter)} style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,border:`1px solid ${encFilter===v?"var(--indigo)":"var(--c-divider)"}`,background:encFilter===v?"rgba(99,102,241,.15)":"transparent",color:encFilter===v?"var(--indigo)":"var(--c-text-muted)",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                        {lbl} <span style={{ background:encFilter===v?"var(--indigo)":"rgba(255,255,255,.1)",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11 }}>{cnt}</span>
                      </button>
                    ))}
                  </div>
                  <input value={encSearch} onChange={e=>setEncSearch(e.target.value)} placeholder="🔍 Buscar por unidade, nome, código..." style={{ width:"100%",padding:"9px 14px",background:"var(--c-input)",border:"1px solid var(--c-input-border)",borderRadius:9,color:"var(--c-text)",fontSize:13 }}/>
                </div>

                {/* Alert banner */}
                {totais.aguardando > 0 && (
                  <div style={{ margin:"0 24px 12px", padding:"12px 16px", background:"rgba(245,158,11,.12)", border:"1px solid rgba(245,158,11,.25)", borderRadius:10, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
                    <span style={{ fontSize:20 }}>🔔</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#FCD34D" }}>{totais.aguardando} encomenda(s) aguardando retirada</div>
                      <div style={{ fontSize:11, color:"#F59E0B" }}>Notifique os moradores para retirada</div>
                    </div>
                    <button onClick={() => encList.filter(e=>e.status==="aguardando_retirada").forEach(e=>encUpdateStatus(e.id,"notificado"))} style={{ padding:"6px 14px",borderRadius:7,background:"rgba(245,158,11,.25)",border:"1px solid rgba(245,158,11,.4)",color:"#FCD34D",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                      🔔 Notificar Todos
                    </button>
                  </div>
                )}

                {/* Cards grid */}
                <div style={{ flex:1, overflowY:"auto", padding:"0 24px 24px" }}>
                  {filtered.length === 0 && (
                    <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--c-text-muted)" }}>
                      <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                      <div style={{ fontSize:15, fontWeight:600 }}>Nenhuma encomenda encontrada</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Tente ajustar os filtros ou adicione uma nova encomenda</div>
                    </div>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
                    {filtered.map(enc => {
                      const st = ENC_STATUS[enc.status];
                      const borderColor = enc.status==="aguardando_retirada" ? "rgba(245,158,11,.35)" : enc.status==="notificado" ? "rgba(59,130,246,.35)" : enc.status==="retirado" ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)";
                      return (
                        <div key={enc.id} style={{ background:"rgba(255,255,255,.04)", border:`1px solid ${borderColor}`, borderRadius:14, padding:"16px", position:"relative" }}>
                          {/* Header row */}
                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:36,height:36,borderRadius:10,background:st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:st.color }}>
                                {enc.morador_nome.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700 }}>{enc.morador_nome}</div>
                                <div style={{ fontSize:11, color:"var(--c-text-muted)" }}>📍 {enc.bloco} · Unidade {enc.unidade}</div>
                              </div>
                            </div>
                            <span style={{ padding:"3px 9px",borderRadius:6,background:st.bg,color:st.color,fontSize:10,fontWeight:800,letterSpacing:".04em" }}>{st.label}</span>
                          </div>
                          {/* Tags */}
                          <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5, marginBottom:10 }}>
                            {enc.tipos.map(t => <span key={t} style={{ padding:"2px 8px",borderRadius:6,background:"rgba(255,255,255,.06)",fontSize:11,color:"var(--c-text-muted)" }}>{t==="pacote"?"📦":t==="correio"?"✉️":t==="documento"?"📄":"⚠️"} {t}</span>)}
                            {enc.codigo_rastreio && <span style={{ padding:"2px 8px",borderRadius:6,background:"rgba(239,68,68,.12)",color:"#F87171",fontSize:11,fontWeight:700 }}>🏷️ {enc.codigo_rastreio}</span>}
                          </div>
                          {/* Date */}
                          <div style={{ fontSize:11, color:"var(--c-text-muted)", marginBottom:12 }}>🕐 Recebido em {fmtEncDate(enc.received_at)}</div>
                          {/* Actions */}
                          <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                            {enc.status === "aguardando_retirada" && <>
                              <button title="Registrar notificação ao morador sobre a encomenda" onClick={()=>encUpdateStatus(enc.id,"notificado")} style={{ padding:"5px 12px",borderRadius:7,background:"rgba(59,130,246,.15)",border:"1px solid rgba(59,130,246,.3)",color:"#60A5FA",fontSize:11,fontWeight:700,cursor:"pointer" }}>🔔 Notificar</button>
                              <button title="Confirmar retirada direta sem notificação" onClick={()=>encUpdateStatus(enc.id,"retirado")} style={{ padding:"5px 12px",borderRadius:7,background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",color:"#34D399",fontSize:11,fontWeight:700,cursor:"pointer" }}>✅ Retirar</button>
                              <button title="Registrar devolução ao remetente" onClick={()=>encUpdateStatus(enc.id,"devolvido")} style={{ padding:"5px 12px",borderRadius:7,background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.25)",color:"#F87171",fontSize:11,fontWeight:700,cursor:"pointer" }}>↩️ Devolver</button>
                            </>}
                            {enc.status === "notificado" && <>
                              <button title="Confirmar que o morador retirou a encomenda" onClick={()=>encUpdateStatus(enc.id,"retirado")} style={{ padding:"5px 12px",borderRadius:7,background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",color:"#34D399",fontSize:11,fontWeight:700,cursor:"pointer" }}>✅ Retirar</button>
                              <button title="Marcar encomenda como devolvida ao remetente" onClick={()=>encUpdateStatus(enc.id,"devolvido")} style={{ padding:"5px 12px",borderRadius:7,background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.25)",color:"#F87171",fontSize:11,fontWeight:700,cursor:"pointer" }}>↩️ Devolver</button>
                            </>}
                            <button title="Excluir registro desta encomenda" onClick={()=>encDelete(enc.id)} style={{ padding:"5px 12px",borderRadius:7,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:"#F87171",fontSize:11,fontWeight:700,cursor:"pointer",marginLeft:"auto" }}>🗑️ Excluir</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* PANEL: FORNECEDORES E CONTATOS */}
          {panel === "fornecedores" && (() => {
            const filteredFornec = fornecList.filter(f => {
              const matchSearch = !fornecSearch || f.nome.toLowerCase().includes(fornecSearch.toLowerCase()) || (f.email||"").toLowerCase().includes(fornecSearch.toLowerCase()) || (f.telefone||"").includes(fornecSearch);
              const matchCat = fornecCatFilter === "todas" || f.categoria === fornecCatFilter;
              return matchSearch && matchCat;
            });
            const catCounts = FORNEC_CATEGORIAS.reduce((acc,c) => ({ ...acc, [c]: fornecList.filter(f=>f.categoria===c).length }), {} as Record<string,number>);
            return (
            <div style={{ padding:"24px 28px", height:"100%", overflowY:"auto" }}>
              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
                <button onClick={()=>setPanel("sv-chat")} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18, padding:0 }}>←</button>
                <div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#E2E8F0" }}>Fornecedores e Contatos</div>
                  <div style={{ fontSize:12, color:"#475569" }}>Cadastro de fornecedores, prestadores de serviço e contatos</div>
                </div>
                <button onClick={()=>{ setFornecModal(true); setFornecEditId(null); setFornecForm(emptyFornec()); }}
                  style={{ marginLeft:"auto", background:"linear-gradient(135deg,#7C5CFC,#A78BFA)", border:"none", borderRadius:10, padding:"9px 18px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                  + Novo Fornecedor
                </button>
              </div>

              {/* Search + filter row */}
              <div style={{ display:"flex", gap:10, margin:"16px 0" }}>
                <div style={{ flex:1, position:"relative" }}>
                  <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#475569" }}>🔍</span>
                  <input value={fornecSearch} onChange={e=>setFornecSearch(e.target.value)}
                    placeholder="Buscar fornecedor..."
                    style={{ width:"100%", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:10, padding:"10px 10px 10px 32px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                </div>
                <select value={fornecCatFilter} onChange={e=>setFornecCatFilter(e.target.value)}
                  style={{ background:"#1E2132", border:"1px solid rgba(255,255,255,.1)", borderRadius:10, padding:"10px 14px", color:"#E2E8F0", fontSize:13 }}>
                  <option value="todas">🔽 Todas as categorias</option>
                  {FORNEC_CATEGORIAS.filter(c=>catCounts[c]>0).map(c=>(
                    <option key={c} value={c}>{c} ({catCounts[c]})</option>
                  ))}
                </select>
              </div>

              {/* Loading / empty */}
              {fornecLoading && <div style={{ color:"#475569", textAlign:"center", padding:32 }}>Carregando...</div>}
              {!fornecLoading && fornecList.length === 0 && (
                <div style={{ textAlign:"center", padding:48 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🏢</div>
                  <div style={{ color:"#475569", fontSize:14 }}>Nenhum fornecedor cadastrado ainda.</div>
                  <div style={{ color:"#334155", fontSize:12, marginTop:4 }}>Clique em "+ Novo Fornecedor" para adicionar.</div>
                </div>
              )}

              {/* Grid de cards */}
              {!fornecLoading && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(310px,1fr))", gap:16 }}>
                  {filteredFornec.map(f => {
                    const hasWa = !!(f.whatsapp || f.telefone);
                    return (
                      <div key={f.id} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"16px 18px", display:"flex", flexDirection:"column", gap:10 }}>
                        {/* Card header: icon + name + badges + actions */}
                        <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                          <div style={{ background:"rgba(255,255,255,.06)", borderRadius:10, width:44, height:44, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
                            {f.icone || "🏢"}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#E2E8F0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.nome}</div>
                            <span style={{ display:"inline-block", background:"rgba(16,185,129,.12)", color:"#34D399", border:"1px solid rgba(16,185,129,.2)", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600, marginTop:3 }}>{f.categoria}</span>
                          </div>
                          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                            <button onClick={()=>{ setFornecMsgModal(f); setFornecMsg(""); }}
                              style={{ background:"rgba(37,211,102,.15)", border:"1px solid rgba(37,211,102,.3)", borderRadius:8, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:16 }} title="Enviar WhatsApp">
                              💬
                            </button>
                            <button onClick={()=>{ setFornecEditId(f.id); setFornecForm({ nome:f.nome, categoria:f.categoria, icone:f.icone, telefone:f.telefone||"", whatsapp:f.whatsapp||"", email:f.email||"", endereco:f.endereco||"", observacoes:f.observacoes||"", status:f.status }); setFornecModal(true); }}
                              style={{ background:"rgba(59,130,246,.15)", border:"1px solid rgba(59,130,246,.3)", borderRadius:8, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:14 }} title="Editar">
                              ✏️
                            </button>
                            <button onClick={()=>{ if(window.confirm('Excluir "' + f.nome + '"?')) fornecDelete(f.id); }}
                              style={{ background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.25)", borderRadius:8, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:14 }} title="Excluir">
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Contact info */}
                        <div style={{ display:"flex", flexDirection:"column", gap:4, fontSize:12 }}>
                          {(f.telefone||f.whatsapp) && (
                            <div style={{ display:"flex", alignItems:"center", gap:6, color:"#94A3B8" }}>
                              <span>📞</span> {f.telefone || f.whatsapp}
                            </div>
                          )}
                          {f.email && (
                            <div style={{ display:"flex", alignItems:"center", gap:6, color:"#94A3B8" }}>
                              <span>✉️</span> {f.email}
                            </div>
                          )}
                          {f.endereco && (
                            <div style={{ display:"flex", alignItems:"center", gap:6, color:"#94A3B8" }}>
                              <span>📍</span> {f.endereco}
                            </div>
                          )}
                        </div>

                        {/* WhatsApp button */}
                        <button onClick={()=>fornecWhatsApp(f)}
                          disabled={!hasWa}
                          style={{ background: hasWa ? "linear-gradient(135deg,#25D366,#128C7E)" : "rgba(255,255,255,.04)", border:"none", borderRadius:9, padding:"9px 14px", color: hasWa ? "#fff" : "#334155", fontSize:13, fontWeight:700, cursor: hasWa ? "pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:2 }}>
                          💬 Enviar WhatsApp
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Modal criar/editar ── */}
              {fornecModal && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={e=>{ if(e.target===e.currentTarget){ setFornecModal(false); }}}>
                  <div style={{ background:"#1A1B2E", border:"1px solid rgba(255,255,255,.1)", borderRadius:16, padding:"24px 26px", width:"100%", maxWidth:460, maxHeight:"90vh", overflowY:"auto", position:"relative" }}>
                    <button onClick={()=>setFornecModal(false)} style={{ position:"absolute", top:14, right:16, background:"none", border:"none", color:"#475569", fontSize:20, cursor:"pointer" }}>✕</button>
                    <div style={{ fontSize:16, fontWeight:800, color:"#E2E8F0", marginBottom:4 }}>
                      {fornecEditId ? "Editar Fornecedor" : "Novo Fornecedor"}
                    </div>
                    <div style={{ fontSize:12, color:"#475569", marginBottom:20 }}>
                      {fornecEditId ? "Atualize os dados do fornecedor." : "Cadastre um novo fornecedor ou prestador de serviço."}
                    </div>

                    {/* Nome */}
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>NOME / EMPRESA *</div>
                      <input value={fornecForm.nome} onChange={e=>setFornecForm(f=>({...f,nome:e.target.value}))}
                        placeholder="Ex: Hidráulica Silva Ltda"
                        style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(99,102,241,.3)", borderRadius:9, padding:"10px 12px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                    </div>

                    {/* Categoria */}
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>CATEGORIA</div>
                      <select value={fornecForm.categoria} onChange={e=>setFornecForm(f=>({...f,categoria:e.target.value}))}
                        style={{ width:"100%", background:"#1E2132", border:"1px solid rgba(255,255,255,.12)", borderRadius:9, padding:"10px 12px", color:"#E2E8F0", fontSize:13 }}>
                        {FORNEC_CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    {/* Ícone */}
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:8 }}>ÍCONE</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6, background:"rgba(0,0,0,.15)", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:8 }}>
                        {FORNEC_ICONES.map(ic=>(
                          <button key={ic} onClick={()=>setFornecForm(f=>({...f,icone:ic}))}
                            style={{ background: fornecForm.icone===ic ? "rgba(124,92,252,.3)" : "rgba(255,255,255,.04)", border: fornecForm.icone===ic ? "1px solid rgba(124,92,252,.5)" : "1px solid transparent", borderRadius:8, padding:6, fontSize:18, cursor:"pointer", textAlign:"center" }}>
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Telefone + WhatsApp */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>TELEFONE</div>
                        <input value={fornecForm.telefone} onChange={e=>setFornecForm(f=>({...f,telefone:e.target.value}))}
                          placeholder="(54) 99999-9999"
                          style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"9px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>WHATSAPP</div>
                        <input value={fornecForm.whatsapp} onChange={e=>setFornecForm(f=>({...f,whatsapp:e.target.value}))}
                          placeholder="(54) 99999-9999"
                          style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"9px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                      </div>
                    </div>

                    {/* E-mail */}
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>E-MAIL</div>
                      <input type="email" value={fornecForm.email} onChange={e=>setFornecForm(f=>({...f,email:e.target.value}))}
                        placeholder="contato@empresa.com.br"
                        style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"9px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                    </div>

                    {/* Endereço */}
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>ENDEREÇO</div>
                      <input value={fornecForm.endereco} onChange={e=>setFornecForm(f=>({...f,endereco:e.target.value}))}
                        placeholder="Rua, número, bairro..."
                        style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"9px 10px", color:"#E2E8F0", fontSize:13, boxSizing:"border-box" }}/>
                    </div>

                    {/* Observações */}
                    <div style={{ marginBottom:22 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:5 }}>OBSERVAÇÕES</div>
                      <textarea value={fornecForm.observacoes} onChange={e=>setFornecForm(f=>({...f,observacoes:e.target.value}))}
                        rows={3} placeholder="Observações adicionais..."
                        style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"9px 10px", color:"#E2E8F0", fontSize:13, resize:"vertical", boxSizing:"border-box" }}/>
                    </div>

                    {/* Botões */}
                    <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                      <button onClick={()=>{ setFornecModal(false); setFornecEditId(null); setFornecForm(emptyFornec()); }}
                        style={{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:9, padding:"10px 20px", color:"#94A3B8", fontSize:13, cursor:"pointer" }}>
                        Cancelar
                      </button>
                      <button onClick={fornecSave} disabled={fornecSaving || !fornecForm.nome.trim()}
                        style={{ background: fornecSaving||!fornecForm.nome.trim() ? "#334155" : "linear-gradient(135deg,#3B82F6,#60A5FA)", border:"none", borderRadius:9, padding:"10px 22px", color:"#fff", fontSize:13, fontWeight:700, cursor: fornecSaving||!fornecForm.nome.trim() ? "not-allowed":"pointer" }}>
                        {fornecSaving ? "Salvando..." : fornecEditId ? "Atualizar" : "Cadastrar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Modal enviar mensagem WhatsApp ── */}
              {fornecMsgModal && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={e=>{ if(e.target===e.currentTarget) setFornecMsgModal(null); }}>
                  <div style={{ background:"#1A1B2E", border:"1px solid rgba(37,211,102,.2)", borderRadius:16, padding:"24px 26px", width:"100%", maxWidth:420, position:"relative" }}>
                    <button onClick={()=>setFornecMsgModal(null)} style={{ position:"absolute", top:14, right:16, background:"none", border:"none", color:"#475569", fontSize:20, cursor:"pointer" }}>✕</button>
                    <div style={{ fontSize:15, fontWeight:800, color:"#E2E8F0", marginBottom:4 }}>💬 Enviar WhatsApp</div>
                    <div style={{ fontSize:12, color:"#475569", marginBottom:16 }}>
                      Para: <strong style={{ color:"#E2E8F0" }}>{fornecMsgModal.nome}</strong> · {fornecMsgModal.whatsapp||fornecMsgModal.telefone}
                    </div>
                    {/* Sugestões de mensagem */}
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:8 }}>MODELOS RÁPIDOS</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
                      {[
                        "Olá! Precisamos de um orçamento para serviço no condomínio. Poderia nos atender?",
                        "Bom dia! Gostaríamos de agendar uma visita técnica. Qual sua disponibilidade?",
                        "Olá! Verificamos uma pendência em nosso contrato. Pode entrar em contato conosco?",
                        "Bom dia! Precisamos de um serviço urgente no condomínio. Por favor, nos ligue.",
                      ].map((tmpl,i)=>(
                        <button key={i} onClick={()=>setFornecMsg(tmpl)}
                          style={{ background: fornecMsg===tmpl ? "rgba(37,211,102,.12)" : "rgba(255,255,255,.04)", border: fornecMsg===tmpl ? "1px solid rgba(37,211,102,.3)" : "1px solid rgba(255,255,255,.07)", borderRadius:8, padding:"8px 12px", color: fornecMsg===tmpl ? "#34D399" : "#94A3B8", fontSize:12, cursor:"pointer", textAlign:"left" }}>
                          {tmpl}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginBottom:6 }}>MENSAGEM PERSONALIZADA</div>
                    <textarea value={fornecMsg} onChange={e=>setFornecMsg(e.target.value)}
                      rows={4} placeholder="Escreva sua mensagem..."
                      style={{ width:"100%", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"9px 10px", color:"#E2E8F0", fontSize:13, resize:"vertical", boxSizing:"border-box", marginBottom:16 }}/>
                    <button onClick={()=>{ fornecWhatsApp(fornecMsgModal, fornecMsg || undefined); setFornecMsgModal(null); }}
                      style={{ width:"100%", background:"linear-gradient(135deg,#25D366,#128C7E)", border:"none", borderRadius:10, padding:"11px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      💬 Abrir WhatsApp
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {/* PANEL: SSE LOG */}
          <div className={`panel ${panel === "supabase" ? "active" : ""} card`}>
            <div className="card-title">🗄️ SSE Live Log – Eventos em Tempo Real
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>{sseCount} eventos</span>
            </div>
            <div className="log-wrap">
              {logs.map((l, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{l.time}</span>
                  <span style={{ color: logColor(l.ev), fontWeight: 600 }}>{l.ev}</span>
                  <span style={{ color: "#475569", marginLeft: 8 }}>{l.data}</span>
                </div>
              ))}
              {logs.length === 0 && <div style={{ color: "#334155" }}>Aguardando eventos SSE...</div>}
            </div>
          </div>
        </div>

        {/* RIGHT AI PANEL */}
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div style={{ fontSize: 13, fontWeight: 600 }}>🤖 Síndico Virtual</div>
            <span className={`status-badge ${sseOnline ? "badge-online" : "badge-offline"}`}>● {sseOnline ? "online" : "offline"}</span>
          </div>
          <div className="ctx-pills">
            {["OSs", "IoT", "MISP", "Financeiro"].map(p => <span key={p} className="ctx-pill">{p}</span>)}
          </div>
          <div className="ai-panel-msgs" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
            {sideMsgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="msg-bubble">{m.content}</div>
                <div className="msg-time">{m.time}</div>
              </div>
            ))}
            {sideTyping && <TypingIndicator />}
          </div>
          <div className="ai-panel-input">
            <textarea value={sideInput} onChange={e => setSideInput(e.target.value)} placeholder="Pergunte ao Síndico IA..."
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(sideInput, deskHistory, setSideMsgs, setSideTyping, setDeskHistory); setDeskMsgs(p => [...p, { role: "user", content: sideInput, time: fmtTime() }]); setSideInput(""); } }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button className="btn-send btn-sm" disabled={sideTyping} onClick={() => { sendChat(sideInput, deskHistory, setSideMsgs, setSideTyping, setDeskHistory); setDeskMsgs(p => [...p, { role: "user", content: sideInput, time: fmtTime() }]); setSideInput(""); }}>Enviar</button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ VIEW 2: APP SÍNDICO ════════════════════════════════════════════════ */}
      <div className={`view ${view === "sindico" ? "active" : ""}`} style={{ flexDirection:"column", overflow:"hidden", fontFamily:"'Nunito', sans-serif", position:"relative", height:"100vh", marginTop:0, ...(sindicoTheme === "dark" ? { background:"#1E1B35", "--neu-bg":"#1E1B35", "--neu-shadow-d":"#141228", "--neu-shadow-l":"#2a2650", "--neu-text":"#E2E8F0", "--neu-text-2":"rgba(190,180,240,0.55)", "--neu-purple":"#A584FC", "--card-border":"rgba(255,255,255,.08)", "--neu-out-sm":"3px 3px 8px #141228,-2px -2px 6px #2a2650", "--neu-in-sm":"inset 3px 3px 7px #141228,inset -2px -2px 5px #2a2650", "--neu-out":"5px 5px 14px #141228,-4px -4px 11px #2a2650", "--neu-grad":"linear-gradient(135deg,#A584FC,#7C5CFC)" } as React.CSSProperties : { background:"#EEEEF4" }) }}>
            <SindicoHome
              sindicoTheme={sindicoTheme}
              setSindicoTheme={setSindicoTheme}
              sindicoScreen={sindicoScreen}
              setSindicoScreen={setSindicoScreen}
              setView={setView}
              condo={dash?.condominios?.[0] ?? null}
              condId={condId}
              loginEmail={loginEmail}
              bellCount={bellCount}
              setBellCount={setBellCount}
              bellShake={bellShake}
              saldo={t?.saldo ?? 0}
              osAbertasCount={osAbertas.length}
              equipCount={equipList.length}
              crmCount={crmMoradores.length}
              fornecCount={fornecList.length}
              nivelMedio={nivelMedio}
              sseCount={sseCount}
              comunicadosCount={(dash?.comunicados ?? []).length}
              gasNivel={gasLeituras[0]?.nivel ?? 0}
              encPendentes={encList.filter(e => e.status === "aguardando_retirada").length}
              piscinaAlerta={piscinaList.some(l => l.status === "alerta")}
              piscinaLastPh={piscinaList[0]?.ph ?? null}
              onPhotoUpdate={(url) => setDash(prev => prev ? { ...prev, condominios: prev.condominios.map((c, i) => i === 0 ? { ...c, photo_url: url } : c) } : prev)}
              renderSindicoScreen={renderSindicoScreen}
            />
      </div>

      {/* ══ VIEW 3: APP MORADOR ════════════════════════════════════════════════ */}
      <div className={`view ${view === "morador" ? "active" : ""}`} style={{ flexDirection:"column", background:"var(--neu-bg)", overflow:"hidden", fontFamily:"'Nunito', sans-serif", position:"relative", height:"100vh", marginTop:0 }}>
            {(() => {
              const h = new Date().getHours();
              const greet = h < 12 ? "Bom dia," : h < 18 ? "Boa tarde," : "Boa noite,";
              const eName = loginEmail.split("@")[0] || "Morador";
              const fname = eName.charAt(0).toUpperCase() + eName.slice(1);
              const condo = dash?.condominios?.[0]?.nome || "Residencial Parque das Flores";
              const notifs = t?.alertas_ativos || 0;
              return (
                <div className="phone-header">
                  <div className="ph-topbar">
                    <div className="ph-logo-row">
                      <div className="ph-logo-icon">IC</div>
                      <div className="ph-brand-name">ImobCore <span>v2</span></div>
                    </div>
                    <div className="ph-topbar-btns">
                      <button className="ph-btn-neu" title="Notificações">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                        </svg>
                        {notifs > 0 && <div className="ph-bell-dot"/>}
                      </button>
                      <button className="ph-btn-neu" onClick={() => setView("selector")} title="Trocar interface">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="ph-greeting-section">
                    <div className="ph-greet-wrap">
                      <div className="ph-greet-time">{greet}</div>
                      <div className="ph-greet-name">{fname}</div>
                      <div><span className="badge-role" style={{ background: "linear-gradient(135deg,#0D9488,#14B8A6)" }}>◆ Morador</span></div>
                      <div className="ph-greet-condo">{condo}</div>
                    </div>
                    <div className="ph-av-lg teal">{fname.charAt(0).toUpperCase()}</div>
                  </div>
                </div>
              );
            })()}

            <div className="phone-content">
              {/* Comunicado do topo — atualiza via SSE */}
              <div className="ph-card grad-card-teal" onClick={() => setMoradorScreen("comunicados")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📢</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.75)", letterSpacing: ".06em", textTransform: "uppercase" as const, marginBottom: 2 }}>Comunicado Recente</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 2 }}>
                    {dash?.comunicados?.[0]?.titulo || "Carregando..."}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)" }}>Toque para ver todos</div>
                </div>
                <span style={{ color: "rgba(255,255,255,.8)", fontSize: 18 }}>›</span>
              </div>

              {/* Status grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px", marginBottom: 12 }}>
                <div className="ph-card" style={{ margin: 0, textAlign: "center", cursor: "pointer" }} onClick={() => setMoradorScreen("agua")}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--neu-text-2)", marginBottom: 6 }}>💧 Água</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#0D9488" }}>{nivelMedio}%</div>
                  <div style={{ fontSize: 10, color: "var(--neu-text-2)", fontWeight: 600 }}>nível médio ↻10s</div>
                </div>
                <div className="ph-card" style={{ margin: 0, textAlign: "center", cursor: "pointer" }} onClick={() => setMoradorScreen("misp")}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--neu-text-2)", marginBottom: 6 }}>🚨 MISP</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#F59E0B" }}>{t?.alertas_ativos || 0}</div>
                  <div style={{ fontSize: 10, color: "var(--neu-text-2)", fontWeight: 600 }}>alertas ativos</div>
                </div>
              </div>

              <div className="sec-header">
                <div className="sec-title">Serviços do Condomínio</div>
                <div className="sec-link">ver tudo</div>
              </div>
              <div className="services-list">
                {[
                  { icon: "📋", name: "Ocorrências", count: String(t?.os_abertas || 0), color: "#0D9488", screen: null },
                  { icon: "📅", name: "Reservar Espaço", count: "3 disp.", color: "#3B82F6", screen: "reserva" },
                  { icon: "💳", name: "Boletos", count: "1 venc.", color: "#F59E0B", screen: "boletos" },
                  { icon: "🚗", name: "Autorizar Visitante", count: "✓", color: "#10B981", screen: "visitante" },
                  { icon: "📦", name: "Minhas Encomendas", count: String(encList.filter(e=>e.morador_nome.toLowerCase().includes("fabio")||e.unidade==="101A").filter(e=>e.status!=="retirado"&&e.status!=="devolvido").length || "0"), color: "#F59E0B", screen: "encomendas" },
                  { icon: "📢", name: "Comunicados", count: String(dash?.comunicados?.length || 0), color: "#7C5CFC", screen: "comunicados" },
                  { icon: "🚨", name: "Alertas MISP", count: String(t?.alertas_ativos || 0), color: "#EF4444", screen: "misp" },
                  { icon: "🏢", name: "Fornecedores", count: String(fornecList.length), color: "#10B981", screen: "fornecedores" },
                ].map(s => (
                  <div key={s.name} className="service-item" onClick={() => { if (s.screen) { setMoradorScreen(s.screen); setMorFornecDetail(null); } }}>
                    <div className="svc-icon">{s.icon}</div>
                    <div className="svc-name">{s.name}</div>
                    <span className="svc-count" style={{ color: s.color }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-screen overlay */}
            {renderMoradorScreen()}

            <div className="phone-bottom-nav morador-nav">
              <div className={`nav-item ${!moradorScreen ? "active" : ""}`} onClick={() => setMoradorScreen(null)}><span>🏠</span>Início</div>
              <div className={`nav-item ${moradorScreen === "misp" ? "active" : ""}`} onClick={() => setMoradorScreen("misp")}><span>🚨</span>Alertas</div>
              <button className="nav-fab" onClick={() => setMoradorScreen("visitante")}>➕</button>
              <div className={`nav-item ${moradorScreen === "comunicados" ? "active" : ""}`} onClick={() => setMoradorScreen("comunicados")}><span>💬</span>Avisos</div>
              <div className={`nav-item ${moradorScreen === "boletos" ? "active" : ""}`} onClick={() => setMoradorScreen("boletos")}><span>💳</span>Boletos</div>
            </div>
      </div>

      {/* ══ VIEW 4: ONBOARDING ════════════════════════════════════════════════ */}
      {view === "onboarding" && renderOnboarding()}

      {/* ══ MODAL: RESERVATÓRIO ADD / EDIT ════════════════════════════════════ */}
      {resShowForm && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setResShowForm(false); setResEditId(null); setResForm(EMPTY_RES_FORM); } }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.72)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
        >
          <div style={{ background:"#0F172A", border:"1px solid rgba(59,130,246,.35)", borderRadius:16, padding:"28px 28px 24px", width:"100%", maxWidth:560, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,.8)" }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#60A5FA" }}>
                {resEditId ? "✏️ Editar Reservatório" : "＋ Novo Reservatório"}
              </div>
              <button onClick={() => { setResShowForm(false); setResEditId(null); setResForm(EMPTY_RES_FORM); }} style={{ background:"none", border:"none", color:"#64748B", fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>

            {/* Nome + Local */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Nome <span style={{color:"#EF4444"}}>*</span></div>
                <input
                  autoFocus
                  value={resForm.nome}
                  onChange={e=>setResForm(f=>({...f,nome:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:`1px solid ${resForm.nome.trim() ? "rgba(255,255,255,.15)" : "rgba(239,68,68,.5)"}`, borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="Ex: Caixa Bloco A, Cisterna Principal..."
                />
              </div>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Local</div>
                <input
                  value={resForm.local}
                  onChange={e=>setResForm(f=>({...f,local:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="Bloco A, cobertura..."
                />
              </div>
            </div>

            {/* Capacidade + Altura */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Capacidade (litros)</div>
                <input
                  type="number"
                  value={resForm.capacidade_litros}
                  onChange={e=>setResForm(f=>({...f,capacidade_litros:Number(e.target.value)}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="20000"
                />
              </div>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Altura da caixa (cm)</div>
                <input
                  type="number"
                  value={resForm.altura_cm}
                  onChange={e=>setResForm(f=>({...f,altura_cm:Number(e.target.value)}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="200"
                />
              </div>
            </div>

            {/* Sensor ID + MAC */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Sensor ID <span style={{color:"#475569", fontStyle:"italic"}}>(opcional)</span></div>
                <input
                  value={resForm.sensor_id}
                  onChange={e=>setResForm(f=>({...f,sensor_id:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="auto-gerado se vazio"
                />
              </div>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>MAC Address <span style={{color:"#475569", fontStyle:"italic"}}>(opcional)</span></div>
                <input
                  value={resForm.mac_address}
                  onChange={e=>setResForm(f=>({...f,mac_address:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="AA:BB:CC:DD:EE:FF"
                />
              </div>
            </div>

            {/* Cloudflare Worker URL */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>☁️ URL Cloudflare Worker <span style={{color:"#475569", fontStyle:"italic"}}>(opcional)</span></div>
              <input
                value={resForm.cf_url}
                onChange={e=>setResForm(f=>({...f,cf_url:e.target.value}))}
                style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                placeholder="https://xxx.workers.dev"
              />
            </div>

            {/* Webhook URL + Protocolo + Porta */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>🔗 URL Webhook <span style={{color:"#475569", fontStyle:"italic"}}>(opcional)</span></div>
              <input
                value={resForm.wh_url}
                onChange={e=>setResForm(f=>({...f,wh_url:e.target.value}))}
                style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const, marginBottom:10 }}
                placeholder="https://seu-app.replit.app/api/webhook"
              />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div>
                  <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Protocolo</div>
                  <select
                    value={resForm.protocolo}
                    onChange={e=>setResForm(f=>({...f,protocolo:e.target.value}))}
                    style={{ width:"100%", background:"#0F172A", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  >
                    <option>HTTPS POST</option>
                    <option>HTTP POST</option>
                    <option>MQTT</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Porta</div>
                  <input
                    type="number"
                    value={resForm.porta}
                    onChange={e=>setResForm(f=>({...f,porta:Number(e.target.value)}))}
                    style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                    placeholder="443"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
              <button
                onClick={resSave}
                style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"11px 28px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}
              >
                {resEditId ? "💾 Salvar alterações" : "✅ Adicionar"}
              </button>
              {resEditId && (() => {
                const cur = resList.find(r=>r.id===resEditId);
                return cur ? (
                  <>
                    <button
                      onClick={()=>resTestCF(cur)}
                      disabled={!!resTesting.cf}
                      style={{ background:"rgba(16,185,129,.15)", border:"1px solid rgba(16,185,129,.3)", borderRadius:8, padding:"11px 18px", color:"#10B981", fontSize:13, fontWeight:700, cursor:"pointer", opacity:resTesting.cf?0.5:1 }}
                    >
                      {resTesting.cf ? "⏳" : "☁️"} Testar CF
                    </button>
                    <button
                      onClick={()=>resTestWH(cur)}
                      disabled={!!resTesting.wh}
                      style={{ background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", borderRadius:8, padding:"11px 18px", color:"#818CF8", fontSize:13, fontWeight:700, cursor:"pointer", opacity:resTesting.wh?0.5:1 }}
                    >
                      {resTesting.wh ? "⏳" : "🔗"} Testar WH
                    </button>
                  </>
                ) : null;
              })()}
              <button
                onClick={() => { setResShowForm(false); setResEditId(null); setResForm(EMPTY_RES_FORM); }}
                style={{ background:"transparent", border:"1px solid rgba(255,255,255,.15)", borderRadius:8, padding:"11px 18px", color:"#64748B", fontSize:13, cursor:"pointer", marginLeft:"auto" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Editar Sensor IoT
      ═══════════════════════════════════════════════════════════════ */}
      {sensorEditModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setSensorEditModal(false); setSensorEditId(null); setSensorEditForm(EMPTY_SENSOR_FORM); } }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.72)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
        >
          <div style={{ background:"#0F172A", border:"1px solid rgba(59,130,246,.35)", borderRadius:16, padding:"28px 28px 24px", width:"100%", maxWidth:480, boxShadow:"0 24px 80px rgba(0,0,0,.8)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#60A5FA" }}>✏️ Editar Sensor IoT</div>
              <button onClick={() => { setSensorEditModal(false); setSensorEditId(null); setSensorEditForm(EMPTY_SENSOR_FORM); }} style={{ background:"none", border:"none", color:"#64748B", fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Sensor ID</div>
              <div style={{ fontSize:13, color:"#475569", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:8, padding:"9px 12px" }}>{sensorEditForm.sensor_id}</div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Nome <span style={{color:"#EF4444"}}>*</span></div>
                <input
                  autoFocus
                  value={sensorEditForm.nome}
                  onChange={e => setSensorEditForm(f=>({...f, nome:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:`1px solid ${sensorEditForm.nome.trim()?"rgba(255,255,255,.15)":"rgba(239,68,68,.5)"}`, borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="Ex: Caixa Bloco A, Cisterna..."
                />
              </div>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Local</div>
                <input
                  value={sensorEditForm.local}
                  onChange={e => setSensorEditForm(f=>({...f, local:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                  placeholder="Ex: Cobertura, Subsolo..."
                />
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Capacidade (L)</div>
                <input
                  type="number" min={100}
                  value={sensorEditForm.capacidade_litros}
                  onChange={e => setSensorEditForm(f=>({...f, capacidade_litros:Number(e.target.value)}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                />
              </div>
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>Nível atual (%)</div>
                <input
                  type="number" min={0} max={100}
                  value={sensorEditForm.nivel_atual}
                  onChange={e => setSensorEditForm(f=>({...f, nivel_atual:Math.min(100,Math.max(0,Number(e.target.value)))}))}
                  style={{ width:"100%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, boxSizing:"border-box" as const }}
                />
                <div style={{ marginTop:6 }}>
                  <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,.08)" }}>
                    <div style={{ height:4, borderRadius:2, width:`${sensorEditForm.nivel_atual}%`, background: sensorEditForm.nivel_atual>=60?"#10B981":sensorEditForm.nivel_atual>=30?"#F59E0B":"#EF4444", transition:"width .2s" }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button
                onClick={() => { setSensorEditModal(false); setSensorEditId(null); setSensorEditForm(EMPTY_SENSOR_FORM); }}
                style={{ background:"transparent", border:"1px solid rgba(255,255,255,.15)", borderRadius:8, padding:"11px 18px", color:"#64748B", fontSize:13, cursor:"pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={sensorSave}
                style={{ background:"#3B82F6", border:"none", borderRadius:8, padding:"11px 24px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}
              >
                ✓ Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
