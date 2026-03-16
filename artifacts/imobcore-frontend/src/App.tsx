import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrdemServico { id: string; numero: number; titulo: string; descricao?: string; categoria: string; status: string; prioridade: string; unidade?: string; responsavel?: string; updated_at?: string; created_at: string }
interface Sensor { id: string; sensor_id: string; nome: string; local: string; capacidade_litros: number; nivel_atual: number; volume_litros: number }
interface Alerta { id: string; origem: string; titulo: string; descricao?: string; tipo: string; nivel: string; cidade: string; bairro: string }
interface Receita { id: string; descricao: string; valor: number; categoria: string; status: string }
interface Despesa { id: string; descricao: string; valor: number; categoria: string; fornecedor?: string }
interface Comunicado { id: string; titulo: string; corpo: string; gerado_por_ia: boolean; created_at: string }
interface ChatMsg { role: "user" | "ai"; content: string; time: string }
interface DashTotais { os_abertas: number; os_urgentes: number; saldo: number; total_receitas: number; total_despesas: number; alertas_ativos: number; nivel_medio_agua: number }
interface CondominioInfo { id: string; nome: string; cidade: string; unidades: number; moradores: number; sindico_nome: string }
interface Dashboard { ordens_servico: OrdemServico[]; sensores: Sensor[]; alertas_publicos: Alerta[]; receitas: Receita[]; despesas: Despesa[]; comunicados: Comunicado[]; totais: DashTotais; condominios: CondominioInfo[] }

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
        setObCondo({ nome: c.nome || "", cnpj: "", endereco: "", cidade: c.cidade || "", estado: "SC", sindico_nome: c.sindico_nome || "", sindico_email: "", sindico_tel: "", unidades: String(c.unidades || "84") });
        setObSavedCondoId(c.id);
        setObInfra(p => ({ ...p, moradores: String(c.moradores || "168") }));
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
    setOsModal("editar");
  };

  const criarOS = async () => {
    if (!osForm.titulo.trim()) { showToast("Informe o título", "warn"); return; }
    const payload: Record<string, unknown> = { ...osForm, condominio_id: condId };
    if (osForm.numero) payload.numero = Number(osForm.numero);
    await fetch("/api/os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    showToast("✅ OS criada!", "success");
    setOsModal(null);
    ringBell();
    loadDashboard();
  };

  const salvarEditOS = async () => {
    if (!osEditId) return;
    if (!osForm.titulo.trim()) { showToast("Informe o título", "warn"); return; }
    const payload: Record<string, unknown> = {
      titulo: osForm.titulo, descricao: osForm.descricao, categoria: osForm.categoria,
      prioridade: osForm.prioridade, unidade: osForm.unidade, responsavel: osForm.responsavel,
    };
    if (osForm.numero) payload.numero = Number(osForm.numero);
    await fetch(`/api/os/${osEditId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    showToast("✅ OS atualizada", "success");
    setOsModal(null);
    loadDashboard();
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
              const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–";

              return (
                <>
                  {/* ── Stats Bar ── */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                    {[
                      { label: "Total", val: stats.total, color: "#94A3B8" },
                      { label: "Abertas", val: stats.abertas, color: "#F59E0B" },
                      { label: "Em andamento", val: stats.andamento, color: "#06B6D4" },
                      { label: "Concluídas", val: stats.concluidas, color: "#10B981" },
                      { label: "🔴 Urgentes", val: stats.urgentes, color: "#EF4444" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "8px 14px", minWidth: 90, textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                    <button onClick={openCriarOS} style={{ marginLeft: "auto", padding: "0 18px", background: "linear-gradient(135deg,#6366F1,#818CF8)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: ".02em" }}>
                      + Nova OS
                    </button>
                  </div>

                  {/* ── Toolbar ── */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      placeholder="🔍 Buscar por título, unidade, responsável..."
                      value={osSearch} onChange={e => setOsSearch(e.target.value)}
                      style={{ flex: 1, minWidth: 200, padding: "7px 12px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, color: "#F1F5F9", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                    {(["status","categoria","prioridade"] as const).map(key => (
                      <select key={key} value={osFilter[key]} onChange={e => setOsFilter(f => ({ ...f, [key]: e.target.value }))}
                        style={{ padding: "7px 10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, color: "#94A3B8", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                        <option value="todos">Todos {key === "status" ? "status" : key === "categoria" ? "categorias" : "prioridades"}</option>
                        {key === "status" && ["aberta","em_andamento","fechada"].map(v => <option key={v} value={v}>{v.replace("_"," ")}</option>)}
                        {key === "categoria" && ["hidraulica","eletrica","estrutural","limpeza","seguranca","equipamento","outros"].map(v => <option key={v} value={v}>{v}</option>)}
                        {key === "prioridade" && ["baixa","media","alta","urgente"].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ))}
                    <div style={{ display: "flex", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, overflow: "hidden" }}>
                      {(["tabela","cards"] as const).map(m => (
                        <button key={m} onClick={() => setOsViewMode(m)}
                          style={{ padding: "7px 12px", background: osViewMode === m ? "rgba(99,102,241,.3)" : "transparent", border: "none", color: osViewMode === m ? "#A5B4FC" : "#475569", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                          {m === "tabela" ? "☰" : "⊞"}
                        </button>
                      ))}
                    </div>
                    {(osSearch || osFilter.status !== "todos" || osFilter.categoria !== "todos" || osFilter.prioridade !== "todos") && (
                      <button onClick={() => { setOsSearch(""); setOsFilter({ status: "todos", categoria: "todos", prioridade: "todos" }); }}
                        style={{ padding: "7px 10px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, color: "#FCA5A5", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                        ✕ Limpar filtros
                      </button>
                    )}
                  </div>

                  {/* ── Resultados ── */}
                  {displayed.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 0", color: "#334155" }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>{allOs.length === 0 ? "✅" : "🔍"}</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{allOs.length === 0 ? "Nenhuma OS cadastrada" : "Nenhuma OS encontrada"}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{allOs.length === 0 ? "Crie a primeira ordem de serviço" : "Tente ajustar os filtros"}</div>
                      {allOs.length === 0 && <button onClick={openCriarOS} style={{ marginTop: 16, padding: "9px 20px", background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.25)", borderRadius: 9, color: "#A5B4FC", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>+ Nova OS</button>}
                    </div>
                  ) : osViewMode === "tabela" ? (
                    /* ── Tabela ── */
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: 70 }}>#</th>
                            <th>Título</th>
                            <th style={{ width: 90 }}>Cat.</th>
                            <th style={{ width: 90 }}>Prioridade</th>
                            <th style={{ width: 100 }}>Status</th>
                            <th style={{ width: 80 }}>Unidade</th>
                            <th style={{ width: 100 }}>Responsável</th>
                            <th style={{ width: 80 }}>Data</th>
                            <th style={{ width: 140 }}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayed.map(o => (
                            <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => openEditarOS(o)}>
                              <td><span style={{ fontFamily: "monospace", fontSize: 11, color: "#6366F1", fontWeight: 700 }}>OS-{String(o.numero || "?").padStart(3, "0")}</span></td>
                              <td>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{o.titulo}</div>
                                {o.descricao && <div style={{ fontSize: 10, color: "#475569", marginTop: 1, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descricao}</div>}
                              </td>
                              <td><span style={{ fontSize: 12 }}>{catIcon[o.categoria] || "📋"} <span style={{ fontSize: 10, color: "#64748B" }}>{o.categoria}</span></span></td>
                              <td><span className={`pill ${priPill(o.prioridade)}`}>{o.prioridade}</span></td>
                              <td><span className={`pill ${stsPill(o.status)}`}>{o.status.replace("_", " ")}</span></td>
                              <td style={{ fontSize: 11, color: "#64748B" }}>{o.unidade || "–"}</td>
                              <td style={{ fontSize: 11, color: "#64748B" }}>{o.responsavel || "–"}</td>
                              <td style={{ fontSize: 10, color: "#475569" }}>{fmtDate(o.created_at)}</td>
                              <td onClick={e => e.stopPropagation()}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  {o.status === "aberta" && <button className="btn btn-sm btn-success" onClick={() => updateOSStatus(o.id, "em_andamento")}>▶</button>}
                                  {o.status === "em_andamento" && <button className="btn btn-sm btn-success" onClick={() => updateOSStatus(o.id, "fechada")}>✓</button>}
                                  {o.status !== "aberta" && o.status !== "em_andamento" && <button className="btn btn-sm" style={{ background: "rgba(100,116,139,.15)", color: "#94A3B8" }} onClick={() => updateOSStatus(o.id, "aberta")}>↺</button>}
                                  <button className="btn btn-sm" style={{ background: "rgba(99,102,241,.12)", color: "#A5B4FC" }} onClick={() => openEditarOS(o)}>✏️</button>
                                  <button className="btn btn-sm btn-danger" onClick={() => setOsDeleteId(o.id)}>🗑</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* ── Cards ── */
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                      {displayed.map(o => (
                        <div key={o.id} onClick={() => openEditarOS(o)}
                          style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${o.prioridade === "urgente" ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.07)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "border-color .15s" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#6366F1", fontWeight: 700 }}>OS-{String(o.numero || "?").padStart(3, "0")}</span>
                            <div style={{ display: "flex", gap: 4 }}>
                              <span className={`pill ${priPill(o.prioridade)}`} style={{ fontSize: 9 }}>{o.prioridade}</span>
                              <span className={`pill ${stsPill(o.status)}`} style={{ fontSize: 9 }}>{o.status.replace("_"," ")}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{o.titulo}</div>
                          {o.descricao && <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, lineHeight: 1.5 }}>{o.descricao.slice(0, 80)}{o.descricao.length > 80 ? "…" : ""}</div>}
                          <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#64748B", marginBottom: 10 }}>
                            <span>{catIcon[o.categoria] || "📋"} {o.categoria}</span>
                            {o.unidade && <span>🏠 {o.unidade}</span>}
                            {o.responsavel && <span>👤 {o.responsavel}</span>}
                          </div>
                          <div style={{ display: "flex", gap: 4, justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#334155" }}>{fmtDate(o.created_at)}</span>
                            <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                              {o.status === "aberta" && <button className="btn btn-sm btn-success" onClick={() => updateOSStatus(o.id, "em_andamento")}>Iniciar</button>}
                              {o.status === "em_andamento" && <button className="btn btn-sm btn-success" onClick={() => updateOSStatus(o.id, "fechada")}>Concluir</button>}
                              <button className="btn btn-sm btn-danger" onClick={() => setOsDeleteId(o.id)}>🗑</button>
                            </div>
                          </div>
                        </div>
                      ))}
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
