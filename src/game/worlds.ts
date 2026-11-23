import * as THREE from 'three';
import {
  canvasTexture,
  glowPlane,
  makeAsphaltRoadMaterial,
  makeFacadeAtlas,
  makeKerbTexture,
  makeMetalPlateMaps,
  makeRoadMarkingsTexture,
  makeWallTexture,
  nebulaTexture,
  padTexture,
  planetTexture
} from './textures';
import type { RoadGrade } from './textures';
import { buildTrack } from './tracks';
import type { DestructibleProp, DestructiblePropKind, LevelDef, ShortcutRail, SpiralBlockGate, TrackData } from './types';

export interface BuiltWorld {
  group: THREE.Group;
  trk: TrackData;
  def: LevelDef;
  update: (dt: number, now: number) => void;
}

// Pre-allocated scratch helpers to avoid GC in animated world hooks
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _euler = new THREE.Euler();
const _col = new THREE.Color();
const _colTarget = new THREE.Color();
const _one = new THREE.Vector3(1, 1, 1);

interface ActiveArchEntry {
  beam: THREE.Mesh;
  beamNeon: THREE.Mesh;
  sign: THREE.Mesh;
  neonMat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  altColorP2: THREE.Color;
  altColorP3: THREE.Color;
  index: number;
}

const _archRegistry = new WeakMap<TrackData, ActiveArchEntry[]>();

export function disposeGroup(g: THREE.Group, scene: THREE.Scene): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      const rec = m as unknown as Record<string, unknown>;
      for (const k of Object.keys(rec)) {
        const v = rec[k] as { isTexture?: boolean; dispose?: () => void } | null;
        if (v && v.isTexture && v.dispose) v.dispose();
      }
      m.dispose();
    }
  });
  scene.remove(g);
}

function clampTrackU(trk: TrackData, u: number): number {
  return trk.def.isSprint ? Math.max(0, Math.min(1, u)) : ((u % 1) + 1) % 1;
}

function ribbonGeometry(
  trk: TrackData,
  offset: number,
  width: number,
  yOff: number,
  from: number,
  to: number,
  vScale: number,
  taper?: boolean,
  uvMetres?: number
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const span = Math.max(0.0001, to - from);
  const steps = Math.max(6, Math.round(trk.steps * span * 1.8));
  for (let k = 0; k <= steps; k++) {
    const uRaw = from + span * (k / steps);
    const u = clampTrackU(trk, uRaw);
    const f = trk.fr(u);
    const ws = taper ? trk.widthAt(u) : 1;
    const base = f.pos.clone().addScaledVector(f.s, offset * ws).addScaledVector(f.up, yOff);
    const a = base.clone().addScaledVector(f.s, (-width * ws) / 2);
    const b = base.clone().addScaledVector(f.s, (width * ws) / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    // With uvMetres the ribbon is UV-mapped in world metres (one texture tile
    // per uvMetres in both directions); otherwise the old 0..1-across mapping
    // stands, which is what the decal-style overlays rely on.
    const v = uvMetres ? (uRaw * trk.len) / uvMetres : (uRaw * trk.len) / (vScale || 40);
    uv.push(0, v, uvMetres ? (width * ws) / uvMetres : 1, v);
    if (k < steps) {
      const j = k * 2;
      idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(
  trk: TrackData,
  offset: number,
  height: number,
  from: number,
  to: number,
  taper?: boolean,
  uvMetres?: number
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const span = Math.max(0.0001, to - from);
  const steps = Math.max(6, Math.round(trk.steps * span * 1.8));
  for (let k = 0; k <= steps; k++) {
    const uRaw = from + span * (k / steps);
    const u = clampTrackU(trk, uRaw);
    const f = trk.fr(u);
    const ws = taper ? trk.widthAt(u) : 1;
    const base = f.pos.clone().addScaledVector(f.s, offset * ws);
    const top = base.clone().addScaledVector(f.up, height);
    pos.push(base.x, base.y, base.z, top.x, top.y, top.z);
    // uvMetres tiles the wall in world metres (across the height as well), so
    // panel maps keep a constant rivet/plate pitch instead of stretching 26 m
    // of road along one texture and 3.8 m of height across the other axis.
    const v = uvMetres ? (uRaw * trk.len) / uvMetres : (uRaw * trk.len) / 26;
    uv.push(v, uvMetres ? height / uvMetres : 0, v, uvMetres ? height / uvMetres : 1);
    if (k < steps) {
      const j = k * 2;
      idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function arch(
  trk: TrackData,
  u: number,
  title: string,
  kanji: string,
  color: string,
  group: THREE.Group,
  allowInSpecial = false
): void {
  const uNorm = clampTrackU(trk, u);
  if (trk.elev.isGap(uNorm) || (!allowInSpecial && trk.inSpecial(uNorm))) return;
  const f = trk.fr(uNorm);
  const p = f.pos;
  const span = f.width + 12;
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x18203c, metalness: 0.75, roughness: 0.32 });
  const neonMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 42, 2.4), pillarMat);
    leg.position.set(side * span, 21, 0);
    g.add(leg);
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 18, 4.2), pillarMat);
    buttress.position.set(side * (span + 2.2), 9, 0);
    buttress.rotation.z = side * 0.16;
    g.add(buttress);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 42, 0.45), neonMat);
    strip.position.set(side * span - side * 1.45, 21, 0);
    g.add(strip);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 3.4), neonMat);
    cap.position.set(side * span, 42.5, 0);
    g.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2.24, 2.4, 2.8), pillarMat);
  beam.position.y = 40;
  g.add(beam);
  const beamNeon = new THREE.Mesh(new THREE.BoxGeometry(span * 2.24, 0.45, 0.45), neonMat);
  beamNeon.position.set(0, 38.6, 0);
  g.add(beamNeon);

  const tex = canvasTexture(1024, 192, (ctx) => {
    ctx.fillStyle = 'rgba(8,12,30,0.92)';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 1008, 176);
    ctx.textAlign = 'center';
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 70px 'Noto Sans SC', sans-serif";
    ctx.fillText(kanji, 512, 84);
    ctx.font = "bold 40px 'Orbitron', sans-serif";
    ctx.fillStyle = '#f5c451';
    ctx.shadowBlur = 12;
    ctx.fillText(title, 512, 150);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 7),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
  );
  sign.position.set(0, 32.2, 0);
  sign.rotation.y = Math.PI;
  g.add(sign);
  group.add(g);

  if (!allowInSpecial) {
    let list = _archRegistry.get(trk);
    if (!list) {
      list = [];
      _archRegistry.set(trk, list);
    }
    list.push({
      beam,
      beamNeon,
      sign,
      neonMat,
      baseColor: new THREE.Color(color),
      altColorP2: new THREE.Color(list.length % 2 === 0 ? '#ff2e93' : '#00f0ff'),
      altColorP3: new THREE.Color(list.length % 2 === 0 ? '#f5c451' : '#ff2e63'),
      index: list.length
    });
  }
}

function tracksideSign(
  trk: TrackData,
  u: number,
  text: string,
  color: string,
  height: number,
  group: THREE.Group
): void {
  const uNorm = clampTrackU(trk, u);
  if (trk.elev.isGap(uNorm)) return;
  const f = trk.fr(uNorm);
  const tex = canvasTexture(768, 220, (g) => {
    g.fillStyle = 'rgba(8,12,30,0.9)';
    g.fillRect(0, 0, 768, 220);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(8, 8, 752, 204);
    g.textAlign = 'center';
    g.shadowColor = color;
    g.shadowBlur = 20;
    g.fillStyle = '#ffffff';
    g.font = "bold 88px 'Orbitron', sans-serif";
    g.fillText(text, 384, 132);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 8.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
  );
  m.position.copy(f.pos).addScaledVector(f.up, height);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s.clone().negate(), f.up, f.t));
  m.rotateY(Math.PI);
  group.add(m);
}

function buildNeonWorld(def: LevelDef, trk: TrackData, group: THREE.Group, world: BuiltWorld): void {
  const skyTex = canvasTexture(8, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#04020f');
    grd.addColorStop(0.38, '#150a30');
    grd.addColorStop(0.68, '#2b0d42');
    grd.addColorStop(0.86, '#431448');
    grd.addColorStop(1, '#0b1030');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
  });
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(9000, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    )
  );

  // Stars
  const starCount = 2000;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2500 + Math.random() * 3000);
    sp[i * 3] = v.x;
    sp[i * 3 + 1] = Math.abs(v.y) * 0.9 + 60;
    sp[i * 3 + 2] = v.z;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  group.add(
    new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd8ecff, size: 3.0, fog: false, transparent: true, opacity: 0.9 }))
  );

  // Ringed Saturn-like planet + companion moons (matching Ahwoo video vista)
  const moonTex = canvasTexture(512, 512, (g) => {
    const grd = g.createRadialGradient(210, 210, 20, 256, 256, 250);
    grd.addColorStop(0, '#e6fbff');
    grd.addColorStop(0.55, '#7ecfff');
    grd.addColorStop(0.85, '#2a6b96');
    grd.addColorStop(1, '#0d2438');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(10,40,70,0.35)';
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 40, 0, 7);
      g.fill();
    }
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 24), new THREE.MeshBasicMaterial({ map: moonTex, fog: false }));
  moon.position.set(-2100, 1450, -3100);
  group.add(moon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(300, 460, 64),
    new THREE.MeshBasicMaterial({
      color: 0x7fd8ff,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      depthWrite: false
    })
  );
  ring.position.copy(moon.position);
  ring.rotation.set(1.15, 0.35, 0.2);
  group.add(ring);

  const amber = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 20), new THREE.MeshBasicMaterial({ color: 0xffc66e, fog: false }));
  amber.position.set(2600, 1150, 2400);
  group.add(amber);
  const amberGlow = glowPlane('rgba(255,198,110,0.5)', 620, 0.5);
  amberGlow.position.copy(amber.position);
  amberGlow.lookAt(0, 0, 0);
  group.add(amberGlow);

  // Skyline towers
  const citySamples: THREE.Vector3[] = [];
  for (let i = 0; i < 420; i++) citySamples.push(trk.curve.getPointAt(i / 420));
  const blocked = (p: THREE.Vector3, min: number) => citySamples.some((q) => q.distanceToSquared(p) < min * min);

  // Eight facade skins in one 2048² atlas with a matching emissive pass. Each
  // tower family samples its own cell, and per-instance UV scaling (aUvScale)
  // keeps the window pitch constant in metres instead of stretching a single
  // 128 px canvas across a 1,000 m tower.
  const facade = makeFacadeAtlas();
  // Six height bands, each with its own skin: squat podium blocks reuse cells
  // 0/1, the mid-rise canyon 2/3, and the supertall crowns the brightest 4/5,
  // so the skyline reads as three registers instead of one repeated facade.
  const FACADE_BANDS = 6;
  const bandForHeight = (h: number) => Math.min(FACADE_BANDS - 1, Math.max(0, Math.floor((h - 140) / 120)));
  const towerMats = Array.from({ length: FACADE_BANDS }, (_, cell) => {
    const mat = new THREE.MeshStandardMaterial({
      map: facade.map,
      emissiveMap: facade.emissive,
      emissive: 0xffffff,
      emissiveIntensity: 1.05,
      metalness: 0.4,
      roughness: 0.58,
      envMapIntensity: 0.85
    });
    // Atlas is 4 cells across and 2 down; flipY puts canvas row 0 at v 0.5.
    const origin = new THREE.Vector2((cell % 4) / 4, cell < 4 ? 0.5 : 0);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCellOrigin = { value: origin };
      shader.uniforms.uCellSize = { value: new THREE.Vector2(0.25, 0.5) };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 aUvScale;\nuniform vec2 uCellOrigin;\nuniform vec2 uCellSize;'
        )
        .replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\n  vec2 cellSpan = uCellSize - 0.008;\n  vUv = uCellOrigin + 0.004 + fract(vUv * aUvScale) * cellSpan;'
        );
    };
    mat.customProgramCacheKey = () => 'facade-' + cell;
    return mat;
  });

  interface TowerItem {
    p: THREE.Vector3;
    h: number;
    w: number;
    d: number;
    mat: number;
    pagoda: boolean;
  }
  const towers: TowerItem[] = [];
  for (let i = 0; i < 720; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 360 + Math.random() * 3000;
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.9);
    if (blocked(p, trk.hw + 145)) continue;
    const h = 140 + Math.random() * 700;
    towers.push({
      p,
      h,
      w: 42 + Math.random() * 100,
      d: 42 + Math.random() * 100,
      mat: bandForHeight(h),
      pagoda: Math.random() < 0.28
    });
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let mIdx = 0; mIdx < FACADE_BANDS; mIdx++) {
    const list = towers.filter((t) => t.mat === mIdx);
    if (!list.length) continue;
    // Instanced attributes live on the geometry, so each family needs its own
    // copy of the box rather than sharing one buffer.
    const geo = box.clone();
    const uvScale = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 2), 2);
    const mesh = new THREE.InstancedMesh(geo, towerMats[mIdx], list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    list.forEach((t, i) => {
      sc.set(t.w, t.h + 330, t.d);
      m4.compose(new THREE.Vector3(t.p.x, (t.h + 330) / 2 - 440, t.p.z), q, sc);
      mesh.setMatrixAt(i, m4);
      // one facade cell = 32 m wide × 64 m tall
      uvScale.setXY(i, t.w / 32, (t.h + 330) / 64);
    });
    geo.setAttribute('aUvScale', uvScale);
    uvScale.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // Architectural setback crowns, rooftop spires, neon trim rings & Neo-Pagoda roofs
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x161d38, metalness: 0.8, roughness: 0.28 });
  const crownMesh = new THREE.InstancedMesh(box, crownMat, towers.length);
  const spireMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false });
  const spireMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1.5, 1, 6), spireMat, towers.length);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false });
  const bandMesh = new THREE.InstancedMesh(box, bandMat, towers.length);

  const pagodaTowers = towers.filter((t) => t.pagoda);
  const eaveGeo = new THREE.ConeGeometry(0.85, 0.34, 4);
  eaveGeo.rotateY(Math.PI / 4);
  const eaveMat = new THREE.MeshStandardMaterial({
    color: 0x1e1836,
    emissive: 0xff2e93,
    emissiveIntensity: 0.45,
    metalness: 0.72,
    roughness: 0.32
  });
  const eaveMesh = new THREE.InstancedMesh(eaveGeo, eaveMat, pagodaTowers.length * 2);

  const q0 = new THREE.Quaternion();
  const sc0 = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  towers.forEach((t, i) => {
    const roofY = t.h - 110;
    const crownH = 26 + (i % 4) * 14;
    p0.set(t.p.x, roofY + crownH * 0.5, t.p.z);
    sc0.set(t.w * 0.64, crownH, t.d * 0.64);
    _m4.compose(p0, q0, sc0);
    crownMesh.setMatrixAt(i, _m4);

    p0.set(t.p.x, roofY + 1.2, t.p.z);
    sc0.set(t.w * 1.04, 2.2, t.d * 1.04);
    _m4.compose(p0, q0, sc0);
    bandMesh.setMatrixAt(i, _m4);

    const spireH = 38 + (i % 5) * 18;
    p0.set(t.p.x, roofY + crownH + spireH * 0.5, t.p.z);
    sc0.set(1, spireH, 1);
    _m4.compose(p0, q0, sc0);
    spireMesh.setMatrixAt(i, _m4);
  });

  pagodaTowers.forEach((t, i) => {
    const roofY = t.h - 110;
    for (let tier = 0; tier < 2; tier++) {
      const s = 1.28 - tier * 0.32;
      p0.set(t.p.x, roofY + 8 + tier * 24, t.p.z);
      sc0.set(t.w * s, 26, t.d * s);
      _m4.compose(p0, q0, sc0);
      eaveMesh.setMatrixAt(i * 2 + tier, _m4);
    }
  });

  for (const m of [crownMesh, bandMesh, spireMesh, eaveMesh]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }

  // Tall vertical cyberpunk kanji & brand holo-banners on skyscrapers (inspired by ref megacity)
  const verticalBannerLabels: [string, string, string][] = [
    ['未技', 'AHWOO', '#ff2e93'],
    ['天际', 'SKYLINE', '#00f0ff'],
    ['极速', 'OVERDRIVE', '#f5c451'],
    ['王者', 'SOVEREIGN', '#8b5cf6'],
    ['未来', 'APEX GP', '#00ffcc'],
    ['零式', 'CUBIC', '#ff2e93']
  ];
  const verticalBannerMats = verticalBannerLabels.map(([kanji, sub, col]) => {
    const tex = canvasTexture(128, 512, (g) => {
      g.fillStyle = 'rgba(6,10,28,0.88)';
      g.fillRect(0, 0, 128, 512);
      g.strokeStyle = col;
      g.lineWidth = 6;
      g.strokeRect(4, 4, 120, 504);
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.shadowColor = col;
      g.shadowBlur = 22;
      g.font = "bold 72px 'Noto Sans SC', sans-serif";
      const chars = Array.from(kanji);
      chars.forEach((ch, idx) => {
        g.fillText(ch, 64, 125 + idx * 120);
      });
      g.fillStyle = col;
      g.font = "bold 20px 'Orbitron', sans-serif";
      g.fillText(sub, 64, 470);
    });
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthWrite: false
    });
  });

  const bannerGeo = new THREE.PlaneGeometry(34, 155);
  towers.slice(0, 54).forEach((t, i) => {
    const mat = verticalBannerMats[i % verticalBannerMats.length];
    const sign = new THREE.Mesh(bannerGeo, mat);
    const face = i % 4;
    const offsetX = face === 1 ? t.w * 0.52 : face === 3 ? -t.w * 0.52 : 0;
    const offsetZ = face === 0 ? t.d * 0.52 : face === 2 ? -t.d * 0.52 : 0;
    sign.position.set(t.p.x + offsetX, Math.min(340, 80 + t.h * 0.45), t.p.z + offsetZ);
    sign.rotation.y = face * (Math.PI / 2);
    group.add(sign);
  });

  // Ambient flying sky-traffic shuttles weaving through the city skyline
  const trafficCount = 24;
  const shuttleHull = new THREE.InstancedMesh(
    new THREE.BoxGeometry(8, 2.2, 18),
    new THREE.MeshStandardMaterial({ color: 0x161f38, metalness: 0.8, roughness: 0.25 }),
    trafficCount
  );
  const shuttleGlow = new THREE.InstancedMesh(
    new THREE.BoxGeometry(8.4, 0.9, 3.2),
    new THREE.MeshBasicMaterial({ color: 0xff2e93, toneMapped: false }),
    trafficCount
  );
  shuttleHull.frustumCulled = false;
  shuttleGlow.frustumCulled = false;
  const trafficData = Array.from({ length: trafficCount }, (_, i) => ({
    radius: 750 + (i % 5) * 420,
    altitude: 190 + (i % 6) * 75,
    speed: (i % 2 === 0 ? 1 : -1) * (0.045 + (i % 4) * 0.015),
    phase: (i / trafficCount) * Math.PI * 2
  }));
  group.add(shuttleHull, shuttleGlow);

  // Floating lanterns beside the road
  const lanternCount = 80;
  const lanternMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.5, 1.5, 3.4, 8),
    new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false }),
    lanternCount
  );
  lanternMesh.frustumCulled = false;
  const lanterns: { base: THREE.Vector3; p: THREE.Vector3; phase: number; speed: number }[] = [];
  for (let i = 0; i < lanternCount; i++) {
    const u = i / lanternCount;
    const f = trk.fr(u);
    const side = (Math.random() - 0.5) * trk.hw * 4.4;
    const p = f.pos.clone().addScaledVector(f.s, side).addScaledVector(f.up, 16 + Math.random() * 60);
    lanterns.push({ base: p.clone(), p, phase: Math.random() * 7, speed: 0.8 + Math.random() });
  }
  group.add(lanternMesh);

  // Celestial dragon loop in the sky
  const dragon = new THREE.Group();
  const segs: THREE.Group[] = [];
  const ringGeo = new THREE.TorusGeometry(5, 0.75, 6, 14);
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false })
  ];
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Group();
    const ringM = new THREE.Mesh(ringGeo, mats[i % 3 === 0 ? 1 : 0]);
    const k = 1 - (i / 24) * 0.6;
    ringM.scale.setScalar(k);
    s.add(ringM);
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.9 * k, 4.2 * k, 4), mats[i % 3 === 0 ? 1 : 0]);
    spine.position.y = 4 * k;
    s.add(spine);
    dragon.add(s);
    segs.push(s);
  }
  const head = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 6), mats[1]);
  head.rotation.x = Math.PI / 2;
  dragon.add(head);
  group.add(dragon);

  for (let u = 0.05; u < 0.99; u += 0.115) {
    arch(trk, u, 'AHWOO GP', '天际回廊', u % 0.25 < 0.06 ? '#f5c451' : '#00f0ff', group);
  }
  tracksideSign(trk, 0.022, 'AHWOO RACING', '#f5c451', 26, group);
  tracksideSign(trk, 0.52, 'OVERDRIVE', '#00f0ff', 24, group);

  world.update = (_dt, now) => {
    const t = now * 0.0012;
    const ang = t * 0.3;
    head.position.set(Math.cos(ang) * 1250, 520 + Math.sin(t * 1.4) * 90, Math.sin(ang) * 1250);
    head.rotation.y = ang + Math.PI / 2;
    for (let i = 0; i < segs.length; i++) {
      const a = (t - (i + 1) * 0.16) * 0.3;
      segs[i].position.set(
        Math.cos(a) * 1250 + Math.sin(t * 2 - i * 0.35) * 30,
        520 + Math.sin((t - i * 0.16) * 1.4) * 90 + Math.cos(t * 2.5 - i * 0.3) * 20,
        Math.sin(a) * 1250
      );
      segs[i].lookAt(i === 0 ? head.position : segs[i - 1].position);
    }
    for (let i = 0; i < lanterns.length; i++) {
      const l = lanterns[i];
      _m4.identity();
      _m4.setPosition(l.p.x, l.base.y + Math.sin(now * 0.0016 * l.speed + l.phase) * 7, l.p.z);
      lanternMesh.setMatrixAt(i, _m4);
    }
    lanternMesh.instanceMatrix.needsUpdate = true;

    const nowSec = now * 0.001;
    for (let i = 0; i < trafficCount; i++) {
      const tr = trafficData[i];
      const angT = tr.phase + nowSec * tr.speed;
      const px = Math.cos(angT) * tr.radius;
      const pz = Math.sin(angT) * tr.radius;
      const yaw = -angT + (tr.speed > 0 ? 0 : Math.PI);
      _q.setFromEuler(_euler.set(0, yaw, 0));
      _m4.compose(_sc.set(px, tr.altitude, pz), _q, _one);
      shuttleHull.setMatrixAt(i, _m4);
      _m4.compose(_sc.set(px - Math.sin(yaw) * 8.2, tr.altitude, pz - Math.cos(yaw) * 8.2), _q, _one);
      shuttleGlow.setMatrixAt(i, _m4);
    }
    shuttleHull.instanceMatrix.needsUpdate = true;
    shuttleGlow.instanceMatrix.needsUpdate = true;
  };
}

