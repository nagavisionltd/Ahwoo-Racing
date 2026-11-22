import * as THREE from 'three';
import type {
  ElevationModel,
  FeatureSpec,
  FeatureType,
  JumpSpec,
  LevelDef,
  TrackAudit,
  TrackData,
  TrackFrame
} from './types';

function xyz(rows: [number, number, number][]): THREE.Vector3[] {
  return rows.map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

function neonPoints(): THREE.Vector3[] {
  return xyz([
    [-1500, 30, -2100], [-400, 30, -2150], [700, 20, -2100], [1600, 10, -1950],
    [2200, 0, -1400], [2350, -10, -600], [2170, 25, -50], [2300, 40, 600],
    [2150, 20, 1350], [1500, 0, 1920], [650, 15, 1780], [0, 30, 2050],
    [-850, 20, 2150], [-1650, 0, 1850], [-2150, -10, 1150], [-2300, 20, 350],
    [-1950, 40, -400], [-2200, 20, -1200], [-1900, 30, -1850]
  ]);
}

function beachPoints(): THREE.Vector3[] {
  return xyz([
    [-2000, 10, -1000], [-1500, 25, -1700], [-600, 20, -1950], [300, 10, -1650],
    [1100, 5, -1500], [1850, 15, -1750], [2350, 20, -1500], [2650, 30, -800],
    [2400, 10, 300], [1800, 0, 1100], [800, 15, 1850], [-300, 20, 2150],
    [-1300, 10, 1950], [-1950, 25, 1300], [-2250, 15, 300]
  ]);
}

function spacePoints(): THREE.Vector3[] {
  return xyz([
    [-2400, 60, 0], [-2200, 20, -900], [-1500, -30, -1500], [-500, 40, -1750],
    [600, 90, -1500], [1500, 40, -1750], [2300, -20, -1100], [2600, 30, -200],
    [2200, 80, 700], [1400, 20, 1300], [500, -40, 1100], [-300, 30, 1650],
    [-1200, 70, 2050], [-2000, 20, 1550]
  ]);
}

type FeatureRow = [FeatureType, number, number, number?, number?];

function planFeatures(pts: THREE.Vector3[], rows: FeatureRow[]): FeatureSpec[] {
  const L = new THREE.CatmullRomCurve3(pts, true, 'centripetal').getLength();
  return rows.map(([type, at, p, q = 0, r = 0]) => {
    switch (type) {
      case 'jump':
        return { type, at, w: p / L, h: q, gap: r / L };
      case 'descent':
        return { type, at, w: p / L, h: -q };
      case 'hill':
        return { type, at, w: p / L, h: q };
      case 'loop':
        return { type, at, w: (p * 2.6) / L, radius: p, narrow: 0.55, blend: 260 / L };
      case 'corkscrew':
        return { type, at, w: p / L, narrow: 0.55, blend: 150 / L, turns: q || 1 };
      case 'tunnel':
        return { type, at, w: p / L, height: q };
    }
  });
}

export const LEVELS: LevelDef[] = [
  {
    id: 'neon',
    num: '01',
    name: 'NEON SPRAWL',
    cn: '霓虹都市',
    sub: 'RAIN-SLICK HYPER HIGHWAY',
    tagline: 'NEON SPRAWL',
    badge: 'NEON',
    weatherBadge: 'NEON RAIN',
    weatherTitle: 'NEON RAINSTORM // 霓虹暴雨',
    desc: 'Skyscraper canyon circuit with AHWOO mega-gantries, twin 360° loops, and three launch gaps.',
    trackTrackTitle: 'SKYLINE OVERDRIVE',
    points: neonPoints(),
    hw: 140,
    obstacles: 18,
    scale: 1,
    features: planFeatures(neonPoints(), [
      ['jump', 0.027, 360, 92, 470],
      ['descent', 0.132, 700, 260],
      ['loop', 0.206, 210],
      ['hill', 0.319, 600, 70],
      ['tunnel', 0.37, 900, 34],
      ['corkscrew', 0.45, 1000, 1],
      ['descent', 0.537, 800, 300],
      ['jump', 0.601, 360, 100, 520],
      ['jump', 0.709, 340, 86, 430],
      ['loop', 0.824, 195],
      ['descent', 0.932, 550, 220]
    ]),
    look: {
      sky: 0x100a24,
      fog: 0x1a0f36,
      fogNear: 330,
      fogFar: 3900,
      ambient: 0x6b7fb8,
      ambientI: 0.75,
      hemiSky: 0x9fd4ff,
      hemiGround: 0x33194d,
      hemiI: 1.35,
      sun: 0xffd296,
      sunI: 1.9,
      rim: 0x00f0ff,
      rimI: 0.9,
      exposure: 1.04,
      bloom: 0.62,
      bloomRadius: 0.34,
      bloomThreshold: 0.95
    },
    road: {
      base: '#0b1028',
      edge: '#00f0ff',
      edge2: '#f5c451',
      lane: '#8fe9ff',
      centre: '#ffd700'
    },
    theme: { accent: 0x00f0ff, secondary: 0xf5c451, wall: 0x00f0ff }
  },
  {
    id: 'beach',
    num: '02',
    name: 'VESPER SHORE',
    cn: '暮星海岸',
    sub: 'ALIEN TIDELINE · PINK SKIES · EMERALD SAND',
    tagline: 'VESPER SHORE',
    badge: 'SHORE',
    weatherBadge: 'TIDAL MIST',
    weatherTitle: 'BIOLUMINESCENT SQUALL // 潮汐霓雾',
    desc: 'Sunset coastal ribbon above bioluminescent emerald dunes, wide sweepers, and twin corkscrews.',
    trackTrackTitle: 'TIDELINE LUXURY',
    points: beachPoints(),
    hw: 130,
    obstacles: 16,
    scale: 1,
    features: planFeatures(beachPoints(), [
      ['hill', 0.029, 700, 60],
      ['corkscrew', 0.108, 1050, 1],
      ['jump', 0.21, 360, 92, 470],
      ['descent', 0.329, 800, 280],
      ['tunnel', 0.404, 800, 32],
      ['loop', 0.496, 205],
      ['descent', 0.622, 700, 240],
      ['jump', 0.69, 340, 100, 500],
      ['hill', 0.807, 600, 70],
      ['corkscrew', 0.879, 1000, 1]
    ]),
    look: {
      sky: 0xffb7d9,
      fog: 0xffc2dd,
      fogNear: 230,
      fogFar: 2600,
      ambient: 0xffd9ef,
      ambientI: 0.85,
      hemiSky: 0xff9ecb,
      hemiGround: 0x2e8f63,
      hemiI: 1.5,
      sun: 0xffd0a8,
      sunI: 2.0,
      rim: 0x67e8ff,
      rimI: 0.55,
      exposure: 1.02,
      bloom: 0.48,
      bloomRadius: 0.42,
      bloomThreshold: 1.0
    },
    road: {
      base: '#3c2460',
      edge: '#59f0d8',
      edge2: '#ff8ad4',
      lane: '#d8fff6',
      centre: '#ffe9a6'
    },
    theme: { accent: 0x59f0d8, secondary: 0xff8ad4, wall: 0x8cf7e4 }
  },
  {
    id: 'space',
    num: '03',
    name: 'EVENT HORIZON',
    cn: '事件视界',
    sub: 'NEBULA PASSAGE · WORMHOLE SPRINT',
    tagline: 'EVENT HORIZON',
    badge: 'DEEP SPACE',
    weatherBadge: 'SOLAR FLARES',
    weatherTitle: 'SOLAR FLARE SURGE // 太阳耀斑',
    desc: 'Orbital wormhole ring suspended between ringed gas giants, deep-space drops, and zero-G loops.',
    trackTrackTitle: 'STARLIGHT APEX',
    points: spacePoints(),
    hw: 120,
    obstacles: 20,
    scale: 1,
    features: planFeatures(spacePoints(), [
      ['hill', 0.029, 800, 120],
      ['tunnel', 0.092, 800, 34],
      ['descent', 0.155, 800, 330],
      ['jump', 0.218, 360, 110, 560],
      ['loop', 0.35, 210],
      ['corkscrew', 0.477, 1050, 1],
      ['hill', 0.569, 700, 130],
      ['descent', 0.625, 850, 350],
      ['jump', 0.692, 340, 95, 480],
      ['tunnel', 0.796, 700, 34],
      ['loop', 0.87, 190]
    ]),
    look: {
      sky: 0x03040d,
      fog: 0x050817,
      fogNear: 900,
      fogFar: 7200,
      ambient: 0x6b7fbf,
      ambientI: 0.7,
      hemiSky: 0xb8d4ff,
      hemiGround: 0x241a44,
      hemiI: 1.0,
      sun: 0xfff0d0,
      sunI: 1.8,
      rim: 0x9d7bff,
      rimI: 0.9,
      exposure: 1.0,
      bloom: 0.72,
      bloomRadius: 0.44,
      bloomThreshold: 0.95
    },
    road: {
      base: '#0a0d2c',
      edge: '#8f7dff',
      edge2: '#31e8ff',
      lane: '#9fb8ff',
      centre: '#ffd5f4'
    },
    theme: { accent: 0x9d7bff, secondary: 0x31e8ff, wall: 0x8f7dff }
  }
];

function makeElevation(features: FeatureSpec[]): ElevationModel {
  const hills = features.filter((f) => f.type === 'hill');
  const descents = features.filter((f) => f.type === 'descent');
  const jumps: JumpSpec[] = features
    .filter((f): f is FeatureSpec & { type: 'jump'; h: number; gap: number } => f.type === 'jump')
    .map((f) => {
      const h = f.h ?? 80;
      const gap = f.gap ?? 0.03;
      const lip = f.at + f.w;
      const land = lip + gap;
      const landLen = f.w * 1.7;
      const deck = h * 0.16;
      return {
        ...f,
        h,
        gap,
        lip,
        land,
        landLen,
        deck,
        end: land + landLen,
        apex: ((gap * 1.9 * h) / f.w + (h - deck)) / 4
      };
    });

  function value(u: number): number {
    let h = 0;
    for (const f of hills) {
      if (u >= f.at && u <= f.at + f.w) {
        h += (f.h ?? 0) * 0.5 * (1 - Math.cos((Math.PI * (u - f.at)) / f.w));
      }
    }
    for (const f of descents) {
      if (u < f.at || u > f.at + f.w) continue;
      const k = (u - f.at) / f.w;
      const fh = f.h ?? 0;
      h +=
        k < 0.68
          ? fh * 0.5 * (1 - Math.cos(Math.PI * (k / 0.68)))
          : fh * 0.5 * (1 + Math.cos(Math.PI * ((k - 0.68) / 0.32)));
    }
    for (const j of jumps) {
      if (u >= j.at && u < j.lip) {
        const k = (u - j.at) / j.w;
        h += j.h * k * k * (3 - 2 * k);
      } else if (u >= j.lip && u < j.land) {
        h += j.h + (j.deck - j.h) * ((u - j.lip) / j.gap);
      } else if (u >= j.land && u <= j.end) {
        h += j.deck * 0.5 * (1 + Math.cos((Math.PI * (u - j.land)) / j.landLen));
      }
    }
    return h;
  }

  const isGap = (u: number): boolean => jumps.some((j) => u >= j.lip && u < j.land);

  function arc(u: number): number {
    for (const j of jumps) {
      if (u >= j.lip && u < j.land) {
        const k = (u - j.lip) / j.gap;
        return j.apex * 4 * k * (1 - k);
      }
    }
    return 0;
  }

  return { value, isGap, arc, jumps };
}

function buildFrames(curve: THREE.CatmullRomCurve3, steps: number): { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[] {
  const frames: { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) % 1;
    const t = curve.getTangentAt(u);
    const p = curve.getPointAt(u);
    const s = i ? frames[i - 1].s.clone() : new THREE.Vector3().crossVectors(t, up);
    s.addScaledVector(t, -s.dot(t)).normalize();
    frames.push({ p, t, s, up: new THREE.Vector3().crossVectors(s, t).normalize() });
  }
  const a = Math.atan2(
    new THREE.Vector3().crossVectors(frames[frames.length - 1].s, frames[0].s).dot(frames[0].t),
    frames[frames.length - 1].s.dot(frames[0].s)
  );
  frames.forEach((f, i) => {
    f.s.applyAxisAngle(f.t, (a * i) / steps);
    f.up = new THREE.Vector3().crossVectors(f.s, f.t).normalize();
  });
  return frames;
}

function auditTrack(curve: THREE.CatmullRomCurve3, steps: number): TrackAudit {
  const N = 360;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) pts.push(curve.getPointAt(i / N));
  let minRadius = Infinity;
  const vAB = new THREE.Vector3();
  const vCA = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[i];
    const c = pts[(i + 1) % N];
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);
    const area = vAB.subVectors(b, a).cross(vCA.subVectors(c, a)).length() * 0.5;
    if (area > 1e-4) minRadius = Math.min(minRadius, (ab * bc * ca) / (4 * area));
  }
  const orient = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const segHit = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) => {
    const o1 = orient(p, q, r);
    const o2 = orient(p, q, s);
    const o3 = orient(r, s, p);
    const o4 = orient(r, s, q);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };
  let selfIntersections = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      if (segHit(pts[i], pts[(i + 1) % N], pts[j], pts[(j + 1) % N])) selfIntersections++;
    }
  }
  return {
    minRadius: Number.isFinite(minRadius) ? minRadius : 0,
    selfIntersections,
    sampled: N,
    closed: curve.closed,
    steps
  };
}

