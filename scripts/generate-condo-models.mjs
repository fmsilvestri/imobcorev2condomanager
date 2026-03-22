/**
 * Gerador de modelos GLB para o Mapa 3D do Condomínio
 * Pure Node.js — sem dependências externas
 * Cria geometrias básicas únicas para cada área do condomínio
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../artifacts/imobcore-frontend/public/models");
mkdirSync(OUT_DIR, { recursive: true });

// ─── GLB Binary Builder ────────────────────────────────────────────────────────
function buildGLB(meshes) {
  // Each mesh: { positions: Float32Array, normals: Float32Array, indices: Uint16Array, color: [r,g,b] }
  // Build combined buffer
  const bufferParts = [];
  const bufferViews = [];
  const accessors = [];
  const primitives = [];
  let byteOffset = 0;

  for (const mesh of meshes) {
    const posBuf = Buffer.from(mesh.positions.buffer);
    const norBuf = Buffer.from(mesh.normals.buffer);
    const idxBuf = Buffer.from(mesh.indices.buffer);

    // Pad idx to 4-byte boundary
    const idxPad = idxBuf.length % 4 === 0 ? 0 : 4 - (idxBuf.length % 4);
    const idxPadded = Buffer.concat([idxBuf, Buffer.alloc(idxPad, 0)]);

    const posView = { buffer: 0, byteOffset, byteLength: posBuf.length, target: 34962 };
    byteOffset += posBuf.length;

    const norView = { buffer: 0, byteOffset, byteLength: norBuf.length, target: 34962 };
    byteOffset += norBuf.length;

    const idxView = { buffer: 0, byteOffset, byteLength: idxPadded.length, target: 34963 };
    byteOffset += idxPadded.length;

    bufferParts.push(posBuf, norBuf, idxPadded);

    // Compute POSITION min/max
    const count = mesh.positions.length / 3;
    let posMin = [Infinity, Infinity, Infinity];
    let posMax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < 3; j++) {
        const v = mesh.positions[i * 3 + j];
        if (v < posMin[j]) posMin[j] = v;
        if (v > posMax[j]) posMax[j] = v;
      }
    }

    const baseAcc = accessors.length;
    const baseView = bufferViews.length;

    accessors.push(
      { bufferView: baseView,     byteOffset: 0, componentType: 5126, count, type: "VEC3", min: posMin, max: posMax },
      { bufferView: baseView + 1, byteOffset: 0, componentType: 5126, count, type: "VEC3" },
      { bufferView: baseView + 2, byteOffset: 0, componentType: 5123, count: mesh.indices.length, type: "SCALAR" }
    );
    bufferViews.push(posView, norView, idxView);

    primitives.push({
      attributes: { POSITION: baseAcc, NORMAL: baseAcc + 1 },
      indices: baseAcc + 2,
      material: primitives.length,
      mode: 4,
    });
  }

  const binBuf = Buffer.concat(bufferParts);

  const materials = meshes.map((m) => ({
    name: "Material",
    pbrMetallicRoughness: {
      baseColorFactor: [...m.color, 1.0],
      metallicFactor: 0.2,
      roughnessFactor: 0.6,
    },
  }));

  const json = {
    asset: { version: "2.0", generator: "ImobCore Model Generator v1" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ name: "Mesh", primitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuf.length }],
    materials,
  };

  const jsonStr = JSON.stringify(json);
  const jsonPad = jsonStr.length % 4 === 0 ? 0 : 4 - (jsonStr.length % 4);
  const jsonChunkData = Buffer.concat([Buffer.from(jsonStr, "utf8"), Buffer.alloc(jsonPad, 0x20)]);

  const binPad2 = binBuf.length % 4 === 0 ? 0 : 4 - (binBuf.length % 4);
  const binChunkData = Buffer.concat([binBuf, Buffer.alloc(binPad2, 0x00)]);

  const totalLength = 12 + 8 + jsonChunkData.length + 8 + binChunkData.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonChunkData.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binChunkData.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, jsonChunkData, binChunkHeader, binChunkData]);
}

// ─── Box Geometry ─────────────────────────────────────────────────────────────
function boxGeometry(w, h, d, color = [1, 1, 1]) {
  const hw = w / 2, hh = h / 2, hd = d / 2;

  const faceData = [
    // [normal, 4 vertices]
    [[1, 0, 0],  [hw,-hh,-hd], [hw, hh,-hd], [hw, hh, hd], [hw,-hh, hd]],
    [[-1,0, 0], [-hw,-hh, hd],[-hw, hh, hd],[-hw, hh,-hd],[-hw,-hh,-hd]],
    [[0, 1, 0], [-hw, hh, hd], [hw, hh, hd], [hw, hh,-hd],[-hw, hh,-hd]],
    [[0,-1, 0], [-hw,-hh,-hd], [hw,-hh,-hd], [hw,-hh, hd],[-hw,-hh, hd]],
    [[0, 0, 1], [-hw,-hh, hd], [hw,-hh, hd], [hw, hh, hd],[-hw, hh, hd]],
    [[0, 0,-1],  [hw,-hh,-hd],[-hw,-hh,-hd],[-hw, hh,-hd], [hw, hh,-hd]],
  ];

  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const indices = new Uint16Array(36);

  faceData.forEach(([normal, v0, v1, v2, v3], fi) => {
    const vb = fi * 4;
    [v0, v1, v2, v3].forEach(([x, y, z], vi) => {
      const bi = (vb + vi) * 3;
      positions[bi] = x; positions[bi+1] = y; positions[bi+2] = z;
      normals[bi] = normal[0]; normals[bi+1] = normal[1]; normals[bi+2] = normal[2];
    });
    const ib = fi * 6;
    indices[ib]   = vb;   indices[ib+1] = vb+1; indices[ib+2] = vb+2;
    indices[ib+3] = vb;   indices[ib+4] = vb+2; indices[ib+5] = vb+3;
  });

  return { positions, normals, indices, color };
}

// ─── Cylinder Geometry ────────────────────────────────────────────────────────
function cylinderGeometry(radiusTop, radiusBot, height, segs, color = [1, 1, 1]) {
  const positions = [];
  const normals = [];
  const indices = [];
  const hh = height / 2;

  // Side
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    positions.push(cos * radiusTop, hh, sin * radiusTop);
    positions.push(cos * radiusBot, -hh, sin * radiusBot);
    const slope = (radiusBot - radiusTop) / height;
    const ny = Math.sqrt(1 / (1 + slope * slope)) * slope;
    const nr = Math.sqrt(1 - ny * ny);
    normals.push(cos * nr, ny, sin * nr);
    normals.push(cos * nr, ny, sin * nr);
  }
  const sideVerts = (segs + 1) * 2;
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, d, a, d, c);
  }

  // Top cap
  const topCenter = sideVerts;
  positions.push(0, hh, 0); normals.push(0, 1, 0);
  for (let i = 0; i < segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    positions.push(Math.cos(theta) * radiusTop, hh, Math.sin(theta) * radiusTop);
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = topCenter, b = topCenter + 1 + i, c = topCenter + 1 + (i + 1) % segs;
    indices.push(a, b, c);
  }

  // Bottom cap
  const botCenter = topCenter + 1 + segs;
  positions.push(0, -hh, 0); normals.push(0, -1, 0);
  for (let i = 0; i < segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    positions.push(Math.cos(theta) * radiusBot, -hh, Math.sin(theta) * radiusBot);
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = botCenter, b = botCenter + 1 + i, c = botCenter + 1 + (i + 1) % segs;
    indices.push(a, c, b);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    color,
  };
}

// ─── Model Definitions ────────────────────────────────────────────────────────
const models = {
  // Garagem — carro (corpo + teto recuado)
  car: [
    boxGeometry(2.0, 0.5, 1.0, [0.2, 0.5, 1.0]),         // body
    boxGeometry(1.2, 0.45, 0.92, [0.15, 0.4, 0.85]),      // cab (slightly smaller, on top)
  ],
  // Academia — haltere (dois discos + barra)
  gym: [
    cylinderGeometry(0.45, 0.45, 0.18, 12, [0.8, 0.2, 0.1]),  // left disc
    cylinderGeometry(0.45, 0.45, 0.18, 12, [0.8, 0.2, 0.1]),  // right disc
    cylinderGeometry(0.08, 0.08, 1.2, 10, [0.5, 0.5, 0.55]),  // bar
  ],
  // Elevador — cabine alta
  elevator: [
    boxGeometry(0.9, 2.0, 0.9, [0.35, 0.55, 0.75]),     // cabin
    boxGeometry(0.85, 0.05, 0.85, [0.45, 0.65, 0.85]),  // top panel
    boxGeometry(0.85, 0.05, 0.85, [0.45, 0.65, 0.85]),  // bottom panel
  ],
  // Piscina — bacia rasa larga
  pool: [
    boxGeometry(2.4, 0.12, 1.6, [0.0, 0.65, 0.9]),    // water surface
    boxGeometry(2.6, 0.18, 1.8, [0.8, 0.85, 0.9]),    // pool rim
  ],
};

// ─── Generate Files ───────────────────────────────────────────────────────────
for (const [name, meshes] of Object.entries(models)) {
  const glb = buildGLB(meshes);
  const filePath = join(OUT_DIR, `${name}.glb`);
  writeFileSync(filePath, glb);
  console.log(`✅ ${name}.glb — ${glb.length} bytes → ${filePath}`);
}

console.log("\n🎉 Todos os modelos gerados com sucesso!");
