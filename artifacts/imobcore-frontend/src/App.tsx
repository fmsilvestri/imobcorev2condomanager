import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrdemServico { id: string; numero: number; titulo: string; descricao?: string; categoria: string; status: string; prioridade: string; unidade?: string; created_at: string }
interface Sensor { id: string; sensor_id: string; nome: string; local: string; capacidade_litros: number; nivel_atual: number; volume_litros: number }
interface Alerta { id: string; origem: string; titulo: string; descricao?: string; tipo: string; nivel: string; cidade: string; bairro: string }
interface Receita { id: string; descricao: string; valor: number; categoria: string; status: string }
interface Despesa { id: string; descricao: string; valor: number; categoria: string; fornecedor?: string }
interface Comunicado { id: string; titulo: string; corpo: string; gerado_por_ia: boolean; created_at: string }
interface ChatMsg { role: "user" | "ai"; content: string; time: string }
interface DashTotais { os_abertas: number; os_urgentes: number; saldo: number; total_receitas: number; total_despesas: number; alertas_ativos: number; nivel_medio_agua: number }
interface Dashboard { ordens_servico: OrdemServico[]; sensores: Sensor[]; alertas_publicos: Alerta[]; receitas: Receita[]; despesas: Despesa[]; comunicados: Comunicado[]; totais: DashTotais }

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => "R$" + Math.round(v).toLocaleString("pt-BR");
const fmtBRLFull = (v: number) => "R$" + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtTime = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// ─── Styles ───────────────────────────────────────────────────────────────────
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
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideLeft{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes bellShake{0%,100%{transform:rotate(0)}20%{transform:rotate(-15deg)}40%{transform:rotate(15deg)}60%{transform:rotate(-10deg)}80%{transform:rotate(10deg)}}
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
.bell-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:var(--red);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #0D1220;padding:0 3px}
.bell-shake{animation:bellShake .4s ease}
.ph-card{margin:0 12px 10px;padding:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px}
.ph-card.grad-card{background:var(--grad);border:none;cursor:pointer}
.ph-card.grad-card-teal{background:var(--grad-teal);border:none}
.ph-card.critical{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);animation:pulse 2s infinite}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px;margin-bottom:10px}
.module-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 12px;cursor:pointer;transition:all .15s}
.module-card:hover{background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.2)}
.module-card-icon{font-size:22px;margin-bottom:6px}
.module-card-title{font-size:12px;font-weight:600;color:#CBD5E1;margin-bottom:2px}
.module-card-sub{font-size:10px;color:#475569}
.module-card-val{font-size:18px;font-weight:700;margin-top:4px}
.ph-subscreen{position:absolute;inset:0;background:#0D1220;z-index:200;display:flex;flex-direction:column;border-radius:48px;overflow:hidden;animation:slideLeft .2s ease}
.ph-subscreen.hidden{display:none}
.ph-sub-header{padding:16px 16px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--card-border);flex-shrink:0}
.back-btn{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.06);border:none;color:#E2E8F0;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
.back-btn:hover{background:rgba(255,255,255,.12)}
.ph-sub-title{font-size:14px;font-weight:700;flex:1}
.ph-sub-body{flex:1;overflow-y:auto;padding:12px}
.ph-sub-footer{padding:10px 12px;border-top:1px solid var(--card-border);flex-shrink:0}
.ph-os-item{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;margin-bottom:8px}
.ph-os-titulo{font-size:13px;font-weight:600;margin-bottom:4px}
.ph-os-meta{font-size:11px;color:#64748B;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ph-log-entry{padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px}
.ph-log-time{color:#334155;font-size:10px}
.ph-fin-item{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.ph-fin-label{font-size:12px;color:#CBD5E1}
.ph-fin-sub{font-size:10px;color:#475569}
.ph-fin-val{font-size:13px;font-weight:600}
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
.ob-steps{display:flex;align-items:center;justify-content:center;gap:0;padding:20px 40px;border-bottom:1px solid var(--card-border)}
.ob-step{display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;font-weight:500}
.ob-step.active{color:#A5B4FC}
.ob-step.done{color:#10B981}
.ob-step-num{width:24px;height:24px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.ob-step.active .ob-step-num{background:rgba(99,102,241,.2);border-color:var(--indigo)}
.ob-step.done .ob-step-num{background:rgba(16,185,129,.2);border-color:var(--green)}
.ob-sep{width:24px;height:1px;background:var(--card-border);flex-shrink:0;margin:0 4px}
.ob-body{padding:32px 40px}
.ob-footer{padding:20px 40px;border-top:1px solid var(--card-border);display:flex;align-items:center;justify-content:space-between}
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
.ob-progress{height:3px;background:var(--card-border);border-radius:2px;margin-bottom:24px;overflow:hidden}
.ob-progress-bar{height:100%;background:var(--grad);border-radius:2px;transition:width .3s ease}
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
export default function App() {
  const [view, setView] = useState<"gestor" | "sindico" | "morador" | "onboarding">("gestor");
  const [panel, setPanel] = useState("sv-chat");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [condId, setCondId] = useState<string | null>(null);
  const [sseOnline, setSseOnline] = useState(false);
  const [clock, setClock] = useState(fmtTime());
  const [logs, setLogs] = useState<{ ev: string; data: string; time: string }[]>([]);
  const [sseCount, setSseCount] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const toastIdRef = useRef(0);
  const [bellCount, setBellCount] = useState(0);
  const [bellShake, setBellShake] = useState(false);

  // Sub-screen navigation
  const [sindicoScreen, setSindicoScreen] = useState<string | null>(null);
  const [moradorScreen, setMoradorScreen] = useState<string | null>(null);

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

  // OS form
  const [osFormOpen, setOsFormOpen] = useState(false);
  const [osForm, setOsForm] = useState({ titulo: "", descricao: "", categoria: "hidraulica", prioridade: "media", unidade: "" });

  // Comunicado
  const [comTema, setComTema] = useState("");
  const [comLoading, setComLoading] = useState(false);
  const [comPreview, setComPreview] = useState<{ titulo: string; corpo: string } | null>(null);

  // Insights
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Visitante form
  const [visitante, setVisitante] = useState({ nome: "", documento: "", motivo: "", unidade: "", placa: "" });
  const [visitanteSent, setVisitanteSent] = useState(false);

  // Calendar
  const [calSel, setCalSel] = useState<number | null>(null);

  // ── Onboarding Wizard ─────────────────────────────────────────────────────
  const [obStep, setObStep] = useState(0);
  const [obLoading, setObLoading] = useState(false);
  const [obIsReset, setObIsReset] = useState(false);
  const [obCondo, setObCondo] = useState({ nome: "", cidade: "", unidades: "84", moradores: "168", sindico_nome: "" });
  const [obSensors, setObSensors] = useState([
    { sensor_id: "sensor_cisterna", nome: "Cisterna Principal", local: "Subsolo", capacidade_litros: "20000", nivel_atual: "80" },
    { sensor_id: "sensor_torre_a", nome: "Caixa Torre A", local: "Telhado Torre A", capacidade_litros: "5000", nivel_atual: "75" },
    { sensor_id: "sensor_torre_b", nome: "Caixa Torre B", local: "Telhado Torre B", capacidade_litros: "5000", nivel_atual: "70" },
    { sensor_id: "sensor_piscina", nome: "Tanque Piscina", local: "Área da Piscina", capacidade_litros: "8000", nivel_atual: "85" },
    { sensor_id: "sensor_jardim", nome: "Reservatório Jardim", local: "Área Verde", capacidade_litros: "2000", nivel_atual: "60" },
  ]);
  const [obSaldo, setObSaldo] = useState("50000");

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Bell ──────────────────────────────────────────────────────────────────
  const ringBell = useCallback(() => {
    setBellCount(c => c + 1);
    setBellShake(true);
    setTimeout(() => setBellShake(false), 500);
  }, []);

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard");
      const d: Dashboard = await r.json();
      setDash(d);
      if (d.condominios?.[0]) {
        setCondId(d.condominios[0].id);
        // Pre-fill onboarding with existing condo data for reconfiguration
        const c = d.condominios[0];
        setObCondo({ nome: c.nome || "", cidade: c.cidade || "", unidades: String(c.unidades || "84"), moradores: String(c.moradores || "168"), sindico_nome: c.sindico_nome || "" });
      } else {
        // No condo configured — go to onboarding automatically
        setView("onboarding");
        setObStep(0);
      }
    } catch (e) { console.error("dashboard err:", e); }
  }, []);

  // ── Ativar ImobCore (Onboarding Submit) ───────────────────────────────────
  const ativarImobCore = useCallback(async () => {
    if (!obCondo.nome.trim()) { showToast("Nome do condomínio é obrigatório", "warn"); return; }
    setObLoading(true);
    try {
      const payload = {
        nome: obCondo.nome, cidade: obCondo.cidade,
        unidades: Number(obCondo.unidades), moradores: Number(obCondo.moradores),
        sindico_nome: obCondo.sindico_nome,
        sensores: obSensors.map(s => ({ ...s, capacidade_litros: Number(s.capacidade_litros), nivel_atual: Number(s.nivel_atual) })),
        saldo_inicial: Number(obSaldo) || 0,
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
  }, [obCondo, obSensors, obSaldo, obIsReset, showToast, loadDashboard]);

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
  const criarOS = async () => {
    if (!osForm.titulo.trim()) { showToast("Informe o título", "warn"); return; }
    await fetch("/api/os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...osForm, condominio_id: condId }) });
    showToast("✅ OS criada", "success");
    setOsForm({ titulo: "", descricao: "", categoria: "hidraulica", prioridade: "media", unidade: "" });
    setOsFormOpen(false);
    ringBell();
    loadDashboard();
  };
  const updateOS = async (id: string, status: string) => {
    await fetch(`/api/os/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    showToast("OS atualizada", "success");
    loadDashboard();
  };

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

  // ── Onboarding Wizard ─────────────────────────────────────────────────────
  const OB_STEPS = ["Condomínio", "Sensores IoT", "Financeiro", "Ativação"];
  const renderOnboarding = () => {
    const progress = ((obStep) / (OB_STEPS.length - 1)) * 100;
    const hasCondo = (dash?.condominios?.length ?? 0) > 0;

    return (
      <div className="ob-wrap" style={{ overflowY: "auto", marginTop: "var(--topbar-h)" }}>
        <div className="ob-card">
          <div className="ob-hero">
            <div className="ob-hero-logo">🏢</div>
            <div className="ob-hero-title">
              {obIsReset ? "Reconfigurar ImobCore" : hasCondo ? "Reconfigurar ImobCore" : "Configurar ImobCore"}
            </div>
            <div className="ob-hero-sub">
              {obIsReset ? "Dados atuais serão apagados e substituídos" : "Configure seu condomínio em minutos"}
            </div>
          </div>

          <div className="ob-steps">
            {OB_STEPS.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                <div className={`ob-step ${i === obStep ? "active" : i < obStep ? "done" : ""}`}>
                  <div className="ob-step-num">{i < obStep ? "✓" : i + 1}</div>
                  <span style={{ display: window.innerWidth > 500 ? "inline" : "none" }}>{s}</span>
                </div>
                {i < OB_STEPS.length - 1 && <div className="ob-sep" />}
              </div>
            ))}
          </div>

          <div className="ob-body">
            <div className="ob-progress"><div className="ob-progress-bar" style={{ width: progress + "%" }} /></div>

            {/* STEP 0: Condomínio */}
            {obStep === 0 && (
              <div style={{ animation: "fadeIn .2s ease" }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🏢 Dados do Condomínio</div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>Informações básicas do seu condomínio</div>
                <div className="form-group">
                  <label className="form-label">Nome do Condomínio *</label>
                  <input className="form-control" value={obCondo.nome} onChange={e => setObCondo(c => ({ ...c, nome: e.target.value }))} placeholder="Ex: Residencial Parque das Flores" autoFocus />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Cidade</label>
                    <input className="form-control" value={obCondo.cidade} onChange={e => setObCondo(c => ({ ...c, cidade: e.target.value }))} placeholder="Ex: Florianópolis" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nome do Síndico</label>
                    <input className="form-control" value={obCondo.sindico_nome} onChange={e => setObCondo(c => ({ ...c, sindico_nome: e.target.value }))} placeholder="Ex: Ricardo Gestor" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total de Unidades</label>
                    <input className="form-control" type="number" value={obCondo.unidades} onChange={e => setObCondo(c => ({ ...c, unidades: e.target.value }))} placeholder="84" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total de Moradores</label>
                    <input className="form-control" type="number" value={obCondo.moradores} onChange={e => setObCondo(c => ({ ...c, moradores: e.target.value }))} placeholder="168" />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Sensores IoT */}
            {obStep === 1 && (
              <div style={{ animation: "fadeIn .2s ease" }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>💧 Sensores IoT de Água</div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>Configure os 5 sensores do sistema</div>
                <div className="ob-sensor-row" style={{ marginBottom: 4 }}>
                  <div className="ob-sensor-hdr">Sensor ID</div>
                  <div className="ob-sensor-hdr">Nome</div>
                  <div className="ob-sensor-hdr">Local</div>
                  <div className="ob-sensor-hdr">Cap. (L)</div>
                  <div className="ob-sensor-hdr">Nível %</div>
                </div>
                {obSensors.map((s, i) => (
                  <div key={i} className="ob-sensor-row">
                    <input className="form-control" style={{ fontSize: 11, padding: "5px 8px" }} value={s.sensor_id}
                      onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, sensor_id: e.target.value } : x))} />
                    <input className="form-control" style={{ fontSize: 11, padding: "5px 8px" }} value={s.nome}
                      onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                    <input className="form-control" style={{ fontSize: 11, padding: "5px 8px" }} value={s.local}
                      onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, local: e.target.value } : x))} />
                    <input className="form-control" style={{ fontSize: 11, padding: "5px 8px" }} type="number" value={s.capacidade_litros}
                      onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, capacidade_litros: e.target.value } : x))} />
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input className="form-control" style={{ fontSize: 11, padding: "5px 8px" }} type="number" min="0" max="100" value={s.nivel_atual}
                        onChange={e => setObSensors(arr => arr.map((x, j) => j === i ? { ...x, nivel_atual: e.target.value } : x))} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>💡 5 sensores pré-configurados. Ajuste conforme sua infraestrutura.</div>
              </div>
            )}

            {/* STEP 2: Financeiro */}
            {obStep === 2 && (
              <div style={{ animation: "fadeIn .2s ease" }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>💰 Saldo Inicial</div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>Configure o saldo inicial do condomínio</div>
                <div className="form-group">
                  <label className="form-label">Saldo Inicial do Fundo (R$)</label>
                  <input className="form-control" type="number" value={obSaldo} onChange={e => setObSaldo(e.target.value)} placeholder="50000" />
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>Será lançado como receita "Saldo inicial" no sistema financeiro.</div>
                </div>
                <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 12, padding: 16, marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#A5B4FC", marginBottom: 6 }}>📋 Módulos que serão ativados</div>
                  {[
                    ["🤖", "Síndico Virtual IA", "Chat inteligente com Claude AI"],
                    ["💧", "IoT Água", "5 sensores de nível monitorados"],
                    ["🔧", "Ordens de Serviço", "CRUD completo com SSE em tempo real"],
                    ["💰", "Financeiro", "Receitas, despesas e saldo"],
                    ["🚨", "MISP", "Alertas públicos de segurança"],
                    ["📢", "Comunicados IA", "Geração automática de comunicados"],
                  ].map(([ic, n, d]) => (
                    <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                      <span style={{ fontSize: 16, marginTop: 1 }}>{ic}</span>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>{n}</div><div style={{ fontSize: 11, color: "#475569" }}>{d}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 3: Ativação */}
            {obStep === 3 && (
              <div style={{ animation: "fadeIn .2s ease" }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🚀 Resumo & Ativação</div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>Confirme os dados antes de ativar</div>
                {[
                  ["🏢 Condomínio", obCondo.nome || "–"],
                  ["📍 Cidade", obCondo.cidade || "–"],
                  ["👤 Síndico", obCondo.sindico_nome || "–"],
                  ["🏠 Unidades", obCondo.unidades],
                  ["👥 Moradores", obCondo.moradores],
                  ["💧 Sensores IoT", `${obSensors.length} configurados`],
                  ["💰 Saldo Inicial", `R$ ${Number(obSaldo || 0).toLocaleString("pt-BR")}`],
                ].map(([l, v]) => (
                  <div key={l as string} className="ob-confirm-row">
                    <div className="ob-confirm-label">{l}</div>
                    <div className="ob-confirm-val">{v as string}</div>
                  </div>
                ))}
                {obIsReset && (
                  <div style={{ marginTop: 16, padding: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#F87171" }}>⚠️ Modo Reconfiguração</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>Todos os dados existentes (OSs, sensores, financeiro, comunicados) serão apagados e substituídos.</div>
                  </div>
                )}
                <button className="btn-ativar" onClick={ativarImobCore} disabled={obLoading} style={{ marginTop: 24 }}>
                  {obLoading ? <><span style={{ animation: "pulse 1s infinite" }}>⏳</span> Ativando...</> : <><span>🚀</span> Ativar ImobCore</>}
                </button>
              </div>
            )}
          </div>

          <div className="ob-footer">
            <button className="btn-ob-back" onClick={() => {
              if (obStep === 0) { if (hasCondo) setView("gestor"); }
              else setObStep(s => s - 1);
            }}>
              {obStep === 0 ? (hasCondo ? "✕ Cancelar" : "") : "← Voltar"}
            </button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#334155" }}>{obStep + 1} / {OB_STEPS.length}</span>
              {obStep < OB_STEPS.length - 1 && (
                <button className="btn-ob-next" onClick={() => { if (obStep === 0 && !obCondo.nome.trim()) { showToast("Informe o nome do condomínio", "warn"); return; } setObStep(s => s + 1); }}>
                  Próximo →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render Phone Sub-Screen ───────────────────────────────────────────────
  const renderSindicoScreen = () => {
    if (!sindicoScreen) return null;

    const screenTitle: Record<string, string> = {
      planejamento: "📋 Planejamento",
      sindico: "🤖 Síndico Virtual IA",
      iot: "📡 Monitor IoT",
      agua: "💧 Água IoT",
      financeiro: "💰 Financeiro",
      misp: "🚨 Alertas MISP",
    };

    return (
      <div className="ph-subscreen">
        <div style={{ height: 30, flexShrink: 0 }} />
        <div className="ph-sub-header">
          <button className="back-btn" onClick={() => setSindicoScreen(null)}>←</button>
          <div className="ph-sub-title">{screenTitle[sindicoScreen]}</div>
          {sseOnline && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />}
        </div>

        {/* PLANEJAMENTO: OSs abertas */}
        {sindicoScreen === "planejamento" && (
          <div className="ph-sub-body">
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>{osAbertas.length} ordens em aberto</div>
            {osAbertas.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#334155", fontSize: 12 }}>✅ Nenhuma OS em aberto</div>}
            {osAbertas.map(o => (
              <div key={o.id} className="ph-os-item">
                <div className="ph-os-titulo">{o.titulo}</div>
                <div className="ph-os-meta">
                  <span className={`pill ${priPill(o.prioridade)}`}>{o.prioridade}</span>
                  <span className={`pill ${stsPill(o.status)}`}>{o.status.replace("_", " ")}</span>
                  {o.unidade && <span style={{ color: "#475569" }}>· {o.unidade}</span>}
                </div>
                <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>{fmtDate(o.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {/* SÍNDICO IA: chat fullscreen */}
        {sindicoScreen === "sindico" && (
          <>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "6px 12px", borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
              {[["📊 Resumo", "Resumo rápido do condomínio"], ["🔴 Urgentes", "Quais OSs urgentes?"], ["💧 Água", "Status dos sensores"]].map(([l, m]) => (
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
    };

    return (
      <div className="ph-subscreen" style={{ background: "#0a1520" }}>
        <div style={{ height: 30, flexShrink: 0 }} />
        <div className="ph-sub-header" style={{ borderColor: "rgba(20,184,166,.2)" }}>
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
            {(dash?.receitas || []).concat(dash?.despesas?.slice(0, 2) || []).slice(0, 6).map((item, i) => (
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
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>Alertas públicos da região – atualizado via Supabase</div>
            {(dash?.alertas_publicos || []).length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: "#334155", fontSize: 12 }}>✅ Sem alertas ativos</div>
            )}
            {(dash?.alertas_publicos || []).map(a => {
              const nc = { alto: "#EF4444", medio: "#F59E0B", baixo: "#10B981" }[a.nivel] || "#94A3B8";
              return (
                <div key={a.id} className="ph-os-item" style={{ borderColor: nc + "40" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div className="ph-os-titulo">{a.titulo}</div>
                    <span style={{ fontSize: 10, color: nc, fontWeight: 600 }}>{a.nivel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{a.descricao}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{a.cidade} – {a.bairro}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="logo"><span>🤖</span> ImobCore <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 600, background: "rgba(99,102,241,.1)", padding: "2px 6px", borderRadius: 4 }}>v2</span></div>

        {/* Main view buttons — hide when in onboarding with no condo */}
        {((dash?.condominios?.length ?? 0) > 0 || view !== "onboarding") && (
          <div className="view-btns">
            <button className={`view-btn ${view === "gestor" ? "active" : ""}`} onClick={() => setView("gestor")}>⚡ Painel Gestor</button>
            <button className={`view-btn ${view === "sindico" ? "active" : ""}`} onClick={() => setView("sindico")}>📱 App Síndico</button>
            <button className={`view-btn ${view === "morador" ? "active" : ""}`} onClick={() => setView("morador")}>🏠 App Morador</button>
          </div>
        )}

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
          <div className="sb-label">Módulos</div>
          <div className={`sb-item ${panel === "operacao" ? "active" : ""}`} onClick={() => setPanel("operacao")}>
            <span className="sb-icon">🔧</span> Ordens de Serviço<span className="sb-badge">{t?.os_abertas || 0}</span>
          </div>
          <div className={`sb-item ${panel === "financeiro" ? "active" : ""}`} onClick={() => setPanel("financeiro")}>
            <span className="sb-icon">💰</span> Financeiro
          </div>
          <div className={`sb-item ${panel === "iot" ? "active" : ""}`} onClick={() => setPanel("iot")}>
            <span className="sb-icon">💧</span> Água IoT
          </div>
          <div className={`sb-item ${panel === "misp" ? "active" : ""}`} onClick={() => setPanel("misp")}>
            <span className="sb-icon">🚨</span> MISP<span className="sb-badge">{t?.alertas_ativos || 0}</span>
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
              { label: "Score Cond.", val: "847", sub: "excelente", color: "var(--purple)" },
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
            <div className="chat-chips">
              {[["📊 Resumo executivo", "Faça um resumo executivo do condomínio agora"], ["🔴 OSs urgentes", "Quais são as OSs urgentes pendentes?"], ["💧 Água + IoT", "Como está a situação da água e sensores IoT?"], ["💰 Financeiro", "Análise financeira completa"], ["⭐ Score", "Como melhorar o score do condomínio?"]].map(([l, m]) => (
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

          {/* PANEL: INSIGHTS */}
          <div className={`panel ${panel === "sv-insights" ? "active" : ""} card`}>
            <div className="card-title">💡 Insights do Condomínio</div>
            {insightsLoading && <div style={{ color: "#94A3B8", textAlign: "center", padding: 30 }}>🔮 Gerando insights via IA...</div>}
            {insights && <div style={{ fontSize: 13, lineHeight: 1.6, color: "#CBD5E1", whiteSpace: "pre-wrap" }}>{insights}</div>}
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
            <div className="card">
              <div className="card-title">🔧 Ordens de Serviço
                <button className="btn btn-primary btn-sm" onClick={() => setOsFormOpen(o => !o)} style={{ marginLeft: "auto" }}>+ Nova OS</button>
              </div>
              <div className={`os-form ${osFormOpen ? "open" : ""}`}>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Título *</label>
                    <input className="form-control" value={osForm.titulo} onChange={e => setOsForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Título" /></div>
                  <div className="form-group"><label className="form-label">Prioridade</label>
                    <select className="form-control" value={osForm.prioridade} onChange={e => setOsForm(f => ({ ...f, prioridade: e.target.value }))}>
                      {["baixa", "media", "alta", "urgente"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Unidade</label>
                    <input className="form-control" value={osForm.unidade} onChange={e => setOsForm(f => ({ ...f, unidade: e.target.value }))} placeholder="Ex: Apto 101" /></div>
                  <div className="form-group"><label className="form-label">Categoria</label>
                    <select className="form-control" value={osForm.categoria} onChange={e => setOsForm(f => ({ ...f, categoria: e.target.value }))}>
                      {["hidraulica", "eletrica", "estrutural", "limpeza", "seguranca", "equipamento", "outros"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select></div>
                </div>
                <div className="form-group"><label className="form-label">Descrição</label>
                  <textarea className="fc" value={osForm.descricao} onChange={e => setOsForm(f => ({ ...f, descricao: e.target.value }))} rows={2} placeholder="Descreva o problema..." /></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" onClick={criarOS}>✓ Criar OS</button>
                  <button className="btn btn-ghost" onClick={() => setOsFormOpen(false)}>Cancelar</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th style={{ width: 60 }}>#</th><th>Título</th><th style={{ width: 100 }}>Prioridade</th><th style={{ width: 90 }}>Status</th><th style={{ width: 80 }}>Unidade</th><th style={{ width: 160 }}>Ações</th></tr></thead>
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
              {[{ label: "Saldo", val: fmtBRLFull(t?.saldo || 0), color: "var(--green)" }, { label: "Receitas", val: fmtBRLFull(t?.total_receitas || 0), color: "var(--cyan)" }, { label: "Despesas", val: fmtBRLFull(t?.total_despesas || 0), color: "var(--red)" }].map(k => (
                <div key={k.label} className="fin-kpi"><div className="fin-kpi-label">{k.label}</div><div className="fin-kpi-val" style={{ color: k.color }}>{k.val}</div></div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div className="card-title">📈 Receitas</div>
                {(dash?.receitas || []).map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div><div style={{ fontSize: 13 }}>{r.descricao}</div><div style={{ fontSize: 11, color: "#475569" }}>{r.categoria}</div></div>
                    <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>{fmtBRLFull(r.valor)}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="card-title">📉 Despesas</div>
                {(dash?.despesas || []).map(d => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div><div style={{ fontSize: 13 }}>{d.descricao}</div><div style={{ fontSize: 11, color: "#475569" }}>{d.fornecedor || d.categoria}</div></div>
                    <div style={{ color: "var(--red)", fontWeight: 600, fontSize: 13 }}>-{fmtBRLFull(d.valor)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PANEL: IoT */}
          <div className={`panel ${panel === "iot" ? "active" : ""} card`}>
            <div className="card-title">💧 Sensores de Água – IoT em Tempo Real
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>↻ 10s</span>
            </div>
            <div className="sensor-grid">
              {(dash?.sensores || []).map(s => <SensorRing key={s.id} sensor={s} />)}
            </div>
          </div>

          {/* PANEL: MISP */}
          <div className={`panel ${panel === "misp" ? "active" : ""} card`}>
            <div className="card-title">🚨 Alertas Públicos – MISP</div>
            {(dash?.alertas_publicos || []).length === 0 && <div style={{ color: "#475569", textAlign: "center", padding: 20, fontSize: 13 }}>Nenhum alerta ativo</div>}
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
      <div className={`view ${view === "sindico" ? "active" : ""}`} style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="phone-frame">
          <div className="phone-inner">
            <div className="phone-notch" />
            <div className="phone-status"><span>{clock}</span><span>📶 5G 🔋</span></div>
            <div className="phone-header">
              <div className="phone-avatar">R</div>
              <div className="phone-user-info">
                <div className="phone-user-name">Ricardo Gestor</div>
                <div className="phone-user-sub">Síndico – Res. Parque das Flores</div>
              </div>
              <div className={`phone-bell ${bellShake ? "bell-shake" : ""}`} onClick={() => setBellCount(0)}>
                🔔{bellCount > 0 && <div className="bell-badge">{bellCount > 99 ? "99+" : bellCount}</div>}
              </div>
            </div>

            <div className="phone-content">
              {urgentes > 0 && (
                <div className="ph-card critical" style={{ margin: "0 12px 8px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>⚠️ ATENÇÃO URGENTE</div>
                  <div style={{ fontSize: 11, color: "#FCA5A5" }}>
                    {(dash?.ordens_servico || []).find(o => o.prioridade === "urgente" && o.status === "aberta")?.titulo}
                  </div>
                </div>
              )}

              <div className="ph-card grad-card" onClick={() => setSindicoScreen("sindico")}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginBottom: 2 }}>SÍNDICO VIRTUAL IA</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Falar com IA 🤖</div>
                  </div>
                  <span style={{ fontSize: 28 }}>🤖</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", lineHeight: 1.4 }}>
                  {mobileMsgs[mobileMsgs.length - 1]?.role === "ai"
                    ? mobileMsgs[mobileMsgs.length - 1].content.substring(0, 100) + "..."
                    : "Toque para consultar o Síndico Virtual IA..."}
                </div>
              </div>

              <div className="sec-header"><div className="sec-title">Gestão do Condomínio</div></div>
              <div className="grid-2">
                {[
                  { icon: "📋", title: "Planejamento", sub: "OSs abertas", val: String(osAbertas.length), color: "var(--amber)", screen: "planejamento" },
                  { icon: "💰", title: "Financeiro", sub: "Saldo atual", val: fmtBRL(t?.saldo || 0), color: "var(--green)", screen: "financeiro" },
                  { icon: "💧", title: "Água IoT", sub: "Nível médio", val: nivelMedio + "%", color: "var(--cyan)", screen: "agua" },
                  { icon: "🚨", title: "MISP", sub: "Alertas ativos", val: String(t?.alertas_ativos || 0), color: "var(--red)", screen: "misp" },
                  { icon: "📡", title: "Monitor IoT", sub: "Eventos SSE", val: String(sseCount), color: "var(--green)", screen: "iot" },
                  { icon: "🤖", title: "Síndico Virtual", sub: "Chat IA", val: "847", color: "var(--purple)", screen: "sindico" },
                ].map(m => (
                  <div key={m.title} className="module-card" onClick={() => setSindicoScreen(m.screen)}>
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
              <div className="nav-item" onClick={() => setSindicoScreen("misp")}><span>🚨</span>Alertas</div>
              <button className="nav-fab" onClick={() => setSindicoScreen("sindico")}>🤖</button>
              <div className="nav-item" onClick={() => setSindicoScreen("planejamento")}><span>📋</span>OSs</div>
              <div className="nav-item"><span>👤</span>Perfil</div>
            </div>

            {/* Sub-screen overlay */}
            {renderSindicoScreen()}
          </div>
        </div>
      </div>

      {/* ══ VIEW 3: APP MORADOR ════════════════════════════════════════════════ */}
      <div className={`view ${view === "morador" ? "active" : ""}`} style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="phone-frame">
          <div className="phone-inner" style={{ background: "#0a1520" }}>
            <div className="phone-notch" />
            <div className="phone-status"><span>{clock}</span><span>📶 4G 🔋</span></div>
            <div className="phone-header">
              <div className="phone-avatar teal">A</div>
              <div className="phone-user-info">
                <div className="phone-user-name">Ana Silva</div>
                <div className="phone-user-sub">Apto 204 – Torre A</div>
              </div>
              <div className="phone-bell">
                🔔{(t?.alertas_ativos || 0) > 0 && <div className="bell-badge">{t?.alertas_ativos}</div>}
              </div>
            </div>

            <div className="phone-content">
              {/* Comunicado do topo — atualiza via SSE */}
              <div className="ph-card grad-card-teal" onClick={() => setMoradorScreen("comunicados")} style={{ cursor: "pointer" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.75)", marginBottom: 4 }}>📢 COMUNICADO RECENTE</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  {dash?.comunicados?.[0]?.titulo || "Carregando..."}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                  {dash?.comunicados?.[0]?.corpo || "–"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 6 }}>
                  {dash?.comunicados?.[0] ? fmtDate(dash.comunicados[0].created_at) : "–"} · Toque para ver todos
                </div>
              </div>

              {/* Status grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 12px", marginBottom: 10 }}>
                <div className="ph-card" style={{ margin: 0, textAlign: "center", cursor: "pointer" }} onClick={() => setMoradorScreen("agua")}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>💧 Água</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--teal)" }}>{nivelMedio}%</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>nível médio ↻10s</div>
                </div>
                <div className="ph-card" style={{ margin: 0, textAlign: "center", cursor: "pointer" }} onClick={() => setMoradorScreen("misp")}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>🚨 MISP</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)" }}>{t?.alertas_ativos || 0}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>alertas ativos</div>
                </div>
              </div>

              <div className="sec-header"><div className="sec-title">Serviços do Condomínio</div></div>
              <div className="services-list">
                {[
                  { icon: "📋", name: "Ocorrências", bg: "rgba(20,184,166,.15)", count: String(t?.os_abertas || 0), color: "var(--teal)", screen: null },
                  { icon: "📅", name: "Reservar Espaço", bg: "rgba(59,130,246,.15)", count: "3 disp.", color: "var(--blue)", screen: "reserva" },
                  { icon: "💳", name: "Boletos", bg: "rgba(245,158,11,.15)", count: "1 venc.", color: "var(--amber)", screen: "boletos" },
                  { icon: "🚗", name: "Autorizar Visitante", bg: "rgba(16,185,129,.15)", count: "✓", color: "var(--green)", screen: "visitante" },
                  { icon: "📢", name: "Comunicados", bg: "rgba(99,102,241,.15)", count: String(dash?.comunicados?.length || 0), color: "var(--indigo)", screen: "comunicados" },
                  { icon: "🚨", name: "Alertas MISP", bg: "rgba(239,68,68,.15)", count: String(t?.alertas_ativos || 0), color: "var(--red)", screen: "misp" },
                ].map(s => (
                  <div key={s.name} className="service-item" onClick={() => s.screen && setMoradorScreen(s.screen)}>
                    <div className="svc-icon" style={{ background: s.bg }}>{s.icon}</div>
                    <div className="svc-name">{s.name}</div>
                    <span className="svc-count" style={{ color: s.color, background: s.bg }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="phone-bottom-nav morador-nav">
              <div className="nav-item active"><span>🏠</span>Início</div>
              <div className="nav-item" onClick={() => setMoradorScreen("misp")}><span>🚨</span>Alertas</div>
              <button className="nav-fab" onClick={() => setMoradorScreen("visitante")}>➕</button>
              <div className="nav-item" onClick={() => setMoradorScreen("comunicados")}><span>💬</span>Avisos</div>
              <div className="nav-item"><span>👤</span>Perfil</div>
            </div>

            {/* Sub-screen overlay */}
            {renderMoradorScreen()}
          </div>
        </div>
      </div>

      {/* ══ VIEW 4: ONBOARDING ════════════════════════════════════════════════ */}
      {view === "onboarding" && renderOnboarding()}
    </>
  );
}
