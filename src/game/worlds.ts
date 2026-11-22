import * as THREE from 'three';
import {
  canvasTexture,
  glowPlane,
  makeKerbTexture,
  makeRoadTexture,
  makeWallTexture,
  nebulaTexture,
  padTexture,
  planetTexture
} from './textures';
import { buildTrack } from './tracks';
import type { LevelDef, TrackData } from './types';

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
const _one = new THREE.Vector3(1, 1, 1);

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

function ribbonGeometry(
  trk: TrackData,
  offset: number,
  width: number,
  yOff: number,
  from: number,
  to: number,
  vScale: number,
  taper?: boolean
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const steps = Math.max(2, Math.round(trk.steps * (to - from)));
  for (let k = 0; k <= steps; k++) {
    const i = Math.round(from * trk.steps) + k;
    const u = (((i / trk.steps) % 1) + 1) % 1;
    const f = trk.fr(u);
    const ws = taper ? trk.widthAt(u) : 1;
    const base = f.pos.clone().addScaledVector(f.s, offset * ws);
    const a = base.clone().addScaledVector(f.s, (-width * ws) / 2);
    const b = base.clone().addScaledVector(f.s, (width * ws) / 2);
    pos.push(a.x, a.y + yOff, a.z, b.x, b.y + yOff, b.z);
    const v = ((i / trk.steps) * trk.len) / (vScale || 40);
    uv.push(0, v, 1, v);
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
  taper?: boolean
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const steps = Math.max(2, Math.round(trk.steps * (to - from)));
  for (let k = 0; k <= steps; k++) {
    const i = Math.round(from * trk.steps) + k;
    const u = (((i / trk.steps) % 1) + 1) % 1;
    const f = trk.fr(u);
    const ws = taper ? trk.widthAt(u) : 1;
    const base = f.pos.clone().addScaledVector(f.s, offset * ws);
    const top = base.clone().addScaledVector(f.up, height);
    pos.push(base.x, base.y, base.z, top.x, top.y, top.z);
    const v = ((i / trk.steps) * trk.len) / 26;
    uv.push(v, 0, v, 1);
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
  group: THREE.Group
): void {
  const f = trk.fr(u);
  const p = f.pos;
  const span = trk.hw + 12;
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x18203c, metalness: 0.75, roughness: 0.32 });
  const neonMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 40, 2.2), pillarMat);
    leg.position.set(side * span, 20, 0);
    g.add(leg);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 40, 0.4), neonMat);
    strip.position.set(side * span - side * 1.4, 20, 0);
    g.add(strip);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2.2, 2.2, 2.6), pillarMat);
  beam.position.y = 39;
  g.add(beam);
  const beamNeon = new THREE.Mesh(new THREE.BoxGeometry(span * 2.2, 0.4, 0.4), neonMat);
  beamNeon.position.set(0, 37.8, 0);
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
  sign.position.set(0, 31.5, 0);
  sign.rotation.y = Math.PI;
  g.add(sign);
  group.add(g);
}

