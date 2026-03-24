import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Reservoir, HistoryPoint, LiveLevel, SENSOR_COLORS } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
}

const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

const shortId = (sensor_id: string | undefined | null, cap: number) => {
  if (!sensor_id) {
    const capStr = cap >= 1000 ? `${Math.round(cap / 1000)}k` : String(cap);
    return `reservatório (${capStr})`;
  }
  const parts = sensor_id.split('_');
  const last = parts[parts.length - 1];
  const prefix = parts.slice(0, 2).join('_');
  const capStr = cap >= 1000 ? `${Math.round(cap / 1000)}k` : String(cap);
  return parts.length > 2 ? `${prefix}_..._${last} (${capStr})` : `${sensor_id} (${capStr})`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.fill === 'rgba(255,255,255,0.06)' ? '#475569' : p.fill, marginBottom: 2 }}>
          {p.name === 'volume' ? 'Volume atual' : 'Capacidade livre'}: {p.value.toLocaleString('pt-BR')} L
        </div>
      ))}
    </div>
  );
};

export default function ReservoirBarChart({ reservoirs, resNivels, resHistorico }: Props) {
  const data = reservoirs.map((r, i) => {
    const live = resNivels[r.sensor_id];
    const hist = resHistorico[r.sensor_id];
    const volume = live?.volume ?? hist?.[0]?.volume_litros ?? 0;
    const remaining = Math.max(0, r.capacidade_litros - volume);
    return {
      name: shortId(r.sensor_id, r.capacidade_litros),
      volume,
      remaining,
      fillColor: SENSOR_COLORS[i % SENSOR_COLORS.length].fill,
      cap: r.capacidade_litros,
    };
  });

  if (data.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
        Nenhum reservatório
      </div>
    );
  }

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 24, left: -4 }} barSize={40}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            angle={-18}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={32}
            tickFormatter={fmtK}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="volume" stackId="a" name="volume">
            {data.map((_, i) => (
              <Cell key={i} fill={SENSOR_COLORS[i % SENSOR_COLORS.length].fill} />
            ))}
          </Bar>
          <Bar dataKey="remaining" stackId="a" name="remaining" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="rgba(255,255,255,0.05)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
