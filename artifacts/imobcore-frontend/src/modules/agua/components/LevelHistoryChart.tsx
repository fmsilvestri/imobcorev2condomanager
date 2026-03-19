import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, isToday, subDays, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Reservoir, HistoryPoint, SENSOR_COLORS } from '../types/agua.types';

interface Props {
  reservoirs: Reservoir[];
  resHistorico: Record<string, HistoryPoint[]>;
}

type Period = '24h' | '7d' | '30d';

export default function LevelHistoryChart({ reservoirs, resHistorico }: Props) {
  const [period, setPeriod] = useState<Period>('7d');

  const filterByPeriod = (hist: HistoryPoint[], p: Period): HistoryPoint[] => {
    const now = new Date();
    if (p === '24h') return hist.filter(h => isToday(new Date(h.received_at)));
    if (p === '7d') return hist.filter(h => isAfter(new Date(h.received_at), subDays(now, 7)));
    return hist.filter(h => isAfter(new Date(h.received_at), subDays(now, 30)));
  };

  const formatLabel = (ts: string, p: Period): string => {
    try {
      const d = new Date(ts);
      if (p === '24h') return format(d, 'HH:mm');
      if (p === '7d') return format(d, 'EEE', { locale: ptBR });
      return format(d, 'dd/MM');
    } catch { return ts.slice(0, 5); }
  };

  const { chartData, dataKeys } = useMemo(() => {
    const byReservoir = reservoirs.map((r, i) => ({
      name: r.nome || r.sensor_id.slice(-6),
      color: SENSOR_COLORS[i % SENSOR_COLORS.length].border,
      bg: SENSOR_COLORS[i % SENSOR_COLORS.length].bg,
      filtered: filterByPeriod([...(resHistorico[r.sensor_id] || [])].reverse(), period),
      cap: r.capacidade_litros,
    }));

    const allTs = new Set<string>();
    byReservoir.forEach(r => r.filtered.forEach(h => allTs.add(h.received_at)));
    const sorted = [...allTs].sort();

    const data = sorted.map(ts => {
      const obj: Record<string, string | number> = { ts, label: formatLabel(ts, period) };
      byReservoir.forEach((r, i) => {
        const pt = r.filtered.find(h => h.received_at === ts);
        if (pt && r.cap > 0) {
          obj[`nivel_${i}`] = Math.round((pt.volume_litros / r.cap) * 100);
        }
      });
      return obj;
    });

    const keys = byReservoir.map((r, i) => ({ key: `nivel_${i}`, name: r.name, color: r.color, bg: r.bg, cap: r.cap }));
    return { chartData: data, dataKeys: keys };
  }, [reservoirs, resHistorico, period]);

  const periodBtns: { id: Period; label: string }[] = [
    { id: '24h', label: '24h' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {dataKeys.map(dk => (
            <div key={dk.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dk.color }} />
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{dk.name} · {(dk.cap / 1000).toFixed(0)}kL</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {periodBtns.map(b => (
            <button
              key={b.id}
              onClick={() => setPeriod(b.id)}
              style={{
                padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                background: period === b.id ? '#0369a1' : 'rgba(255,255,255,0.07)',
                color: period === b.id ? '#e0f2fe' : 'rgba(255,255,255,0.4)',
                transition: 'all .15s',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
          Sem leituras no período selecionado
        </div>
      ) : (
        <div style={{ position: 'relative', height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number, name: string) => [`${v}%`, name]}
              />
              {dataKeys.map(dk => (
                <Line
                  key={dk.key}
                  type="monotone"
                  dataKey={dk.key}
                  stroke={dk.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: dk.color }}
                  name={dk.name}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
