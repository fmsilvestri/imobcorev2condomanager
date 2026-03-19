import React from 'react';
import AguaSummaryCards from './components/AguaSummaryCards';
import ReservoirBarChart from './components/ReservoirBarChart';
import ReservoirDonut from './components/ReservoirDonut';
import LevelHistoryChart from './components/LevelHistoryChart';
import ReservoirStatusList from './components/ReservoirStatusList';
import { Reservoir, HistoryPoint, LiveLevel } from './types/agua.types';

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

const CARD_STYLE: React.CSSProperties = {
  background: '#111827',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
  padding: '18px 20px',
};

export default function AguaModule({
  resList,
  resNivels,
  resHistorico,
  sensoresManaged,
  resNivelsExtra,
  onNovoReservatorio,
  onEditReservatorio,
  onDeleteReservatorio,
  resEditId,
  SensorRingComponent,
  condId,
}: AguaModuleProps) {
  const allSensors = [...sensoresManaged];
  const sensorManaged = new Set(sensoresManaged.map(s => s.sensor_id));
  for (const r of resList) {
    if (!sensorManaged.has(r.sensor_id)) {
      const live = resNivels[r.sensor_id];
      allSensors.push({
        id: r.id, sensor_id: r.sensor_id, nome: r.nome || r.sensor_id,
        local: r.local || '—', capacidade_litros: r.capacidade_litros,
        nivel_atual: live?.nivel ?? 0, volume_litros: live?.volume ?? 0,
      });
    }
  }

  return (
    <div style={{ background: '#0d0d1a' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: '#0c4a6e', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            💧
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#e0f2fe' }}>Caixas d'água</div>
            <div style={{ fontSize: 11, color: '#60a5fa' }}>
              IETEC · IoT em tempo real · {resList.length} {resList.length === 1 ? 'reservatório' : 'reservatórios'}
            </div>
          </div>
        </div>
        <button
          onClick={onNovoReservatorio}
          style={{ background: '#0369a1', border: 'none', borderRadius: 8, padding: '8px 18px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          ＋ Novo
        </button>
      </div>

      {resList.length === 0 ? (
        /* ── Empty state ── */
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗂️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#94a3b8' }}>Nenhum reservatório cadastrado</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Adicione um reservatório para começar o monitoramento em tempo real</div>
          <button
            onClick={onNovoReservatorio}
            style={{ background: '#0369a1', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ＋ Novo Reservatório
          </button>
        </div>
      ) : (
        <>
          {/* ── Summary Cards ── */}
          <AguaSummaryCards reservoirs={resList} resNivels={resNivels} resHistorico={resHistorico} />

          {/* ── IoT Gauges (se houver sensores gerenciados) ── */}
          {allSensors.length > 0 && (
            <div style={{ ...CARD_STYLE, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                📡 Sensores IoT — Tempo real <span style={{ color: '#334155', fontWeight: 400 }}>↻ 10s</span>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {allSensors.map(s => {
                  const live = resNivels[s.sensor_id];
                  const withLive: SensorManaged = {
                    ...s,
                    nivel_atual: live?.nivel ?? s.nivel_atual,
                    volume_litros: live?.volume ?? s.volume_litros,
                  };
                  const ts = live?.ts;
                  return (
                    <div key={s.id} style={{ textAlign: 'center' }}>
                      <SensorRingComponent sensor={withLive} />
                      {ts ? (
                        <div style={{ fontSize: 9, color: '#334155', marginTop: -2 }}>
                          {new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: '#F59E0B', fontWeight: 600, marginTop: -2 }}>⏳ Aguardando</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Charts Row ── */}
          <div className="agua-charts-row">
            <div style={CARD_STYLE}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                📊 Volume por Reservatório
              </div>
              <ReservoirBarChart reservoirs={resList} resNivels={resNivels} resHistorico={resHistorico} />
            </div>
            <div style={CARD_STYLE}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                🔵 Distribuição de Volume
              </div>
              <ReservoirDonut reservoirs={resList} resNivels={resNivels} resHistorico={resHistorico} />
            </div>
          </div>

          {/* ── Level History Chart ── */}
          <div style={{ ...CARD_STYLE, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              📈 Histórico de Nível
            </div>
            <LevelHistoryChart reservoirs={resList} resHistorico={resHistorico} />
          </div>

          {/* ── Status List ── */}
          <div style={CARD_STYLE}>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              🗂️ Status dos Reservatórios
            </div>
            <ReservoirStatusList
              reservoirs={resList}
              resNivels={resNivels}
              resHistorico={resHistorico}
              onEdit={onEditReservatorio}
            />
          </div>

          {/* ── Configurações IoT (collapsible) ── */}
          {resList.length > 0 && (
            <details style={{ marginTop: 14 }}>
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
          )}
        </>
      )}
    </div>
  );
}