function buildBeachWorld(def: LevelDef, trk: TrackData, group: THREE.Group, world: BuiltWorld): void {
  const skyTex = canvasTexture(8, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#3b1a5e');
    grd.addColorStop(0.28, '#8c3a90');
    grd.addColorStop(0.52, '#ff6fb5');
    grd.addColorStop(0.72, '#ff9ecb');
    grd.addColorStop(0.88, '#ffd0e4');
    grd.addColorStop(1, '#6fe6d8');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
  });
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(9000, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    )
  );

  const sun = new THREE.Mesh(new THREE.SphereGeometry(230, 32, 24), new THREE.MeshBasicMaterial({ color: 0xfff2d8, fog: false, toneMapped: false }));
  sun.position.set(-2600, 520, -3600);
  group.add(sun);
  const sunGlow = glowPlane('rgba(255,190,220,0.55)', 2400, 0.7);
  sunGlow.position.copy(sun.position);
  sunGlow.lookAt(0, 0, 0);
  group.add(sunGlow);

  const sandTex = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#2f9e63';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2800; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(180,255,190,0.2)' : 'rgba(10,70,60,0.14)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(16, 16);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000, 1, 1),
    new THREE.MeshStandardMaterial({ map: sandTex, color: 0xb9ffd2, roughness: 0.95, metalness: 0.0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -292;
  group.add(sand);

  const seaTex = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#11577a';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(130,240,255,${0.04 + Math.random() * 0.1})`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      const y = Math.random() * 512;
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 20, 340, y - 20, 512, y + 6);
      g.stroke();
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(22, 22);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x1d8fb5, map: seaTex, emissive: 0x0a3d52, emissiveIntensity: 0.45, metalness: 0.45, roughness: 0.22 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -340;
  group.add(sea);

  // Palm trees
  const palms: { p: THREE.Vector3; h: number; lean: number; rot: number }[] = [];
  for (let i = 0; i < 120; i++) {
    const u = i / 120;
    const f = trk.fr(u);
    const side = i % 2 ? 1 : -1;
    const off = side * (trk.hw + 12 + Math.random() * 95);
    const p = f.pos.clone().addScaledVector(f.s, off);
    p.y = -292;
    palms.push({ p, h: 40 + Math.random() * 46, lean: (Math.random() - 0.5) * 0.35, rot: Math.random() * Math.PI * 2 });
  }
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.8, 1.7, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0x5b3a6b, roughness: 0.8, metalness: 0.1, emissive: 0x2a1236, emissiveIntensity: 0.5 }),
    palms.length
  );
  const leavesPerPalm = 8;
  const leafMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.7, 26, 4, 1),
    new THREE.MeshStandardMaterial({ color: 0x2f7dff, emissive: 0x0e46c8, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide, flatShading: true }),
    palms.length * leavesPerPalm
  );
  const upVec = new THREE.Vector3(0, 1, 0);
  palms.forEach((palm, i) => {
    _q.setFromEuler(_euler.set(palm.lean, palm.rot, palm.lean * 0.6));
    _sc.set(1, palm.h, 1);
    _m4.compose(new THREE.Vector3(palm.p.x, palm.p.y + palm.h / 2, palm.p.z), _q, _sc);
    trunkMesh.setMatrixAt(i, _m4);

    const top = new THREE.Vector3(palm.p.x + palm.lean * palm.h * 0.4, palm.p.y + palm.h * 0.96, palm.p.z);
    for (let k = 0; k < leavesPerPalm; k++) {
      const ang = (k / leavesPerPalm) * Math.PI * 2 + palm.rot;
      const droop = 0.1 + (k % 2) * 0.35;
      const dir = new THREE.Vector3(Math.cos(ang), droop, Math.sin(ang)).normalize();
      _q.setFromUnitVectors(upVec, dir);
      _m4.compose(top.clone().addScaledVector(dir, 10.5), _q, _sc.set(1, 0.9, 1));
      leafMesh.setMatrixAt(i * leavesPerPalm + k, _m4);
    }
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.computeBoundingSphere();
  leafMesh.computeBoundingSphere();
  group.add(trunkMesh, leafMesh);

  // Sculpted emerald basalt sea-stacks & bioluminescent crystal spires along coast
  const stackCount = 34;
  const stackBaseMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(14, 28, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0x3b2a5a, roughness: 0.82, metalness: 0.14, flatShading: true }),
    stackCount
  );
  const stackCrownMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(11, 0),
    new THREE.MeshStandardMaterial({ color: 0x59f0d8, emissive: 0x1cc7a8, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0.4, flatShading: true }),
    stackCount
  );
  for (let i = 0; i < stackCount; i++) {
    const u = (i + 0.35) / stackCount;
    const f = trk.fr(u);
    const side = i % 2 === 0 ? 1 : -1;
    const dist = trk.hw + 190 + (i % 5) * 95;
    const pos = f.pos.clone().addScaledVector(f.s, side * dist);
    const h = 110 + (i % 4) * 55;
    _q.setFromEuler(_euler.set(0, i * 0.9, 0));
    _sc.set(1 + (i % 3) * 0.35, h, 1 + (i % 2) * 0.35);
    _m4.compose(new THREE.Vector3(pos.x, -340 + h * 0.5, pos.z), _q, _sc);
    stackBaseMesh.setMatrixAt(i, _m4);

    _sc.set(1.1, 2.2, 1.1);
    _m4.compose(new THREE.Vector3(pos.x, -340 + h + 10, pos.z), _q, _sc);
    stackCrownMesh.setMatrixAt(i, _m4);
  }
  stackBaseMesh.instanceMatrix.needsUpdate = true;
  stackCrownMesh.instanceMatrix.needsUpdate = true;
  stackBaseMesh.computeBoundingSphere();
  stackCrownMesh.computeBoundingSphere();
  group.add(stackBaseMesh, stackCrownMesh);

  for (let u = 0.08; u < 0.99; u += 0.17) {
    arch(trk, u, 'VESPER SHORE', '海岸', '#8cf7e4', group);
  }
  tracksideSign(trk, 0.1, 'AHWOO SHORE', '#ffd9ef', 26, group);
  tracksideSign(trk, 0.62, 'TIDELINE RUN', '#8cf7e4', 24, group);

  world.update = (dt) => {
    seaTex.offset.y -= dt * 0.006;
    seaTex.offset.x += dt * 0.002;
  };
}

function buildSpaceWorld(def: LevelDef, trk: TrackData, group: THREE.Group, world: BuiltWorld): void {
  const starCount = 6000;
  const sp = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const col = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2000 + Math.random() * 7000);
    sp[i * 3] = v.x;
    sp[i * 3 + 1] = v.y;
    sp[i * 3 + 2] = v.z;
    col.setHSL(0.55 + Math.random() * 0.18, 0.35 + Math.random() * 0.4, 0.65 + Math.random() * 0.3);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 5.4, vertexColors: true, fog: false, transparent: true, opacity: 0.95 })));

  const nebulaDefs: { pos: [number, number, number]; size: [number, number]; tex: THREE.CanvasTexture }[] = [
    { pos: [0, 1400, -4200], size: [5200, 3600], tex: nebulaTexture('rgba(120,40,220,0.55)', 'rgba(40,120,255,0.3)') },
    { pos: [-3600, 900, 2600], size: [4400, 3000], tex: nebulaTexture('rgba(255,60,160,0.5)', 'rgba(255,140,60,0.22)') },
    { pos: [4200, 2000, 1900], size: [5000, 3400], tex: nebulaTexture('rgba(40,220,255,0.4)', 'rgba(120,60,255,0.24)') }
  ];
  for (const n of nebulaDefs) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(n.size[0], n.size[1]),
      new THREE.MeshBasicMaterial({ map: n.tex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
    );
    m.position.set(...n.pos);
    m.lookAt(0, 0, 0);
    group.add(m);
  }

  function makePlanet(
    radius: number,
    tex: THREE.CanvasTexture,
    position: THREE.Vector3,
    ringOpts?: { outer: number; color: number; opacity: number; tilt: number; spin: number }
  ): THREE.Mesh {
    const p = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    p.position.copy(position);
    group.add(p);
    const halo = glowPlane('rgba(120,170,255,0.3)', radius * 4.2, 0.28);
    halo.position.copy(position);
    halo.lookAt(0, 0, 0);
    group.add(halo);
    if (ringOpts) {
      const rMesh = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.35, radius * ringOpts.outer, 96),
        new THREE.MeshBasicMaterial({ color: ringOpts.color, transparent: true, opacity: ringOpts.opacity, side: THREE.DoubleSide, fog: false, depthWrite: false })
      );
      rMesh.position.copy(position);
      rMesh.rotation.set(ringOpts.tilt, ringOpts.spin, 0.2);
      group.add(rMesh);
    }
    return p;
  }

  const gas = makePlanet(520, planetTexture('#ffb3d9', '#9a6bff', '#3b2a86', true), new THREE.Vector3(-3000, 900, -3600), { outer: 2.1, color: 0xffc9f0, opacity: 0.35, tilt: 1.2, spin: 0.3 });
  const red = makePlanet(240, planetTexture('#ff8a5c', '#b83a4a', '#3a1020', false), new THREE.Vector3(3300, -260, -2200));
  const ice = makePlanet(160, planetTexture('#e6f6ff', '#8fd6ff', '#2b5f9e', false), new THREE.Vector3(1600, 1500, 3000), { outer: 1.6, color: 0xa8e8ff, opacity: 0.3, tilt: 2.2, spin: 0.1 });

  // Wormhole
  const holeGroup = new THREE.Group();
  const holeAnchor = trk.fr(0.43);
  holeGroup.position.copy(holeAnchor.pos).addScaledVector(holeAnchor.s, 520).addScaledVector(holeAnchor.up, 260);
  holeGroup.lookAt(holeAnchor.pos);
  holeGroup.scale.setScalar(1.5);
  const spiral = canvasTexture(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    const grd = g.createRadialGradient(256, 256, 10, 256, 256, 250);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(120,220,255,0.9)');
    grd.addColorStop(0.5, 'rgba(150,80,255,0.55)');
    grd.addColorStop(1, 'rgba(20,0,60,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  });
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshBasicMaterial({ map: spiral, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  holeGroup.add(disc);
  const holeRing = new THREE.Mesh(
    new THREE.TorusGeometry(250, 24, 16, 80),
    new THREE.MeshBasicMaterial({ color: 0x7fe8ff, toneMapped: false, transparent: true, opacity: 0.85, fog: false })
  );
  holeGroup.add(holeRing);
  group.add(holeGroup);

  // Asteroids
  const asteroidCount = 200;
  const asteroids = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x5a5478, roughness: 0.85, metalness: 0.2, flatShading: true }),
    asteroidCount
  );
  asteroids.frustumCulled = false;
  const astData: { p: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];
  const trackSamples: THREE.Vector3[] = [];
  for (let k = 0; k < 96; k++) trackSamples.push(trk.curve.getPointAt(k / 96));
  for (let i = 0; i < asteroidCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 420 + Math.random() * 1600;
    const p = new THREE.Vector3(Math.cos(a) * r, -180 + Math.random() * 520, Math.sin(a) * r);
    const nearTrack = trackSamples.some((q) => q.distanceToSquared(p) < (trk.hw + 70) ** 2);
    const scale = nearTrack ? 2 + Math.random() * 4 : 4 + Math.random() * 20;
    const rot = new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    _q.setFromEuler(rot);
    _sc.set(scale, scale * (0.6 + Math.random() * 0.7), scale);
    _m4.compose(p, _q, _sc);
    asteroids.setMatrixAt(i, _m4);
    astData.push({ p, rot, scale });
  }
  asteroids.instanceMatrix.needsUpdate = true;
  group.add(asteroids);

  // Orbital drydock megastructure beacon pylons flanking deep space circuit
  const pylonCount = 24;
  const orbitalBody = new THREE.InstancedMesh(
    new THREE.BoxGeometry(10, 140, 10),
    new THREE.MeshStandardMaterial({ color: 0x181f3d, metalness: 0.85, roughness: 0.28 }),
    pylonCount
  );
  const orbitalCore = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(9, 0),
    new THREE.MeshBasicMaterial({ color: 0x31e8ff, toneMapped: false }),
    pylonCount
  );
  for (let i = 0; i < pylonCount; i++) {
    const u = i / pylonCount;
    const f = trk.fr(u);
    const side = i % 2 === 0 ? 1 : -1;
    const pos = f.pos.clone().addScaledVector(f.s, side * (trk.hw + 140 + (i % 3) * 65)).addScaledVector(f.up, -20 + (i % 3) * 30);
    _q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
    _m4.compose(pos, _q, _one);
    orbitalBody.setMatrixAt(i, _m4);
    _m4.compose(pos.clone().addScaledVector(f.up, 82), _q, _one);
    orbitalCore.setMatrixAt(i, _m4);
  }
  orbitalBody.instanceMatrix.needsUpdate = true;
  orbitalCore.instanceMatrix.needsUpdate = true;
  orbitalBody.computeBoundingSphere();
  orbitalCore.computeBoundingSphere();
  group.add(orbitalBody, orbitalCore);

  // Massive open-lattice skeletal truss drydock station floating beside the asteroid belt
  const trussGroup = new THREE.Group();
  trussGroup.position.set(2200, 480, 1950);
  trussGroup.rotation.set(0.28, -0.65, 0.38);
  const trussSteel = new THREE.MeshStandardMaterial({ color: 0x202848, metalness: 0.88, roughness: 0.28 });
  const trussGlow = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, toneMapped: false });
  for (const sx of [-42, 42]) {
    for (const sy of [-42, 42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 920), trussSteel);
      rail.position.set(sx, sy, 0);
      trussGroup.add(rail);
    }
  }
  for (let z = -420; z <= 420; z += 105) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(92, 92, 8), trussSteel);
    frame.position.z = z;
    trussGroup.add(frame);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(96, 4, 4), trussGlow);
    beacon.position.set(0, 48, z);
    trussGroup.add(beacon);
  }
  const dockBay = new THREE.Mesh(new THREE.BoxGeometry(190, 95, 220), trussSteel);
  dockBay.position.set(0, -18, -320);
  trussGroup.add(dockBay);
  group.add(trussGroup);

  for (let u = 0.07; u < 0.99; u += 0.18) {
    arch(trk, u, 'EVENT HORIZON', '视界', '#9d7bff', group);
  }
  tracksideSign(trk, 0.08, 'EVENT HORIZON', '#c9a8ff', 28, group);
  tracksideSign(trk, 0.55, 'WORMHOLE AHEAD', '#7fe8ff', 26, group);

  world.update = (dt, now) => {
    const t = now * 0.001;
    disc.rotation.z -= dt * 0.25;
    holeRing.rotation.z += dt * 0.12;
    gas.rotation.y += dt * 0.02;
    red.rotation.y += dt * 0.03;
    ice.rotation.y += dt * 0.025;
    for (let i = 0; i < asteroidCount; i++) {
      const a = astData[i];
      _q.setFromEuler(_euler.set(a.rot.x + t * 0.05, a.rot.y + t * 0.04, a.rot.z));
      _sc.set(a.scale, a.scale * 0.8, a.scale);
      _m4.compose(a.p, _q, _sc);
      asteroids.setMatrixAt(i, _m4);
    }
    asteroids.instanceMatrix.needsUpdate = true;
  };
}