export function buildTrack(def: LevelDef): TrackData {
  const scale = def.scale || 1;
  const pts = scale === 1 ? def.points : def.points.map((p) => new THREE.Vector3(p.x * scale, p.y, p.z * scale));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const len = curve.getLength();
  const steps = Math.max(700, Math.round(len / 5.5));
  const frames = buildFrames(curve, steps);
  const elev = makeElevation(def.features);
  const hw = def.hw;
  const audit = auditTrack(curve, steps);

  const tapers = def.features
    .filter((f) => f.type === 'loop' || f.type === 'corkscrew')
    .map((f) => ({
      at: f.at - (f.blend ?? 0.014),
      to: f.at + f.w + (f.blend ?? 0.014),
      min: f.narrow ?? 0.45
    }));

  function widthAt(u0: number): number {
    const u = ((u0 % 1) + 1) % 1;
    let w = 1;
    for (const t of tapers) {
      if (u < t.at || u > t.to) continue;
      const k = (u - t.at) / (t.to - t.at);
      w = Math.min(w, 1 - (1 - t.min) * Math.pow(Math.sin(Math.PI * k), 0.8));
    }
    return w;
  }

  const loops = def.features
    .filter((f) => f.type === 'loop')
    .map((f) => {
      const i = Math.min(steps, Math.round(f.at * steps));
      return {
        ...f,
        anchor: {
          p: frames[i].p.clone(),
          t: frames[i].t.clone(),
          s: frames[i].s.clone(),
          up: frames[i].up.clone()
        },
        drift: len * f.w,
        radius: f.radius ?? 100
      };
    });

  const rolls = def.features.filter((f) => f.type === 'corkscrew');
  const tunnels = def.features.filter((f) => f.type === 'tunnel');

  const inSpecial = (u: number): boolean =>
    loops.some((f) => u >= f.at && u <= f.at + f.w) ||
    rolls.some((f) => u >= f.at - 0.01 && u <= f.at + f.w + 0.01) ||
    tunnels.some((f) => u >= f.at - 0.008 && u <= f.at + f.w + 0.008);

  function fr(u0: number): TrackFrame {
    const u = ((u0 % 1) + 1) % 1;
    const x = u * steps;
    const i = Math.min(steps - 1, Math.floor(x));
    const f = x - i;
    const a = frames[i];
    const b = frames[i + 1];
    const raw = curve.getPointAt(u);
    const h = elev.value(u);
    let t = a.t.clone().lerp(b.t, f).normalize();
    let s = a.s.clone().lerp(b.s, f).normalize();
    let up = a.up.clone().lerp(b.up, f).normalize();
    const pos = raw.clone().addScaledVector(up, h);

    for (const L of loops) {
      if (u < L.at || u > L.at + L.w) continue;
      const D = L.radius * 0.25;
      const lpAt = (uu: number) => {
        const k = (uu - L.at) / L.w;
        const ang = k * Math.PI * 2;
        const xx = uu * steps;
        const ii = Math.min(steps - 1, Math.floor(xx));
        const ff = xx - ii;
        const fa = frames[ii];
        const fb = frames[ii + 1];
        const tt = fa.t.clone().lerp(fb.t, ff).normalize();
        const ss = fa.s.clone().lerp(fb.s, ff).normalize();
        const uv = fa.up.clone().lerp(fb.up, ff).normalize();
        return curve
          .getPointAt(((uu % 1) + 1) % 1)
          .addScaledVector(tt, L.radius * Math.sin(ang))
          .addScaledVector(uv, L.radius * (1 - Math.cos(ang)))
          .addScaledVector(ss, D * Math.sin(ang) * Math.sin(Math.PI * k));
      };
      const d = 0.00035;
      const uA = Math.max(L.at, u - d);
      const uB = Math.min(L.at + L.w, u + d);
      const lp = lpAt(u);
      const lt = lpAt(uB).sub(lpAt(uA)).normalize();
      const lu = new THREE.Vector3().crossVectors(s, lt).normalize();
      pos.copy(lp);
      t = lt;
      up = lu;
      s = new THREE.Vector3().crossVectors(t, up).normalize();
      up = new THREE.Vector3().crossVectors(s, t).normalize();
    }

    for (const R of rolls) {
      if (u < R.at || u > R.at + R.w) continue;
      const k = (u - R.at) / R.w;
      const ang = (R.turns ?? 1) * Math.PI * 2 * (k * k * (3 - 2 * k));
      s.applyAxisAngle(t, ang);
      up.applyAxisAngle(t, ang);
    }

    return { p: raw, h, pos, t, s, up, width: hw * widthAt(u) };
  }

  return {
    def,
    curve,
    len,
    steps,
    frames,
    elev,
    hw,
    audit,
    clearance: 180,
    fr,
    widthAt,
    inSpecial,
    loops,
    rolls,
    pads: [],
    obstacles: [],
    anim: []
  };
}
