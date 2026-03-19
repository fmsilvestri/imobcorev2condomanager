import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { Reservoir, HistoryPoint, LiveLevel, SENSOR_COLORS } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
}

export default function ReservoirBarChart({ reservoirs, resNivels, resHistorico }: Props) {
  const data = reservoirs.map((r, i) => {
    const live = resNivels[r.sensor_id];
    const hist = resHistorico[r.sensor_id];
    const volume = live?.volume ?? hist?.[0]?.volume_litros ?? 0;
    const remaining = Math.max(0, r.capacidade_litros - volume);
    const col = SENSOR_COLORS[i % SENSOR_COLORS.length];
    return {
      name: (r.nome || r.sensor_id).slice(0, 10),
      volume,
      remaining,
      fillColor: col.fill,
      bgColor: col.bg.replace('0.08', '0.25').replace('0.06', '0.2'),
      cap: r.capacidade_litros,
    };
  });

  if (data.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
        Nenhum reservatório cadastrado
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 9, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={38}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <Tooltip
            contentStyle={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, name: string) => [
              `${v.toLocaleString('pt-BR')} L`,
              name === 'volume' ? 'Volume atual' : 'Capacidade livre',
            ]}
          />
          <Bar dataKey="volume" stackId="a" radius={[0, 0, 0, 0]} name="volume">
            {data.map((entry, i) => (
              <Cell key={i} fill={SENSOR_COLORS[i % SENSOR_COLORS.length].fill} />
            ))}
          </Bar>
          <Bar dataKey="remaining" stackId="a" radius={[6, 6, 0, 0]} name="remaining">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.bgColor} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
