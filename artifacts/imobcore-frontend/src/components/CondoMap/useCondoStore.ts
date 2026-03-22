import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────
export type AreaStatus = "ok" | "warning" | "critical";

export interface Area {
  id: string;
  nome: string;
  icon: string;
  modelPath: string;
  posicao: [number, number, number];
  rotacao?: [number, number, number];
  status: AreaStatus;
  descricao: string;
  ultimaManutencao?: string;
  proximaManutencao?: string;
  osAbertas: number;
  tags: string[];
}

export interface CondoState {
  areas: Area[];
  selectedAreaId: string | null;
  selectArea: (id: string | null) => void;
  updateAreaStatus: (id: string, status: AreaStatus) => void;
  updateOsCount: (id: string, count: number) => void;
}

// ─── Default areas ────────────────────────────────────────────────────────────
const DEFAULT_AREAS: Area[] = [
  {
    id: "garagem",
    nome: "Garagem",
    icon: "🚗",
    modelPath: "/models/car.glb",
    posicao: [-3.5, 0, 2.5],
    rotacao: [0, 0.3, 0],
    status: "ok",
    descricao: "Garagem com 84 vagas + 4 vagas PCD. Portão eletrônico com chip de acesso.",
    ultimaManutencao: "2026-02-15",
    proximaManutencao: "2026-05-15",
    osAbertas: 0,
    tags: ["segurança", "acesso"],
  },
  {
    id: "academia",
    nome: "Academia",
    icon: "🏋️",
    modelPath: "/models/gym.glb",
    posicao: [3.5, 0.5, 2.5],
    rotacao: [0, -0.3, 0],
    status: "warning",
    descricao: "Academia com 28 equipamentos. Esteira, musculação e área cardio.",
    ultimaManutencao: "2026-01-20",
    proximaManutencao: "2026-04-20",
    osAbertas: 2,
    tags: ["lazer", "manutenção"],
  },
  {
    id: "elevador",
    nome: "Elevadores",
    icon: "🛗",
    modelPath: "/models/elevator.glb",
    posicao: [0, 0.5, -2.5],
    rotacao: [0, 0, 0],
    status: "critical",
    descricao: "Dois elevadores sociais (torres A e B) + um elevador de serviço. NR-12.",
    ultimaManutencao: "2025-12-01",
    proximaManutencao: "2026-03-01",
    osAbertas: 1,
    tags: ["urgente", "NR-12"],
  },
  {
    id: "piscina",
    nome: "Piscina",
    icon: "🏊",
    modelPath: "/models/pool.glb",
    posicao: [0, -0.2, 4.5],
    rotacao: [0, 0, 0],
    status: "ok",
    descricao: "Piscina adulto (15m × 6m) + infantil. Tratamento automatizado ABNT NBR 10339.",
    ultimaManutencao: "2026-03-10",
    proximaManutencao: "2026-06-10",
    osAbertas: 0,
    tags: ["lazer", "NR-10339"],
  },
];

// ─── Store ────────────────────────────────────────────────────────────────────
export const useCondoStore = create<CondoState>((set) => ({
  areas: DEFAULT_AREAS,
  selectedAreaId: null,
  selectArea: (id) => set({ selectedAreaId: id }),
  updateAreaStatus: (id, status) =>
    set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, status } : a)) })),
  updateOsCount: (id, count) =>
    set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, osAbertas: count } : a)) })),
}));

// ─── Preload all GLB models ───────────────────────────────────────────────────
// Called once at app init to avoid loading jank
export const preloadCondoModels = () => {
  import("@react-three/drei").then(({ useGLTF }) => {
    DEFAULT_AREAS.forEach((a) => {
      try { useGLTF.preload(a.modelPath); } catch { /* silent fail */ }
    });
  });
};
