import React from 'react';
import { Reservoir, HistoryPoint, LiveLevel, SENSOR_COLORS, getSensorStatus, STATUS_STYLE } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
  onEdit?: (r: Reservoir) => void;
}

const pulseStyle = `
@keyframes agua-pulse {
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.4;transform:scale(1.3)}
}`;

export default function ReservoirStatusList({ reservoirs, resNivels, resHistorico, onEdit }: Props) {
  if (reservoirs.length === 0) return null;

  return (
    <>
      <style>{pulseStyle}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reservoirs.map((r, i) => {
          const live = resNivels[r.sensor_id];
          const hist = resHistorico[r.sensor_id];
          const nivel = live?.nivel ?? hist?.[0]?.nivel ?? 0;
          const volume = live?.volume ?? hist?.[0]?.volume_litros ?? 0;
          const status = getSensorStatus(nivel);
          const ss = STATUS_STYLE[status];
          const col = SENSOR_COLORS[i % SENSOR_COLORS.length];
          const iconBg = status === 'normal' ? '#0c4a6e' : status === 'atencao' ? '#451a03' : '#450a0a';
          const iconEl = status === 'normal' ? '💧' : status === 'atencao' ? '⚠️' : '🔴';
          const ts = live?.ts ?? hist?.[0]?.received_at;
          const lastSeen = ts ? new Date(ts).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

          return (
            <div key={r.id} style={{ position: 'relative', background: '#0f172a', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
              {(status === 'critico' || status === 'atencao') && (
                <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: ss.text, animation: 'agua-pulse 1.5s infinite' }} />
              )}

              <div style={{ width: 32, height: 32, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {iconEl}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome || r.sensor_id}</div>
                <div style={{ fontSize: 10, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.local || '—'} · {r.capacidade_litros.toLocaleString('pt-BR')}L · {lastSeen}</div>
              </div>

              <div style={{ flex: 1.5, minWidth: 80 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: '#6b7280' }}>0%</span>
                  <span style={{ fontSize: 9, color: '#6b7280' }}>100%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, nivel)}%`, borderRadius: 3, background: ss.text, transition: 'width .6s ease' }} />
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 58 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: ss.text }}>{nivel}%</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{(volume / 1000).toFixed(1)}kL</div>
              </div>

              <div style={{ background: ss.bg, color: ss.text, borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {ss.label}
              </div>

              {onEdit && (
                <button onClick={() => onEdit(r)} style={{ background: 'none', border: 'none', color: col.border, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  Editar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