function underwaterDomeGeometry(
  trk: TrackData,
  from: number,
  to: number,
  archHeight: number
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const span = Math.max(0.0001, to - from);
  const uSteps = Math.max(12, Math.round(trk.steps * span * 1.4));
  const arcSegs = 12;
  const ringVerts = arcSegs + 1;

  for (let k = 0; k <= uSteps; k++) {
    const uRaw = from + span * (k / uSteps);
    const u = clampTrackU(trk, uRaw);
    const f = trk.fr(u);
    const halfSpan = f.width + 5;
    const vCoord = (uRaw * trk.len) / 60;

    for (let a = 0; a <= arcSegs; a++) {
      const theta = (a / arcSegs) * Math.PI; // 0 (right base) -> PI (left base)
      const sOff = Math.cos(theta) * halfSpan;
      const uOff = Math.sin(theta) * archHeight;
      const vx = f.pos.x + f.s.x * sOff + f.up.x * uOff;
      const vy = f.pos.y + f.s.y * sOff + f.up.y * uOff;
      const vz = f.pos.z + f.s.z * sOff + f.up.z * uOff;
      pos.push(vx, vy, vz);
      uv.push(a / arcSegs, vCoord);
    }

    if (k < uSteps) {
      const base = k * ringVerts;
      for (let a = 0; a < arcSegs; a++) {
        const i0 = base + a;
        const i1 = base + a + 1;
        const i2 = base + ringVerts + a;
        const i3 = base + ringVerts + a + 1;
        idx.push(i0, i1, i2, i1, i3, i2);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildSpaceBeachWorld(_def: LevelDef, trk: TrackData, group: THREE.Group, world: BuiltWorld): void {
  // 1. Cosmic-Tropical Sunset Starfield Sky Dome
  const skyTex = canvasTexture(8, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0.0, '#03081c');
    grd.addColorStop(0.28, '#0c1c45');
    grd.addColorStop(0.46, '#1a3a6a');
    grd.addColorStop(0.55, '#3b5b7a');
    grd.addColorStop(0.62, '#143c5e');
    grd.addColorStop(0.8, '#07223e');
    grd.addColorStop(1.0, '#020f22');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
  });
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(11000, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    )
  );

  // Stars overhead above the cosmic ocean horizon
  const starCount = 3400;
  const sp = new Float32Array(starCount * 3);
  const scol = new Float32Array(starCount * 3);
  const cTmp = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(3200 + Math.random() * 5200);
    sp[i * 3] = v.x;
    sp[i * 3 + 1] = Math.abs(v.y) * 0.95 + 160;
    sp[i * 3 + 2] = v.z;
    cTmp.setHSL(0.48 + Math.random() * 0.16, 0.45, 0.72 + Math.random() * 0.25);
    scol[i * 3] = cTmp.r;
    scol[i * 3 + 1] = cTmp.g;
    scol[i * 3 + 2] = cTmp.b;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 4.5, vertexColors: true, fog: false, transparent: true, opacity: 0.92 })));

  // Giant ringed cosmic ocean planet + golden horizon sun
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(480, 40, 28),
    new THREE.MeshBasicMaterial({ map: planetTexture('#8df6ff', '#2c6bd8', '#0a1c48', true), fog: false })
  );
  planet.position.set(-2400, 1750, -3400);
  group.add(planet);
  const planetRing = new THREE.Mesh(
    new THREE.RingGeometry(640, 1020, 84),
    new THREE.MeshBasicMaterial({ color: 0x52f7e4, transparent: true, opacity: 0.34, side: THREE.DoubleSide, fog: false, depthWrite: false })
  );
  planetRing.position.copy(planet.position);
  planetRing.rotation.set(1.18, 0.32, 0.22);
  group.add(planetRing);

  const horizonSun = new THREE.Mesh(
    new THREE.SphereGeometry(280, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe4b8, fog: false })
  );
  horizonSun.position.set(4200, 340, -5200);
  group.add(horizonSun);
  const sunHalo = glowPlane('rgba(255,212,135,0.48)', 2600, 0.62);
  sunHalo.position.copy(horizonSun.position);
  sunHalo.lookAt(0, 0, 0);
  group.add(sunHalo);

  // 2. Semi-transparent animated ocean water surface (y = -20) visible both above and from inside underwater tunnels
  const OCEAN_Y = -20;
  const SEABED_Y = -220;
  const oceanTex = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#0d5678';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = i % 3 === 0 ? 'rgba(138, 252, 255, 0.22)' : 'rgba(54, 245, 216, 0.14)';
      g.lineWidth = 1.5 + Math.random() * 3;
      const y = Math.random() * 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 26, 340, y - 26, 512, y + 4);
      g.stroke();
    }
  });
  oceanTex.wrapS = oceanTex.wrapT = THREE.RepeatWrapping;
  oceanTex.repeat.set(28, 28);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x1990ba,
    map: oceanTex,
    emissive: 0x0a4d6e,
    emissiveIntensity: 0.45,
    metalness: 0.55,
    roughness: 0.14,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const oceanPlane = new THREE.Mesh(new THREE.PlaneGeometry(15000, 15000), oceanMat);
  oceanPlane.rotation.x = -Math.PI / 2;
  oceanPlane.position.y = OCEAN_Y;
  oceanPlane.renderOrder = 1;
  group.add(oceanPlane);

  // 3. Textured Seabed Terrain at y = -220
  const seabedTex = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#072b42';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(54,245,216,0.12)' : 'rgba(12,68,98,0.22)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
  });
  seabedTex.wrapS = seabedTex.wrapT = THREE.RepeatWrapping;
  seabedTex.repeat.set(24, 24);
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(15000, 15000),
    new THREE.MeshStandardMaterial({ map: seabedTex, color: 0x185c78, roughness: 0.92, metalness: 0.05 })
  );
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = SEABED_Y;
  group.add(seabed);

  // 4. Coastal Islands & Palm Trees at Start Bay (u~0.03), Mid Atoll (u~0.55), and Finish Bay (u~0.96)
  const islandSpecs: [number, number, number, number][] = [
    [-3150, -34, 2350, 900],
    [2050, -32, 780, 760],
    [4100, -30, -1550, 880]
  ];
  const islandSandMat = new THREE.MeshStandardMaterial({ color: 0x2ca88e, emissive: 0x0a4a3f, emissiveIntensity: 0.25, roughness: 0.85 });
  const palmPositions: { x: number; y: number; z: number; h: number; lean: number; rot: number }[] = [];

  for (const [ix, iy, iz, ir] of islandSpecs) {
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(ir * 0.65, ir, 46, 28), islandSandMat);
    mound.position.set(ix, iy, iz);
    group.add(mound);

    for (let k = 0; k < 22; k++) {
      const ang = (k / 22) * Math.PI * 2 + ir * 0.01;
      const dist = ir * (0.28 + (k % 3) * 0.14);
      const px = ix + Math.cos(ang) * dist;
      const pz = iz + Math.sin(ang) * dist;
      // Keep palm trees well clear of track roadbed
      const closeToRoad = [0.02, 0.08, 0.52, 0.57, 0.92, 0.98].some((tu) => {
        const tf = trk.fr(tu);
        return (tf.pos.x - px) ** 2 + (tf.pos.z - pz) ** 2 < (trk.hw + 48) ** 2;
      });
      if (closeToRoad) continue;
      palmPositions.push({
        x: px,
        y: iy + 20,
        z: pz,
        h: 44 + (k % 4) * 14,
        lean: ((k % 5) - 2) * 0.09,
        rot: k * 1.1
      });
    }
  }

  if (palmPositions.length > 0) {
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.9, 1.9, 1, 7),
      new THREE.MeshStandardMaterial({ color: 0x4b355c, roughness: 0.8 }),
      palmPositions.length
    );
    const leavesPerPalm = 8;
    const leafMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.8, 25, 4, 1),
      new THREE.MeshStandardMaterial({ color: 0x36f5d8, emissive: 0x107a72, emissiveIntensity: 0.65, roughness: 0.45, side: THREE.DoubleSide, flatShading: true }),
      palmPositions.length * leavesPerPalm
    );
    const upVec = new THREE.Vector3(0, 1, 0);
    palmPositions.forEach((p, i) => {
      _q.setFromEuler(_euler.set(p.lean, p.rot, p.lean * 0.5));
      _sc.set(1, p.h, 1);
      _m4.compose(new THREE.Vector3(p.x, p.y + p.h * 0.5, p.z), _q, _sc);
      trunkMesh.setMatrixAt(i, _m4);

      const top = new THREE.Vector3(p.x + p.lean * p.h * 0.35, p.y + p.h * 0.96, p.z);
      for (let k = 0; k < leavesPerPalm; k++) {
        const ang = (k / leavesPerPalm) * Math.PI * 2 + p.rot;
        const dir = new THREE.Vector3(Math.cos(ang), 0.14 + (k % 2) * 0.32, Math.sin(ang)).normalize();
        _q.setFromUnitVectors(upVec, dir);
        _m4.compose(top.clone().addScaledVector(dir, 10), _q, _sc.set(1, 0.9, 1));
        leafMesh.setMatrixAt(i * leavesPerPalm + k, _m4);
      }
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    leafMesh.computeBoundingSphere();
    group.add(trunkMesh, leafMesh);
  }

  // 5. Bioluminescent Coral Spires & Kelp Flanking Both Underwater Tunnels
  const coralList: { pos: THREE.Vector3; h: number; r: number; hue: number }[] = [];
  const kelpList: { pos: THREE.Vector3; h: number; phase: number }[] = [];
  const tunnelBands: [number, number][] = [
    [0.215, 0.445],
    [0.705, 0.89]
  ];
  for (const [uA, uB] of tunnelBands) {
    for (let i = 0; i < 48; i++) {
      const u = uA + (uB - uA) * (i / 48);
      const f = trk.fr(u);
      const side = i % 2 === 0 ? 1 : -1;
      const lat = trk.hw + 42 + (i % 5) * 44;
      const p = f.pos.clone().addScaledVector(f.s, side * lat);
      coralList.push({
        pos: new THREE.Vector3(p.x, SEABED_Y, p.z),
        h: 36 + (i % 6) * 22,
        r: 12 + (i % 4) * 5,
        hue: i % 3
      });
      kelpList.push({
        pos: new THREE.Vector3(p.x + (i % 3 - 1) * 18, SEABED_Y, p.z + ((i % 2) - 0.5) * 18),
        h: 72 + (i % 5) * 24,
        phase: i * 0.7
      });
    }
  }

  const coralMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x268599, emissiveIntensity: 0.65, roughness: 0.4, flatShading: true }),
    coralList.length
  );
  const coralColors = [new THREE.Color(0x36f5d8), new THREE.Color(0xff77c8), new THREE.Color(0xf5c451)];
  coralList.forEach((c, i) => {
    _q.setFromEuler(_euler.set(0, i * 0.8, 0));
    _sc.set(c.r, c.h, c.r);
    _m4.compose(new THREE.Vector3(c.pos.x, SEABED_Y + c.h * 0.48, c.pos.z), _q, _sc);
    coralMesh.setMatrixAt(i, _m4);
    coralMesh.setColorAt(i, coralColors[c.hue]);
  });
  coralMesh.instanceMatrix.needsUpdate = true;
  if (coralMesh.instanceColor) coralMesh.instanceColor.needsUpdate = true;
  coralMesh.computeBoundingSphere();
  group.add(coralMesh);

  const kelpMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.2, 1, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x1ee8b8, emissive: 0x0b5e54, emissiveIntensity: 0.45, roughness: 0.6 }),
    kelpList.length
  );
  kelpMesh.frustumCulled = false;
  group.add(kelpMesh);

  // Helper returning safe ocean-wildlife anchor beside/above a tunnel coordinate (always submerged under OCEAN_Y)
  const sampleTunnelWildlifeAnchor = (u: number, side: number, latDist: number, aboveDeck: number) => {
    const f = trk.fr(u);
    const p = f.pos.clone().addScaledVector(f.s, side * latDist);
    p.y = Math.min(OCEAN_Y - 24, Math.max(SEABED_Y + 34, f.pos.y + aboveDeck));
    return { p, t: f.t.clone(), s: f.s.clone() };
  };

  // 6. Animated Swimming Marine Wildlife #1: 14 Bioluminescent Manta Rays
  interface MantaActor {
    root: THREE.Group;
    wingL: THREE.Mesh;
    wingR: THREE.Mesh;
    uCenter: number;
    uSpan: number;
    side: number;
    latBase: number;
    yOff: number;
    speed: number;
    phase: number;
  }
  const mantas: MantaActor[] = [];
  const mantaBodyMat = new THREE.MeshStandardMaterial({
    color: 0x103c68,
    emissive: 0x1ad8e8,
    emissiveIntensity: 0.55,
    metalness: 0.45,
    roughness: 0.28
  });
  const mantaTrimMat = new THREE.MeshBasicMaterial({ color: 0x6efbff });
  const wingShapeL = new THREE.Shape();
  wingShapeL.moveTo(0, 5.5);
  wingShapeL.lineTo(-14, -1.5);
  wingShapeL.lineTo(-9, -6.5);
  wingShapeL.lineTo(0, -4.0);
  wingShapeL.closePath();
  const wingGeoL = new THREE.ExtrudeGeometry(wingShapeL, { depth: 0.55, bevelEnabled: false });
  wingGeoL.rotateX(Math.PI / 2);

  const wingShapeR = new THREE.Shape();
  wingShapeR.moveTo(0, 5.5);
  wingShapeR.lineTo(14, -1.5);
  wingShapeR.lineTo(9, -6.5);
  wingShapeR.lineTo(0, -4.0);
  wingShapeR.closePath();
  const wingGeoR = new THREE.ExtrudeGeometry(wingShapeR, { depth: 0.55, bevelEnabled: false });
  wingGeoR.rotateX(Math.PI / 2);

  for (let i = 0; i < 14; i++) {
    const band = i < 7 ? tunnelBands[0] : tunnelBands[1];
    const uCenter = band[0] + (band[1] - band[0]) * ((i % 7 + 0.5) / 7);
    const root = new THREE.Group();
    const core = new THREE.Mesh(new THREE.ConeGeometry(2.6, 13, 6), mantaBodyMat);
    core.rotation.x = Math.PI / 2;
    core.scale.set(1.2, 1.0, 0.45);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.45, 11, 5), mantaTrimMat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -9.5;
    const wingL = new THREE.Mesh(wingGeoL, mantaBodyMat);
    const wingR = new THREE.Mesh(wingGeoR, mantaBodyMat);
    root.add(core, tail, wingL, wingR);
    root.scale.setScalar(1.3 + (i % 3) * 0.35);
    group.add(root);

    const side = i % 2 === 0 ? 1 : -1;
    const overRoof = i % 3 === 0;
    mantas.push({
      root,
      wingL,
      wingR,
      uCenter,
      uSpan: 0.032,
      side,
      latBase: overRoof ? (i % 2 === 0 ? 28 : -28) : trk.hw + 62 + (i % 4) * 32,
      yOff: overRoof ? 68 : 26 + (i % 3) * 14,
      speed: 0.32 + (i % 4) * 0.08,
      phase: i * 1.4
    });
  }

  // 7. Animated Swimming Marine Wildlife #2: 220 Neon Reef Fish (InstancedMesh)
  const fishCount = 220;
  const fishGeo = new THREE.ConeGeometry(1.1, 4.4, 4);
  fishGeo.rotateX(Math.PI / 2);
  const fishMesh = new THREE.InstancedMesh(
    fishGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x1a9cb8, emissiveIntensity: 0.65, roughness: 0.25, metalness: 0.35 }),
    fishCount
  );
  fishMesh.frustumCulled = false;
  const fishPalette = [new THREE.Color(0x52f7e4), new THREE.Color(0xf5c451), new THREE.Color(0xff84c8), new THREE.Color(0x7fe8ff)];
  interface FishData {
    uBase: number;
    bandIdx: number;
    side: number;
    latBase: number;
    yOff: number;
    orbitR: number;
    speed: number;
    phase: number;
    scale: number;
  }
  const fishList: FishData[] = [];
  for (let i = 0; i < fishCount; i++) {
    const bandIdx = i % 2;
    const band = tunnelBands[bandIdx];
    const uBase = band[0] + (band[1] - band[0]) * (((i * 0.6180339) % 1));
    const overRoof = i % 5 === 0;
    fishList.push({
      uBase,
      bandIdx,
      side: i % 2 === 0 ? 1 : -1,
      latBase: overRoof ? ((i % 3) - 1) * 38 : trk.hw + 44 + (i % 6) * 26,
      yOff: overRoof ? 66 + (i % 3) * 8 : 16 + (i % 5) * 10,
      orbitR: 12 + (i % 4) * 6,
      speed: 0.75 + (i % 5) * 0.18,
      phase: i * 0.55,
      scale: 0.8 + (i % 4) * 0.25
    });
    fishMesh.setColorAt(i, fishPalette[i % fishPalette.length]);
  }
  if (fishMesh.instanceColor) fishMesh.instanceColor.needsUpdate = true;
  group.add(fishMesh);

  // 8. Animated Swimming Marine Wildlife #3: 28 Bioluminescent Deep-Sea Jellyfish
  const jellyCount = 28;
  const jellyBellMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(4.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    new THREE.MeshBasicMaterial({ color: 0xff94f0, transparent: true, opacity: 0.74, blending: THREE.AdditiveBlending, depthWrite: false }),
    jellyCount
  );
  const jellyCoreMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.6, 2.2, 11, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x52f7e4, transparent: true, opacity: 0.56, blending: THREE.AdditiveBlending, depthWrite: false }),
    jellyCount
  );
  jellyBellMesh.frustumCulled = false;
  jellyCoreMesh.frustumCulled = false;
  const jellyAnchors: { x: number; y: number; z: number; phase: number; speed: number }[] = [];
  for (let i = 0; i < jellyCount; i++) {
    const band = tunnelBands[i % 2];
    const u = band[0] + (band[1] - band[0]) * ((i + 0.4) / jellyCount);
    const anc = sampleTunnelWildlifeAnchor(u, i % 2 === 0 ? 1 : -1, trk.hw + 55 + (i % 4) * 35, 22 + (i % 4) * 14);
    jellyAnchors.push({ x: anc.p.x, y: anc.p.y, z: anc.p.z, phase: i * 0.9, speed: 1.2 + (i % 3) * 0.35 });
  }
  group.add(jellyBellMesh, jellyCoreMesh);

  // 9. Animated Swimming Marine Wildlife #4: 2 Giant Cosmic Sea-Leviathans (Whales)
  interface WhaleActor {
    segs: THREE.Group[];
    uBase: number;
    uAmp: number;
    side: number;
    latBase: number;
    yOff: number;
    speed: number;
    phase: number;
  }
  const whales: WhaleActor[] = [];
  const whaleSkinMat = new THREE.MeshStandardMaterial({
    color: 0x163868,
    emissive: 0x2688c8,
    emissiveIntensity: 0.42,
    metalness: 0.4,
    roughness: 0.3
  });
  const whaleSpotMat = new THREE.MeshBasicMaterial({ color: 0x6efbff });

  for (let w = 0; w < 2; w++) {
    const segs: THREE.Group[] = [];
    const segCount = 10;
    for (let s = 0; s < segCount; s++) {
      const seg = new THREE.Group();
      const tNorm = s / (segCount - 1);
      const rad = s === 0 ? 9.5 : Math.max(2.2, 11.5 * Math.sin(Math.PI * (0.14 + 0.76 * (1 - tNorm))));
      const body = new THREE.Mesh(new THREE.SphereGeometry(rad, 14, 12), whaleSkinMat);
      body.scale.set(0.85, 0.78, 1.35);
      seg.add(body);
      if (s < segCount - 2) {
        for (const ls of [-1, 1]) {
          const spot = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.18, 6, 6), whaleSpotMat);
          spot.position.set(ls * rad * 0.78, rad * 0.15, 0);
          seg.add(spot);
        }
      }
      if (s === 2) {
        // Pectoral fins
        for (const ls of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 7.5), whaleSkinMat);
          fin.position.set(ls * 15, -2, -2);
          fin.rotation.y = ls * -0.45;
          fin.rotation.z = ls * -0.22;
          seg.add(fin);
        }
      }
      if (s === segCount - 1) {
        // Tail fluke
        const fluke = new THREE.Mesh(new THREE.BoxGeometry(22, 1.1, 8.5), whaleSpotMat);
        fluke.position.z = -5;
        seg.add(fluke);
      }
      group.add(seg);
      segs.push(seg);
    }
    whales.push({
      segs,
      uBase: w === 0 ? 0.32 : 0.79,
      uAmp: 0.08,
      side: w === 0 ? -1 : 1,
      latBase: trk.hw + 125,
      yOff: 46,
      speed: 0.18 + w * 0.04,
      phase: w * 2.1
    });
  }

  // 10. Rising Bubble Columns beside both underwater tunnels
  const bubbleCount = 150;
  const bubbleMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.15, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xb8ffff, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false }),
    bubbleCount
  );
  bubbleMesh.frustumCulled = false;
  const bubbles: { x: number; z: number; minY: number; maxY: number; speed: number; phase: number; scale: number }[] = [];
  for (let i = 0; i < bubbleCount; i++) {
    const band = tunnelBands[i % 2];
    const u = band[0] + (band[1] - band[0]) * (Math.floor(i / 6) / (bubbleCount / 6));
    const f = trk.fr(u);
    const side = i % 2 === 0 ? 1 : -1;
    const p = f.pos.clone().addScaledVector(f.s, side * (trk.hw + 32 + (i % 4) * 20));
    bubbles.push({
      x: p.x + ((i % 3) - 1) * 6,
      z: p.z + ((i % 5) - 2) * 5,
      minY: SEABED_Y + 8,
      maxY: OCEAN_Y - 6,
      speed: 18 + (i % 5) * 6,
      phase: (i * 0.37) % 1,
      scale: 0.7 + (i % 4) * 0.35
    });
  }
  group.add(bubbleMesh);

  // Trackside scenic sprint arches outside tunnels
  arch(trk, 0.11, 'CORAL HORIZON', '珊瑚海湾', '#36f5d8', group);
  arch(trk, 0.59, 'ATOLL LEAP', '星海飞跃', '#f5c451', group);
  tracksideSign(trk, 0.045, 'SPACE BEACH SPRINT', '#f5c451', 26, group);
  tracksideSign(trk, 0.495, 'ATOL BAY JUMP', '#36f5d8', 26, group);

  const _wPos = new THREE.Vector3();
  const _wTarget = new THREE.Vector3();

  world.update = (dt, now) => {
    const t = now * 0.001;
    oceanTex.offset.y -= dt * 0.008;
    oceanTex.offset.x += dt * 0.003;
    planet.rotation.y += dt * 0.015;

    // Gentle kelp sway
    for (let i = 0; i < kelpList.length; i++) {
      const k = kelpList[i];
      _q.setFromEuler(_euler.set(Math.sin(t * 1.1 + k.phase) * 0.14, k.phase, Math.cos(t * 0.9 + k.phase) * 0.12));
      _sc.set(1, k.h, 1);
      _m4.compose(_wPos.set(k.pos.x, SEABED_Y + k.h * 0.45, k.pos.z), _q, _sc);
      kelpMesh.setMatrixAt(i, _m4);
    }
    kelpMesh.instanceMatrix.needsUpdate = true;

    // Manta rays gliding & flapping wings
    for (const m of mantas) {
      const mt = t * m.speed + m.phase;
      const u = clampTrackU(trk, m.uCenter + Math.sin(mt) * m.uSpan);
      const uNext = clampTrackU(trk, m.uCenter + Math.sin(mt + 0.04) * m.uSpan);
      const f = trk.fr(u);
      const fn = trk.fr(uNext);
      const lat = m.side * (m.latBase + Math.cos(mt * 1.5) * 14);
      const y = Math.min(OCEAN_Y - 22, Math.max(SEABED_Y + 30, f.pos.y + m.yOff + Math.sin(mt * 2.1) * 10));
      m.root.position.set(f.pos.x + f.s.x * lat, y, f.pos.z + f.s.z * lat);
      const latNext = m.side * (m.latBase + Math.cos((mt + 0.04) * 1.5) * 14);
      const yNext = Math.min(OCEAN_Y - 22, Math.max(SEABED_Y + 30, fn.pos.y + m.yOff + Math.sin((mt + 0.04) * 2.1) * 10));
      _wTarget.set(fn.pos.x + fn.s.x * latNext, yNext, fn.pos.z + fn.s.z * latNext);
      m.root.lookAt(_wTarget);
      const flap = Math.sin(t * 2.8 + m.phase) * 0.34;
      m.wingL.rotation.z = flap;
      m.wingR.rotation.z = -flap;
    }

    // Orbiting fish schools
    for (let i = 0; i < fishList.length; i++) {
      const fs = fishList[i];
      const ang = t * fs.speed + fs.phase;
      const u = clampTrackU(trk, fs.uBase + Math.sin(ang * 0.35) * 0.018);
      const f = trk.fr(u);
      const lat = fs.side * (fs.latBase + Math.cos(ang) * fs.orbitR);
      const px = f.pos.x + f.s.x * lat + Math.sin(ang) * 4;
      const pz = f.pos.z + f.s.z * lat + Math.cos(ang) * 4;
      const py = Math.min(OCEAN_Y - 14, Math.max(SEABED_Y + 18, f.pos.y + fs.yOff + Math.sin(ang * 1.7) * 8));
      const yaw = Math.atan2(f.t.x, f.t.z) * (Math.cos(ang * 0.35) >= 0 ? 1 : 1) + Math.sin(ang) * 0.35;
      _q.setFromEuler(_euler.set(0, yaw, 0));
      _sc.setScalar(fs.scale);
      _m4.compose(_wPos.set(px, py, pz), _q, _sc);
      fishMesh.setMatrixAt(i, _m4);
    }
    fishMesh.instanceMatrix.needsUpdate = true;

    // Pulsing jellyfish
    for (let i = 0; i < jellyAnchors.length; i++) {
      const ja = jellyAnchors[i];
      const bob = Math.sin(t * ja.speed + ja.phase);
      const pulse = 0.86 + 0.24 * Math.sin(t * ja.speed * 1.6 + ja.phase);
      _q.setFromEuler(_euler.set(0, t * 0.3 + ja.phase, 0));
      _sc.set(pulse, 1.15 - (pulse - 0.86) * 0.4, pulse);
      _wPos.set(ja.x, Math.min(OCEAN_Y - 18, ja.y + bob * 10), ja.z);
      _m4.compose(_wPos, _q, _sc);
      jellyBellMesh.setMatrixAt(i, _m4);
      _wPos.y -= 5.2;
      _sc.set(0.85, 1, 0.85);
      _m4.compose(_wPos, _q, _sc);
      jellyCoreMesh.setMatrixAt(i, _m4);
    }
    jellyBellMesh.instanceMatrix.needsUpdate = true;
    jellyCoreMesh.instanceMatrix.needsUpdate = true;

    // Giant Cosmic Whales gliding along the glass tunnels
    for (const wh of whales) {
      const wt = t * wh.speed + wh.phase;
      for (let s = 0; s < wh.segs.length; s++) {
        const st = wt - s * 0.14;
        const u = clampTrackU(trk, wh.uBase + Math.sin(st) * wh.uAmp);
        const uNext = clampTrackU(trk, wh.uBase + Math.sin(st + 0.03) * wh.uAmp);
        const f = trk.fr(u);
        const fn = trk.fr(uNext);
        const lat = wh.side * (wh.latBase + Math.cos(st * 1.4) * 24);
        const y = Math.min(OCEAN_Y - 30, Math.max(SEABED_Y + 42, f.pos.y + wh.yOff + Math.sin(st * 1.8) * 14));
        const seg = wh.segs[s];
        seg.position.set(f.pos.x + f.s.x * lat, y, f.pos.z + f.s.z * lat);
        _wTarget.set(
          fn.pos.x + fn.s.x * wh.side * (wh.latBase + Math.cos((st + 0.03) * 1.4) * 24),
          Math.min(OCEAN_Y - 30, Math.max(SEABED_Y + 42, fn.pos.y + wh.yOff + Math.sin((st + 0.03) * 1.8) * 14)),
          fn.pos.z + fn.s.z * wh.side * (wh.latBase + Math.cos((st + 0.03) * 1.4) * 24)
        );
        seg.lookAt(_wTarget);
      }
    }

    // Rising hydrothermal bubble columns
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      const frac = ((t * (b.speed / (b.maxY - b.minY)) + b.phase) % 1 + 1) % 1;
      const by = b.minY + frac * (b.maxY - b.minY);
      _q.identity();
      _sc.setScalar(b.scale);
      _m4.compose(_wPos.set(b.x + Math.sin(t * 2 + i) * 2.2, by, b.z + Math.cos(t * 2 + i) * 2.2), _q, _sc);
      bubbleMesh.setMatrixAt(i, _m4);
    }
    bubbleMesh.instanceMatrix.needsUpdate = true;
  };
}

