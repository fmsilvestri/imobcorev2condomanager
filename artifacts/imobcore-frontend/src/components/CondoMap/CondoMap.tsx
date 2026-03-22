import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Grid,
  Stars,
} from "@react-three/drei";
import * as THREE from "three";
import { Areas } from "./Areas";
import { MaintenancePanel } from "./MaintenancePanel";
import { useCondoStore } from "./useCondoStore";
import { STATUS_COLOR } from "./AreaIcon";

// ─── Floor/Ground ─────────────────────────────────────────────────────────────
function Ground() {
  return (
    <group>
      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial
          color="#0a0c14"
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {/* Grid overlay */}
      <Grid
        position={[0, -1.49, 0]}
        args={[24, 24]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#1a2040"
        sectionSize={4}
        sectionThickness={0.8}
        sectionColor="#1e3060"
        fadeDistance={20}
        fadeStrength={1.5}
        infiniteGrid={false}
      />
    </group>
  );
}

// ─── Status summary legend ────────────────────────────────────────────────────
function SceneLegend() {
  const { areas } = useCondoStore();
  const critical = areas.filter((a) => a.status === "critical").length;
  const warning  = areas.filter((a) => a.status === "warning").length;
  const ok       = areas.filter((a) => a.status === "ok").length;

  return (
    <group position={[-4.5, -0.8, -4]}>
      {[
        { status: "ok",       label: `${ok} OK`,       y: 0 },
        { status: "warning",  label: `${warning} Atenção`, y: -0.4 },
        { status: "critical", label: `${critical} Urgente`, y: -0.8 },
      ].map(({ status, label, y }) => (
        <group key={status} position={[0, y, 0]}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshBasicMaterial color={STATUS_COLOR[status as keyof typeof STATUS_COLOR]} />
          </mesh>
          <mesh position={[0.15, 0, 0]}>
            <boxGeometry args={[0.01, 0.01, 0.01]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Scene Lighting ───────────────────────────────────────────────────────────
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={0.6}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <pointLight position={[-4, 4, -4]} intensity={0.3} color="#4466ff" />
      <pointLight position={[4, 4, 4]}  intensity={0.3} color="#6644ff" />
      <hemisphereLight args={["#0a0820", "#000010", 0.4]} />
    </>
  );
}

// ─── Loading fallback ─────────────────────────────────────────────────────────
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color="#4488ff" wireframe />
    </mesh>
  );
}

// ─── HUD overlay (rendered as 2D on top of canvas) ───────────────────────────
function HUD({ condoNome }: { condoNome?: string }) {
  const { areas, selectedAreaId, selectArea } = useCondoStore();
  const critical = areas.filter((a) => a.status === "critical");
  const warning  = areas.filter((a) => a.status === "warning");

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-4">
        <div>
          <h1 className="text-white/90 font-bold text-base tracking-wide">
            Mapa 3D — {condoNome ?? "Condomínio"}
          </h1>
          <p className="text-white/35 text-xs mt-0.5">Clique em um ícone para ver detalhes</p>
        </div>

        {/* Alert badges */}
        <div className="flex gap-2">
          {critical.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {critical.length} Urgente{critical.length > 1 ? "s" : ""}
            </div>
          )}
          {warning.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {warning.length} Atenção
            </div>
          )}
        </div>
      </div>

      {/* Bottom area pills — clickable */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {areas.map((area) => {
          const isSelected = area.id === selectedAreaId;
          const dotColor = area.status === "ok" ? "bg-emerald-400" : area.status === "warning" ? "bg-amber-400" : "bg-red-400";
          return (
            <button
              key={area.id}
              onClick={() => selectArea(area.id === selectedAreaId ? null : area.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-white/20 text-white border border-white/30"
                  : "bg-black/40 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span>{area.icon}</span>
              <span>{area.nome}</span>
            </button>
          );
        })}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 right-4 text-white/20 text-[10px] space-y-0.5 text-right">
        <div>⬡ Arraste para girar</div>
        <div>🔍 Scroll para zoom</div>
        <div>Esc para fechar</div>
      </div>
    </div>
  );
}

// ─── Main CondoMap component ──────────────────────────────────────────────────
interface CondoMapProps {
  condoNome?: string;
  className?: string;
}

export function CondoMap({ condoNome, className = "" }: CondoMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={canvasRef}
      className={`relative w-full h-full min-h-[480px] bg-[#070812] overflow-hidden rounded-2xl ${className}`}
    >
      {/* Three.js Canvas */}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 4, 10], fov: 52, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ position: "absolute", inset: 0 }}
        onPointerMissed={() => {
          // Deselect when clicking empty space
          useCondoStore.getState().selectArea(null);
        }}
      >
        <SceneLighting />

        <Suspense fallback={<LoadingFallback />}>
          {/* HDRI environment for reflections */}
          <Environment preset="night" />

          {/* Stars background */}
          <Stars radius={60} depth={20} count={1200} factor={2} fade speed={0.3} />

          {/* Ground */}
          <Ground />

          {/* Area Icons (levitating 3D models) */}
          <Areas />

          {/* Scene legend */}
          <SceneLegend />
        </Suspense>

        {/* Camera controls */}
        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={18}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.1}
          autoRotate
          autoRotateSpeed={0.4}
          makeDefault
        />
      </Canvas>

      {/* 2D HUD overlay */}
      <HUD condoNome={condoNome} />

      {/* Maintenance panel (slides in from right) */}
      <MaintenancePanel />
    </div>
  );
}
