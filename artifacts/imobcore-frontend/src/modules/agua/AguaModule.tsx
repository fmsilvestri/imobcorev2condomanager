import React, { useState } from 'react';
import AguaSummaryCards from './components/AguaSummaryCards';
import ReservoirBarChart from './components/ReservoirBarChart';
import ReservoirDonut from './components/ReservoirDonut';
import LevelHistoryChart from './components/LevelHistoryChart';
import ReservoirStatusList from './components/ReservoirStatusList';
import { Reservoir, HistoryPoint, LiveLevel } from './types/agua.types';

export type Period = '24h' | '7d' | '30d';

interface SensorManaged {
  id: string;
  sensor_id: string;
  nome: string;
  local: string;
  capacidade_litros: number;
  nivel_atual: number;
  volume_litros: number;
  status?: string;
}

interface AguaModuleProps {
  resList: Reservoir[];
  resNivels: Record<string, LiveLevel>;
  resHistorico: Record<string, HistoryPoint[]>;
  sensoresManaged: SensorManaged[];
  resNivelsExtra: Record<string, LiveLevel>;
  onNovoReservatorio: () => void;
  onEditReservatorio: (r: Reservoir) => void;
  onDeleteReservatorio: (id: string) => void;
  resEditId: string | null;
  SensorRingComponent: React.ComponentType<{ sensor: SensorManaged }>;
  condId: string | null;
}

const CARD: React.CSSProperties = {
  background: '#111827',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
  padding: '20px 22px',
  marginBottom: 14,
};

const PERIOD_LABELS: Record<Period, string> = { '24h': '24h', '7d': '7 dias', '30d': '30 dias' };

export default function AguaModule({
  resList, resNivels, resHistorico,
  sensoresManaged,
  onNovoReservatorio, onEditReservatorio, onDeleteReservatorio,
  resEditId,
}: AguaModuleProps) {
  const [period, setPeriod] = useState<Period>('7d');

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: '#0c4a6e', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            💧
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e0f2fe', lineHeight: 1.2 }}>Caixas d'água</div>
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 2 }}>
              IETEC · IoT em tempo real · {resList.length} {resList.length === 1 ? 'reservatório' : 'reservatórios'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['24h', '7d', '30d'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s',
              background: period === p ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: period === p ? '#e0f2fe' : 'rgba(255,255,255,0.4)',
            }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
          <button
            onClick={onNovoReservatorio}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0369a1', border: 'none', borderRadius: 8, padding: '7px 16px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Novo
          </button>
        </div>
      </div>

      {resList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>💧</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#94a3b8' }}>Nenhum reservatório cadastrado</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>Adicione um reservatório para começar o monitoramento em tempo real</div>
          <button onClick={onNovoReservatorio} style={{ background: '#0369a1', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ＋ Novo Reservatório
          </button>
        </div>
      ) : (
        <>
          {/* ── 4 Summary Cards ── */}
          <AguaSummaryCards reservoirs={resList} resNivels={resNivels} resHistorico={resHistorico} period={period} />

          {/* ── Charts Row: Bar + Donut ── */}
          <div className="agua-charts-row">
            <div style={CARD}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Volume por reservatório</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Litros atuais vs capacidade total</div>
              </div>
              <ReservoirBarChart reservoirs={resList} resNivels={resNivels} resHistorico={resHistorico} />
            </div>
            <div style={CARD}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Distribuição atual</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>% do volume total por reservatório</div>
              </div>
              <ReservoirDonut reservoirs={resList} resNivels={resNivels} resHistorico={resHistorico} />
            </div>
          </div>

          {/* ── Level History Chart ── */}
          <div style={CARD}>
            <LevelHistoryChart reservoirs={resList} resHistorico={resHistorico} period={period} />
          </div>

          {/* ── Status List ── */}
          <div style={CARD}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Status dos reservatórios</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Nível atual · capacidade · alerta</div>
            </div>
            <ReservoirStatusList
              reservoirs={resList}
              resNivels={resNivels}
              resHistorico={resHistorico}
              onEdit={onEditReservatorio}
              onDelete={onDeleteReservatorio}
            />
          </div>

          {/* ── Configurações IoT (collapsible) ── */}
          <details style={{ marginTop: 8, marginBottom: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 11, color: '#64748B', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', userSelect: 'none', padding: '8px 0' }}>
              ⚙️ Configurações IoT ({resList.length} {resList.length === 1 ? 'reservatório' : 'reservatórios'}) ▸
            </summary>
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px 80px 36px 36px 120px', padding: '10px 16px', background: 'rgba(255,255,255,.04)', fontSize: 11, fontWeight: 700, color: '#64748B', borderBottom: '1px solid rgba(255,255,255,.06)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                <span>Sensor ID</span><span>Nome</span><span>Local</span><span>Capacidade</span><span>Altura</span><span>CF</span><span>WH</span><span>Ações</span>
              </div>
              {resList.map((r, i) => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px 80px 36px 36px 120px', padding: '12px 16px', borderBottom: i < resList.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none', alignItems: 'center', fontSize: 12, background: resEditId === r.id ? 'rgba(59,130,246,.08)' : 'transparent' }}>
                  <span style={{ fontWeight: 700, color: '#E2E8F0', fontSize: 11 }}>{r.sensor_id}</span>
                  <span style={{ color: '#94A3B8' }}>{r.nome || '—'}</span>
                  <span style={{ color: '#64748B' }}>{r.local || '—'}</span>
                  <span style={{ color: '#94A3B8' }}>{r.capacidade_litros.toLocaleString('pt-BR')}L</span>
                  <span style={{ color: '#94A3B8' }}>{r.altura_cm}cm</span>
                  <span><div style={{ width: 10, height: 10, borderRadius: '50%', background: r.cf_online ? '#10B981' : '#EF4444', boxShadow: `0 0 6px ${r.cf_online ? '#10B981' : '#EF4444'}` }} /></span>
                  <span><div style={{ width: 10, height: 10, borderRadius: '50%', background: r.wh_online ? '#10B981' : '#EF4444', boxShadow: `0 0 6px ${r.wh_online ? '#10B981' : '#EF4444'}` }} /></span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onEditReservatorio(r)} style={{ color: '#3B82F6', background: 'none', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Editar</button>
                    <button onClick={() => onDeleteReservatorio(r.id)} style={{ color: '#EF4444', background: 'none', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Excluir</button>
                  </span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