function buildVortexWorld(def: LevelDef, trk: TrackData, group: THREE.Group, world: BuiltWorld): void {
  // 1. Deep Electric-Violet Abyssal Sky Dome
  const skyTex = canvasTexture(8, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0.0, '#04020f');
    grd.addColorStop(0.32, '#0c0629');
    grd.addColorStop(0.54, '#240c4c');
    grd.addColorStop(0.72, '#130832');
    grd.addColorStop(1.0, '#03010a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
  });
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(12500, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    )
  );

  // Abyssal ionized starfield & dust bands
  const starCount = 3200;
  const sp = new Float32Array(starCount * 3);
  const scol = new Float32Array(starCount * 3);
  const cTmp = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(3600 + Math.random() * 6200);
    sp[i * 3] = v.x;
    sp[i * 3 + 1] = v.y * 0.72 + 120;
    sp[i * 3 + 2] = v.z;
    cTmp.setHSL(0.55 + (i % 7) * 0.055, 0.75, 0.72 + Math.random() * 0.25);
    scol[i * 3] = cTmp.r;
    scol[i * 3 + 1] = cTmp.g;
    scol[i * 3 + 2] = cTmp.b;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 5.2, vertexColors: true, fog: false, transparent: true, opacity: 0.9 })));

  // Lower chasm luminous floor plane far beneath Helix III (-940m)
  const abyssFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(24000, 24000),
    new THREE.MeshBasicMaterial({ color: 0x050214 })
  );
  abyssFloor.rotation.x = -Math.PI / 2;
  abyssFloor.position.y = -940;
  group.add(abyssFloor);

  // 2. Three Colossal Spinning Abyssal Vortex Shafts centered inside the Descending Spirals
  const helixRings: { mesh: THREE.Mesh; baseRotZ: number; speed: number; dir: number }[] = [];
  const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x10142c, metalness: 0.88, roughness: 0.28 });
  const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false });
  const magNeonMat = new THREE.MeshBasicMaterial({ color: 0xff2e93, toneMapped: false });
  const goldNeonMat = new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false });

  interface ShardSpec {
    cx: number;
    cz: number;
    topY: number;
    bottomY: number;
    r: number;
    phase: number;
    speed: number;
    dir: number;
    scale: number;
  }
  const shardSpecs: ShardSpec[] = [];

  const zones = trk.spiralZones || [];
  zones.forEach((zone, zIdx) => {
    const cx = zone.center.x;
    const cz = zone.center.z;
    const spanY = Math.max(420, zone.topY - zone.bottomY);
    const colHeight = spanY + 950;
    const midY = (zone.topY + zone.bottomY) * 0.5 - 80;

    // Towering central plasma singularity core column
    const coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(28, 48, colHeight, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: zIdx === 1 ? 0xff2e93 : 0x00f0ff,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    coreBeam.position.set(cx, midY, cz);
    group.add(coreBeam);

    const innerSpine = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 11, colHeight, 10),
      zIdx === 1 ? magNeonMat : cyanNeonMat
    );
    innerSpine.position.set(cx, midY, cz);
    group.add(innerSpine);

    // 7 stacked giant energy turbine rings descending through each spiral chasm
    const ringCount = 7;
    for (let k = 0; k < ringCount; k++) {
      const frac = k / (ringCount - 1);
      const ringY = zone.topY + 120 - frac * (spanY + 340);
      const ringR = zone.endR * (0.44 + (1 - frac) * 0.22);
      const ringMat = k % 3 === 0 ? cyanNeonMat : k % 3 === 1 ? magNeonMat : goldNeonMat;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 4.5, 8, 36), ringMat);
      ring.position.set(cx, ringY, cz);
      ring.rotation.x = Math.PI / 2 + Math.sin(k * 0.9) * 0.08;
      ring.rotation.y = Math.cos(k * 0.7) * 0.08;
      group.add(ring);
      helixRings.push({
        mesh: ring,
        baseRotZ: k * 0.5,
        speed: (0.45 + frac * 0.55) * (zone.clockwise ? 1 : -1),
        dir: zone.clockwise ? 1 : -1
      });
    }

    // 8 towering outer cyber-monolith pylons framing the outer rim of each spiral vortex
    const outerR = zone.startR + 240;
    for (let m = 0; m < 8; m++) {
      const ang = (m / 8) * Math.PI * 2 + zIdx * 0.4;
      const px = cx + outerR * Math.cos(ang);
      const pz = cz + outerR * Math.sin(ang);
      const towerH = spanY + 760;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(36, towerH, 36), obsidianMat);
      pylon.position.set(px, midY - 60, pz);
      pylon.lookAt(cx, midY - 60, cz);
      group.add(pylon);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(8, towerH * 0.94, 4),
        m % 2 === 0 ? cyanNeonMat : magNeonMat
      );
      trim.position.set(0, 0, 19.5);
      pylon.add(trim);
    }

    // Place active architecture gantries at spiral entry & midpoint
    arch(trk, Math.max(0.02, zone.startU + 0.015), `HELIX 0${zIdx + 1}`, zone.cn, zIdx === 1 ? '#ff2e93' : '#00f0ff', group);
    arch(trk, (zone.startU + zone.endU) * 0.5, zone.name, '螺旋深渊', '#f5c451', group);
    tracksideSign(trk, Math.max(0.015, zone.startU - 0.015), `HELIX 0${zIdx + 1} DESCENT`, zIdx === 1 ? '#ff2e93' : '#00f0ff', 28, group);

    // Orbiting shard stream inside this spiral core
    for (let s = 0; s < 48; s++) {
      const k = s / 48;
      shardSpecs.push({
        cx,
        cz,
        topY: zone.topY + 140,
        bottomY: zone.bottomY - 260,
        r: 120 + (s % 5) * 48,
        phase: k,
        speed: 0.14 + (s % 4) * 0.04,
        dir: zone.clockwise ? 1 : -1,
        scale: 3.5 + (s % 4) * 2.2
      });
    }
  });

  // Instanced orbiting plasma shards across all 3 vortex cores
  const shardMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    Math.max(1, shardSpecs.length)
  );
  shardMesh.frustumCulled = false;
  const shardPalette = [new THREE.Color(0x00f0ff), new THREE.Color(0xff2e93), new THREE.Color(0xf5c451)];
  shardSpecs.forEach((_, i) => shardMesh.setColorAt(i, shardPalette[i % shardPalette.length]));
  if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  group.add(shardMesh);

  // Additional signature trackside gantries along bridges & tunnel approach
  arch(trk, 0.295, 'CHASM LEAP', '深渊飞跃', '#f5c451', group);
  arch(trk, 0.605, 'AXIS TWIST', '矢量回旋', '#00f0ff', group);
  tracksideSign(trk, 0.03, 'VORTEX ABYSS', '#ff2e93', 28, group);

  const _sPos = new THREE.Vector3();

  world.update = (_dt, now) => {
    const t = now * 0.001;
    for (let i = 0; i < helixRings.length; i++) {
      const hr = helixRings[i];
      hr.mesh.rotation.z = hr.baseRotZ + t * hr.speed;
    }
    for (let i = 0; i < shardSpecs.length; i++) {
      const sh = shardSpecs[i];
      const frac = ((t * sh.speed + sh.phase) % 1 + 1) % 1;
      const ang = (t * 1.4 + sh.phase * Math.PI * 2) * sh.dir;
      const py = sh.topY - frac * (sh.topY - sh.bottomY);
      _q.setFromEuler(_euler.set(t * 1.6 + i, ang, t * 0.8));
      _sc.set(sh.scale * 0.7, sh.scale * 1.8, sh.scale * 0.7);
      _m4.compose(_sPos.set(sh.cx + Math.cos(ang) * sh.r, py, sh.cz + Math.sin(ang) * sh.r), _q, _sc);
      shardMesh.setMatrixAt(i, _m4);
    }
    shardMesh.instanceMatrix.needsUpdate = true;
  };
  void def;
}

