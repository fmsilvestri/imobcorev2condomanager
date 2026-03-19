export interface Reservoir {
  id: string;
  sensor_id: string;
  nome: string;
  local: string;
  capacidade_litros: number;
  altura_cm: number;
  cf_online: boolean;
  wh_online: boolean;
  condominio_id?: string | null;
  cf_url?: string;
  wh_url?: string;
  protocolo?: string;
  porta?: number;
  created_at?: string;
  mac_address?: string;
}

export interface HistoryPoint {
  nivel: number;
  volume_litros: number;
  received_at: string;
}

export interface LiveLevel {
  nivel: number;
  volume: number;
  ts: string;
}

export type SensorStatus = 'normal' | 'atencao' | 'critico';

export function getSensorStatus(nivel: number): SensorStatus {
  if (nivel >= 70) return 'normal';
  if (nivel >= 40) return 'atencao';
  return 'critico';
}

export const SENSOR_COLORS = [
  { border: '#38bdf8', fill: '#0369a1', bg: 'rgba(56,189,248,0.08)' },
  { border: '#fbbf24', fill: '#b45309', bg: 'rgba(251,191,36,0.06)' },
  { border: '#f87171', fill: '#991b1b', bg: 'rgba(248,113,113,0.06)' },
  { border: '#a78bfa', fill: '#5b21b6', bg: 'rgba(167,139,250,0.06)' },
];

export const STATUS_STYLE: Record<SensorStatus, { bg: string; text: string; label: string }> = {
  normal:  { bg: 'rgba(74,222,128,0.15)', text: '#4ade80', label: 'Normal' },
  atencao: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', label: 'Atenção' },
  critico: { bg: 'rgba(248,113,113,0.15)', text: '#f87171', label: 'Crítico' },
};
