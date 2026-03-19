import React from 'react';
import { Reservoir, HistoryPoint, LiveLevel } from '../types/agua.types';
import { Period } from '../AguaModule';
import { isToday, subDays, isAfter } from 'date-fns';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
  period: Period;
}

export default function AguaSummaryCards({ reservoirs, resNivels, resHistorico, period }: Props) {
  const totalCapacity = reservoirs.reduce((s, r) => s + r.capacidade_litros, 0);

  const getVolume = (r: Reservoir): number => {
    const live = resNivels[r.sensor_id];
    if (live) return live.volume;
    const hist = resHistorico[r.sensor_id];
    if (hist && hist.length > 0) return hist[0].volume_litros;
    return 0;
  };

  const totalVolume = reservoirs.reduce((s, r) => s + getVolume(r), 0);
  const avgLevel = totalCapacity > 0 ? Math.round((totalVolume / totalCapacity) * 100) : 0;

  // Consumo: max - min volume in period
  const consumoHoje = reservoirs.reduce((s, r) => {
    const now = new Date();
    const hist = (resHistorico[r.sensor_id] || []).filter(p => {
      const d = new Date(p.received_at);
      if (period === '24h') return isToday(d);
      if (period === '7d') return isAfter(d, subDays(now, 7));
      return isAfter(d, subDays(now, 30));
    });
    if (hist.length < 2) return s;
    const maxV = Math.max(...hist.map(h => h.volume_litros));
    const minV = Math.min(...hist.map(h => h.volume_litros));
    return s + Math.max(0, maxV - minV);
  }, 0);

  // Variation vs previous reading
  const prevVolume = reservoirs.reduce((s, r) => {
    const hist = resHistorico[r.sensor_id];
    if (hist && hist.length > 1) return s + hist[1].volume_litros;
    return s;
  }, 0);
  const volumeDiff = totalVolume - prevVolume;
  const diffPct = prevVolume > 0 ? Math.round(Math.abs(volumeDiff) / prevVolume * 100) : 0;

  const alertCount = reservoirs.filter(r => {
    const n = resNivels[r.sensor_id]?.nivel ?? resHistorico[r.sensor_id]?.[0]?.nivel ?? 0;
    return n < 40;
  }).length;
  const warnCount = reservoirs.filter(r => {
    const n = resNivels[r.sensor_id]?.nivel ?? resHistorico[r.sensor_id]?.[0]?.nivel ?? 0;
    return n >= 40 && n < 70;
  }).length;

  const levelColor = avgLevel >= 70 ? '#4ade80' : avgLevel >= 40 ? '#fbbf24' : '#f87171';

  // Consumo variation vs 7-day avg
  const avg7d = reservoirs.reduce((s, r) => {
    const now = new Date();
    const hist = (resHistorico[r.sensor_id] || []).filter(p => isAfter(new Date(p.received_at), subDays(now, 7)));
    if (hist.length < 2) return s;
    return s + Math.max(0, Math.max(...hist.map(h => h.volume_litros)) - Math.min(...hist.map(h => h.volume_litros)));
  }, 0);
  const consumoDiff = avg7d > 0 ? Math.round((consumoHoje - avg7d) / avg7d * 100) : 0;

  const cards = [
    {
      label: 'VOLUME TOTAL',
      value: totalVolume.toLocaleString('pt-BR') + ' L',
      sub: `de ${totalCapacity.toLocaleString('pt-BR')} L capacidade`,
      color: '#38bdf8',
      subColor: '#6b7280',
    },
    {
      label: 'NÍVEL MÉDIO',
      value: avgLevel + '%',
      sub: volumeDiff !== 0 ? `${volumeDiff > 0 ? '▲' : '▼'} ${diffPct > 0 ? '+' : ''}${diffPct}% vs ontem` : 'Sem variação',
      color: levelColor,
      subColor: volumeDiff >= 0 ? '#4ade80' : '#f87171',
    },
    {
      label: 'CONSUMO HOJE',
      value: consumoHoje.toLocaleString('pt-BR') + ' L',
      sub: consumoDiff !== 0 ? `${consumoDiff > 0 ? '▲' : '▼'} ${Math.abs(consumoDiff)}% vs média` : 'Sem dados suficientes',
      color: '#fbbf24',
      subColor: consumoDiff > 0 ? '#f87171' : '#4ade80',
    },
    {
      label: 'ALERTAS ATIVOS',
      value: String(alertCount + warnCount),
      sub: `${alertCount} crítico · ${warnCount} atenção`,
      color: alertCount > 0 ? '#f87171' : warnCount > 0 ? '#fbbf24' : '#4ade80',
      subColor: alertCount > 0 ? '#f87171' : '#fbbf24',
    },
  ];

  return (
    <div className="agua-summary-grid">
      {cards.map(c => (
        <div key={c.label} style={{
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, letterSpacing: '.08em', marginBottom: 10 }}>
            {c.label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: c.color, lineHeight: 1, marginBottom: 6 }}>
            {c.value}
          </div>
          <div style={{ fontSize: 11, color: c.subColor }}>
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