function buildGauntletWorld(def: LevelDef, trk: TrackData, group: THREE.Group, world: BuiltWorld): void {
  // 1. Fiery Solar-Rift to Obsidian Zenith Sky Dome
  const skyTex = canvasTexture(8, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0.0, '#04020d');
    grd.addColorStop(0.28, '#140624');
    grd.addColorStop(0.52, '#3d102a');
    grd.addColorStop(0.68, '#70242c');
    grd.addColorStop(0.84, '#240b24');
    grd.addColorStop(1.0, '#05010a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
  });
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(13000, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    )
  );

  // Starfield with warm amber & crimson stars
  const starCount = 3000;
  const sp = new Float32Array(starCount * 3);
  const scol = new Float32Array(starCount * 3);
  const cTmp = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(3900 + Math.random() * 6400);
    sp[i * 3] = v.x;
    sp[i * 3 + 1] = v.y * 0.72 + 160;
    sp[i * 3 + 2] = v.z;
    cTmp.setHSL(0.03 + (i % 7) * 0.04, 0.8, 0.72 + Math.random() * 0.25);
    scol[i * 3] = cTmp.r;
    scol[i * 3 + 1] = cTmp.g;
    scol[i * 3 + 2] = cTmp.b;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 5.4, vertexColors: true, fog: false, transparent: true, opacity: 0.9 })));

  // Hyperion Blazing Ringed Star landmark high over the canyon
  const starGroup = new THREE.Group();
  starGroup.position.set(2800, 1420, -4800);
  const starCore = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd28a, fog: false, toneMapped: false })
  );
  const starHalo = glowPlane('rgba(255, 110, 68, 0.55)', 2800, 0.68);
  starHalo.lookAt(0, 0, 0);
  const starRing = new THREE.Mesh(
    new THREE.TorusGeometry(760, 26, 10, 64),
    new THREE.MeshBasicMaterial({ color: 0xff425b, fog: false, transparent: true, opacity: 0.78, toneMapped: false })
  );
  starRing.rotation.set(1.18, 0.35, 0.2);
  starGroup.add(starCore, starHalo, starRing);
  group.add(starGroup);

  // Lower rift thermal floor (-780m)
  const riftFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(28000, 28000),
    new THREE.MeshBasicMaterial({ color: 0x0c0314 })
  );
  riftFloor.rotation.x = -Math.PI / 2;
  riftFloor.position.y = -780;
  group.add(riftFloor);

  // Twin Descending Spiral Plasma Shafts & Orbiting Shards
  const helixRings: { mesh: THREE.Mesh; baseRotZ: number; speed: number }[] = [];
  const basaltMat = new THREE.MeshStandardMaterial({ color: 0x151226, metalness: 0.85, roughness: 0.32 });
  const crimsonMat = new THREE.MeshBasicMaterial({ color: 0xff425b, toneMapped: false });
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false });
  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false });

  interface ShardSpec {
    cx: number;
    cz: number;
    topY: number;
    bottomY: number;
    r: number;
    phase: number;
    speed: number;
    dir: number;
    scale: number;
  }
  const shardSpecs: ShardSpec[] = [];

  (trk.spiralZones || []).forEach((zone, zIdx) => {
    const cx = zone.center.x;
    const cz = zone.center.z;
    const spanY = Math.max(420, zone.topY - zone.bottomY);
    const colHeight = spanY + 920;
    const midY = (zone.topY + zone.bottomY) * 0.5 - 60;

    const beamCol = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 50, colHeight, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: zIdx === 0 ? 0xf5c451 : 0xff425b,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    beamCol.position.set(cx, midY, cz);
    group.add(beamCol);

    const innerSpine = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 12, colHeight, 10),
      zIdx === 0 ? goldMat : crimsonMat
    );
    innerSpine.position.set(cx, midY, cz);
    group.add(innerSpine);

    for (let k = 0; k < 7; k++) {
      const frac = k / 6;
      const ringY = zone.topY + 120 - frac * (spanY + 300);
      const ringR = zone.endR * (0.44 + (1 - frac) * 0.22);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, 4.5, 8, 36),
        k % 3 === 0 ? goldMat : k % 3 === 1 ? crimsonMat : cyanMat
      );
      ring.position.set(cx, ringY, cz);
      ring.rotation.x = Math.PI / 2 + Math.sin(k * 0.85) * 0.08;
      ring.rotation.y = Math.cos(k * 0.65) * 0.08;
      group.add(ring);
      helixRings.push({
        mesh: ring,
        baseRotZ: k * 0.5,
        speed: (0.48 + frac * 0.55) * (zone.clockwise ? 1 : -1)
      });
    }

    const outerR = zone.startR + 245;
    for (let m = 0; m < 8; m++) {
      const ang = (m / 8) * Math.PI * 2 + zIdx * 0.35;
      const px = cx + outerR * Math.cos(ang);
      const pz = cz + outerR * Math.sin(ang);
      const towerH = spanY + 740;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(36, towerH, 36), basaltMat);
      pylon.position.set(px, midY - 60, pz);
      pylon.lookAt(cx, midY - 60, cz);
      group.add(pylon);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(8, towerH * 0.94, 4), m % 2 === 0 ? crimsonMat : goldMat);
      trim.position.set(0, 0, 19.5);
      pylon.add(trim);
    }

    arch(trk, Math.max(0.02, zone.startU + 0.015), zone.name, zone.cn, zIdx === 0 ? '#f5c451' : '#ff425b', group);
    tracksideSign(trk, Math.max(0.015, zone.startU - 0.014), zone.name, zIdx === 0 ? '#f5c451' : '#ff425b', 28, group);

    for (let s = 0; s < 44; s++) {
      shardSpecs.push({
        cx,
        cz,
        topY: zone.topY + 140,
        bottomY: zone.bottomY - 240,
        r: 120 + (s % 5) * 48,
        phase: s / 44,
        speed: 0.15 + (s % 4) * 0.04,
        dir: zone.clockwise ? 1 : -1,
        scale: 3.5 + (s % 4) * 2.1
      });
    }
  });

  // Flanking Rift Canyon Monoliths along non-spiral gauntlet stretches
  for (let i = 0; i < 36; i++) {
    const u = 0.04 + (i / 36) * 0.92;
    if (trk.spiralZones?.some((z) => u >= z.startU - 0.02 && u <= z.endU + 0.02)) continue;
    const f = trk.fr(u);
    const side = i % 2 === 0 ? -1 : 1;
    const dist = trk.hw + 220 + (i % 4) * 75;
    const towerH = 420 + (i % 5) * 140;
    const p = f.pos.clone().addScaledVector(f.s, side * dist);
    const spire = new THREE.Mesh(new THREE.BoxGeometry(44, towerH, 44), basaltMat);
    spire.position.set(p.x, p.y - 110, p.z);
    spire.lookAt(f.pos.x, p.y - 110, f.pos.z);
    group.add(spire);
    const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(8, towerH * 0.92, 4), i % 3 === 0 ? cyanMat : crimsonMat);
    neonStrip.position.set(0, 0, 23);
    spire.add(neonStrip);
  }

  const shardMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    Math.max(1, shardSpecs.length)
  );
  shardMesh.frustumCulled = false;
  const shardPalette = [new THREE.Color(0xf5c451), new THREE.Color(0xff425b), new THREE.Color(0x00f0ff)];
  shardSpecs.forEach((_, i) => shardMesh.setColorAt(i, shardPalette[i % shardPalette.length]));
  if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  group.add(shardMesh);

  arch(trk, 0.278, 'CORKSCREW TUBE', '螺旋隧道', '#00f0ff', group);
  arch(trk, 0.78, 'CORKSCREW II', '双旋通道', '#00f0ff', group);
  tracksideSign(trk, 0.018, 'HYPERION RIFT', '#f5c451', 28, group);

  const _sPos = new THREE.Vector3();
  world.update = (_dt, now) => {
    const t = now * 0.001;
    starRing.rotation.z = t * 0.08;
    for (let i = 0; i < helixRings.length; i++) {
      helixRings[i].mesh.rotation.z = helixRings[i].baseRotZ + t * helixRings[i].speed;
    }
    for (let i = 0; i < shardSpecs.length; i++) {
      const sh = shardSpecs[i];
      const frac = ((t * sh.speed + sh.phase) % 1 + 1) % 1;
      const ang = (t * 1.45 + sh.phase * Math.PI * 2) * sh.dir;
      const py = sh.topY - frac * (sh.topY - sh.bottomY);
      _q.setFromEuler(_euler.set(t * 1.5 + i, ang, t * 0.7));
      _sc.set(sh.scale * 0.7, sh.scale * 1.8, sh.scale * 0.7);
      _m4.compose(_sPos.set(sh.cx + Math.cos(ang) * sh.r, py, sh.cz + Math.sin(ang) * sh.r), _q, _sc);
      shardMesh.setMatrixAt(i, _m4);
    }
    shardMesh.instanceMatrix.needsUpdate = true;
  };
  void def;
}

function buildSpecials(def: LevelDef, trk: TrackData, group: THREE.Group): void {
  const accent = new THREE.MeshBasicMaterial({ color: def.theme.accent, toneMapped: false });
  const accent2 = new THREE.MeshBasicMaterial({ color: def.theme.secondary, toneMapped: false });
  const steel = new THREE.MeshStandardMaterial({ color: 0x1b2340, metalness: 0.85, roughness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: def.theme.accent, toneMapped: false, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });

  function sampleRun(spec: { at: number; w: number }, n: number) {
    const out = [];
    for (let k = 0; k <= n; k++) out.push(trk.fr(spec.at + spec.w * (k / n)));
    return out;
  }

  function edgeRails(spec: { at: number; w: number }, radius: number) {
    const samples = sampleRun(spec, 96);
    for (const [side, mat] of [[-1, accent], [1, accent2]] as [number, THREE.MeshBasicMaterial][]) {
      const pts = samples.map((f) =>
        f.pos.clone().addScaledVector(f.s, side * (f.width + 0.9)).addScaledVector(f.up, 2.2)
      );
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 220, radius, 6, false), mat));
    }
    return samples;
  }

  for (const spec of trk.loops) {
    const samples = edgeRails(spec, 0.95);
    for (let k = 10; k < samples.length - 10; k += 15) {
      const f = samples[k];
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.4, 22, 6), steel);
      strut.position.copy(f.pos).addScaledVector(f.up, -11);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.up.clone().negate());
      group.add(strut);
    }
    tracksideSign(trk, clampTrackU(trk, spec.at - 0.022), 'FULL LOOP', '#ffd700', 27, group);
  }

  for (const spec of trk.rolls) {
    const samples = edgeRails(spec, 0.95);
    const hoopMat = new THREE.MeshBasicMaterial({ color: def.theme.secondary, toneMapped: false });
    // Open underside cradle C-arcs strictly beneath the twisted deck so the sky and car remain 100% unobstructed
    for (let k = 6; k < samples.length - 6; k += 9) {
      const f = samples[k];
      const cradleR = f.width + 10;
      const cradle = new THREE.Mesh(new THREE.TorusGeometry(cradleR, 1.35, 6, 18, Math.PI * 0.92), steel);
      cradle.position.copy(f.pos).addScaledVector(f.up, -8);
      cradle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
      cradle.rotateZ(Math.PI + 0.04 * Math.PI);
      group.add(cradle);

      const beaconL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 1.4), hoopMat);
      beaconL.position.copy(f.pos).addScaledVector(f.s, -(f.width + 2.4)).addScaledVector(f.up, 1.2);
      beaconL.quaternion.copy(cradle.quaternion);
      group.add(beaconL);

      const beaconR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 1.4), accent);
      beaconR.position.copy(f.pos).addScaledVector(f.s, f.width + 2.4).addScaledVector(f.up, 1.2);
      beaconR.quaternion.copy(cradle.quaternion);
      group.add(beaconR);
    }
    tracksideSign(trk, clampTrackU(trk, spec.at - 0.02), 'CORKSCREW', '#00f0ff', 26, group);
  }

  for (const spec of def.features.filter((f) => f.type === 'tunnel')) {
    const from = spec.at;
    const to = spec.at + spec.w;
    const h = spec.height ?? 30;

    if (spec.underwater) {
      // Transparent panoramic underwater glass tunnel looking directly out into ocean wildlife
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x52f7e4,
        emissive: 0x09425e,
        emissiveIntensity: 0.22,
        metalness: 0.14,
        roughness: 0.08,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const glassDome = new THREE.Mesh(underwaterDomeGeometry(trk, from, to, h + 10), glassMat);
      glassDome.renderOrder = 3;
      group.add(glassDome);

      // Glowing longitudinal glass structural spines
      group.add(new THREE.Mesh(ribbonGeometry(trk, 0, 2.2, h + 10, from, to, 40, true), glow));
      group.add(new THREE.Mesh(ribbonGeometry(trk, -(trk.hw + 2.5), 1.8, (h + 10) * 0.56, from, to, 40, true), glow));
      group.add(new THREE.Mesh(ribbonGeometry(trk, trk.hw + 2.5, 1.8, (h + 10) * 0.56, from, to, 40, true), glow));

      const steps = Math.max(12, Math.round(trk.steps * spec.w));
      const ribGeo = new THREE.TorusGeometry(trk.hw + 5.2, 1.25, 8, 28, Math.PI);
      const spineLightGeo = new THREE.TorusGeometry(trk.hw + 4.3, 0.36, 6, 28, Math.PI);
      const yScale = (h + 10) / (trk.hw + 5.2);

      for (let k = 0; k <= steps; k += 8) {
        const u = clampTrackU(trk, from + (to - from) * (k / steps));
        const f = trk.fr(u);
        const ribGroup = new THREE.Group();
        ribGroup.position.copy(f.pos);
        ribGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
        ribGroup.scale.set(1, yScale, 1);

        const ribMesh = new THREE.Mesh(ribGeo, steel);
        const ribLight = new THREE.Mesh(spineLightGeo, k % 16 === 0 ? accent2 : accent);
        ribGroup.add(ribMesh, ribLight);
        group.add(ribGroup);
      }
      tracksideSign(trk, clampTrackU(trk, from - 0.015), 'UNDERWATER TUNNEL', '#36f5d8', 26, group);
    } else {
      const hasCorkscrew = trk.rolls.some((r) => r.at < to && r.at + r.w > from);
      const shellMat = hasCorkscrew
        ? new THREE.MeshBasicMaterial({
            color: 0x0d1736,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        : new THREE.MeshBasicMaterial({ color: 0x0a1024, side: THREE.DoubleSide });
      group.add(new THREE.Mesh(ribbonGeometry(trk, 0, trk.hw * 2 + 12, h, from, to, 30, true), shellMat));
      group.add(new THREE.Mesh(wallGeometry(trk, -(trk.hw + 3.5), h, from, to, true), shellMat));
      group.add(new THREE.Mesh(wallGeometry(trk, trk.hw + 3.5, h, from, to, true), shellMat));

      const steps = Math.max(10, Math.round(trk.steps * spec.w));
      const ribStep = hasCorkscrew ? 5 : 7;
      for (let k = 0; k <= steps; k += ribStep) {
        const u = from + (to - from) * (k / steps);
        const f = trk.fr(u);
        const g = new THREE.Group();
        g.position.copy(f.pos);
        g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
        const span = f.width + 4;
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 2.6), steel);
          leg.position.set(side * span, h / 2, 0);
          g.add(leg);
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.65, h * 0.85, 0.65), hasCorkscrew && k % 10 === 0 ? accent2 : glow);
          strip.position.set(side * (span - 1.6), h * 0.45, 0);
          g.add(strip);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 2.6, 2.6, 2.6), steel);
        beam.position.set(0, h, 0);
        g.add(beam);
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(span * 1.6, 0.55, 1.8), hasCorkscrew && k % 10 === 0 ? accent2 : accent);
        ceiling.position.set(0, h - 2.2, 0);
        g.add(ceiling);
        group.add(g);
      }
      tracksideSign(
        trk,
        clampTrackU(trk, from - 0.02),
        hasCorkscrew ? 'CORKSCREW TUNNEL' : 'TUNNEL',
        hasCorkscrew ? '#00f0ff' : '#8fe9ff',
        26,
        group
      );
    }
  }
}

