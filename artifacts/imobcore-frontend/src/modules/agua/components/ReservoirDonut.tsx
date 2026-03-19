import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Reservoir, HistoryPoint, LiveLevel, SENSOR_COLORS } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
}

export default function ReservoirDonut({ reservoirs, resNivels, resHistorico }: Props) {
  const items = reservoirs.map((r, i) => {
    const live = resNivels[r.sensor_id];
    const hist = resHistorico[r.sensor_id];
    const volume = live?.volume ?? hist?.[0]?.volume_litros ?? 0;
    const nivel = live?.nivel ?? hist?.[0]?.nivel ?? (r.capacidade_litros > 0 ? Math.round(volume / r.capacidade_litros * 100) : 0);
    const sc = SENSOR_COLORS[i % SENSOR_COLORS.length];
    return {
      name: r.nome || r.sensor_id,
      volume,
      nivel: Math.round(nivel),
      fill: sc.fill,
      border: sc.border,
    };
  });

  if (items.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
        Sem dados
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 220, gap: 8 }}>
      <div style={{ flex: '0 0 150px', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items.map(it => ({ name: it.name, value: it.volume }))}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={72}
              paddingAngle={3}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {items.map((it, i) => (
                <Cell key={i} fill={it.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`${v.toLocaleString('pt-BR')} L`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: it.fill, flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.name}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: it.fill, lineHeight: 1 }}>
                {it.volume.toLocaleString('pt-BR')} L{' '}
                <span style={{ fontSize: 13, fontWeight: 600, opacity: .8 }}>{it.nivel}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
