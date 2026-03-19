import React from 'react';
import { Reservoir, HistoryPoint, LiveLevel, SENSOR_COLORS, getSensorStatus, STATUS_STYLE } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
  onEdit?: (r: Reservoir) => void;
}

export default function ReservoirStatusList({ reservoirs, resNivels, resHistorico, onEdit }: Props) {
  if (reservoirs.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reservoirs.map((r, i) => {
        const live = resNivels[r.sensor_id];
        const hist = resHistorico[r.sensor_id];
        const nivel = Math.round(live?.nivel ?? hist?.[0]?.nivel ?? 0);
        const volume = live?.volume ?? hist?.[0]?.volume_litros ?? 0;
        const status = getSensorStatus(nivel);
        const ss = STATUS_STYLE[status];
        const col = SENSOR_COLORS[i % SENSOR_COLORS.length];

        const iconBg = status === 'normal' ? 'rgba(56,189,248,0.15)' : status === 'atencao' ? 'rgba(251,191,36,0.15)' : 'rgba(248,113,113,0.15)';
        const iconEl = status === 'normal' ? '💧' : status === 'atencao' ? '⚠️' : '🔴';

        return (
          <div key={r.id} style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            {/* Icon */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: iconBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>
              {iconEl}
            </div>

            {/* Name + local */}
            <div style={{ minWidth: 160, maxWidth: 200 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.sensor_id}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.nome || r.local || '—'} · {r.capacidade_litros.toLocaleString('pt-BR')} L cap.
              </div>
            </div>

            {/* Progress bar with 0% / 100% labels */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: '#6b7280' }}>0%</span>
                <span style={{ fontSize: 9, color: '#6b7280' }}>100%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, nivel)}%`,
                  borderRadius: 4,
                  background: ss.text,
                  transition: 'width .6s ease',
                }} />
              </div>
            </div>

            {/* Level % + volume */}
            <div style={{ textAlign: 'right', minWidth: 64, flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: ss.text, lineHeight: 1 }}>
                {nivel}%
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {volume.toLocaleString('pt-BR')} L
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              background: ss.bg, color: ss.text,
              borderRadius: 20, padding: '4px 13px',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
              minWidth: 64, textAlign: 'center',
            }}>
              {ss.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