function buildDressing(def: LevelDef, trk: TrackData, group: THREE.Group): void {
  const A = def.theme.accent;
  const B = def.theme.secondary;
  const hw = trk.hw;
  const len = trk.len;
  const anim = trk.anim;
  const hot = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);
  const basicHot = (hex: number, k: number, extra: Record<string, unknown> = {}) =>
    new THREE.MeshBasicMaterial({ color: hot(hex, k), toneMapped: false, ...extra });
  const faceQ = (f: { s: THREE.Vector3; up: THREE.Vector3; t: THREE.Vector3 }) =>
    new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s.clone().negate(), f.up, f.t));
  const plain = (u: number) => !trk.elev.isGap(u) && !trk.inSpecial(u);

  // Chase edge lights
  {
    const slots: { u: number; side: number }[] = [];
    for (let m = 12; m < len; m += 26) {
      const u = m / len;
      if (!plain(u)) continue;
      slots.push({ u, side: -1 }, { u, side: 1 });
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.7, 4.2), basicHot(0xffffff, 1), slots.length);
    slots.forEach((l, i) => {
      const f = trk.fr(l.u);
      const p = f.pos.clone().addScaledVector(f.s, l.side * (f.width / 2 - 0.5)).addScaledVector(f.up, 0.55);
      _m4.compose(p, faceQ(f), _one);
      mesh.setMatrixAt(i, _m4);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
    const cA = new THREE.Color(A);
    const cB = new THREE.Color(B);
    anim.push((_dt, now) => {
      const t = now * 0.001;
      for (let i = 0; i < slots.length; i++) {
        const w = 0.5 + 0.5 * Math.sin(slots[i].u * len * 0.045 - t * 9);
        _col.copy(slots[i].side < 0 ? cA : cB).multiplyScalar(0.16 + 2.7 * w * w * w);
        mesh.setColorAt(i, _col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  // Viaduct pylons
  {
    const spots: number[] = [];
    for (let m = 60; m < len; m += 120) {
      const u = m / len;
      if (plain(u)) spots.push(u);
    }
    const steel = new THREE.MeshStandardMaterial({ color: 0x182040, metalness: 0.85, roughness: 0.35 });
    const pylons = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.6, 4.4, 1, 10), steel, spots.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 3.2, 7), steel, spots.length);
    const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.9, 4.9, 1.3, 10), basicHot(B, 1.8), spots.length * 2);
    const q0 = new THREE.Quaternion();
    const groundFloorY =
      def.id === 'vortex'
        ? -920
        : def.id === 'gauntlet'
          ? -760
          : def.id === 'space_beach'
            ? -220
            : -320;
    spots.forEach((u, i) => {
      const f = trk.fr(u);
      const H = Math.max(14, f.pos.y - 7 - groundFloorY);
      _m4.compose(new THREE.Vector3(f.pos.x, f.pos.y - 7 - H / 2, f.pos.z), q0, _sc.set(1, H, 1));
      pylons.setMatrixAt(i, _m4);
      _m4.compose(f.pos.clone().addScaledVector(f.up, -8.6), faceQ(f), _sc.set(f.width * 0.72, 1, 1));
      heads.setMatrixAt(i, _m4);
      for (let k = 0; k < 2; k++) {
        _m4.compose(new THREE.Vector3(f.pos.x, f.pos.y - 28 - k * 70, f.pos.z), q0, _sc.set(1, 1, 1));
        bands.setMatrixAt(i * 2 + k, _m4);
      }
    });
    for (const m of [pylons, heads, bands]) {
      m.frustumCulled = false;
      group.add(m);
    }
  }

  // Jumps & boost rings
  const chevTex = canvasTexture(128, 256, (g) => {
    g.shadowColor = '#ffd700';
    g.shadowBlur = 16;
    g.fillStyle = '#ffd75a';
    g.beginPath();
    g.moveTo(8, 212);
    g.lineTo(64, 120);
    g.lineTo(120, 212);
    g.lineTo(120, 248);
    g.lineTo(64, 164);
    g.lineTo(8, 248);
    g.closePath();
    g.fill();
  });
  chevTex.wrapS = chevTex.wrapT = THREE.RepeatWrapping;
  chevTex.repeat.set(3, 1);
  const chevMat = new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
  anim.push((dt) => {
    chevTex.offset.y -= dt * 1.6;
  });

  const rings: { ring: THREE.Mesh; i: number }[] = [];
  for (const j of trk.elev.jumps) {
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 1.2, 0.6, j.at, j.lip, 26, true), chevMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, 0.9, j.lip - 10 / len, j.lip, 8, true), basicHot(A, 2.4)));
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, 0.9, j.land, j.land + 10 / len, 8, true), basicHot(B, 2.4)));
    arch(trk, j.at - 0.004, 'MEGA JUMP', '大跳躍', '#ffd700', group);

    const pointAt = (k: number, lift: number, side = 0) => {
      const f = trk.fr(j.lip + j.gap * k);
      return f.pos.clone().addScaledVector(f.up, trk.elev.arc(j.lip + j.gap * k) + lift).addScaledVector(f.s, side);
    };
    const n = 7;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const c = pointAt(k, 3.4);
      const dir = pointAt(k + 0.01, 3.4).sub(c).normalize();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(hw * 0.22, 28), 1.15, 8, 40),
        basicHot(i % 2 ? B : A, 2.0, { transparent: true, opacity: 0.92 })
      );
      ring.position.copy(c);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      group.add(ring);
      rings.push({ ring, i });
    }
  }
  if (rings.length) {
    anim.push((_dt, now) => {
      const t = now * 0.001;
      for (const r of rings) r.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 5 + r.i * 1.1));
    });
  }
}

function buildObstacles(def: LevelDef, trk: TrackData, group: THREE.Group): void {
  if (!def.obstacles) return;
  const glowMat = new THREE.MeshBasicMaterial({ color: def.theme.secondary, toneMapped: false });
  const dynamicGlowMat = new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false });
  const neonBody = new THREE.MeshStandardMaterial({ color: 0x151b32, metalness: 0.7, roughness: 0.35 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b4f8f, roughness: 0.8, metalness: 0.1, flatShading: true });
  const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x565073, roughness: 0.78, metalness: 0.28, flatShading: true });
  const railMat = new THREE.MeshBasicMaterial({ color: def.theme.accent, transparent: true, opacity: 0.35, toneMapped: false });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xffc14d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });

  const warnGeo = new THREE.RingGeometry(5.6, 6.6, 28);
  warnGeo.rotateX(-Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.55, 0.9, 28, 6, 1, true);

  interface MovingObstacleSlot {
    ob: { pos: THREE.Vector3; u: number; off: number; r: number; cool: number; active?: boolean; dynamic?: boolean };
    mesh: THREE.Object3D;
    warn: THREE.Mesh;
    beam: THREE.Mesh;
    basePos: THREE.Vector3;
    sAxis: THREE.Vector3;
    upAxis: THREE.Vector3;
    yOff: number;
    maxSweep: number;
    speed: number;
    phase: number;
  }
  const movingSlots: MovingObstacleSlot[] = [];

  const isGauntlet = def.id === 'gauntlet';
  let packed = 0;
  for (let i = 0; i < def.obstacles * 20 && packed < def.obstacles; i++) {
    const u = isGauntlet
      ? 0.055 + ((i * 0.0837 + 0.017) % 0.89)
      : 0.08 + ((i * 0.1379 + 0.021) % 0.855);
    const skip =
      trk.inSpecial(u) ||
      trk.elev.jumps.some((j) => u > j.at - 0.025 && u < j.end + 0.025) ||
      trk.pads.some((p) => Math.abs(p - u) < 0.016) ||
      trk.obstacles.some((o) => Math.abs(o.u - u) < 0.011);
    if (skip) continue;

    const liveHw = trk.hw * trk.widthAt(u);
    const isDynamic = isGauntlet && packed % 3 === 0;
    const offPattern = [-0.48, 0.46, 0, -0.34, 0.36];
    const off = isDynamic ? 0 : offPattern[packed % offPattern.length] * liveHw;
    const f = trk.fr(u);
    const qSurface = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(f.s.clone().negate(), f.up, f.t)
    );
    const base = f.pos.clone().addScaledVector(f.s, off);
    let mesh: THREE.Mesh;
    let height: number;
    if (isDynamic) {
      height = 9.2;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(7.2, height, 4.4), neonBody);
      mesh.position.copy(base).addScaledVector(f.up, height / 2);
      mesh.quaternion.copy(qSurface);
      const band = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.4, 4.7), dynamicGlowMat);
      band.position.y = -height / 2 + 1.8;
      mesh.add(band);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 4.7), glowMat);
      cap.position.y = height / 2 - 0.6;
      mesh.add(cap);

      // Flush deck guide rail showing the sweeping path
      const railSpan = liveHw * 1.18;
      const guideRail = new THREE.Mesh(new THREE.BoxGeometry(railSpan, 0.32, 1.2), railMat);
      guideRail.position.copy(f.pos).addScaledVector(f.up, 0.18);
      guideRail.quaternion.copy(qSurface);
      group.add(guideRail);
    } else if (def.id === 'beach' || def.id === 'space_beach') {
      height = 13;
      mesh = new THREE.Mesh(new THREE.ConeGeometry(4.6, height, 5), rockMat);
      mesh.position.copy(base).addScaledVector(f.up, height / 2);
      mesh.quaternion.copy(qSurface);
      mesh.rotateY(Math.random() * 3);
    } else if (def.id === 'space') {
      height = 10;
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(5, 0), asteroidMat);
      mesh.position.copy(base).addScaledVector(f.up, 5.4);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    } else {
      height = 9;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(5.6, height, 5), neonBody);
      mesh.position.copy(base).addScaledVector(f.up, height / 2);
      mesh.quaternion.copy(qSurface);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.1, 5.2), glowMat);
      strip.position.y = -height / 2 + 1.5;
      mesh.add(strip);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.8, 5.2), glowMat);
      cap.position.y = height / 2 - 0.5;
      mesh.add(cap);
    }
    group.add(mesh);

    const warn = new THREE.Mesh(warnGeo, warnMat);
    warn.quaternion.copy(qSurface);
    warn.position.copy(base).addScaledVector(f.up, 0.35);
    group.add(warn);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.quaternion.copy(qSurface);
    beam.position.copy(base).addScaledVector(f.up, 16);
    group.add(beam);

    const ob = {
      pos: base.clone().addScaledVector(f.up, 3.6),
      u,
      off,
      r: isDynamic ? 5.8 : 5.4,
      cool: 0,
      dynamic: isDynamic
    };
    trk.obstacles.push(ob);

    if (isDynamic) {
      movingSlots.push({
        ob,
        mesh,
        warn,
        beam,
        basePos: f.pos.clone(),
        sAxis: f.s.clone(),
        upAxis: f.up.clone(),
        yOff: height / 2,
        maxSweep: liveHw * 0.54,
        speed: 1.55 + (packed % 3) * 0.35,
        phase: packed * 1.45
      });
    }
    packed++;
  }

  if (movingSlots.length > 0) {
    trk.anim.push((_dt, now) => {
      const t = now * 0.001;
      for (let i = 0; i < movingSlots.length; i++) {
        const m = movingSlots[i];
        const lat = Math.sin(t * m.speed + m.phase) * m.maxSweep;
        m.ob.off = lat;
        m.ob.pos.copy(m.basePos).addScaledVector(m.sAxis, lat).addScaledVector(m.upAxis, 3.6);
        m.mesh.position.copy(m.basePos).addScaledVector(m.sAxis, lat).addScaledVector(m.upAxis, m.yOff);
        m.warn.position.copy(m.basePos).addScaledVector(m.sAxis, lat).addScaledVector(m.upAxis, 0.35);
        m.beam.position.copy(m.basePos).addScaledVector(m.sAxis, lat).addScaledVector(m.upAxis, 16);
      }
    });
  }
}

function subtractRanges(ranges: [number, number][], holes: { at: number; to: number }[]): [number, number][] {
  if (!holes.length) return ranges;
  let current = ranges.slice();
  for (const h of holes) {
    const next: [number, number][] = [];
    for (const [a, b] of current) {
      if (h.to <= a || h.at >= b) {
        next.push([a, b]);
      } else {
        if (h.at > a) next.push([a, h.at]);
        if (h.to < b) next.push([h.to, b]);
      }
    }
    current = next;
  }
  return current;
}

function solidRanges(trk: TrackData): [number, number][] {
  const gaps = trk.elev.jumps.map((j) => [j.lip, j.land] as [number, number]).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let c = 0;
  for (const [a, b] of gaps) {
    if (a > c) out.push([c, a]);
    c = b;
  }
  if (c < 1) out.push([c, 1]);
  return out;
}

/**
 * One authored asphalt set, graded per circuit. Tint multiplies the albedo,
 * roughness/metalness multiply the packed ARM channels, env is reflection
 * strength, and uvMetres is the world size of a single texture repeat.
 */
const ROAD_GRADE: Record<string, RoadGrade> = {
  // 01 · night city: cool dry asphalt that still catches the neon
  neon: { tint: 0xcbd4e4, roughness: 0.62, metalness: 0.35, env: 1.15, uvMetres: 22 },
  // 02 · sunset coast: sun-bleached, matte and warm
  beach: { tint: 0xffe2c9, roughness: 0.82, metalness: 0.1, env: 0.7, uvMetres: 30 },
  // 03 · orbital ring: cold composite deck, glossier and tighter grained
  space: { tint: 0xa8b6d8, roughness: 0.5, metalness: 0.45, env: 1.05, uvMetres: 18 },
  // 04 · underwater tunnel: wet, cyan cast, strong reflections
  space_beach: { tint: 0xb6dfe0, roughness: 0.4, metalness: 0.3, env: 1.2, uvMetres: 20 },
  // 05 · vortex descent: rain-slick asphalt with a violet cast
  vortex: { tint: 0xcfb6e2, roughness: 0.34, metalness: 0.32, env: 1.3, uvMetres: 16 },
  // 06 · rift gauntlet: hot, scorched and dry
  gauntlet: { tint: 0xe7c3ad, roughness: 0.74, metalness: 0.18, env: 0.85, uvMetres: 26 }
};

