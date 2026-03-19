import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { format, subDays, isAfter, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Reservoir, HistoryPoint, SENSOR_COLORS } from '../types/agua.types';
import { Period } from '../AguaModule';

interface Props {
  reservoirs: Reservoir[];
  resHistorico: Record<string, HistoryPoint[]>;
  period: Period;
}

const PERIOD_LABELS: Record<Period, string> = { '24h': 'últimas 24h', '7d': 'últimos 7 dias', '30d': 'últimos 30 dias' };

const fmtTs = (ts: string, period: Period) => {
  try {
    const d = new Date(ts);
    if (period === '24h') return format(d, 'HH:mm');
    if (period === '7d') return format(d, 'EEE', { locale: ptBR });
    return format(d, 'dd/MM');
  } catch { return ts.slice(0, 5); }
};

const filterTs = (ts: string, period: Period) => {
  const d = new Date(ts);
  const now = new Date();
  if (period === '24h') return isToday(d);
  if (period === '7d') return isAfter(d, subDays(now, 7));
  return isAfter(d, subDays(now, 30));
};

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '10px 14px', fontSize: 11 }}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {p.value !== undefined ? `${p.value}%` : '—'}
        </div>
      ))}
    </div>
  );
};

export default function LevelHistoryChart({ reservoirs, resHistorico, period }: Props) {
  const { chartData, keys } = useMemo(() => {
    const sensors = reservoirs.map((r, i) => ({
      sensor_id: r.sensor_id,
      label: r.sensor_id,
      cap: r.capacidade_litros,
      fill: SENSOR_COLORS[i % SENSOR_COLORS.length].fill,
      fillAlpha: hexToRgba(SENSOR_COLORS[i % SENSOR_COLORS.length].fill, 0.15),
      key: `nivel_${i}`,
      filtered: [...(resHistorico[r.sensor_id] || [])]
        .reverse()
        .filter(h => filterTs(h.received_at, period)),
    }));

    const allTs = [...new Set(sensors.flatMap(s => s.filtered.map(h => h.received_at)))].sort();
    const data = allTs.map(ts => {
      const obj: Record<string, any> = { ts, label: fmtTs(ts, period) };
      sensors.forEach((s, i) => {
        const pt = s.filtered.find(h => h.received_at === ts);
        if (pt && s.cap > 0) obj[s.key] = Math.round((pt.volume_litros / s.cap) * 100);
      });
      return obj;
    });
    return { chartData: data, keys: sensors };
  }, [reservoirs, resHistorico, period]);

  const capLabel = (cap: number) =>
    cap >= 1000 ? `${Math.round(cap / 1000)} k L` : `${cap} L`;

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
          Histórico de nível — {PERIOD_LABELS[period]}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          % de volume por reservatório ao longo do tempo
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
        {keys.map((k, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: k.fill, boxShadow: `0 0 4px ${k.fill}` }} />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{k.label} ({capLabel(k.cap)})</span>
          </div>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
          Sem leituras no período selecionado
        </div>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
              <defs>
                {keys.map((k, i) => (
                  <linearGradient key={i} id={`grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={k.fill} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={k.fill} stopOpacity={0.04} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={34}
                ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              {keys.map((k, i) => (
                <Area
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  stroke={k.fill}
                  strokeWidth={2.5}
                  fill={`url(#grad_${i})`}
                  dot={{ r: 3, fill: k.fill, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: k.fill, strokeWidth: 0 }}
                  name={k.label}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
