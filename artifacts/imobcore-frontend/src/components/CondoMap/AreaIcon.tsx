import { useRef, useState, useMemo, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Float } from "@react-three/drei";
import * as THREE from "three";
import type { AreaStatus } from "./useCondoStore";

// ─── Status colors ────────────────────────────────────────────────────────────
export const STATUS_COLOR: Record<AreaStatus, string> = {
  ok:       "#00e676",
  warning:  "#ffb300",
  critical: "#ff1744",
};

// ─── Error boundary for GLB load failures ────────────────────────────────────
interface EBState { failed: boolean }
class GLBErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, EBState> {
  state: EBState = { failed: false };
  componentDidCatch(_err: unknown, _info: ErrorInfo) { this.setState({ failed: true }); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// ─── Procedural fallback shapes ───────────────────────────────────────────────
function ProceduralMesh({ modelPath, color }: { modelPath: string; color: string }) {
  const mat = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={0.25}
      metalness={0.3}
      roughness={0.5}
    />
  );

  if (modelPath.includes("car")) {
    return (
      <group>
        <mesh position={[0, 0, 0]}>   <boxGeometry args={[2, 0.5, 1]} />    {mat} </mesh>
        <mesh position={[0, 0.47, 0]}><boxGeometry args={[1.2, 0.42, 0.9]} />{mat} </mesh>
      </group>
    );
  }
  if (modelPath.includes("gym")) {
    return (
      <group>
        <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.45, 0.45, 0.18, 16]} />{mat}
        </mesh>
        <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.45, 0.45, 0.18, 16]} />{mat}
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 1.2, 10]} />{mat}
        </mesh>
      </group>
    );
  }
  if (modelPath.includes("elevator")) {
    return (
      <group>
        <mesh><boxGeometry args={[0.9, 2, 0.9]} />{mat}</mesh>
        <mesh position={[0, 1.05, 0]}><boxGeometry args={[0.85, 0.05, 0.85]} />{mat}</mesh>
        <mesh position={[0, -1.05, 0]}><boxGeometry args={[0.85, 0.05, 0.85]} />{mat}</mesh>
      </group>
    );
  }
  if (modelPath.includes("pool")) {
    return (
      <group>
        <mesh position={[0, 0.03, 0]}><boxGeometry args={[2.4, 0.12, 1.6]} />{mat}</mesh>
        <mesh position={[0, -0.05, 0]}><boxGeometry args={[2.6, 0.18, 1.8]} />{mat}</mesh>
      </group>
    );
  }
  return <mesh><boxGeometry args={[1, 1, 1]} />{mat}</mesh>;
}

// ─── GLB Loader (renders model with status-based emissive) ────────────────────
function GLBModel({ path, status }: { path: string; status: AreaStatus }) {
  const { scene } = useGLTF(path);
  const glowColor = STATUS_COLOR[status];

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(glowColor);
        mat.emissiveIntensity = 0.2;
        mat.metalness = 0.3;
        mat.roughness = 0.6;
        mesh.material = mat;
        mesh.castShadow = true;
      }
    });
    return clone;
  }, [scene, glowColor]);

  return <primitive object={clonedScene} />;
}

// ─── Selection ring ───────────────────────────────────────────────────────────
function SelectionRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.5;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
      <ringGeometry args={[1.0, 1.2, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Status glow sphere ───────────────────────────────────────────────────────
function StatusGlow({ color, selected }: { color: string; selected: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.12 + Math.sin(clock.elapsedTime * 3) * 0.08 + (selected ? 0.1 : 0);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.6, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.BackSide} />
    </mesh>
  );
}

// ─── Area status badge (2D billboard) ────────────────────────────────────────
function StatusBadge({ status, osAbertas }: { status: AreaStatus; osAbertas: number }) {
  const color = STATUS_COLOR[status];
  const scale = status === "critical" ? 1.15 : 1;
  return (
    <mesh position={[0.8, 1.4, 0]} scale={[scale, scale, scale]}>
      <circleGeometry args={[0.22, 20]} />
      <meshBasicMaterial color={color} />
      {osAbertas > 0 && (
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[0.16, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.5} />
        </mesh>
      )}
    </mesh>
  );
}

// ─── Main AreaIcon component ──────────────────────────────────────────────────
export interface AreaIconProps {
  id: string;
  nome: string;
  modelPath: string;
  posicao: [number, number, number];
  rotacao?: [number, number, number];
  status: AreaStatus;
  osAbertas: number;
  selected: boolean;
  onClick: () => void;
}

export function AreaIcon({
  id: _id,
  nome: _nome,
  modelPath,
  posicao,
  rotacao,
  status,
  osAbertas,
  selected,
  onClick,
}: AreaIconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const scaleRef = useRef(1.0);
  const targetScale = hovered || selected ? 1.28 : 1.0;
  const glowColor = STATUS_COLOR[status];

  // Smooth scale animation in render loop
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, Math.min(dt * 10, 1));
    groupRef.current.scale.setScalar(scaleRef.current);
  });

  const fallback = <ProceduralMesh modelPath={modelPath} color={glowColor} />;

  return (
    <group
      ref={groupRef}
      position={posicao}
      rotation={rotacao ? [rotacao[0], rotacao[1], rotacao[2]] : [0, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "default"; }}
    >
      {/* Status-colored ambient glow */}
      <StatusGlow color={glowColor} selected={selected} />

      {/* Point light for local illumination */}
      <pointLight
        color={glowColor}
        intensity={selected ? 3 : 1.2}
        distance={4}
        decay={2}
      />

      {/* Floating 3D model with levitation */}
      <Float
        speed={selected ? 3 : 2}
        rotationIntensity={selected ? 0.2 : 0.08}
        floatIntensity={selected ? 0.7 : 0.4}
      >
        <GLBErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <GLBModel path={modelPath} status={status} />
          </Suspense>
        </GLBErrorBoundary>
      </Float>

      {/* Selection ring */}
      {selected && <SelectionRing color={glowColor} />}

      {/* Status badge */}
      <StatusBadge status={status} osAbertas={osAbertas} />
    </group>
  );
}