export function buildWorld(
  def: LevelDef,
  scene: THREE.Scene,
  lights: {
    ambient: THREE.AmbientLight;
    hemi: THREE.HemisphereLight;
    keyLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
  }
): BuiltWorld {
  const trk = buildTrack(def);
  const group = new THREE.Group();
  group.name = 'world-' + def.id;

  scene.background = new THREE.Color(def.look.sky);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(def.look.fog);
    scene.fog.near = def.look.fogNear;
    scene.fog.far = def.look.fogFar;
  }
  lights.ambient.color.setHex(def.look.ambient);
  lights.ambient.intensity = def.look.ambientI;
  lights.hemi.color.setHex(def.look.hemiSky);
  lights.hemi.groundColor.setHex(def.look.hemiGround);
  lights.hemi.intensity = def.look.hemiI;
  lights.keyLight.color.setHex(def.look.sun);
  lights.keyLight.intensity = def.look.sunI;
  lights.rimLight.color.setHex(def.look.rim);
  lights.rimLight.intensity = def.look.rimI;

  const ranges = solidRanges(trk);
  const hw = trk.hw;

  // Surface and light are separate layers: a tiling, metre-scaled asphalt map
  // for the deck and a transparent additive decal for the glow markings, so
  // only the markings bloom instead of the whole road self-illuminating.
  // Every circuit runs the authored CC0 asphalt set now, graded per level so
  // the city reads cool and dry, the coast sun-bleached, the orbital deck
  // glossy, and so on.
  const grade = ROAD_GRADE[def.id] ?? ROAD_GRADE.neon;
  const roadMat = makeAsphaltRoadMaterial(grade);

  const markingTex = makeRoadMarkingsTexture(def.road);
  const markingMat = new THREE.MeshBasicMaterial({
    map: markingTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const kerbTex = makeKerbTexture(def.road.edge2, def.road.edge);
  kerbTex.wrapT = THREE.RepeatWrapping;
  const kerbMat = new THREE.MeshBasicMaterial({ map: kerbTex, side: THREE.DoubleSide, toneMapped: false });

  const wallTex = makeWallTexture(
    def.road,
    def.id === 'neon' || def.id === 'vortex' || def.id === 'gauntlet'
      ? 'hex'
      : def.id === 'beach' || def.id === 'space_beach'
        ? 'bio'
        : 'grid'
  );
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  // Plated surfaces: the barrier keeps its emissive hex pattern, but now sits
  // on a real metal panel with normal + packed ORM instead of being unlit.
  const panel = makeMetalPlateMaps('#101a2e', def.theme.accent);
  const wallMat = new THREE.MeshStandardMaterial({
    map: panel.map,
    normalMap: panel.normalMap,
    roughnessMap: panel.orm,
    metalnessMap: panel.orm,
    emissive: 0xffffff,
    emissiveMap: wallTex,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const deckMat = new THREE.MeshStandardMaterial({
    map: panel.map,
    normalMap: panel.normalMap,
    roughnessMap: panel.orm,
    metalnessMap: panel.orm,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide
  });
  const trimA = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.theme.accent).multiplyScalar(1.75), toneMapped: false, side: THREE.DoubleSide });
  const trimB = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.theme.secondary).multiplyScalar(1.75), toneMapped: false, side: THREE.DoubleSide });
  const noBarrierWarnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b5c').multiplyScalar(1.9), toneMapped: false, side: THREE.DoubleSide });
  const underGlow = new THREE.MeshBasicMaterial({
    color: def.theme.accent,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  const noBarrierZones = trk.noBarrierZones ?? [];
  const barrierRanges = subtractRanges(ranges, noBarrierZones);

  for (const [a, b] of ranges) {
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, 0.04, a, b, 40, true, grade.uvMetres), roadMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, 0.075, a, b, 96, true), markingMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, -(hw - 1.8), 3.4, 0.11, a, b, 12, true), kerbMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, hw - 1.8, 3.4, 0.11, a, b, 12, true), kerbMat));

    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, -6.8, a, b, 40, true, 16), deckMat));
    group.add(new THREE.Mesh(wallGeometry(trk, -hw, -6.8, a, b, true, 8), deckMat));
    group.add(new THREE.Mesh(wallGeometry(trk, hw, -6.8, a, b, true, 8), deckMat));
    group.add(new THREE.Mesh(wallGeometry(trk, -(hw + 0.2), -1.1, a, b, true), trimA));
    group.add(new THREE.Mesh(wallGeometry(trk, hw + 0.2, -1.1, a, b, true), trimB));
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 1.5, -7.2, a, b, 40, true), underGlow));
  }

  for (const [a, b] of barrierRanges) {
    group.add(new THREE.Mesh(wallGeometry(trk, -(hw + 0.5), 3.8, a, b, true, 4), wallMat));
    group.add(new THREE.Mesh(wallGeometry(trk, hw + 0.5, 3.8, a, b, true, 4), wallMat));
    // Continuous glowing upper rail light strip along both barrier walls
    group.add(new THREE.Mesh(ribbonGeometry(trk, -(hw + 0.3), 1.3, 1.9, a, b, 40, true), trimA));
    group.add(new THREE.Mesh(ribbonGeometry(trk, hw + 0.3, 1.3, 1.9, a, b, 40, true), trimB));
  }

  // Exposed-edge warning ribbons & trackside warning signs at unbarriered cliff zones
  for (const z of noBarrierZones) {
    group.add(new THREE.Mesh(ribbonGeometry(trk, -(hw - 0.6), 1.8, 0.24, z.at, z.to, 20, true), noBarrierWarnMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, hw - 0.6, 1.8, 0.24, z.at, z.to, 20, true), noBarrierWarnMat));
    tracksideSign(trk, clampTrackU(trk, z.at - 0.012), 'NO BARRIERS', '#ff425b', 28, group);
  }

  const world: BuiltWorld = { group, trk, def, update: () => {} };
  scene.add(group);

  if (def.id === 'neon') buildNeonWorld(def, trk, group, world);
  else if (def.id === 'beach') buildBeachWorld(def, trk, group, world);
  else if (def.id === 'space_beach') buildSpaceBeachWorld(def, trk, group, world);
  else if (def.id === 'vortex') buildVortexWorld(def, trk, group, world);
  else if (def.id === 'gauntlet') buildGauntletWorld(def, trk, group, world);
  else buildSpaceWorld(def, trk, group, world);

  if (def.isSprint) {
    arch(trk, 0.015, 'SPRINT START', '起点', '#36f5d8', group, true);
    arch(trk, 0.988, 'RACE FINISH', '终点', '#f5c451', group, true);
  }

  const rawPads = def.isSprint ? [0.035, 0.26, 0.515, 0.76, 0.92] : [0.02, 0.25, 0.57, 0.78];
  for (const j of trk.elev.jumps) rawPads.push(j.at - 0.016);
  for (const L of trk.loops) rawPads.push(L.at - 0.024);
  for (const f of def.features) if (f.type === 'descent') rawPads.push(f.at + f.w * 0.62);
  trk.pads = rawPads
    .map((p) => (def.isSprint ? Math.max(0.02, Math.min(0.95, p)) : ((p % 1) + 1) % 1))
    .filter((p) => !trk.elev.isGap(p) && !trk.inSpecial(p) && !trk.elev.jumps.some((j) => p > j.at - 0.002 && p < j.end))
    .sort((p, q) => p - q)
    .filter((p, i, arr) => i === 0 || p - arr[i - 1] > 0.032);

  // Extended 190m spline-aligned Hyper-Boost Lanes with animated chevron stream
  const padTex = padTexture(
    def.id === 'beach' || def.id === 'space_beach'
      ? '#59f0d8'
      : def.id === 'space'
        ? '#c9a8ff'
        : def.id === 'vortex'
          ? '#ff2e93'
          : def.id === 'gauntlet'
            ? '#ff425b'
            : '#f5c451'
  );
  padTex.wrapS = padTex.wrapT = THREE.RepeatWrapping;
  padTex.repeat.set(1, 5);
  const boostLaneMat = new THREE.MeshBasicMaterial({
    map: padTex,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false
  });
  const boostSpanU = 190 / trk.len;
  const gatePylonMat = new THREE.MeshBasicMaterial({ color: def.theme.secondary, toneMapped: false });

  for (const u of trk.pads) {
    const uEnd = Math.min(0.998, u + boostSpanU);
    if (trk.elev.isGap(uEnd) || trk.inSpecial(uEnd)) continue;
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, trk.hw * 1.15, 0.38, u, uEnd, 36, true), boostLaneMat));

    // Entry & exit glowing accelerator fin markers on both edges of the boost strip
    for (const markerU of [u, uEnd]) {
      const f = trk.fr(markerU);
      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7.5, 3.2), gatePylonMat);
        fin.position.copy(f.pos).addScaledVector(f.s, side * f.width * 0.58).addScaledVector(f.up, 3.8);
        fin.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
        group.add(fin);
      }
    }
  }
  trk.anim.push((dt) => {
    padTex.offset.y -= dt * 2.4;
  });

  buildSpecials(def, trk, group);
  buildDressing(def, trk, group);
  buildObstacles(def, trk, group);
  buildActiveArchitecture(def, trk, group);
  if (def.id === 'gauntlet' && (trk.spiralZones?.length ?? 0) > 0) {
    buildSpiralPathBlocks(def, trk, group);
  }
  buildDestructiblesAndShortcuts(def, trk, group);

  const sceneryUpdate = world.update;
  world.update = (dt, now) => {
    sceneryUpdate(dt, now);
    for (const f of trk.anim) f(dt, now);
  };

  return world;
}

function buildActiveArchitecture(def: LevelDef, trk: TrackData, group: THREE.Group): void {
  const arches = _archRegistry.get(trk) || [];
  let activePhase: 1 | 2 | 3 = 1;
  let playerU = 0;
  let curArchOffset = 0;
  const isVortex = def.id === 'vortex';
  const isHelixTrack = isVortex || def.id === 'gauntlet';
  const spirals = trk.spiralZones || [];

  interface DynamicBarrier {
    u: number;
    inHelix: boolean;
    helixIdx: number;
    lockedActive: boolean;
    wasLocked: boolean;
    blade: THREE.Group;
    neonMat: THREE.MeshBasicMaterial;
    fieldMat: THREE.MeshBasicMaterial;
    obstacle: { pos: THREE.Vector3; u: number; off: number; r: number; cool: number; active?: boolean };
    slotGroup: 0 | 1 | 2;
    curScaleY: number;
    phaseColors: [THREE.Color, THREE.Color, THREE.Color];
  }

  const barriers: DynamicBarrier[] = [];
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x101830, metalness: 0.85, roughness: 0.25 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a2444, metalness: 0.8, roughness: 0.3 });
  const baseRingGeo = new THREE.BoxGeometry(11.8, 0.55, 2.8);
  const bladePillarGeo = new THREE.BoxGeometry(11.0, 10.5, 1.4);
  const bladeTrimGeo = new THREE.BoxGeometry(11.3, 1.1, 1.7);
  const bladeFieldGeo = new THREE.PlaneGeometry(10.2, 9.2);

  const cCyan = new THREE.Color(def.theme.accent);
  const cGold = new THREE.Color('#f5c451');
  const cMagenta = new THREE.Color('#ff2e93');
  const cCrimson = new THREE.Color('#ff2e63');

  const slotsCount = isHelixTrack ? 22 : 12;
  let placed = 0;
  for (let i = 0; i < slotsCount * 6 && placed < slotsCount; i++) {
    const u = isHelixTrack
      ? 0.068 + ((i * 0.039) % 0.85)
      : 0.095 + ((i * 0.071) % 0.82);
    const skip =
      trk.inSpecial(u) ||
      trk.elev.isGap(u) ||
      trk.elev.jumps.some((j) => u > j.at - 0.03 && u < j.end + 0.03) ||
      trk.pads.some((p) => Math.abs(p - u) < 0.024) ||
      trk.obstacles.some((o) => Math.abs(o.u - u) < 0.014);
    if (skip) continue;

    const helixIdx = spirals.findIndex((z) => u >= z.startU && u <= z.endU);
    const inHelix = helixIdx >= 0;

    const slotGroup = (placed % 3) as 0 | 1 | 2;
    const laneChoices = [-0.46, 0, 0.46];
    const off = laneChoices[(placed + slotGroup) % 3] * trk.hw;
    const f = trk.fr(u);
    const basePos = f.pos.clone().addScaledVector(f.s, off);
    const qSurf = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(f.s.clone().negate(), f.up, f.t)
    );

    // Flush recessed deck emitter housing
    const padBase = new THREE.Mesh(baseRingGeo, baseMat);
    padBase.position.copy(basePos).addScaledVector(f.up, 0.12);
    padBase.quaternion.copy(qSurf);
    group.add(padBase);

    const neonMat = new THREE.MeshBasicMaterial({ color: cCyan.clone(), toneMapped: false });
    const fieldMat = new THREE.MeshBasicMaterial({
      color: cCyan.clone(),
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });

    const emitterTrim = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.28, 3.1), neonMat);
    emitterTrim.position.copy(basePos).addScaledVector(f.up, 0.34);
    emitterTrim.quaternion.copy(qSurf);
    group.add(emitterTrim);

    // Deployable holographic barrier blade anchored at floor level (y = 0..10.5 in local space)
    const blade = new THREE.Group();
    blade.position.copy(basePos).addScaledVector(f.up, 0.25);
    blade.quaternion.copy(qSurf);

    const core = new THREE.Mesh(bladePillarGeo, frameMat);
    core.position.y = 5.25;
    const topCap = new THREE.Mesh(bladeTrimGeo, neonMat);
    topCap.position.y = 10.2;
    const midBand = new THREE.Mesh(bladeTrimGeo, neonMat);
    midBand.position.y = 4.6;
    const holoFront = new THREE.Mesh(bladeFieldGeo, fieldMat);
    holoFront.position.set(0, 5.25, 0.78);
    const holoBack = new THREE.Mesh(bladeFieldGeo, fieldMat);
    holoBack.position.set(0, 5.25, -0.78);
    blade.add(core, topCap, midBand, holoFront, holoBack);

    const startScale = slotGroup === 0 ? 1.0 : 0.06;
    blade.scale.set(1, startScale, 1);
    group.add(blade);

    const obstacle = {
      pos: basePos.clone().addScaledVector(f.up, 3.6),
      u,
      off,
      r: slotGroup === 0 ? 5.2 : 0,
      cool: 0,
      active: slotGroup === 0
    };
    trk.obstacles.push(obstacle);

    barriers.push({
      u,
      inHelix,
      helixIdx,
      lockedActive: slotGroup === 0,
      wasLocked: false,
      blade,
      neonMat,
      fieldMat,
      obstacle,
      slotGroup,
      curScaleY: startScale,
      phaseColors: [
        slotGroup === 0 ? cCyan.clone() : cGold.clone(),
        slotGroup === 1 ? cMagenta.clone() : cCyan.clone(),
        slotGroup === 2 ? cGold.clone() : cCrimson.clone()
      ]
    });

    placed++;
  }

  trk.setLapPhase = (phase: 1 | 2 | 3) => {
    activePhase = phase;
  };
  trk.setPlayerProgress = (u: number) => {
    playerU = u;
  };

  trk.anim.push((dt, now) => {
    const t = now * 0.001;
    const damp = 1 - Math.exp(-dt * 4.2);

    // 1. Animate dynamic track arches: smooth vertical clearance shift + lap color shift
    const targetArchBaseOffset = activePhase === 1 ? 0 : activePhase === 2 ? -6.2 : 3.2;
    curArchOffset += (targetArchBaseOffset - curArchOffset) * damp;

    for (let i = 0; i < arches.length; i++) {
      const a = arches[i];
      const stagger = a.index % 2 === 0 ? 1 : -0.65;
      const pulse = activePhase === 3 ? Math.sin(t * 2.8 + a.index * 0.7) * 1.4 : Math.sin(t * 1.1 + a.index) * 0.45;
      const yShift = curArchOffset * stagger + pulse;
      a.beam.position.y = 40 + yShift;
      a.beamNeon.position.y = 38.6 + yShift;
      a.sign.position.y = 32.2 + yShift;

      const targetCol =
        activePhase === 1 ? a.baseColor : activePhase === 2 ? a.altColorP2 : a.altColorP3;
      a.neonMat.color.lerp(targetCol, damp);
    }

    // 2. Animate active track-deck holographic barriers per lap phase & real-time helix navigation wave
    for (let i = 0; i < barriers.length; i++) {
      const b = barriers[i];
      let targetActive = false;
      let targetScale = 0.06;

      if (activePhase === 1) {
        targetActive = b.slotGroup === 0;
        targetScale = targetActive ? 1.0 : 0.06;
      } else if (activePhase === 2) {
        targetActive = b.slotGroup === 1;
        targetScale = targetActive ? 1.06 : 0.06;
      } else {
        targetActive = b.slotGroup === 0 || b.slotGroup === 2;
        targetScale = targetActive ? 1.12 + Math.sin(t * 4.2 + i) * 0.06 : 0.06;
      }

      // Dynamic helix-synchronized barrier shifting as the player navigates Vortex Abyss spirals:
      // Barriers oscillate in a traveling wave ahead on the helix and lock fairly once player is within ~260m
      if (isHelixTrack && b.inHelix) {
        const distU = b.u - playerU;
        if (distU > -0.01 && distU < 0.016) {
          if (!b.wasLocked) {
            b.wasLocked = true;
            b.lockedActive = b.curScaleY > 0.48;
          }
          targetActive = b.lockedActive;
          targetScale = targetActive ? 1.08 : 0.06;
        } else {
          b.wasLocked = false;
          const wave = Math.sin(t * 1.45 - b.u * 42 + b.helixIdx * 1.3 + b.slotGroup * 2.1);
          targetActive = wave > -0.05;
          targetScale = targetActive ? 0.96 + 0.16 * Math.max(0, wave) : 0.08;
        }
      }

      b.curScaleY += (targetScale - b.curScaleY) * damp;
      b.blade.scale.set(1, b.curScaleY, 1);

      const isRaised = targetActive && b.curScaleY > 0.48;
      b.obstacle.active = isRaised;
      b.obstacle.r = isRaised ? 5.2 : 0;

      const cTarget = b.phaseColors[activePhase - 1] || b.phaseColors[0];
      _colTarget.copy(cTarget);
      if (isHelixTrack && b.inHelix && isRaised) {
        _colTarget.lerp(b.helixIdx === 1 ? cMagenta : cGold, 0.35 + 0.25 * Math.sin(t * 3 + i));
      } else if (activePhase === 3 && targetActive) {
        _colTarget.multiplyScalar(1.15 + 0.15 * Math.sin(t * 6 + i));
      }
      b.neonMat.color.lerp(_colTarget, damp);
      b.fieldMat.color.lerp(_colTarget, damp);
      b.fieldMat.opacity = isRaised ? 0.44 + 0.12 * Math.sin(t * 5 + i) : 0.14;
    }
  });
}

