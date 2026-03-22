import { useGLTF } from "@react-three/drei";
import { AreaIcon } from "./AreaIcon";
import { useCondoStore } from "./useCondoStore";

// ─── Preload all models at import time ────────────────────────────────────────
const MODEL_PATHS = ["/models/car.glb", "/models/gym.glb", "/models/elevator.glb", "/models/pool.glb"];
MODEL_PATHS.forEach((p) => {
  try { useGLTF.preload(p); } catch { /* ignore in SSR */ }
});

// ─── Areas Scene ──────────────────────────────────────────────────────────────
export function Areas() {
  const { areas, selectedAreaId, selectArea } = useCondoStore();

  return (
    <>
      {areas.map((area) => (
        <AreaIcon
          key={area.id}
          id={area.id}
          nome={area.nome}
          modelPath={area.modelPath}
          posicao={area.posicao}
          rotacao={area.rotacao}
          status={area.status}
          osAbertas={area.osAbertas}
          selected={area.id === selectedAreaId}
          onClick={() => selectArea(area.id === selectedAreaId ? null : area.id)}
        />
      ))}
    </>
  );
}
