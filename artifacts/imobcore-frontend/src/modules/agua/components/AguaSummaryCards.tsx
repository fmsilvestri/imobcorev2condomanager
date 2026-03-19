import React from 'react';
import { Reservoir, HistoryPoint, LiveLevel } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
}

export default function AguaSummaryCards({ reservoirs, resNivels, resHistorico }: Props) {
  const totalCapacity = reservoirs.reduce((s, r) => s + r.capacidade_litros, 0);

  const totalVolume = reservoirs.reduce((s, r) => {
    const live = resNivels[r.sensor_id];
    if (live) return s + live.volume;
    const hist = resHistorico[r.sensor_id];
    if (hist && hist.length > 0) return s + (hist[0].volume_litros || 0);
    return s;
  }, 0);

  const avgLevel = totalCapacity > 0 ? Math.round((totalVolume / totalCapacity) * 100) : 0;

  const consumoHoje = reservoirs.reduce((s, r) => {
    const hist = (resHistorico[r.sensor_id] || []).filter(p => {
      const d = new Date(p.received_at);
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (hist.length < 2) return s;
    const maxVol = Math.max(...hist.map(h => h.volume_litros));
    const minVol = Math.min(...hist.map(h => h.volume_litros));
    return s + Math.max(0, maxVol - minVol);
  }, 0);

  const alertCount = reservoirs.filter(r => {
    const n = resNivels[r.sensor_id]?.nivel ?? resHistorico[r.sensor_id]?.[0]?.nivel ?? 0;
    return n < 40;
  }).length;

  const warnCount = reservoirs.filter(r => {
    const n = resNivels[r.sensor_id]?.nivel ?? resHistorico[r.sensor_id]?.[0]?.nivel ?? 0;
    return n >= 40 && n < 70;
  }).length;

  const prevVolume = reservoirs.reduce((s, r) => {
    const hist = resHistorico[r.sensor_id];
    if (hist && hist.length > 1) return s + (hist[1].volume_litros || 0);
    return s;
  }, 0);
  const volumeDiff = totalVolume - prevVolume;

  const levelColor = avgLevel >= 70 ? '#4ade80' : avgLevel >= 40 ? '#fbbf24' : '#f87171';

  const cards = [
    {
      label: 'Volume total',
      value: totalVolume.toLocaleString('pt-BR') + ' L',
      sub: `de ${totalCapacity.toLocaleString('pt-BR')} L capacidade`,
      color: '#38bdf8',
      icon: '💧',
    },
    {
      label: 'Nível médio',
      value: avgLevel + '%',
      sub: volumeDiff !== 0 ? `${volumeDiff > 0 ? '▲' : '▼'} ${Math.abs(Math.round(volumeDiff / 1000))}k L vs anterior` : 'Sem variação',
      color: levelColor,
      icon: '📊',
    },
    {
      label: 'Consumo hoje',
      value: consumoHoje.toLocaleString('pt-BR') + ' L',
      sub: 'volume consumido no dia',
      color: '#fbbf24',
      icon: '📉',
    },
    {
      label: 'Alertas ativos',
      value: String(alertCount + warnCount),
      sub: `${alertCount} crítico · ${warnCount} atenção`,
      color: alertCount > 0 ? '#f87171' : warnCount > 0 ? '#fbbf24' : '#4ade80',
      icon: alertCount > 0 ? '🚨' : warnCount > 0 ? '⚠️' : '✅',
    },
  ];

  return (
    <div className="agua-summary-grid">
      {cards.map(c => (
        <div key={c.label} style={{
          background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14, padding: '14px 16px',
          borderLeft: `3px solid ${c.color}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.label}</div>
            <span style={{ fontSize: 18 }}>{c.icon}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginBottom: 4 }}>{c.value}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