function buildSpiralPathBlocks(_def: LevelDef, trk: TrackData, group: THREE.Group): void {
  const spirals = trk.spiralZones || [];
  if (spirals.length === 0) return;

  const makeSignTex = (
    blockedRing: 'INNER' | 'OUTER',
    safeRing: 'INNER' | 'OUTER',
    switchDir: 'LEFT' | 'RIGHT'
  ): THREE.CanvasTexture =>
    canvasTexture(768, 224, (g, w, h) => {
      g.fillStyle = '#090312';
      g.fillRect(0, 0, w, h);

      // High-visibility hazard diagonal border top & bottom
      g.fillStyle = '#ff2e55';
      g.fillRect(0, 0, w, 14);
      g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#f5c451';
      for (let sx = -40; sx < w + 40; sx += 44) {
        g.beginPath();
        g.moveTo(sx, 0);
        g.lineTo(sx + 20, 0);
        g.lineTo(sx + 8, 14);
        g.lineTo(sx - 12, 14);
        g.closePath();
        g.fill();

        g.beginPath();
        g.moveTo(sx, h - 14);
        g.lineTo(sx + 20, h - 14);
        g.lineTo(sx + 8, h);
        g.lineTo(sx - 12, h);
        g.closePath();
        g.fill();
      }

      g.strokeStyle = 'rgba(255, 66, 91, 0.8)';
      g.lineWidth = 4;
      g.strokeRect(10, 20, w - 20, h - 40);

      g.textAlign = 'center';
      g.font = '900 32px Orbitron, sans-serif';
      g.fillStyle = '#ff425b';
      g.fillText(`PATH BLOCKED // ${blockedRing} RING CLOSED`, w / 2, 74);

      g.font = '900 46px Orbitron, sans-serif';
      g.fillStyle = '#f5c451';
      const arrowTxt =
        switchDir === 'LEFT'
          ? `◀ SWITCH LEFT · ${safeRing} OPEN`
          : `SWITCH RIGHT ▶ · ${safeRing} OPEN`;
      g.fillText(arrowTxt, w / 2, 142);

      g.font = '700 21px Orbitron, sans-serif';
      g.fillStyle = '#36f5d8';
      g.fillText('SPIRAL LANE DIVERT // 螺旋封锁变道', w / 2, 186);
    });

  const signTextures: Record<string, THREE.CanvasTexture> = {
    INNER_RIGHT: makeSignTex('INNER', 'OUTER', 'RIGHT'),
    INNER_LEFT: makeSignTex('INNER', 'OUTER', 'LEFT'),
    OUTER_RIGHT: makeSignTex('OUTER', 'INNER', 'RIGHT'),
    OUTER_LEFT: makeSignTex('OUTER', 'INNER', 'LEFT')
  };

  const hazardStripeTex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#1d050c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff2e55';
    for (let x = -h; x < w + h; x += 48) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 22, 0);
      g.lineTo(x + 22 - h * 0.6, h);
      g.lineTo(x - h * 0.6, h);
      g.closePath();
      g.fill();
    }
  });
  hazardStripeTex.wrapS = hazardStripeTex.wrapT = THREE.RepeatWrapping;
  hazardStripeTex.repeat.set(3, 1);

  const safeChevronTex = canvasTexture(128, 256, (g) => {
    g.fillStyle = 'rgba(0, 240, 255, 0.14)';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#36f5d8';
    for (const cy of [80, 195]) {
      g.beginPath();
      g.moveTo(14, cy);
      g.lineTo(64, cy - 52);
      g.lineTo(114, cy);
      g.lineTo(114, cy + 26);
      g.lineTo(64, cy - 26);
      g.lineTo(14, cy + 26);
      g.closePath();
      g.fill();
    }
  });
  safeChevronTex.wrapS = safeChevronTex.wrapT = THREE.RepeatWrapping;
  safeChevronTex.repeat.set(2, 3);

  const frameSteelMat = new THREE.MeshStandardMaterial({ color: 0x161c33, metalness: 0.86, roughness: 0.25 });
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2e55, toneMapped: false });
  const barrierCurtainMat = new THREE.MeshBasicMaterial({
    map: hazardStripeTex,
    transparent: true,
    opacity: 0.66,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false
  });
  const safeCarpetMat = new THREE.MeshBasicMaterial({
    map: safeChevronTex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false
  });
  const safeArchMat = new THREE.MeshBasicMaterial({ color: 0x36f5d8, toneMapped: false });

  interface GateVisual {
    gate: SpiralBlockGate;
    halfLaneOffset: number;
    blockedGroup: THREE.Group;
    safeGroup: THREE.Group;
    billboardMat: THREE.MeshBasicMaterial;
  }

  const gateVisuals: GateVisual[] = [];
  const gates: SpiralBlockGate[] = [];

  spirals.forEach((zone, sIdx) => {
    const gateCount = 5;
    for (let k = 0; k < gateCount; k++) {
      const uRaw = zone.startU + 0.025 + ((zone.endU - zone.startU - 0.05) * (k + 0.35)) / gateCount;
      const u = clampTrackU(trk, uRaw);
      if (trk.elev.isGap(u) || trk.inSpecial(u) || trk.pads.some((p) => Math.abs(p - u) < 0.015)) continue;

      const f = trk.fr(u);
      const innerSign: -1 | 1 =
        (zone.center.x - f.pos.x) * f.s.x + (zone.center.z - f.pos.z) * f.s.z >= 0 ? 1 : -1;
      const hw = f.width;
      const halfSpan = hw * 0.88;
      const halfLaneOffset = hw * 0.48;

      const root = new THREE.Group();
      root.position.copy(f.pos);
      root.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(f.s.clone().negate(), f.up, f.t)
      );

      // Outer structural gantry columns & center divider post
      for (const sx of [-(hw + 2.2), hw + 2.2]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(3.2, 34, 3.6), frameSteelMat);
        col.position.set(sx, 17, 0);
        root.add(col);
      }
      const centerPillar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 22, 3.2), frameSteelMat);
      centerPillar.position.set(0, 11, 0);
      root.add(centerPillar);

      const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 2.8, 3.4), frameSteelMat);
      headerBeam.position.set(0, 34, 0);
      root.add(headerBeam);

      // Overhead directional warning billboard (rotated Y=PI so +Z faces oncoming player & +X aligns with screen RIGHT)
      const billboardMat = new THREE.MeshBasicMaterial({
        map: signTextures.INNER_RIGHT,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      const billboard = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(72, hw * 0.92), 20), billboardMat);
      billboard.position.set(0, 27.5, -1.9);
      billboard.rotation.y = Math.PI;
      root.add(billboard);

      // Blocked Half-Deck Group (Armored deck sill + triple laser beams + hazard curtain)
      const blockedGroup = new THREE.Group();
      const sill = new THREE.Mesh(new THREE.BoxGeometry(halfSpan, 1.4, 3.8), frameSteelMat);
      sill.position.y = 0.7;
      blockedGroup.add(sill);

      for (const ly of [3.2, 7.0, 11.0]) {
        const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, halfSpan, 8), laserMat);
        laser.rotation.z = Math.PI / 2;
        laser.position.y = ly;
        blockedGroup.add(laser);
      }
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(halfSpan - 1.5, 11.6), barrierCurtainMat);
      curtain.position.y = 7.1;
      blockedGroup.add(curtain);
      root.add(blockedGroup);

      // Safe Open Half-Deck Group (Glowing cyan chevron carpet + open clearance portal)
      const safeGroup = new THREE.Group();
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(halfSpan * 0.84, 58), safeCarpetMat);
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set(0, 0.22, -26);
      safeGroup.add(carpet);

      const openArch = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 0.85, 0.75, 1.6), safeArchMat);
      openArch.position.y = 18.5;
      safeGroup.add(openArch);
      root.add(safeGroup);

      group.add(root);

      const blockedRing: 'INNER' | 'OUTER' = (k + sIdx) % 2 === 0 ? 'INNER' : 'OUTER';
      const safeRing: 'INNER' | 'OUTER' = blockedRing === 'INNER' ? 'OUTER' : 'INNER';
      const blockedSide: -1 | 1 = blockedRing === 'INNER' ? innerSign : (-innerSign as -1 | 1);
      const switchDir: 'LEFT' | 'RIGHT' = blockedSide < 0 ? 'RIGHT' : 'LEFT';

      const gate: SpiralBlockGate = {
        u,
        spiralIdx: sIdx,
        spiralName: zone.name,
        innerSign,
        blockedRing,
        blockedSide,
        safeRing,
        switchDir,
        halfSpan,
        cool: 0,
        warned: false
      };
      gates.push(gate);
      gateVisuals.push({ gate, halfLaneOffset, blockedGroup, safeGroup, billboardMat });
    }
  });

  const applyGateVisual = (gv: GateVisual) => {
    const g = gv.gate;
    // Local +X = -f.s, so placing at -blockedSide * offset positions it at +blockedSide * f.s (matches S.x)
    gv.blockedGroup.position.x = -g.blockedSide * gv.halfLaneOffset;
    gv.safeGroup.position.x = g.blockedSide * gv.halfLaneOffset;
    const key = `${g.blockedRing}_${g.switchDir}`;
    gv.billboardMat.map = signTextures[key] || signTextures.INNER_RIGHT;
    gv.billboardMat.needsUpdate = true;
  };

  trk.spiralBlockGates = gates;
  trk.randomizeSpiralBlocks = () => {
    let prevRing: 'INNER' | 'OUTER' = Math.random() < 0.5 ? 'INNER' : 'OUTER';
    let streak = 0;
    for (let i = 0; i < gateVisuals.length; i++) {
      const gv = gateVisuals[i];
      const g = gv.gate;
      let nextRing: 'INNER' | 'OUTER' = Math.random() < 0.5 ? 'INNER' : 'OUTER';
      if (nextRing === prevRing) {
        streak++;
        if (streak >= 2) {
          nextRing = prevRing === 'INNER' ? 'OUTER' : 'INNER';
          streak = 0;
        }
      } else {
        streak = 0;
      }
      prevRing = nextRing;
      g.blockedRing = nextRing;
      g.safeRing = nextRing === 'INNER' ? 'OUTER' : 'INNER';
      g.blockedSide = nextRing === 'INNER' ? g.innerSign : (-g.innerSign as -1 | 1);
      g.switchDir = g.blockedSide < 0 ? 'RIGHT' : 'LEFT';
      g.cool = 0;
      g.warned = false;
      applyGateVisual(gv);
    }
  };

  trk.randomizeSpiralBlocks();

  trk.anim.push((dt, now) => {
    hazardStripeTex.offset.x += dt * 0.45;
    safeChevronTex.offset.y -= dt * 1.4;
    const pulse = 0.72 + 0.28 * Math.sin(now * 0.008);
    laserMat.color.setRGB(1.0 * pulse + 0.3, 0.14 * pulse, 0.28 * pulse);
  });
}

function buildDestructiblesAndShortcuts(def: LevelDef, trk: TrackData, group: THREE.Group): void {
  const spirals = trk.spiralZones || [];
  const inSpiralZone = (u: number): boolean =>
    spirals.some((z) => u >= z.startU - 0.018 && u <= z.endU + 0.018);
  const noBarrierZones = trk.noBarrierZones || [];
  const inNoBarrier = (u: number): boolean =>
    noBarrierZones.some((z) => u >= z.at - 0.012 && u <= z.to + 0.012);

  const isZoneClear = (uA: number, uB: number): boolean => {
    const samples = 8;
    for (let s = 0; s <= samples; s++) {
      const u = clampTrackU(trk, uA + ((uB - uA) * s) / samples);
      if (
        inSpiralZone(u) ||
        inNoBarrier(u) ||
        trk.inSpecial(u) ||
        trk.elev.isGap(u) ||
        trk.elev.jumps.some((j) => u >= j.at - 0.025 && u <= j.end + 0.025)
      ) {
        return false;
      }
    }
    return true;
  };

  // 1. Elevated Risk-Reward Shortcut Split-Routes (Risk Rails) in non-spiral canyon zones
  const shortcutRails: ShortcutRail[] = [];
  const destructibles: DestructibleProp[] = [];
  const railSpanU = Math.min(0.055, 290 / trk.len);
  const railHeight = 11.5;
  const railWidth = 17.5;

  const railDeckMat = new THREE.MeshStandardMaterial({
    color: 0x0d152a,
    metalness: 0.85,
    roughness: 0.26,
    side: THREE.DoubleSide
  });
  const railNeonTex = padTexture('#f5c451');
  railNeonTex.wrapS = railNeonTex.wrapT = THREE.RepeatWrapping;
  railNeonTex.repeat.set(1, 6);
  const railCarpetMat = new THREE.MeshBasicMaterial({
    map: railNeonTex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false
  });
  const railEdgeMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x1a2444, metalness: 0.8, roughness: 0.3 });

  const candidateStarts = [0.11, 0.36, 0.56, 0.74, 0.86];
  for (let i = 0; i < candidateStarts.length && shortcutRails.length < 2; i++) {
    const uStart = candidateStarts[i];
    const uEnd = uStart + railSpanU;
    if (uEnd > 0.93) continue;
    if (!isZoneClear(uStart, uEnd)) continue;
    if (shortcutRails.some((r) => Math.abs(r.uStart - uStart) < 0.14)) continue;

    const side: -1 | 1 = shortcutRails.length % 2 === 0 ? 1 : -1;
    const off = side * trk.hw * 0.62;
    const id = shortcutRails.length;
    const boostU = uStart + railSpanU * 0.52;

    // Build curved spline-aligned elevated rail deck + entry/exit launch ramps
    const segs = 28;
    const deckPos: number[] = [];
    const deckUv: number[] = [];
    const deckIdx: number[] = [];
    const edgeLPos: number[] = [];
    const edgeRPos: number[] = [];
    const edgeIdx: number[] = [];

    for (let k = 0; k <= segs; k++) {
      const fk = k / segs;
      const u = clampTrackU(trk, uStart + railSpanU * fk);
      const f = trk.fr(u);
      // Smooth ramp up over first 18%, plateau 18%..84%, smooth drop ramp 84%..100%
      const yLift =
        fk < 0.18
          ? railHeight * (0.5 - 0.5 * Math.cos((fk / 0.18) * Math.PI))
          : fk > 0.84
            ? railHeight * (0.5 + 0.5 * Math.cos(((fk - 0.84) / 0.16) * Math.PI))
            : railHeight;

      const center = f.pos.clone().addScaledVector(f.s, off).addScaledVector(f.up, yLift + 0.15);
      const left = center.clone().addScaledVector(f.s, -railWidth * 0.5);
      const right = center.clone().addScaledVector(f.s, railWidth * 0.5);
      deckPos.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const vCoord = fk * 8;
      deckUv.push(0, vCoord, 1, vCoord);

      const lEdgeOut = left.clone().addScaledVector(f.s, -0.75);
      const rEdgeOut = right.clone().addScaledVector(f.s, 0.75);
      edgeLPos.push(left.x, left.y + 0.12, left.z, lEdgeOut.x, lEdgeOut.y + 0.45, lEdgeOut.z);
      edgeRPos.push(right.x, right.y + 0.12, right.z, rEdgeOut.x, rEdgeOut.y + 0.45, rEdgeOut.z);

      if (k < segs) {
        const j = k * 2;
        deckIdx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
        edgeIdx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }

      if (k > 3 && k < segs - 3 && k % 5 === 0) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.6, Math.max(2, yLift), 1.6), strutMat);
        pylon.position.copy(f.pos).addScaledVector(f.s, off).addScaledVector(f.up, yLift * 0.5);
        pylon.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
        group.add(pylon);
      }
    }

    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(deckUv, 2));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    group.add(new THREE.Mesh(deckGeo, railDeckMat));
    group.add(new THREE.Mesh(deckGeo, railCarpetMat));

    const edgeLGeo = new THREE.BufferGeometry();
    edgeLGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeLPos, 3));
    edgeLGeo.setIndex(edgeIdx);
    edgeLGeo.computeVertexNormals();
    group.add(new THREE.Mesh(edgeLGeo, railEdgeMat));

    const edgeRGeo = new THREE.BufferGeometry();
    edgeRGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeRPos, 3));
    edgeRGeo.setIndex(edgeIdx);
    edgeRGeo.computeVertexNormals();
    group.add(new THREE.Mesh(edgeRGeo, railEdgeMat));

    // Entry sign portal marking the Risk-Reward Split Rail
    const fStart = trk.fr(clampTrackU(trk, uStart));
    const entryGate = new THREE.Group();
    entryGate.position.copy(fStart.pos).addScaledVector(fStart.s, off);
    entryGate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fStart.s.clone().negate(), fStart.up, fStart.t));
    for (const sx of [-railWidth * 0.52, railWidth * 0.52]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 13, 0.9), railEdgeMat);
      post.position.set(sx, 6.5, 0);
      entryGate.add(post);
    }
    const signBar = new THREE.Mesh(new THREE.BoxGeometry(railWidth + 2, 1.2, 0.9), railEdgeMat);
    signBar.position.set(0, 13.2, 0);
    entryGate.add(signBar);
    group.add(entryGate);

    shortcutRails.push({ id, uStart, uEnd, side, off, height: railHeight, width: railWidth, boostU });
  }

  // 2. Breakable Shield & Boost Pylons (Shatter with 360° Spin Attack)
  const pylonBaseMat = new THREE.MeshStandardMaterial({ color: 0x141d38, metalness: 0.85, roughness: 0.25 });
  const shieldCoreMat = new THREE.MeshBasicMaterial({ color: 0x36f5d8, toneMapped: false });
  const shieldHaloMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const boostCoreMat = new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false });
  const boostHaloMat = new THREE.MeshBasicMaterial({
    color: 0xff2e93,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  const basePadGeo = new THREE.CylinderGeometry(3.2, 3.8, 0.65, 8);
  const crystalGeo = new THREE.OctahedronGeometry(2.6, 0);
  crystalGeo.scale(0.85, 1.85, 0.85);
  const ringHaloGeo = new THREE.TorusGeometry(3.4, 0.24, 8, 22);

  interface PylonAnim {
    prop: DestructibleProp;
    crystalGroup: THREE.Group;
    baseY: number;
  }
  const pylonAnims: PylonAnim[] = [];

  const addPylon = (u: number, off: number, yElev: number, kind: DestructiblePropKind, onRail = false) => {
    const uNorm = clampTrackU(trk, u);
    const f = trk.fr(uNorm);
    const basePos = f.pos.clone().addScaledVector(f.s, off).addScaledVector(f.up, yElev);
    const qSurf = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(f.s.clone().negate(), f.up, f.t)
    );

    const holder = new THREE.Group();
    holder.position.copy(basePos);
    holder.quaternion.copy(qSurf);

    const pad = new THREE.Mesh(basePadGeo, pylonBaseMat);
    pad.position.y = 0.35;
    holder.add(pad);

    const crystalGroup = new THREE.Group();
    crystalGroup.position.y = 4.6;
    const cMat = kind === 'shield_pylon' ? shieldCoreMat : boostCoreMat;
    const hMat = kind === 'shield_pylon' ? shieldHaloMat : boostHaloMat;
    const crystal = new THREE.Mesh(crystalGeo, cMat);
    const halo = new THREE.Mesh(ringHaloGeo, hMat);
    halo.rotation.x = Math.PI / 2;
    const haloTilt = new THREE.Mesh(ringHaloGeo, hMat);
    haloTilt.rotation.x = Math.PI / 3;
    crystalGroup.add(crystal, halo, haloTilt);
    holder.add(crystalGroup);
    group.add(holder);

    const prop: DestructibleProp = {
      id: destructibles.length,
      kind,
      u: uNorm,
      off,
      pos: basePos.clone().addScaledVector(f.up, 4.4),
      radius: 4.4,
      intact: true,
      respawnTimer: 0,
      onRail,
      onShatter: () => {
        crystalGroup.visible = false;
      },
      onReset: () => {
        crystalGroup.visible = true;
      }
    };
    destructibles.push(prop);
    pylonAnims.push({ prop, crystalGroup, baseY: 4.6 });
  };

  // Place one Boost Pylon right on top of each elevated Risk Rail
  for (const rail of shortcutRails) {
    addPylon(rail.boostU, rail.off, rail.height + 0.15, 'boost_pylon', true);
  }

  // Place 6 destructible Shield & Boost Pylons across non-spiral canyon track sections
  const propOffsets = [-0.36, 0.36, 0, -0.42, 0.42, -0.26, 0.28];
  let propIdx = 0;
  for (let i = 0; i < 16 && destructibles.length < shortcutRails.length + 6; i++) {
    const u = 0.08 + ((i * 0.056) % 0.84);
    if (
      inSpiralZone(u) ||
      trk.inSpecial(u) ||
      trk.elev.isGap(u) ||
      trk.elev.jumps.some((j) => u > j.at - 0.03 && u < j.end + 0.03) ||
      trk.pads.some((p) => Math.abs(p - u) < 0.025) ||
      trk.obstacles.some((o) => Math.abs(o.u - u) < 0.02) ||
      destructibles.some((d) => Math.abs(d.u - u) < 0.045)
    ) {
      continue;
    }
    const kind: DestructiblePropKind = propIdx % 2 === 0 ? 'shield_pylon' : 'boost_pylon';
    const off = propOffsets[propIdx % propOffsets.length] * trk.hw;
    addPylon(u, off, 0, kind, false);
    propIdx++;
  }

  trk.shortcutRails = shortcutRails;
  trk.destructibles = destructibles;

  trk.anim.push((dt, now) => {
    railNeonTex.offset.y -= dt * 2.1;
    const t = now * 0.001;
    for (let i = 0; i < pylonAnims.length; i++) {
      const pa = pylonAnims[i];
      if (!pa.prop.intact) continue;
      pa.crystalGroup.rotation.y = t * 1.9 + i;
      pa.crystalGroup.position.y = pa.baseY + Math.sin(t * 3.2 + i) * 0.55;
    }
  });
}
