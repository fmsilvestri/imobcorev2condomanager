import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Reservoir, HistoryPoint, LiveLevel, SENSOR_COLORS } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
}

export default function ReservoirDonut({ reservoirs, resNivels, resHistorico }: Props) {
  const data = reservoirs.map((r, i) => {
    const live = resNivels[r.sensor_id];
    const hist = resHistorico[r.sensor_id];
    const volume = live?.volume ?? hist?.[0]?.volume_litros ?? 0;
    return {
      name: r.nome || r.sensor_id.slice(-6),
      value: volume,
      cap: r.capacidade_litros,
      local: r.local,
      color: SENSOR_COLORS[i % SENSOR_COLORS.length].fill,
      border: SENSOR_COLORS[i % SENSOR_COLORS.length].border,
    };
  });

  const totalVol = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
        Sem dados
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', height: 180, width: 180, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              paddingAngle={3}
              strokeWidth={3}
              stroke="#111827"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`${v.toLocaleString('pt-BR')} L`, 'Volume']}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#e2e8f0' }}>{(totalVol / 1000).toFixed(0)}k</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>litros</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
        {data.map((d, i) => {
          const pct = totalVol > 0 ? Math.round((d.value / totalVol) * 100) : 0;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontSize: 10, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.local}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: d.border }}>{d.value.toLocaleString('pt-BR')} L</div>
                <div style={{ fontSize: 9, color: '#6b7280' }}>{pct}% do total</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
