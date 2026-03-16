import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Condominio { id: string; nome: string; cidade: string; unidades: number; moradores: number; sindico_nome: string }
interface OrdemServico { id: string; numero: number; titulo: string; descricao?: string; categoria: string; status: string; prioridade: string; unidade?: string; created_at: string }
interface Sensor { id: string; sensor_id: string; nome: string; local: string; capacidade_litros: number; nivel_atual: number; volume_litros: number }
interface Alerta { id: string; origem: string; titulo: string; descricao?: string; tipo: string; nivel: string; cidade: string; bairro: string }
interface Receita { id: string; descricao: string; valor: number; categoria: string; status: string }
interface Despesa { id: string; descricao: string; valor: number; categoria: string; fornecedor?: string }
interface Comunicado { id: string; titulo: string; corpo: string; gerado_por_ia: boolean; created_at: string }
interface ChatMsg { role: "user" | "ai"; content: string; time: string }
interface DashTotais { os_abertas: number; os_urgentes: number; saldo: number; total_receitas: number; total_despesas: number; alertas_ativos: number; nivel_medio_agua: number }
interface Dashboard { condominios: Condominio[]; ordens_servico: OrdemServico[]; sensores: Sensor[]; alertas_publicos: Alerta[]; receitas: Receita[]; despesas: Despesa[]; comunicados: Comunicado[]; totais: DashTotais }

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => "R$" + Math.round(v).toLocaleString("pt-BR");
const fmtBRLFull = (v: number) => "R$" + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtTime = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// ─── CSS Injector ─────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;font-family:'Inter',sans-serif;background:#070B12;color:#E2E8F0;overflow:hidden}
:root{
  --bg:#070B12;--card-bg:rgba(255,255,255,.04);--card-border:rgba(255,255,255,.08);
  --grad:linear-gradient(135deg,#6366F1,#7C3AED,#A855F7);
  --grad-teal:linear-gradient(135deg,#0D9488,#14B8A6,#2DD4BF);
  --indigo:#6366F1;--violet:#7C3AED;--purple:#A855F7;
  --teal:#14B8A6;--red:#EF4444;--amber:#F59E0B;--green:#10B981;--blue:#3B82F6;--cyan:#06B6D4;
  --sidebar-w:220px;--ai-panel-w:340px;--topbar-h:52px;
}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
.topbar{position:fixed;top:0;left:0;right:0;z-index:1000;height:var(--topbar-h);background:rgba(7,11,18,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--card-border);display:flex;align-items:center;gap:12px;padding:0 16px}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;letter-spacing:-.3px;margin-right:8px}
.view-btns{display:flex;gap:4px}
.view-btn{padding:5px 12px;border-radius:8px;border:1px solid var(--card-border);background:transparent;color:#94A3B8;font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit}
.view-btn.active{background:var(--grad);border-color:transparent;color:#fff}
.view-btn:hover:not(.active){background:rgba(255,255,255,.06);color:#E2E8F0}
.rt-badge{display:flex;align-items:center;gap:6px;margin-left:auto;padding:4px 10px;border-radius:20px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);font-size:11px;color:#10B981;font-weight:500}
.rt-badge .dot{width:7px;height:7px;border-radius:50%;background:#10B981}
.rt-badge .dot.pulse{animation:pulse 2s infinite}
.rt-badge.offline{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.2);color:#EF4444}
.rt-badge.offline .dot{background:#EF4444;animation:none}
.clock{font-size:12px;color:#64748B;font-variant-numeric:tabular-nums;margin-left:8px}
.view{display:none;height:calc(100vh - var(--topbar-h));margin-top:var(--topbar-h)}
.view.active{display:flex}
.sidebar{width:var(--sidebar-w);min-width:var(--sidebar-w);height:100%;background:rgba(8,12,20,.98);border-right:1px solid var(--card-border);overflow-y:auto;padding:12px 0}
.sb-label{font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.08em;padding:8px 16px 4px}
.sb-item{display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;font-size:13px;color:#94A3B8;transition:all .15s;position:relative}
.sb-item:hover{color:#E2E8F0;background:rgba(255,255,255,.04)}
.sb-item.active{color:#fff;background:rgba(99,102,241,.12)}
.sb-item.active::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;background:var(--indigo);border-radius:0 2px 2px 0}
.sb-icon{font-size:15px;width:20px;text-align:center}
.sb-badge{margin-left:auto;padding:1px 7px;border-radius:10px;background:var(--red);color:#fff;font-size:10px;font-weight:600}
.sb-badge.blue{background:var(--blue)}
.main-area{flex:1;overflow-y:auto;padding:16px}
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
.chat-input-row{display:flex;gap:8px}
.chat-input{flex:1;padding:10px 14px;background:rgba(0,0,0,.3);border:1px solid var(--card-border);border-radius:10px;color:#E2E8F0;font-size:13px;font-family:inherit;resize:none;transition:border-color .15s}
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
.form-label{font-size:12px;color:#64748B;margin-bottom:4px;display:block;font-weight:500}
.form-control{width:100%;padding:8px 12px;background:rgba(0,0,0,.3);border:1px solid var(--card-border);border-radius:8px;color:#E2E8F0;font-size:13px;font-family:inherit}
.form-control:focus{outline:none;border-color:rgba(99,102,241,.5)}
select.form-control option{background:#0D1220}
.sensor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.sensor-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:16px;text-align:center}
.sensor-ring-wrap{position:relative;width:90px;height:90px;margin:0 auto 10px}
.sensor-ring-wrap svg{width:90px;height:90px;transform:rotate(-135deg)}
.ring-bg{fill:none;stroke:rgba(255,255,255,.06);stroke-width:8;stroke-linecap:round}
.ring-fg{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .5s ease,stroke .5s ease}
.ring-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:16px;font-weight:700;line-height:1}
.sensor-name{font-size:12px;font-weight:600;color:#CBD5E1;margin-bottom:2px}
.sensor-sub{font-size:11px;color:#475569}
.ai-panel{width:var(--ai-panel-w);min-width:var(--ai-panel-w);height:100%;background:rgba(8,10,20,.98);border-left:1px solid var(--card-border);display:flex;flex-direction:column}
.ai-panel-header{padding:12px 14px;border-bottom:1px solid var(--card-border);display:flex;align-items:center;justify-content:space-between}
.ctx-pills{display:flex;flex-wrap:wrap;gap:4px;padding:8px 14px;border-bottom:1px solid var(--card-border)}
.ctx-pill{font-size:10px;padding:2px 7px;border-radius:8px;font-weight:500;background:rgba(99,102,241,.1);color:#A5B4FC;border:1px solid rgba(99,102,241,.2)}
.ai-panel-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.ai-panel-input{padding:10px;border-top:1px solid var(--card-border)}
.ai-panel-input textarea{width:100%;padding:8px 10px;background:rgba(0,0,0,.3);border:1px solid var(--card-border);border-radius:8px;color:#E2E8F0;font-size:12px;font-family:inherit;resize:none;height:60px}
.ai-panel-input textarea:focus{outline:none;border-color:rgba(99,102,241,.5)}
.log-wrap{height:400px;overflow-y:auto;padding:10px;font-family:'Courier New',monospace;font-size:11px;background:rgba(0,0,0,.4);border-radius:8px;border:1px solid var(--card-border)}
.log-entry{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.03);color:#64748B}
.log-time{color:#334155;margin-right:8px}
.log-ev-sse{color:#10B981}
.log-ev-os{color:#6366F1}
.log-ev-sensor{color:#06B6D4}
.log-ev-chat{color:#A855F7}
.log-ev-comunicado{color:#F59E0B}
.log-ev-alerta{color:#EF4444}
.fin-kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.fin-kpi{background:rgba(255,255,255,.04);border:1px solid var(--card-border);border-radius:10px;padding:12px;text-align:center}
.fin-kpi-label{font-size:10px;color:#64748B;margin-bottom:4px}
.fin-kpi-val{font-size:16px;font-weight:700}
.misp-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:14px;margin-bottom:8px}
.com-preview{background:rgba(255,255,255,.04);border:1px solid var(--card-border);border-radius:10px;padding:12px;margin-bottom:8px}
.com-titulo{font-size:13px;font-weight:600;margin-bottom:4px}
.com-corpo{font-size:12px;color:#64748B;line-height:1.5}
.com-meta{font-size:10px;color:#334155;margin-top:6px}
.os-form{display:none;background:rgba(0,0,0,.2);border:1px solid var(--card-border);border-radius:12px;padding:14px;margin-bottom:14px}
.os-form.open{display:block;animation:fadeIn .2s ease}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.toast-container{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{padding:10px 16px;border-radius:10px;background:#1E293B;border:1px solid var(--card-border);color:#E2E8F0;font-size:13px;max-width:320px;animation:slideIn .2s ease;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.toast.success{border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.1);color:#34D399}
.toast.error{border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:#F87171}
.toast.info{border-color:rgba(99,102,241,.3);background:rgba(99,102,241,.1);color:#A5B4FC}
.toast.warn{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.1);color:#FCD34D}
.phone-frame{width:375px;border-radius:48px;background:#000;box-shadow:0 0 0 2px #1a1a2e,0 0 0 8px #0a0a1a,0 30px 80px rgba(0,0,0,.8),0 0 60px rgba(99,102,241,.15),inset 0 0 0 1px rgba(255,255,255,.05);position:relative;overflow:hidden;height:780px}
.phone-inner{background:#0D1220;height:100%;border-radius:48px;overflow:hidden;display:flex;flex-direction:column;position:relative}
.phone-notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:120px;height:30px;background:#000;border-radius:0 0 20px 20px;z-index:100}
.phone-status{height:44px;display:flex;align-items:center;padding:0 24px;justify-content:space-between;font-size:12px;font-weight:600;padding-top:6px;position:relative;z-index:10}
.phone-content{flex:1;overflow-y:auto;overflow-x:hidden}
.phone-bottom-nav{height:64px;background:rgba(13,18,32,.98);border-top:1px solid var(--card-border);display:flex;align-items:center;justify-content:space-around;padding:0 8px;flex-shrink:0}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#475569;cursor:pointer;flex:1;padding:8px 4px;transition:color .15s}
.nav-item.active{color:var(--indigo)}
.nav-fab{width:54px;height:54px;border-radius:50%;background:var(--grad);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(99,102,241,.5);margin-top:-18px;flex-shrink:0;transition:transform .15s}
.nav-fab:hover{transform:scale(1.05)}
.phone-header{padding:8px 16px 10px;display:flex;align-items:center;justify-content:space-between}
.phone-avatar{width:40px;height:40px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0}
.phone-avatar.teal{background:var(--grad-teal)}
.phone-user-info{flex:1;margin-left:10px}
.phone-user-name{font-size:14px;font-weight:700}
.phone-user-sub{font-size:11px;color:#475569}
.phone-bell{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid var(--card-border);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;position:relative}
.bell-badge{position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--red);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #0D1220}
.ph-card{margin:0 12px 10px;padding:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px}
.ph-card.grad-card{background:var(--grad);border:none}
.ph-card.grad-card-teal{background:var(--grad-teal);border:none}
.ph-card.critical{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);animation:pulse 2s infinite}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px;margin-bottom:10px}
.module-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 12px;cursor:pointer;transition:all .15s}
.module-card:hover{background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.2)}
.module-card-icon{font-size:22px;margin-bottom:6px}
.module-card-title{font-size:12px;font-weight:600;color:#CBD5E1;margin-bottom:2px}
.module-card-sub{font-size:10px;color:#475569}
.module-card-val{font-size:18px;font-weight:700;margin-top:4px}
.phone-modal{position:absolute;inset:0;background:#0D1220;z-index:200;display:flex;flex-direction:column;border-radius:48px;overflow:hidden;animation:fadeIn .15s ease}
.phone-modal.hidden{display:none}
.modal-header{padding:16px 16px 10px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--card-border);flex-shrink:0}
.modal-back{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:none;color:#E2E8F0;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.modal-title{font-size:14px;font-weight:700;flex:1}
.modal-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.modal-chips{display:flex;gap:5px;overflow-x:auto;margin:0 10px 6px;padding-bottom:4px}
.modal-chips::-webkit-scrollbar{height:0}
.modal-input-area{padding:10px;border-top:1px solid var(--card-border);flex-shrink:0}
.services-list{padding:0 12px;margin-bottom:10px}
.service-item{display:flex;align-items:center;gap:12px;padding:11px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:6px;cursor:pointer;transition:all .15s}
.service-item:hover{background:rgba(20,184,166,.06);border-color:rgba(20,184,166,.2)}
.svc-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.svc-name{flex:1;font-size:13px;font-weight:500}
.svc-count{padding:2px 8px;border-radius:10px;background:rgba(20,184,166,.15);color:var(--teal);font-size:11px;font-weight:600}
.morador-nav .nav-item.active{color:var(--teal)}
.morador-nav .nav-fab{background:var(--grad-teal);box-shadow:0 4px 20px rgba(20,184,166,.5)}
.sec-header{display:flex;align-items:center;justify-content:space-between;padding:0 12px;margin-bottom:8px}
.sec-title{font-size:13px;font-weight:700}
.sec-link{font-size:11px;color:var(--indigo);cursor:pointer}
textarea.fc{width:100%;padding:8px 12px;background:rgba(0,0,0,.3);border:1px solid var(--card-border);border-radius:8px;color:#E2E8F0;font-size:13px;font-family:inherit;resize:none}
textarea.fc:focus{outline:none;border-color:rgba(99,102,241,.5)}
`;

// ─── Sub-Components ───────────────────────────────────────────────────────────
function SensorRing({ sensor }: { sensor: Sensor }) {
  const pct = Math.min(100, Math.max(0, Number(sensor.nivel_atual) || 0));
  const color = pct >= 60 ? "#10B981" : pct >= 30 ? "#F59E0B" : "#EF4444";
  const R = 36, C = 2 * Math.PI * R, arc = C * 0.75;
  const filled = arc * (pct / 100);
  const gap = arc - filled;
  return (
    <div className="sensor-card">
      <div className="sensor-ring-wrap">
        <svg viewBox="0 0 90 90">
          <circle className="ring-bg" cx="45" cy="45" r={R} strokeDasharray={`${arc} ${C - arc}`} />
          <circle className="ring-fg" cx="45" cy="45" r={R} stroke={color}
            strokeDasharray={`${filled} ${gap + (C - arc)}`} />
        </svg>
        <div className="ring-label" style={{ color }}>{pct}%</div>
      </div>
      <div className="sensor-name">{sensor.nome || sensor.sensor_id}</div>
      <div className="sensor-sub">{sensor.local}</div>
      <div className="sensor-sub" style={{ marginTop: 2, color: "#334155" }}>
        {Number(sensor.volume_litros || 0).toFixed(0)}L / {Number(sensor.capacidade_litros || 0)}L
      </div>
    </div>
  );
}

function ChatMessages({ msgs }: { msgs: ChatMsg[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs]);
  return (
    <div className="chat-area" ref={ref}>
      {msgs.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          <div className="msg-bubble">{m.content}</div>
          <div className="msg-time">{m.time}</div>
        </div>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg ai" style={{ alignSelf: "flex-start" }}>
      <div className="msg-bubble typing">
        <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<"gestor" | "sindico" | "morador">("gestor");
  const [panel, setPanel] = useState("sv-chat");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [condId, setCondId] = useState<string | null>(null);
  const [sseOnline, setSseOnline] = useState(false);
  const [clock, setClock] = useState(fmtTime());
  const [logs, setLogs] = useState<{ ev: string; data: string; time: string }[]>([]);
  const [sseCount, setSseCount] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);

  // Chat states
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

  // OS form state
  const [osFormOpen, setOsFormOpen] = useState(false);
  const [osForm, setOsForm] = useState({ titulo: "", descricao: "", categoria: "hidraulica", prioridade: "media", unidade: "" });

  // Comunicado state
  const [comTema, setComTema] = useState("");
  const [comLoading, setComLoading] = useState(false);
  const [comPreview, setComPreview] = useState<{ titulo: string; corpo: string } | null>(null);

  // Insights state
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Sindico modal
  const [sindicoModalOpen, setSindicoModalOpen] = useState(false);

  // ─── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard");
      const d: Dashboard = await r.json();
      setDash(d);
      if (d.condominios?.[0]) setCondId(d.condominios[0].id);
    } catch (e) { console.error("dashboard err:", e); }
  }, []);

  // ─── SSE ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const addLog = (ev: string, data: unknown) => {
      setLogs(prev => [{ ev, data: JSON.stringify(data).substring(0, 80), time: fmtTime() }, ...prev.slice(0, 199)]);
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
      const events = ["nova_os", "os_atualizada", "sensor_update", "alerta_sensor", "sindico_chat", "novo_comunicado"];
      events.forEach(evt => {
        es.addEventListener(evt, (e: MessageEvent) => {
          const data = JSON.parse(e.data);
          addLog(evt, data);
          loadDashboard();
          if (evt === "alerta_sensor") showToast("⚠️ " + data.message, "warn");
          if (evt === "nova_os") showToast("🔧 Nova OS criada", "info");
          if (evt === "novo_comunicado") showToast("📢 Novo comunicado", "info");
        });
      });
      es.onerror = () => {
        setSseOnline(false);
        retryTimer = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  }, [loadDashboard, showToast]);

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadDashboard();
    const t = setInterval(() => setClock(fmtTime()), 30000);
    return () => clearInterval(t);
  }, [loadDashboard]);

  // Auto-greet
  useEffect(() => {
    if (!dash) return;
    const urgentes = (dash.ordens_servico || []).filter(o => o.prioridade === "urgente" && o.status === "aberta").length;
    const autoMsg = `Bom dia! Analise a situação atual do condomínio: ${urgentes} OS(s) urgentes, ${dash.totais.alertas_ativos} alertas MISP ativos e ${dash.sensores.length} sensores IoT monitorados. Dê um status executivo.`;
    sendChat(autoMsg, [], setDeskMsgs, setDeskTyping, setDeskHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dash]);

  // ─── Chat ──────────────────────────────────────────────────────────────────
  const sendChat = async (
    msg: string,
    history: { role: string; content: string }[],
    setMsgs: React.Dispatch<React.SetStateAction<ChatMsg[]>>,
    setTyping: (v: boolean) => void,
    setHistory: React.Dispatch<React.SetStateAction<{ role: string; content: string }[]>>
  ) => {
    if (!msg.trim()) return;
    const userMsg: ChatMsg = { role: "user", content: msg, time: fmtTime() };
    setMsgs(prev => [...prev, userMsg]);
    const newHistory = [...history, { role: "user", content: msg }];
    setHistory(newHistory);
    setTyping(true);
    try {
      const r = await fetch("/api/sindico/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: newHistory.slice(-10), condominio_id: condId }),
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

  // ─── OS CRUD ───────────────────────────────────────────────────────────────
  const criarOS = async () => {
    if (!osForm.titulo.trim()) { showToast("Informe o título", "warn"); return; }
    try {
      await fetch("/api/os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...osForm, condominio_id: condId }) });
      showToast("✅ OS criada", "success");
      setOsForm({ titulo: "", descricao: "", categoria: "hidraulica", prioridade: "media", unidade: "" });
      setOsFormOpen(false);
      loadDashboard();
    } catch { showToast("Erro ao criar OS", "error"); }
  };

  const updateOS = async (id: string, status: string) => {
    await fetch(`/api/os/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    showToast("OS atualizada", "success");
    loadDashboard();
  };

  // ─── Comunicado ────────────────────────────────────────────────────────────
  const gerarComunicado = async () => {
    if (!comTema.trim()) { showToast("Informe o tema", "warn"); return; }
    setComLoading(true);
    try {
      const r = await fetch("/api/sindico/comunicado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: comTema, condominio_id: condId }) });
      const com = await r.json();
      setComPreview({ titulo: com.titulo, corpo: com.corpo });
      showToast("✅ Comunicado gerado via IA", "success");
      loadDashboard();
    } catch { showToast("Erro ao gerar comunicado", "error"); }
    setComLoading(false);
  };

  // ─── Insights ──────────────────────────────────────────────────────────────
  const generateInsights = async () => {
    setInsightsLoading(true);
    setInsights("");
    try {
      const r = await fetch("/api/sindico/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Gere uma análise executiva completa com insights sobre financeiro, OSs, água, alertas e recomendações. Use emojis.", history: [], condominio_id: condId }) });
      const res = await r.json();
      setInsights(res.reply);
    } catch { setInsights("Erro ao gerar insights."); }
    setInsightsLoading(false);
  };

  const t = dash?.totais;
  const urgentes = (dash?.ordens_servico || []).filter(o => o.prioridade === "urgente" && o.status === "aberta").length;

  const priPill = (p: string) => {
    const m: Record<string, string> = { urgente: "pill-red", alta: "pill-amber", media: "pill-blue", baixa: "pill-gray" };
    return m[p] || "pill-gray";
  };
  const stsPill = (s: string) => {
    const m: Record<string, string> = { aberta: "pill-amber", em_andamento: "pill-cyan", fechada: "pill-green" };
    return m[s] || "pill-gray";
  };

  return (
    <>
      <style>{CSS}</style>

      {/* TOAST CONTAINER */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>{toast.msg}</div>
        ))}
      </div>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="logo"><span>🤖</span> ImobCore <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 600, background: "rgba(99,102,241,.1)", padding: "2px 6px", borderRadius: 4 }}>v2</span></div>
        <div className="view-btns">
          <button className={`view-btn ${view === "gestor" ? "active" : ""}`} onClick={() => setView("gestor")}>⚡ Painel Gestor</button>
          <button className={`view-btn ${view === "sindico" ? "active" : ""}`} onClick={() => setView("sindico")}>📱 App Síndico</button>
          <button className={`view-btn ${view === "morador" ? "active" : ""}`} onClick={() => setView("morador")}>🏠 App Morador</button>
        </div>
        <div className={`rt-badge ${sseOnline ? "" : "offline"}`}>
          <div className={`dot ${sseOnline ? "pulse" : ""}`} />
          <span>{sseOnline ? "Realtime Ativo" : "Conectando..."}</span>
        </div>
        <div className="clock">{clock}</div>
      </div>

      {/* ── VIEW 1: PAINEL GESTOR ───────────────────────────────────────────── */}
      <div className={`view ${view === "gestor" ? "active" : ""}`}>
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sb-label">Síndico Virtual</div>
          <div className={`sb-item ${panel === "sv-chat" ? "active" : ""}`} onClick={() => setPanel("sv-chat")}>
            <span className="sb-icon">💬</span> Chat IA
          </div>
          <div className={`sb-item ${panel === "sv-insights" ? "active" : ""}`} onClick={() => setPanel("sv-insights")}>
            <span className="sb-icon">💡</span> Insights
          </div>
          <div className={`sb-item ${panel === "sv-comunicados" ? "active" : ""}`} onClick={() => setPanel("sv-comunicados")}>
            <span className="sb-icon">📢</span> Comunicados
          </div>
          <div className="sb-label">Módulos</div>
          <div className={`sb-item ${panel === "operacao" ? "active" : ""}`} onClick={() => setPanel("operacao")}>
            <span className="sb-icon">🔧</span> Ordens de Serviço
            <span className="sb-badge">{t?.os_abertas || 0}</span>
          </div>
          <div className={`sb-item ${panel === "financeiro" ? "active" : ""}`} onClick={() => setPanel("financeiro")}>
            <span className="sb-icon">💰</span> Financeiro
          </div>
          <div className={`sb-item ${panel === "iot" ? "active" : ""}`} onClick={() => setPanel("iot")}>
            <span className="sb-icon">💧</span> Água IoT
          </div>
          <div className={`sb-item ${panel === "misp" ? "active" : ""}`} onClick={() => setPanel("misp")}>
            <span className="sb-icon">🚨</span> MISP
            <span className="sb-badge">{t?.alertas_ativos || 0}</span>
          </div>
          <div className="sb-label">Sistema</div>
          <div className={`sb-item ${panel === "supabase" ? "active" : ""}`} onClick={() => setPanel("supabase")}>
            <span className="sb-icon">🗄️</span> Supabase Live Log
          </div>
        </div>

        {/* MAIN AREA */}
        <div className="main-area">
          {/* KPI Row */}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">OSs Abertas</div>
              <div className="kpi-value" style={{ color: "var(--red)" }}>{t?.os_abertas || 0}</div>
              <div className="kpi-sub">{urgentes} urgentes</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Saldo Financeiro</div>
              <div className="kpi-value" style={{ color: (t?.saldo || 0) >= 0 ? "var(--green)" : "var(--red)" }}>{fmtBRL(t?.saldo || 0)}</div>
              <div className="kpi-sub">em caixa</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Água Média</div>
              <div className="kpi-value" style={{ color: "var(--cyan)" }}>{t?.nivel_medio_agua || 0}%</div>
              <div className="kpi-sub">nível médio</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Alertas MISP</div>
              <div className="kpi-value" style={{ color: "var(--amber)" }}>{t?.alertas_ativos || 0}</div>
              <div className="kpi-sub">ativos</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Score Cond.</div>
              <div className="kpi-value" style={{ color: "var(--purple)" }}>847</div>
              <div className="kpi-sub">excelente</div>
            </div>
          </div>

          {/* PANEL: SV CHAT */}
          <div className={`panel ${panel === "sv-chat" ? "active" : ""} card`}>
            <div className="card-title">
              🤖 Síndico Virtual IA
              <span className={`status-badge ${sseOnline ? "badge-online" : "badge-offline"}`}>● {sseOnline ? "online" : "offline"}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>{tokenInfo}</span>
            </div>
            <div className="chat-chips">
              {[
                ["📊 Resumo executivo", "Faça um resumo executivo do condomínio agora"],
                ["🔴 OSs urgentes", "Quais são as OSs urgentes pendentes?"],
                ["💧 Água + CASAN", "Como está a situação da água e sensores IoT?"],
                ["💰 Análise financeira", "Faça uma análise financeira completa"],
                ["⭐ Melhorar score", "Como podemos melhorar o score do condomínio?"],
              ].map(([label, msg]) => (
                <button key={label} className="chip" onClick={() => { sendChat(msg, deskHistory, setDeskMsgs, setDeskTyping, setDeskHistory); setSideMsgs(prev => [...prev, { role: "user", content: msg, time: fmtTime() }]); }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="chat-area" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
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

          {/* PANEL: INSIGHTS */}
          <div className={`panel ${panel === "sv-insights" ? "active" : ""} card`}>
            <div className="card-title">💡 Insights do Condomínio</div>
            {insightsLoading && <div style={{ color: "#94A3B8", textAlign: "center", padding: 30 }}>🔮 Gerando insights via IA...</div>}
            {insights && <div style={{ fontSize: 13, lineHeight: 1.6, color: "#CBD5E1", whiteSpace: "pre-wrap" }}>{insights}</div>}
            {!insights && !insightsLoading && <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 40 }}>Clique em "Gerar Insights" para análise automática</div>}
            <button className="btn btn-primary" onClick={generateInsights} disabled={insightsLoading} style={{ marginTop: 12 }}>
              🔮 {insightsLoading ? "Gerando..." : "Gerar Insights IA"}
            </button>
          </div>

          {/* PANEL: COMUNICADOS */}
          <div className={`panel ${panel === "sv-comunicados" ? "active" : ""} card`}>
            <div className="card-title">📢 Comunicados</div>
            <div className="form-group">
              <label className="form-label">Tema do comunicado</label>
              <input className="form-control" value={comTema} onChange={e => setComTema(e.target.value)} placeholder="Ex: Manutenção do elevador na próxima segunda-feira..." />
            </div>
            <button className="btn btn-primary" onClick={gerarComunicado} disabled={comLoading} style={{ marginBottom: 16 }}>
              ✨ {comLoading ? "Gerando..." : "Gerar via IA"}
            </button>
            {comPreview && (
              <div className="com-preview">
                <div className="com-titulo">{comPreview.titulo}</div>
                <div className="com-corpo" style={{ WebkitLineClamp: "unset", overflow: "visible" }}>{comPreview.corpo}</div>
              </div>
            )}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>📋 Histórico</div>
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
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>
                🔧 Ordens de Serviço
                <button className="btn btn-primary btn-sm" onClick={() => setOsFormOpen(o => !o)} style={{ marginLeft: "auto" }}>+ Nova OS</button>
              </div>
              <div className={`os-form ${osFormOpen ? "open" : ""}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Título *</label>
                    <input className="form-control" value={osForm.titulo} onChange={e => setOsForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Título da OS" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prioridade</label>
                    <select className="form-control" value={osForm.prioridade} onChange={e => setOsForm(f => ({ ...f, prioridade: e.target.value }))}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Unidade</label>
                    <input className="form-control" value={osForm.unidade} onChange={e => setOsForm(f => ({ ...f, unidade: e.target.value }))} placeholder="Ex: Apto 101" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoria</label>
                    <select className="form-control" value={osForm.categoria} onChange={e => setOsForm(f => ({ ...f, categoria: e.target.value }))}>
                      {["hidraulica", "eletrica", "estrutural", "limpeza", "seguranca", "equipamento", "outros"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <textarea className="fc" value={osForm.descricao} onChange={e => setOsForm(f => ({ ...f, descricao: e.target.value }))} rows={2} placeholder="Descreva o problema..." />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" onClick={criarOS}>✓ Criar OS</button>
                  <button className="btn btn-ghost" onClick={() => setOsFormOpen(false)}>Cancelar</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>#</th>
                      <th>Título</th>
                      <th style={{ width: 100 }}>Prioridade</th>
                      <th style={{ width: 90 }}>Status</th>
                      <th style={{ width: 80 }}>Unidade</th>
                      <th style={{ width: 180 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dash?.ordens_servico || []).slice(0, 20).map(o => (
                      <tr key={o.id}>
                        <td><span style={{ color: "#475569" }}>#{o.numero || "?"}</span></td>
                        <td>{o.titulo}</td>
                        <td><span className={`pill ${priPill(o.prioridade)}`}>{o.prioridade}</span></td>
                        <td><span className={`pill ${stsPill(o.status)}`}>{o.status.replace("_", " ")}</span></td>
                        <td style={{ fontSize: 11, color: "#64748B" }}>{o.unidade || "–"}</td>
                        <td>
                          {o.status === "aberta" && <button className="btn btn-sm btn-success" onClick={() => updateOS(o.id, "em_andamento")} style={{ marginRight: 4 }}>Iniciar</button>}
                          {o.status !== "fechada" && <button className="btn btn-sm btn-danger" onClick={() => updateOS(o.id, "fechada")}>Fechar</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* PANEL: FINANCEIRO */}
          <div className={`panel ${panel === "financeiro" ? "active" : ""} card`}>
            <div className="card-title">💰 Financeiro</div>
            <div className="fin-kpi-row">
              <div className="fin-kpi">
                <div className="fin-kpi-label">Saldo</div>
                <div className="fin-kpi-val" style={{ color: "var(--green)" }}>{fmtBRLFull(t?.saldo || 0)}</div>
              </div>
              <div className="fin-kpi">
                <div className="fin-kpi-label">Receitas</div>
                <div className="fin-kpi-val" style={{ color: "var(--cyan)" }}>{fmtBRLFull(t?.total_receitas || 0)}</div>
              </div>
              <div className="fin-kpi">
                <div className="fin-kpi-label">Despesas</div>
                <div className="fin-kpi-val" style={{ color: "var(--red)" }}>{fmtBRLFull(t?.total_despesas || 0)}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div className="card-title">📈 Receitas</div>
                {(dash?.receitas || []).map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#CBD5E1" }}>{r.descricao}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{r.categoria}</div>
                    </div>
                    <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>{fmtBRLFull(r.valor)}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="card-title">📉 Despesas</div>
                {(dash?.despesas || []).map(d => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#CBD5E1" }}>{d.descricao}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{d.fornecedor || d.categoria}</div>
                    </div>
                    <div style={{ color: "var(--red)", fontWeight: 600, fontSize: 13 }}>-{fmtBRLFull(d.valor)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PANEL: IoT */}
          <div className={`panel ${panel === "iot" ? "active" : ""} card`}>
            <div className="card-title">💧 Sensores de Água – IoT em Tempo Real</div>
            <div className="sensor-grid">
              {(dash?.sensores || []).map(s => <SensorRing key={s.id} sensor={s} />)}
            </div>
          </div>

          {/* PANEL: MISP */}
          <div className={`panel ${panel === "misp" ? "active" : ""} card`}>
            <div className="card-title">🚨 Alertas Públicos – MISP</div>
            {(dash?.alertas_publicos || []).length === 0 && <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 20 }}>Nenhum alerta ativo</div>}
            {(dash?.alertas_publicos || []).map(a => {
              const nivCol = { alto: "pill-red", medio: "pill-amber", baixo: "pill-green" }[a.nivel] || "pill-gray";
              return (
                <div key={a.id} className="misp-card">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.titulo}</div>
                    <span className={`pill ${nivCol}`}>{a.nivel}</span>
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

          {/* PANEL: SUPABASE LOG */}
          <div className={`panel ${panel === "supabase" ? "active" : ""} card`}>
            <div className="card-title">🗄️ Supabase Live Log – Eventos SSE em Tempo Real</div>
            <div className="log-wrap">
              {logs.map((l, i) => {
                const evClass = { connected: "sse", nova_os: "os", os_atualizada: "os", sensor_update: "sensor", alerta_sensor: "alerta", sindico_chat: "chat", novo_comunicado: "comunicado" }[l.ev] || "sse";
                return (
                  <div key={i} className="log-entry">
                    <span className="log-time">{l.time}</span>
                    <span className={`log-ev-${evClass}`}>{l.ev}</span>
                    <span style={{ color: "#475569", marginLeft: 8 }}>{l.data}</span>
                  </div>
                );
              })}
              {logs.length === 0 && <div style={{ color: "#334155" }}>Aguardando eventos SSE...</div>}
            </div>
          </div>
        </div>

        {/* AI FIXED PANEL */}
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div style={{ fontSize: 13, fontWeight: 600 }}>🤖 Síndico Virtual</div>
            <span className={`status-badge ${sseOnline ? "badge-online" : "badge-offline"}`}>● {sseOnline ? "online" : "offline"}</span>
          </div>
          <div className="ctx-pills">
            {["OSs", "IoT", "MISP", "Financeiro"].map(p => <span key={p} className="ctx-pill">{p}</span>)}
          </div>
          <div className="ai-panel-msgs" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
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
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat(sideInput, deskHistory, setSideMsgs, setSideTyping, setDeskHistory);
                  setDeskMsgs(prev => [...prev, { role: "user", content: sideInput, time: fmtTime() }]);
                  setSideInput("");
                }
              }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button className="btn-send btn-sm" disabled={sideTyping} onClick={() => {
                sendChat(sideInput, deskHistory, setSideMsgs, setSideTyping, setDeskHistory);
                setDeskMsgs(prev => [...prev, { role: "user", content: sideInput, time: fmtTime() }]);
                setSideInput("");
              }}>Enviar</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── VIEW 2: APP SÍNDICO ─────────────────────────────────────────────── */}
      <div className={`view ${view === "sindico" ? "active" : ""}`} style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="phone-frame">
          <div className="phone-inner">
            <div className="phone-notch" />
            <div className="phone-status" style={{ color: "#E2E8F0" }}>
              <span>{clock}</span>
              <span>📶 5G 🔋</span>
            </div>
            <div className="phone-header">
              <div className="phone-avatar">R</div>
              <div className="phone-user-info">
                <div className="phone-user-name">Ricardo Gestor</div>
                <div className="phone-user-sub">Síndico – Res. Parque das Flores</div>
              </div>
              <div className="phone-bell">🔔<div className="bell-badge">{urgentes + (t?.alertas_ativos || 0)}</div></div>
            </div>

            {urgentes > 0 && (
              <div className="ph-card critical" style={{ margin: "0 12px 8px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>⚠️ ATENÇÃO URGENTE</div>
                <div style={{ fontSize: 11, color: "#FCA5A5" }}>
                  {(dash?.ordens_servico || []).find(o => o.prioridade === "urgente" && o.status === "aberta")?.titulo}
                </div>
              </div>
            )}

            <div className="phone-content">
              <div className="ph-card grad-card" style={{ cursor: "pointer" }} onClick={() => setSindicoModalOpen(true)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginBottom: 2 }}>SÍNDICO VIRTUAL IA</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Falar com IA</div>
                  </div>
                  <span style={{ fontSize: 28 }}>🤖</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", lineHeight: 1.4 }}>
                  {mobileMsgs[mobileMsgs.length - 1]?.role === "ai" ? mobileMsgs[mobileMsgs.length - 1].content.substring(0, 120) + "..." : "Toque para consultar o Síndico Virtual IA..."}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" as const }}>
                  {["Nova OS", "Reservar", "Comunicado", "Boleto", "Visitante"].map(l => (
                    <span key={l} style={{ background: "rgba(255,255,255,.2)", borderRadius: 6, padding: "3px 8px", fontSize: 10 }}>{l}</span>
                  ))}
                </div>
              </div>

              <div className="sec-header">
                <div className="sec-title">Gestão do Condomínio</div>
                <div className="sec-link">Ver todos</div>
              </div>

              <div className="grid-2">
                {[
                  { icon: "💰", title: "Finanças", sub: "Saldo atual", val: fmtBRL(t?.saldo || 0), color: "var(--green)" },
                  { icon: "📋", title: "Planejamento", sub: "OSs abertas", val: String(t?.os_abertas || 0), color: "var(--amber)" },
                  { icon: "💧", title: "Água IoT", sub: "Nível médio", val: (t?.nivel_medio_agua || 0) + "%", color: "var(--cyan)" },
                  { icon: "🚨", title: "MISP", sub: "Alertas ativos", val: String(t?.alertas_ativos || 0), color: "var(--red)" },
                  { icon: "🤖", title: "Síndico Virtual", sub: "IA ativa", val: "847", color: "var(--purple)" },
                  { icon: "📡", title: "Monitor IoT", sub: "Eventos SSE", val: String(sseCount), color: "var(--green)" },
                ].map(m => (
                  <div key={m.title} className="module-card" onClick={() => { setView("gestor"); }}>
                    <div className="module-card-icon">{m.icon}</div>
                    <div className="module-card-title">{m.title}</div>
                    <div className="module-card-sub">{m.sub}</div>
                    <div className="module-card-val" style={{ color: m.color }}>{m.val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="phone-bottom-nav">
              <div className="nav-item active"><span>🏠</span>Início</div>
              <div className="nav-item"><span>🚨</span>Alertas</div>
              <button className="nav-fab" onClick={() => setSindicoModalOpen(true)}>🤖</button>
              <div className="nav-item"><span>🤖</span>Inteligência</div>
              <div className="nav-item"><span>👤</span>Usuário</div>
            </div>

            {/* Sindico Chat Modal */}
            <div className={`phone-modal ${sindicoModalOpen ? "" : "hidden"}`}>
              <div className="phone-notch" />
              <div style={{ height: 44, flexShrink: 0 }} />
              <div className="modal-header">
                <button className="modal-back" onClick={() => setSindicoModalOpen(false)}>←</button>
                <div className="modal-title">🤖 Síndico Virtual IA</div>
                <span className={`status-badge ${sseOnline ? "badge-online" : "badge-offline"}`}>● {sseOnline ? "on" : "off"}</span>
              </div>
              <div className="modal-chips">
                {[["📊 Resumo", "Resumo do condomínio"], ["🔴 Urgentes", "OSs urgentes pendentes"], ["💧 Água", "Situação dos sensores"], ["🚨 MISP", "Alertas MISP ativos"]].map(([l, m]) => (
                  <button key={l} className="chip" onClick={() => sendChat(m, mobileHistory, setMobileMsgs, setMobileTyping, setMobileHistory)}>{l}</button>
                ))}
              </div>
              <div className="modal-msgs" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                {mobileMsgs.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    <div className="msg-bubble">{m.content}</div>
                    <div className="msg-time">{m.time}</div>
                  </div>
                ))}
                {mobileTyping && <TypingIndicator />}
              </div>
              <div className="modal-input-area">
                <textarea className="fc" value={mobileInput} onChange={e => setMobileInput(e.target.value)} placeholder="Digite sua mensagem..." rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(mobileInput, mobileHistory, setMobileMsgs, setMobileTyping, setMobileHistory); setMobileInput(""); } }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button className="btn-send" disabled={mobileTyping} onClick={() => { sendChat(mobileInput, mobileHistory, setMobileMsgs, setMobileTyping, setMobileHistory); setMobileInput(""); }}>Enviar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── VIEW 3: APP MORADOR ─────────────────────────────────────────────── */}
      <div className={`view ${view === "morador" ? "active" : ""}`} style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="phone-frame">
          <div className="phone-inner" style={{ background: "#0a1520" }}>
            <div className="phone-notch" />
            <div className="phone-status" style={{ color: "#E2E8F0" }}>
              <span>{clock}</span>
              <span>📶 4G 🔋</span>
            </div>
            <div className="phone-header">
              <div className="phone-avatar teal">A</div>
              <div className="phone-user-info">
                <div className="phone-user-name">Ana Silva</div>
                <div className="phone-user-sub">Apto 204 – Torre A</div>
              </div>
              <div className="phone-bell">🔔<div className="bell-badge">{t?.alertas_ativos || 0}</div></div>
            </div>

            <div className="phone-content">
              {/* Comunicado */}
              <div className="ph-card grad-card-teal">
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.75)", marginBottom: 4 }}>📢 COMUNICADO RECENTE</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  {dash?.comunicados?.[0]?.titulo || "Carregando..."}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                  {dash?.comunicados?.[0]?.corpo || "–"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 6 }}>
                  {dash?.comunicados?.[0] ? fmtDate(dash.comunicados[0].created_at) : "–"}
                </div>
              </div>

              {/* Status grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 12px", marginBottom: 10 }}>
                <div className="ph-card" style={{ margin: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>💧 Água</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--teal)" }}>{t?.nivel_medio_agua || 0}%</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>nível médio</div>
                </div>
                <div className="ph-card" style={{ margin: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>🚨 MISP</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)" }}>{t?.alertas_ativos || 0}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>alertas ativos</div>
                </div>
              </div>

              {/* Services */}
              <div className="sec-header">
                <div className="sec-title">Serviços do Condomínio</div>
              </div>
              <div className="services-list">
                {[
                  { icon: "📋", name: "Ocorrências", bg: "rgba(20,184,166,.15)", count: String(t?.os_abertas || 0), countColor: "var(--teal)" },
                  { icon: "📅", name: "Reservar Espaço", bg: "rgba(59,130,246,.15)", count: "3 disp.", countColor: "var(--blue)" },
                  { icon: "💳", name: "Boletos", bg: "rgba(245,158,11,.15)", count: "1 venc.", countColor: "var(--amber)" },
                  { icon: "🚗", name: "Autorizar Visitante", bg: "rgba(16,185,129,.15)", count: "✓", countColor: "var(--green)" },
                  { icon: "📦", name: "Encomendas", bg: "rgba(168,85,247,.15)", count: "2 aguard.", countColor: "var(--purple)" },
                ].map(s => (
                  <div key={s.name} className="service-item">
                    <div className="svc-icon" style={{ background: s.bg }}>{s.icon}</div>
                    <div className="svc-name">{s.name}</div>
                    <span className="svc-count" style={{ color: s.countColor, background: s.bg }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="phone-bottom-nav morador-nav">
              <div className="nav-item active"><span>🏠</span>Início</div>
              <div className="nav-item"><span>🚨</span>Alertas</div>
              <button className="nav-fab">➕</button>
              <div className="nav-item"><span>💬</span>Chat</div>
              <div className="nav-item"><span>👤</span>Perfil</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