function tracksideSign(
  trk: TrackData,
  u: number,
  text: string,
  color: string,
  height: number,
  group: THREE.Group
): void {
  const f = trk.fr(u);
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

  const windowTex = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#0d1730';
    g.fillRect(0, 0, 128, 256);
    const cols = ['#00f0ff', '#f5c451', '#ff2e93', '#ffffff', '#00ffcc', '#8b5cf6'];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        if (Math.random() < 0.32) continue;
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.globalAlpha = 0.35 + Math.random() * 0.45;
        g.fillRect(x * 32 + 3, y * 32 + 4, 26, 22);
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = '#1d2a52';
    g.fillRect(0, 0, 128, 4);
    g.fillRect(0, 252, 128, 4);
  });
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;

  const towerMats = [
    new THREE.MeshStandardMaterial({ color: 0x1a2244, emissive: 0x3a5ec0, emissiveMap: windowTex, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.4, map: windowTex }),
    new THREE.MeshStandardMaterial({ color: 0x241c42, emissive: 0x7a35b0, emissiveMap: windowTex, emissiveIntensity: 1.3, metalness: 0.6, roughness: 0.42, map: windowTex }),
    new THREE.MeshStandardMaterial({ color: 0x102a3a, emissive: 0x1a7d9e, emissiveMap: windowTex, emissiveIntensity: 1.35, metalness: 0.7, roughness: 0.35, map: windowTex })
  ];

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
    if (blocked(p, trk.hw + 115)) continue;
    towers.push({
      p,
      h: 140 + Math.random() * 700,
      w: 42 + Math.random() * 100,
      d: 42 + Math.random() * 100,
      mat: (Math.random() * 3) | 0,
      pagoda: Math.random() < 0.28
    });
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let mIdx = 0; mIdx < 3; mIdx++) {
    const list = towers.filter((t) => t.mat === mIdx);
    const mesh = new THREE.InstancedMesh(box, towerMats[mIdx], list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    list.forEach((t, i) => {
      sc.set(t.w, t.h + 330, t.d);
      m4.compose(new THREE.Vector3(t.p.x, (t.h + 330) / 2 - 440, t.p.z), q, sc);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // Ahwoo Skyline Billboards on buildings
  const billboards = [
    ['AHWOO', '#f5c451'],
    ['天际回廊', '#00f0ff'],
    ['SOVEREIGN', '#ffd700'],
    ['AHWOO GP', '#00f0ff'],
    ['极速', '#ff2e93'],
    ['APEX', '#f5c451']
  ];
  towers.slice(0, 42).forEach((t, i) => {
    const [label, col] = billboards[i % billboards.length];
    const tex = canvasTexture(256, 128, (g) => {
      g.fillStyle = 'rgba(6,10,26,0.92)';
      g.fillRect(0, 0, 256, 128);
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.strokeRect(4, 4, 248, 120);
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.shadowColor = col;
      g.shadowBlur = 18;
      g.font = "bold 40px 'Orbitron', 'Noto Sans SC', sans-serif";
      g.fillText(label, 128, 78);
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 23),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
    );
    const side = i % 2 ? 1 : -1;
    sign.position.set(t.p.x + side * (t.w / 2 + 2), Math.min(310, 95 + t.h * 0.5), t.p.z);
    sign.rotation.y = (i % 4) * (Math.PI / 2);
    group.add(sign);
  });

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
  tracksideSign(trk, 0.045, 'AHWOO RACING', '#f5c451', 26, group);
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
    const samples = sampleRun(spec, 84);
    for (const [side, mat] of [[-1, accent], [1, accent2]] as [number, THREE.MeshBasicMaterial][]) {
      const pts = samples.map((f) =>
        f.pos.clone().addScaledVector(f.s, side * (f.width / 2)).addScaledVector(f.up, 1.4)
      );
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 180, radius, 6, false), mat));
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
    tracksideSign(trk, (spec.at - 0.022 + 1) % 1, 'FULL LOOP', '#ffd700', 27, group);
  }

  for (const spec of trk.rolls) {
    edgeRails(spec, 0.85);
    const samples = sampleRun(spec, 110);
    const pts = samples.map((f) => f.pos);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const radius = trk.hw * trk.widthAt(spec.at + spec.w * 0.5) * 1.3;
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 200, radius, 16, false),
        new THREE.MeshBasicMaterial({ color: def.theme.accent, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      )
    );
    const hoopMat = new THREE.MeshBasicMaterial({ color: def.theme.secondary, toneMapped: false });
    const hoopGeo = new THREE.TorusGeometry(radius, 1.5, 6, 26);
    for (let k = 4; k < samples.length - 4; k += 9) {
      const f = samples[k];
      const hoop = new THREE.Mesh(hoopGeo, hoopMat);
      hoop.position.copy(f.pos);
      hoop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
      group.add(hoop);
    }
    tracksideSign(trk, (spec.at - 0.02 + 1) % 1, 'CORKSCREW', '#00f0ff', 26, group);
  }

  for (const spec of def.features.filter((f) => f.type === 'tunnel')) {
    const from = spec.at;
    const to = spec.at + spec.w;
    const h = spec.height ?? 30;
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x0a1024, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, trk.hw * 2 + 14, h, from, to, 30, true), shellMat));
    group.add(new THREE.Mesh(wallGeometry(trk, -(trk.hw + 4), h, from, to, true), shellMat));
    group.add(new THREE.Mesh(wallGeometry(trk, trk.hw + 4, h, from, to, true), shellMat));

    const steps = Math.max(10, Math.round(trk.steps * spec.w));
    for (let k = 0; k <= steps; k += 7) {
      const u = from + (to - from) * (k / steps);
      const f = trk.fr(u);
      const g = new THREE.Group();
      g.position.copy(f.pos);
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.up, f.t));
      const span = f.width / 2 + 4;
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 2.6), steel);
        leg.position.set(side * span, h / 2, 0);
        g.add(leg);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.8, 0.5), glow);
        strip.position.set(side * (span - 1.6), h * 0.45, 0);
        g.add(strip);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 2.6, 2.6, 2.6), steel);
      beam.position.set(0, h, 0);
      g.add(beam);
      const ceiling = new THREE.Mesh(new THREE.BoxGeometry(span * 1.6, 0.4, 1.6), accent);
      ceiling.position.set(0, h - 2.2, 0);
      g.add(ceiling);
      group.add(g);
    }
    tracksideSign(trk, (from - 0.02 + 1) % 1, 'TUNNEL', '#8fe9ff', 25, group);
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
    spots.forEach((u, i) => {
      const f = trk.fr(u);
      const H = 320 + Math.max(0, f.pos.y);
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
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const c = pointAt(k, 3.2);
      const dir = pointAt(k + 0.01, 3.2).sub(c).normalize();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(hw * 0.2, 26), 1.1, 8, 40),
        basicHot(i % 2 ? B : A, 2.0, { transparent: true, opacity: 0.9 })
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
  const neonBody = new THREE.MeshStandardMaterial({ color: 0x151b32, metalness: 0.7, roughness: 0.35 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b4f8f, roughness: 0.8, metalness: 0.1, flatShading: true });
  const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x565073, roughness: 0.78, metalness: 0.28, flatShading: true });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xffc14d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });

  let packed = 0;
  for (let i = 0; i < def.obstacles * 20 && packed < def.obstacles; i++) {
    const u = 0.08 + ((i * 0.1379 + 0.021) % 0.855);
    const skip =
      trk.inSpecial(u) ||
      trk.elev.jumps.some((j) => u > j.at - 0.025 && u < j.end + 0.025) ||
      trk.pads.some((p) => Math.abs(p - u) < 0.016);
    if (skip) continue;

    const off = (packed % 2 ? 1 : -1) * trk.hw * (0.3 + (packed % 3) * 0.13);
    const f = trk.fr(u);
    const base = f.pos.clone().addScaledVector(f.s, off);
    let mesh: THREE.Mesh;
    let height: number;
    if (def.id === 'beach') {
      height = 13;
      mesh = new THREE.Mesh(new THREE.ConeGeometry(4.6, height, 5), rockMat);
      mesh.position.copy(base).addScaledVector(f.up, height / 2);
      mesh.rotation.y = Math.random() * 3;
    } else if (def.id === 'space') {
      height = 10;
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(5, 0), asteroidMat);
      mesh.position.copy(base).addScaledVector(f.up, 5.4);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    } else {
      height = 9;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(5, height, 5), neonBody);
      mesh.position.copy(base).addScaledVector(f.up, height / 2);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 5.2), glowMat);
      strip.position.y = -height / 2 + 1.5;
      mesh.add(strip);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 5.2), glowMat);
      cap.position.y = height / 2 - 0.5;
      mesh.add(cap);
    }
    group.add(mesh);

    const warn = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.6, 28), warnMat);
    warn.rotation.x = -Math.PI / 2;
    warn.position.copy(base).addScaledVector(f.up, 0.32);
    group.add(warn);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.9, 28, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.copy(base).addScaledVector(f.up, 16);
    group.add(beam);

    trk.obstacles.push({ pos: base.clone().addScaledVector(f.up, 3.6), u, off, r: 5.4, cool: 0 });
    packed++;
  }
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

  const roadTex = makeRoadTexture(def.road);
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshBasicMaterial({ map: roadTex, side: THREE.DoubleSide, toneMapped: false });

  const kerbTex = makeKerbTexture(def.road.edge2, def.road.edge);
  kerbTex.wrapT = THREE.RepeatWrapping;
  const kerbMat = new THREE.MeshBasicMaterial({ map: kerbTex, side: THREE.DoubleSide, toneMapped: false });

  const wallTex = makeWallTexture(def.road, def.id === 'neon' ? 'hex' : def.id === 'beach' ? 'bio' : 'grid');
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  const wallMat = new THREE.MeshBasicMaterial({
    map: wallTex,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false
  });

  const deckMat = new THREE.MeshStandardMaterial({ color: 0x0b1226, metalness: 0.85, roughness: 0.42, side: THREE.DoubleSide });
  const trimA = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.theme.accent).multiplyScalar(2.0), toneMapped: false, side: THREE.DoubleSide });
  const trimB = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.theme.secondary).multiplyScalar(2.0), toneMapped: false, side: THREE.DoubleSide });
  const underGlow = new THREE.MeshBasicMaterial({
    color: def.theme.accent,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  for (const [a, b] of ranges) {
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, 0.02, a, b, 40, true), roadMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, -(hw - 2.2), 3.4, 0.09, a, b, 12, true), kerbMat));
    group.add(new THREE.Mesh(ribbonGeometry(trk, hw - 2.2, 3.4, 0.09, a, b, 12, true), kerbMat));
    group.add(new THREE.Mesh(wallGeometry(trk, -(hw - 0.4), 5.4, a, b, true), wallMat));
    group.add(new THREE.Mesh(wallGeometry(trk, hw - 0.4, 5.4, a, b, true), wallMat));

    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 2, -7, a, b, 40, true), deckMat));
    group.add(new THREE.Mesh(wallGeometry(trk, -hw, -7, a, b, true), deckMat));
    group.add(new THREE.Mesh(wallGeometry(trk, hw, -7, a, b, true), deckMat));
    group.add(new THREE.Mesh(wallGeometry(trk, -hw - 0.2, -1.1, a, b, true), trimA));
    group.add(new THREE.Mesh(wallGeometry(trk, hw + 0.2, -1.1, a, b, true), trimB));
    group.add(new THREE.Mesh(ribbonGeometry(trk, 0, hw * 1.5, -7.4, a, b, 40, true), underGlow));
  }

  const world: BuiltWorld = { group, trk, def, update: () => {} };
  scene.add(group);

  if (def.id === 'neon') buildNeonWorld(def, trk, group, world);
  else if (def.id === 'beach') buildBeachWorld(def, trk, group, world);
  else buildSpaceWorld(def, trk, group, world);

  const rawPads = [0.03];
  for (const j of trk.elev.jumps) rawPads.push(j.at - 0.014);
  for (const L of trk.loops) rawPads.push(L.at - 0.022);
  for (const f of def.features) if (f.type === 'descent') rawPads.push(f.at + f.w * 0.66);
  trk.pads = rawPads
    .map((p) => ((p % 1) + 1) % 1)
    .filter((p) => !trk.elev.isGap(p) && !trk.inSpecial(p) && !trk.elev.jumps.some((j) => p > j.at - 0.002 && p < j.end))
    .sort((p, q) => p - q)
    .filter((p, i, arr) => i === 0 || p - arr[i - 1] > 0.012);

  const padTex = padTexture(def.id === 'beach' ? '#59f0d8' : def.id === 'space' ? '#c9a8ff' : '#f5c451');
  for (const u of trk.pads) {
    const f = trk.fr(u);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(trk.hw * 1.7, 22),
      new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
    );
    m.position.copy(f.pos).addScaledVector(f.up, 0.35);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.s, f.t, f.up));
    group.add(m);
  }

  buildSpecials(def, trk, group);
  buildDressing(def, trk, group);
  const sceneryUpdate = world.update;
  world.update = (dt, now) => {
    sceneryUpdate(dt, now);
    for (const f of trk.anim) f(dt, now);
  };

  buildObstacles(def, trk, group);
  return world;
}
